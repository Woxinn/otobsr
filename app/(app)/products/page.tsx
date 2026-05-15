import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ConfirmActionForm from "@/components/ConfirmActionForm";
import ProductsListToast from "@/components/ProductsListToast";
import ProductsSelectionControls from "@/components/ProductsSelectionControls";
import { deleteAllProducts, deleteSelectedProducts } from "@/app/actions/products";
import { computeCosts, GtipRow, pickWeightKg } from "@/lib/gtipCost";
import { canViewFinance, getCurrentUserRole } from "@/lib/roles";
import ProductLiveStockInline from "@/components/ProductLiveStockInline";
import {
  Boxes,
  Download,
  FilePenLine,
  Filter,
  Layers3,
  PackagePlus,
  Search,
  ShieldCheck,
  Tags,
  Upload,
} from "lucide-react";

const logError = (label: string, error: any) => {
  if (error) {
    // eslint-disable-next-line no-console
    console.error(`[products page] ${label}`, error);
  }
};

type SearchParams = {
  q?: string;
  group?: string | string[];
  supplier?: string;
  gtip?: string;
  page?: string;
  perPage?: string;
  netsis?: string;
};

type OrderItemRow = {
  product_id: string | null;
  unit_price: number | null;
  created_at: string | null;
  order_id?: string | null;
};

const fmtMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("tr-TR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
};

const buildWeightSource = (values: any[], productId: string) =>
  values
    .filter((item) => item.product_id === productId)
    .map((raw) => {
      const item = raw as any;
      const attr = Array.isArray(item.product_attributes)
        ? item.product_attributes[0]
        : item.product_attributes;
      return {
        name: attr?.name,
        value: attr?.value_type === "number" ? item.value_number : item.value_text,
      };
    });

const actionButton =
  "inline-flex items-center gap-2 rounded-lg border border-white/12 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/16";

const secondaryActionButton =
  "inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/68 transition hover:-translate-y-0.5 hover:border-black/18 hover:shadow-sm";

const dangerActionButton =
  "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-100";

export const metadata: Metadata = {
  title: "Ürünler",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { role } = await getCurrentUserRole(supabase, user);
  const isSales = role === "Satis";
  const canSeeFinance = canViewFinance(role);
  const canEdit = role === "Admin";
  const effectiveSupplierFilter = isSales ? undefined : resolvedParams.supplier;

  const [
    { data: groups, error: groupsError },
    { data: suppliers, error: suppliersError },
    { data: gtips, error: gtipsError },
    { data: groupStatsRaw, error: groupStatsError },
    { count: totalProductsCount, error: totalProductsError },
    { count: uncategorizedCount, error: uncategorizedError },
  ] = await Promise.all([
    supabase.from("product_groups").select("id, name").order("name"),
    supabase.from("suppliers").select("id, name").order("name"),
    supabase.from("gtips").select("id, code").order("code"),
    supabase.from("product_groups").select("id, name, products(count)").order("name"),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }).is("group_id", null),
  ]);
  logError("groups", groupsError);
  logError("suppliers", suppliersError);
  logError("gtips", gtipsError);
  logError("groupStats", groupStatsError);
  logError("totalProductsCount", totalProductsError);
  logError("uncategorizedCount", uncategorizedError);

  const query = resolvedParams.q?.trim();
  const safeQuery = query ?? "";
  const queryTokens = safeQuery
    ? safeQuery
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
    : [];
  const perPageOptions = [10, 20, 50, 100];
  const perPageParam = Number(resolvedParams.perPage ?? "");
  const perPage = perPageOptions.includes(perPageParam) ? perPageParam : 20;
  const requestedPage = Math.max(1, Number(resolvedParams.page ?? "1") || 1);
  const selectedGroupIds = Array.isArray(resolvedParams.group)
    ? resolvedParams.group
    : resolvedParams.group
    ? resolvedParams.group.split(",").filter(Boolean)
    : [];

  const buildProductsQuery = (forCount: boolean) => {
    const baseSelect =
      "id, code, name, brand, group_id, description, notes, created_at, gtip_id, domestic_cost_percent, netsis_stok_kodu, gtips:gtip_id(code, customs_duty_rate, additional_duty_rate, anti_dumping_applicable, anti_dumping_rate, surveillance_applicable, surveillance_unit_value)";
    const select = effectiveSupplierFilter
      ? `${baseSelect}, supplier_product_aliases!inner(supplier_id)`
      : baseSelect;
    let queryBuilder = supabase
      .from("products")
      .select(select, { count: "exact", head: forCount })
      .order("created_at", { ascending: false });

    if (effectiveSupplierFilter) {
      queryBuilder = queryBuilder.eq(
        "supplier_product_aliases.supplier_id",
        effectiveSupplierFilter
      );
    }
    if (resolvedParams.netsis === "none") {
      queryBuilder = queryBuilder.is("netsis_stok_kodu", null);
    } else if (resolvedParams.netsis === "exists") {
      queryBuilder = queryBuilder.not("netsis_stok_kodu", "is", null);
    }
    if (queryTokens.length) {
      if (queryTokens.length === 1) {
        const term = queryTokens[0];
        queryBuilder = queryBuilder.or(
          `code.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`
        );
      } else {
        // Tum kelimelerin en az bir alanda bulunmasini isteriz (daha isabetli).
        queryTokens.forEach((term) => {
          queryBuilder = queryBuilder.or(
            `code.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`
          );
        });
      }
    }
    if (selectedGroupIds.length > 0) {
      queryBuilder = queryBuilder.in("group_id", selectedGroupIds);
    }
    if (resolvedParams.gtip) {
      if (resolvedParams.gtip === "none") {
        queryBuilder = queryBuilder.is("gtip_id", null);
      } else {
        queryBuilder = queryBuilder.eq("gtip_id", resolvedParams.gtip);
      }
    }
    return queryBuilder;
  };

  const { count: totalCountRaw, error: totalCountError } = await buildProductsQuery(true);
  logError("products-count", totalCountError);
  const totalCount = totalCountRaw ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const currentPage = Math.min(requestedPage, totalPages);
  const startIndex = totalCount ? (currentPage - 1) * perPage : 0;
  const endIndex = totalCount ? Math.min(startIndex + perPage, totalCount) : 0;

  const { data: products, error: productsError } = await buildProductsQuery(false).range(
    startIndex,
    Math.max(startIndex, startIndex + perPage - 1)
  );
  logError("products", productsError);

  // MSSQL stok cek (Netsis koduna gore)
  const productsList = (products as any[] | null | undefined) ?? [];

  const productIds = Array.from(
    new Set(productsList.map((product) => product.id).filter(Boolean))
  );
  const gtipIds = Array.from(
    new Set(
      productsList
        .map((product) => product.gtip_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const [
    { data: orderItems, error: orderItemsError },
    { data: attributeValues, error: attrError },
    { data: extraAttributeValues, error: extraAttrError },
    { data: countryRates },
  ] = await Promise.all([
    productIds.length > 0
      ? supabase
          .from("order_items")
          .select(
            "product_id, unit_price, created_at, order_id, orders:order_id(suppliers:orders_supplier_id_fkey(country))"
          )
          .in("product_id", productIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[], error: null }),
    productIds.length > 0
      ? supabase
          .from("product_attribute_values")
          .select(
            "product_id, value_text, value_number, product_attributes(name, unit, value_type)"
          )
          .in("product_id", productIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    productIds.length > 0
      ? supabase
          .from("product_extra_attributes")
          .select("product_id, name, unit, value_type, value_text, value_number")
          .in("product_id", productIds)
      : Promise.resolve({ data: [] as any[], error: null }),
    gtipIds.length
      ? supabase
          .from("gtip_country_rates")
          .select(
            "gtip_id, country, customs_duty_rate, additional_duty_rate, anti_dumping_applicable, anti_dumping_rate, surveillance_applicable, surveillance_unit_value, vat_rate"
          )
          .in("gtip_id", gtipIds)
          .order("country")
      : Promise.resolve({ data: [] as any[] }),
  ]);
  logError("order_items", orderItemsError);

  const latestPriceByProduct = new Map<string, OrderItemRow>();
  (orderItems ?? []).forEach((item) => {
    if (!item.product_id) return;
    if (!latestPriceByProduct.has(item.product_id)) {
      latestPriceByProduct.set(item.product_id, item);
    }
  });

  const latestCountryByProduct = new Map<string, string | null>();
  latestPriceByProduct.forEach((latestItem, productId) => {
    const orderRaw = (latestItem as any).orders;
    const order = Array.isArray(orderRaw) ? orderRaw[0] : orderRaw;
    const supplierRaw = order?.suppliers;
    const supplier = Array.isArray(supplierRaw) ? supplierRaw[0] : supplierRaw;
    const country = supplier?.country ?? null;
    latestCountryByProduct.set(productId, country);
  });

  logError("product_attribute_values", attrError);

  logError("product_extra_attributes", extraAttrError);

  const extraAttributesByProduct = (extraAttributeValues ?? []).reduce<Record<string, string[]>>(
    (acc, item) => {
      if (!item.product_id || !item.name) return acc;
      const rawValue =
        item.value_type === "number" ? item.value_number : item.value_text;
      if (rawValue === null || rawValue === undefined || rawValue === "") return acc;
      const valueText =
        item.value_type === "number"
          ? Number(rawValue).toLocaleString("tr-TR")
          : String(rawValue);
      const unitSuffix = item.unit ? ` ${item.unit}` : "";
      const entry = `${item.name}: ${valueText}${unitSuffix}`;
      acc[item.product_id] = [...(acc[item.product_id] ?? []), entry];
      return acc;
    },
    {}
  );

  const attributesByProduct = (attributeValues ?? []).reduce<Record<string, string[]>>(
    (acc, item) => {
      if (!item.product_id) return acc;
      const attribute = Array.isArray(item.product_attributes)
        ? item.product_attributes[0]
        : item.product_attributes;
      if (!attribute?.name) return acc;
      const rawValue =
        attribute.value_type === "number" ? item.value_number : item.value_text;
      if (rawValue === null || rawValue === undefined || rawValue === "") return acc;
      const valueText =
        attribute.value_type === "number"
          ? Number(rawValue).toLocaleString("tr-TR")
          : String(rawValue);
      const unitSuffix = attribute.unit ? ` ${attribute.unit}` : "";
      const entry = `${attribute.name}: ${valueText}${unitSuffix}`;
      acc[item.product_id] = [...(acc[item.product_id] ?? []), entry];
      return acc;
    },
    {}
  );

  const mergedAttributesByProduct = Object.entries(extraAttributesByProduct).reduce(
    (acc, [productId, entries]) => {
      acc[productId] = [...(acc[productId] ?? []), ...entries];
      return acc;
    },
    { ...attributesByProduct }
  );

  const weightByProduct = productIds.reduce<Record<string, number | null>>((acc, pid) => {
    const source = buildWeightSource(attributeValues ?? [], pid);
    acc[pid] = pickWeightKg(source as any[]);
    return acc;
  }, {});

  const ratesByGtip = (countryRates ?? []).reduce<Record<string, any[]>>(
    (acc, row) => {
      if (!row.gtip_id) return acc;
      acc[row.gtip_id] = [...(acc[row.gtip_id] ?? []), row];
      return acc;
    },
    {}
  );

  const costByProduct = new Map<
    string,
    {
      basePrice: number | null;
      kdvSizMaliyet: number | null;
    }
  >();

  productsList.forEach((product) => {
    const basePrice =
      latestPriceByProduct.get(product.id)?.unit_price ??
      (product.unit_price as number | null) ??
      null;
    const weightKg = weightByProduct[product.id] ?? null;
    const baseGtip = (product.gtips as GtipRow | null) ?? null;
    const gtipRates = product.gtip_id ? ratesByGtip[product.gtip_id] ?? [] : [];
    const preferredCountry = latestCountryByProduct.get(product.id) ?? null;
    const fallbackCountry = gtipRates[0]?.country ?? null;
    const chosenCountry = preferredCountry ?? fallbackCountry;
    const countryRate = chosenCountry
      ? gtipRates.find((row) => row.country === chosenCountry)
      : null;
    const gtipForCalc: GtipRow | null = countryRate
      ? {
          ...(baseGtip as any),
          customs_duty_rate: countryRate.customs_duty_rate,
          additional_duty_rate: countryRate.additional_duty_rate,
          anti_dumping_applicable: countryRate.anti_dumping_applicable,
          anti_dumping_rate: countryRate.anti_dumping_rate,
          surveillance_applicable: countryRate.surveillance_applicable,
          surveillance_unit_value: countryRate.surveillance_unit_value,
          vat_rate: countryRate.vat_rate,
        }
      : baseGtip;
    const costs = computeCosts({
      basePrice,
      domesticCostPercent: (product.domestic_cost_percent as number | null) ?? 0,
      weightKg,
      gtip: gtipForCalc,
    });

    const customsFromGozetim = costs.customsFromGozetim;
    const addFromGozetim = costs.addFromGozetim;
    const customsFromAra = costs.customsFromAra;
    const addFromAra = costs.addFromAra;

    const vatBaseCandidates = [costs.gozetimliMatrah, costs.gozetimsizMatrah].filter(
      (v): v is number => v !== null
    );
    const vatBase = vatBaseCandidates.length ? Math.max(...vatBaseCandidates) : null;
    const vatRate = 0.2;
    const grossVatPayable = vatBase !== null ? vatBase * vatRate : null;

    const vatCreditBase =
      costs.araTutar !== null ? (costs.araTutar ?? 0) + (customsFromAra ?? 0) : null;
    const vatCredit = vatCreditBase !== null ? vatCreditBase * vatRate : null;

    const netVatPayable =
      grossVatPayable !== null ? Math.max(grossVatPayable - (vatCredit ?? 0), 0) : null;
    const subtotalBeforeVat =
      (costs.araTutar ?? 0) +
      (customsFromGozetim ?? 0) +
      (addFromGozetim ?? 0) +
      (costs.dumpingTutar ?? 0);

    const kdvBaseCandidates: number[] = [];
    if (costs.gozetimsizMatrah !== null) kdvBaseCandidates.push(costs.gozetimsizMatrah);
    kdvBaseCandidates.push(subtotalBeforeVat);
    const kdvBaz = kdvBaseCandidates.length ? Math.max(...kdvBaseCandidates) : null;
    const addDutyRate = Number((gtipForCalc as any)?.additional_duty_rate ?? 0);
    const hasSurveillance = Boolean((gtipForCalc as any)?.surveillance_applicable);
    const shouldAddNetVat = addDutyRate > 0 || hasSurveillance;

    const kdvSiz =
      kdvBaz !== null
        ? shouldAddNetVat
          ? netVatPayable !== null
            ? kdvBaz + netVatPayable
            : null
          : kdvBaz
        : null;
    costByProduct.set(product.id, {
      basePrice,
      kdvSizMaliyet: kdvSiz,
    });
  });

  const groupStats = (groupStatsRaw ?? []).map((group) => {
    const rawCount = Array.isArray(group.products)
      ? group.products[0]?.count
      : (group.products as { count?: number } | null | undefined)?.count;
    return {
      id: group.id,
      name: group.name,
      count: Number(rawCount ?? 0),
    };
  });

  const rowColorsFromId = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
      hash &= hash;
    }
    const hue = Math.abs(hash) % 360;
    return {
      bg: `hsl(${hue}, 85%, 96%)`,
      accent: `hsl(${hue}, 70%, 45%)`,
    };
  };

  const buildQuery = (overrides: Partial<SearchParams>) => {
    const params = new URLSearchParams();
    const q = overrides.q ?? resolvedParams.q;
    const groupOverride = overrides.group ?? selectedGroupIds;
    const normalizedGroups = Array.isArray(groupOverride)
      ? groupOverride
      : groupOverride
      ? groupOverride.split(",").filter(Boolean)
      : [];
    const supplier = isSales ? undefined : overrides.supplier ?? effectiveSupplierFilter;
    const gtip = overrides.gtip ?? resolvedParams.gtip;
    const netsis = overrides.netsis ?? resolvedParams.netsis;
    const perPageValue = overrides.perPage ?? String(perPage);
    const pageValue = overrides.page ?? String(currentPage);

    if (q) params.set("q", q);
    if (normalizedGroups.length) params.set("group", normalizedGroups.join(","));
    if (supplier) params.set("supplier", supplier);
    if (gtip) params.set("gtip", gtip);
    if (netsis) params.set("netsis", netsis);
    if (perPageValue) params.set("perPage", String(perPageValue));
    if (pageValue && Number(pageValue) > 1) params.set("page", String(pageValue));

    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  };

  const selectedGroupNames = selectedGroupIds
    .map((id) => groupStats.find((group) => group.id === id)?.name)
    .filter(Boolean) as string[];
  const activeFilterCount =
    (safeQuery ? 1 : 0) +
    selectedGroupIds.length +
    (effectiveSupplierFilter ? 1 : 0) +
    (resolvedParams.gtip ? 1 : 0) +
    (resolvedParams.netsis ? 1 : 0);
  const visibleWithGtipCount = productsList.filter((product) => product.gtip_id).length;
  const visibleWithStockCodeCount = productsList.filter((product) =>
    Boolean(product.netsis_stok_kodu)
  ).length;
  const visibleMissingStockCodeCount = Math.max(productsList.length - visibleWithStockCodeCount, 0);
  const topGroups = groupStats
    .filter((group) => group.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <section className="space-y-5">
      <ProductsListToast />

      <div className="rounded-lg border border-black/10 bg-[#101817] p-5 text-white shadow-[0_24px_70px_-50px_rgba(16,24,23,0.9)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-white/45">
              Ürün Kataloğu
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight [font-family:var(--font-display)]">
              Ürünler
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/62">
              Ürün kartları, canlı stok, GTİP, nitelik ve maliyet bilgileri tek ekranda.
            </p>
          </div>

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/products/new" className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#101817] transition hover:-translate-y-0.5">
                <PackagePlus className="h-4 w-4" />
                Yeni ürün
              </Link>
              <Link href="/products/import-update" className={actionButton}>
                <FilePenLine className="h-4 w-4" />
                Ürün güncelle
              </Link>
              <Link href="/products/netsis-import" className={actionButton}>
                <Upload className="h-4 w-4" />
                Stok kodu import
              </Link>
              <Link href="/products/attributes-export" className={actionButton}>
                <Download className="h-4 w-4" />
                Nitelik export
              </Link>
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Toplam ürün",
              value: (totalProductsCount ?? 0).toLocaleString("tr-TR"),
              helper: "Katalog geneli",
              icon: Boxes,
            },
            {
              label: "Filtre sonucu",
              value: totalCount.toLocaleString("tr-TR"),
              helper: activeFilterCount ? `${activeFilterCount} aktif filtre` : "Tüm kayıtlar",
              icon: Filter,
            },
            {
              label: "Kategorisiz",
              value: (uncategorizedCount ?? 0).toLocaleString("tr-TR"),
              helper: "Grup atanmamış",
              icon: Tags,
            },
            {
              label: "Bu sayfa",
              value: productsList.length.toLocaleString("tr-TR"),
              helper: `${visibleWithStockCodeCount} stok kodlu · ${visibleWithGtipCount} GTİP'li`,
              icon: ShieldCheck,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-white/10 bg-white/8 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-white/45">
                      {item.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                  </div>
                  <span className="rounded-lg bg-white/10 p-2 text-white/75">
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-xs font-medium text-white/48">{item.helper}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <form className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
          <input type="hidden" name="page" value="1" />
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 pb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-black/40">
                Filtre Merkezi
              </p>
              <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)]">
                Hızlı arama ve daraltma
              </h2>
            </div>
            <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-black/60">
              {activeFilterCount ? `${activeFilterCount} aktif` : "Filtre yok"}
            </span>
          </div>

          <div className={`mt-4 grid gap-3 ${isSales ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50 lg:col-span-2">
              Arama
              <span className="mt-1 flex items-center gap-2 rounded-lg border border-black/10 bg-slate-50 px-3 py-2">
                <Search className="h-4 w-4 text-black/35" />
                <input
                  name="q"
                  defaultValue={resolvedParams.q ?? ""}
                  placeholder="Ürün kodu, ad, marka, not"
                  className="w-full bg-transparent text-sm font-medium normal-case tracking-normal text-black outline-none placeholder:text-black/35"
                />
              </span>
            </label>
            {!isSales ? (
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                Tedarikçi
                <select
                  name="supplier"
                  defaultValue={effectiveSupplierFilter ?? ""}
                  className="mt-1 w-full rounded-lg border border-black/10 bg-slate-50 px-3 py-2 text-sm font-medium normal-case tracking-normal text-black"
                >
                  <option value="">Hepsi</option>
                  {suppliers?.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
              GTİP
              <select
                name="gtip"
                defaultValue={resolvedParams.gtip ?? ""}
                className="mt-1 w-full rounded-lg border border-black/10 bg-slate-50 px-3 py-2 text-sm font-medium normal-case tracking-normal text-black"
              >
                <option value="">Hepsi</option>
                <option value="none">GTİP yok</option>
                {gtips?.map((gtip) => (
                  <option key={gtip.id} value={gtip.id}>
                    {gtip.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
              Stok kodu
              <select
                name="netsis"
                defaultValue={resolvedParams.netsis ?? ""}
                className="mt-1 w-full rounded-lg border border-black/10 bg-slate-50 px-3 py-2 text-sm font-medium normal-case tracking-normal text-black"
              >
                <option value="">Hepsi</option>
                <option value="none">Stok kodu yok</option>
                <option value="exists">Stok kodu var</option>
              </select>
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
              Sayfada
              <select
                name="perPage"
                defaultValue={String(perPage)}
                className="mt-1 w-full rounded-lg border border-black/10 bg-slate-50 px-3 py-2 text-sm font-medium normal-case tracking-normal text-black"
              >
                {perPageOptions.map((option) => (
                  <option key={option} value={option}>
                    {option} ürün
                  </option>
                ))}
              </select>
            </label>
          </div>

          <details
            className="mt-4 rounded-lg border border-black/10 bg-slate-50 p-3"
            open={selectedGroupIds.length > 0}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-black/50">
                Kategori filtresi
              </span>
              <span className="rounded-md border border-black/10 bg-white px-2 py-1 text-[11px] font-bold text-black/60">
                {selectedGroupIds.length ? `${selectedGroupIds.length} seçili` : "Hepsi"}
              </span>
            </summary>
            <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
              {groupStats.map((group) => (
                <label key={group.id} className="inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    name="group"
                    value={group.id}
                    defaultChecked={selectedGroupIds.includes(group.id)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-black/65 transition hover:border-black/20 peer-checked:border-[#101817] peer-checked:bg-[#101817] peer-checked:text-white">
                    <span>{group.name}</span>
                    <span className="rounded-md bg-black/8 px-1.5 py-[1px] text-[10px] peer-checked:bg-white/15">
                      {group.count}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </details>

          {activeFilterCount ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {safeQuery ? (
                <span className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-black/60">
                  Arama: {safeQuery}
                </span>
              ) : null}
              {selectedGroupNames.map((name) => (
                <span key={name} className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-black/60">
                  {name}
                </span>
              ))}
              {resolvedParams.gtip ? (
                <span className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-black/60">
                  GTİP: {resolvedParams.gtip === "none" ? "yok" : "seçili"}
                </span>
              ) : null}
              {resolvedParams.netsis ? (
                <span className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-xs font-semibold text-black/60">
                  Stok kodu: {resolvedParams.netsis === "none" ? "yok" : "var"}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg bg-[#101817] px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5">
              <Filter className="h-4 w-4" />
              Filtrele
            </button>
            <Link
              href="/products"
              className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black/65 transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              Temizle
            </Link>
          </div>
        </form>

        <aside className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.28em] text-black/40">
            Kategori Nabzı
          </p>
          <h2 className="mt-1 text-lg font-semibold [font-family:var(--font-display)]">
            En dolu gruplar
          </h2>
          <div className="mt-4 space-y-3">
            {topGroups.length ? (
              topGroups.map((group) => {
                const ratio = totalProductsCount ? (group.count / totalProductsCount) * 100 : 0;
                return (
                  <Link
                    key={group.id}
                    href={`/products${buildQuery({ group: [group.id], page: "1" })}`}
                    className="block rounded-lg border border-black/8 bg-slate-50 px-3 py-2 transition hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-semibold text-black/70">{group.name}</span>
                      <span className="font-bold text-black">{group.count}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/8">
                      <div
                        className="h-full rounded-full bg-[#101817]"
                        style={{ width: `${Math.max(6, ratio)}%` }}
                      />
                    </div>
                  </Link>
                );
              })
            ) : (
              <div className="rounded-lg border border-black/8 bg-slate-50 px-3 py-3 text-sm text-black/55">
                Kategori verisi yok.
              </div>
            )}
          </div>

          {canEdit ? (
            <div className="mt-5 space-y-2 border-t border-black/8 pt-4">
              <Link href="/product-groups" className={secondaryActionButton}>
                <Layers3 className="h-4 w-4" />
                Kategori yönetimi
              </Link>
              <div className="flex flex-wrap gap-2">
                <ConfirmActionForm
                  action={deleteSelectedProducts}
                  confirmText="Seçili ürünler silinsin mi?"
                  buttonText="Seçiliyi sil"
                  formId="products-delete-selected"
                  buttonClassName={dangerActionButton}
                />
                <ConfirmActionForm
                  action={deleteAllProducts}
                  confirmText="Tüm ürünler silinsin mi?"
                  buttonText="Tümünü sil"
                  formId="products-delete-all"
                  buttonClassName={dangerActionButton}
                />
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      <div className="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-black/40">
              Liste
            </p>
            <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)]">
              Ürün kayıtları
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-black/55">
            <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5">
              {totalCount
                ? `${(startIndex + 1).toLocaleString("tr-TR")}-${endIndex.toLocaleString("tr-TR")}`
                : "0"}{" "}
              / {totalCount.toLocaleString("tr-TR")}
            </span>
            <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5">
              {visibleMissingStockCodeCount} stok kodu eksik
            </span>
          </div>
        </div>

        {totalCount ? (
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[1180px]">
              {canEdit ? (
                <div className="mb-3 rounded-lg border border-black/8 bg-slate-50 p-2">
                  <ProductsSelectionControls formId="products-delete-selected" />
                </div>
              ) : null}
              <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-[11px] uppercase tracking-[0.22em] text-black/40">
                    {canEdit ? <th className="w-10 px-3 py-3">Seç</th> : null}
                    <th className="w-[28%] px-3 py-3">Ürün</th>
                    <th className="w-[13%] px-3 py-3">Kategori</th>
                    <th className="w-[13%] px-3 py-3">Stok</th>
                    <th className="w-[12%] px-3 py-3">GTİP</th>
                    <th className="w-[22%] px-3 py-3">Nitelikler</th>
                    {!isSales ? <th className="w-[10%] px-3 py-3 text-right">Son alış</th> : null}
                    {!isSales ? <th className="w-[11%] px-3 py-3 text-right">KDV'siz</th> : null}
                    <th className="w-[12%] px-3 py-3 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {productsList.map((product, index) => {
                    const rowColors = rowColorsFromId(product.id);
                    const detailHref = `/products/${product.id}`;
                    const groupName =
                      groups?.find((group) => group.id === product.group_id)?.name ?? "-";
                    const productAttributes = mergedAttributesByProduct[product.id] ?? [];
                    const visibleAttributes = productAttributes.slice(0, 3);
                    const costInfo = costByProduct.get(product.id);
                    const weightKg = weightByProduct[product.id] ?? null;
                    const gtipCode =
                      (Array.isArray(product.gtips)
                        ? product.gtips[0]?.code
                        : (product.gtips as any)?.code) ?? null;
                    return (
                      <tr
                        key={product.id}
                        className="group border-b border-black/6 transition hover:bg-slate-50"
                        style={{ ["--row-accent" as string]: rowColors.accent } as CSSProperties}
                      >
                        {canEdit ? (
                          <td className="border-t border-black/6 px-3 py-4 align-top">
                            <input
                              type="checkbox"
                              name="product_ids"
                              value={product.id}
                              form="products-delete-selected"
                              className="h-4 w-4 rounded border-black/20 text-[#101817]"
                            />
                          </td>
                        ) : null}
                        <td className="border-t border-black/6 px-3 py-4 align-top">
                          <Link href={detailHref} className="block">
                            <div className="flex items-start gap-3">
                              <span
                                className="mt-1 h-10 w-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: "var(--row-accent)" }}
                              />
                              <span className="min-w-0">
                                <span className="inline-flex max-w-full rounded-md border border-black/10 bg-white px-2 py-0.5 text-[11px] font-bold text-black/65">
                                  <span className="truncate">{product.code}</span>
                                </span>
                                <span className="mt-2 block truncate text-sm font-semibold text-black">
                                  {product.name}
                                </span>
                                <span className="mt-1 block truncate text-xs text-black/50">
                                  {product.brand ?? "Marka yok"} · {product.description ?? product.notes ?? "-"}
                                </span>
                              </span>
                            </div>
                          </Link>
                        </td>
                        <td className="border-t border-black/6 px-3 py-4 align-top">
                          <Link href={detailHref} className="inline-flex max-w-full rounded-lg border border-black/8 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-black/65">
                            <span className="truncate">{groupName}</span>
                          </Link>
                        </td>
                        <td className="border-t border-black/6 px-3 py-4 align-top">
                          <Link href={detailHref} className="block">
                            <span className="block text-base font-semibold text-black">
                              <ProductLiveStockInline
                                stockCode={
                                  product.netsis_stok_kodu
                                    ? String(product.netsis_stok_kodu).trim()
                                    : null
                                }
                              />
                            </span>
                            <span className="mt-1 block truncate text-[11px] font-medium text-black/45">
                              {product.netsis_stok_kodu ?? "Stok kodu yok"}
                            </span>
                          </Link>
                        </td>
                        <td className="border-t border-black/6 px-3 py-4 align-top">
                          <Link
                            href={detailHref}
                            className={`inline-flex max-w-full rounded-lg px-2.5 py-1 text-xs font-semibold ${
                              gtipCode
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border border-amber-200 bg-amber-50 text-amber-800"
                            }`}
                          >
                            <span className="truncate">{gtipCode ?? "GTİP yok"}</span>
                          </Link>
                        </td>
                        <td className="border-t border-black/6 px-3 py-4 align-top">
                          <Link href={detailHref} className="block">
                            <div className="flex flex-wrap gap-1.5">
                              {visibleAttributes.length ? (
                                visibleAttributes.map((attr) => (
                                  <span
                                    key={`${product.id}-${attr}`}
                                    className="max-w-[180px] truncate rounded-md border border-black/8 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-black/55"
                                  >
                                    {attr}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-black/40">-</span>
                              )}
                              {productAttributes.length > visibleAttributes.length ? (
                                <span className="rounded-md border border-black/8 bg-white px-2 py-0.5 text-[11px] font-semibold text-black/45">
                                  +{productAttributes.length - visibleAttributes.length}
                                </span>
                              ) : null}
                            </div>
                            {weightKg !== null ? (
                              <span className="mt-2 block text-[11px] font-semibold text-black/45">
                                Ağırlık:{" "}
                                {Number(weightKg).toLocaleString("tr-TR", {
                                  maximumFractionDigits: 2,
                                })}{" "}
                                kg
                              </span>
                            ) : null}
                          </Link>
                        </td>
                        {!isSales ? (
                          <td className="border-t border-black/6 px-3 py-4 text-right align-top font-semibold text-black/75">
                            <Link href={detailHref} className="block">
                              {fmtMoney(costInfo?.basePrice ?? null)}
                            </Link>
                          </td>
                        ) : null}
                        {!isSales ? (
                          <td className="border-t border-black/6 px-3 py-4 text-right align-top font-semibold text-black">
                            <Link href={detailHref} className="block">
                              {fmtMoney(costInfo?.kdvSizMaliyet ?? null)}
                            </Link>
                          </td>
                        ) : null}
                        <td className="border-t border-black/6 px-3 py-4 text-right align-top">
                          <div className="flex justify-end gap-2">
                            {canEdit ? (
                              <Link
                                href={`/products/${product.id}/edit`}
                                className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-black/60 transition hover:bg-slate-50"
                              >
                                Düzenle
                              </Link>
                            ) : null}
                            <Link
                              href={detailHref}
                              className="rounded-lg bg-[#101817] px-2.5 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5"
                            >
                              Detay
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-900">
            Filtreye uygun ürün bulunamadı.
          </div>
        )}

        {totalCount > perPage ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/8 pt-4 text-sm">
            <span className="text-xs font-semibold text-black/55">
              Sayfa {currentPage} / {totalPages}
            </span>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/products${buildQuery({ page: String(currentPage - 1) })}`}
                aria-disabled={currentPage <= 1}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                  currentPage <= 1
                    ? "cursor-not-allowed border border-black/10 text-black/30"
                    : "border border-black/15 bg-white text-black/65 transition hover:-translate-y-0.5 hover:bg-slate-50"
                }`}
              >
                Önceki
              </Link>
              <Link
                href={`/products${buildQuery({ page: String(currentPage + 1) })}`}
                aria-disabled={currentPage >= totalPages}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${
                  currentPage >= totalPages
                    ? "cursor-not-allowed border border-black/10 text-black/30"
                    : "border border-black/15 bg-white text-black/65 transition hover:-translate-y-0.5 hover:bg-slate-50"
                }`}
              >
                Sonraki
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );

}
