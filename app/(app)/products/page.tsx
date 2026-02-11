import Link from "next/link";
import type { CSSProperties } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import sql from "mssql";
import ConfirmActionForm from "@/components/ConfirmActionForm";
import ProductsListToast from "@/components/ProductsListToast";
import ProductsSelectionControls from "@/components/ProductsSelectionControls";
import { deleteAllProducts, deleteSelectedProducts } from "@/app/actions/products";
import { computeCosts, GtipRow, pickWeightKg } from "@/lib/gtipCost";
import { canViewFinance, getCurrentUserRole } from "@/lib/roles";

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

const fetchNetsisStocks = async (products: any[]) => {
  const map = new Map<string, number | null>();
  const {
    MSSQL_SERVER,
    MSSQL_PORT,
    MSSQL_DB,
    MSSQL_USER,
    MSSQL_PASS,
    MSSQL_TRUST_CERT,
    MSSQL_ENCRYPT,
  } = process.env;
  const canConnect = MSSQL_SERVER && MSSQL_DB && MSSQL_USER && MSSQL_PASS;
  if (!canConnect) return map;

  const codes = products
    .map((p) => (p.netsis_stok_kodu ? String(p.netsis_stok_kodu).trim() : null))
    .filter(Boolean) as string[];
  const distinctCodes = Array.from(new Set(codes));
  if (!distinctCodes.length) return map;

  try {
    const pool = await sql.connect({
      server: MSSQL_SERVER!,
      port: MSSQL_PORT ? Number(MSSQL_PORT) : 1433,
      database: MSSQL_DB!,
      user: MSSQL_USER!,
      password: MSSQL_PASS!,
      options: {
        encrypt: MSSQL_ENCRYPT !== "false",
        trustServerCertificate: MSSQL_TRUST_CERT === "true",
        cryptoCredentialsDetails: { minVersion: "TLSv1", maxVersion: "TLSv1.2" },
        enableArithAbort: true,
      },
    });

    // Kod baÅŸÄ±na LIKE ile sorgula (\"22 6200%\" gibi) â€“ perPage <= 100 olduÄŸu iÃ§in kabul edilebilir
    for (const code of distinctCodes) {
      const key = code.trim();
      try {
        const result = await pool
          .request()
          .input("stok", sql.VarChar, `${key}%`)
          .query(
            `SELECT SUM(CASE WHEN Har.STHAR_GCKOD='G' THEN Har.STHAR_GCMIK ELSE -Har.STHAR_GCMIK END) AS NetMiktar
             FROM TBLSTHAR Har
             WHERE LTRIM(RTRIM(Har.STOK_KODU)) LIKE @stok`
          );
        const net = result.recordset?.[0]?.NetMiktar ?? null;
        map.set(key, net);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[netsis-stock] fetch error for code", key, err);
        map.set(key, null);
      }
    }

    await pool.close();
  } catch (err) {
    // baÄŸlantÄ± hatasÄ± olursa tÃ¼m map boÅŸ kalÄ±r; logla ve geri dÃ¶n
    // eslint-disable-next-line no-console
    console.error("[netsis-stock] connection failed", err);
  }
  // Debug: kaÃ§ kod ve kaÃ§ sonuÃ§ dÃ¶ndÃ¼
  // eslint-disable-next-line no-console
  console.log("[netsis-stock] codes", distinctCodes.length, "map size", map.size);
  // eslint-disable-next-line no-console
  console.log(
    "[netsis-stock] sample",
    Array.from(map.entries())
      .slice(0, 10)
      .map(([k, v]) => `${k}:${v}`)
  );
  return map;
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

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const isSales = role === "Satis";
  const canSeeFinance = canViewFinance(role);
  const canEdit = role === "Admin";

  const { data: groups, error: groupsError } = await supabase
    .from("product_groups")
    .select("id, name")
    .order("name");
  logError("groups", groupsError);

  const { data: suppliers, error: suppliersError } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name");
  logError("suppliers", suppliersError);

  const { data: gtips, error: gtipsError } = await supabase
    .from("gtips")
    .select("id, code")
    .order("code");
  logError("gtips", gtipsError);

  const { data: groupStatsRaw, error: groupStatsError } = await supabase
    .from("product_groups")
    .select("id, name, products(count)")
    .order("name");
  logError("groupStats", groupStatsError);

  const { count: totalProductsCount, error: totalProductsError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true });
  logError("totalProductsCount", totalProductsError);

  const { count: uncategorizedCount, error: uncategorizedError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .is("group_id", null);
  logError("uncategorizedCount", uncategorizedError);

  const query = resolvedParams.q?.trim();
  const safeQuery = query ? query.replace(/,/g, " ") : "";
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
    const select = resolvedParams.supplier
      ? `${baseSelect}, supplier_product_aliases!inner(supplier_id)`
      : baseSelect;
    let queryBuilder = supabase
      .from("products")
      .select(select, { count: "exact", head: forCount })
      .order("created_at", { ascending: false });

    if (resolvedParams.supplier) {
      queryBuilder = queryBuilder.eq(
        "supplier_product_aliases.supplier_id",
        resolvedParams.supplier
      );
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

  // MSSQL stok Ã§ek (Netsis koduna gÃ¶re)
  const productsList = (products as any[] | null | undefined) ?? [];

  // MSSQL stok cek (Netsis koduna gore)
  const netsisStockMap = await fetchNetsisStocks(productsList);

  const productIds = Array.from(
    new Set(productsList.map((product) => product.id).filter(Boolean))
  );

  const { data: orderItems, error: orderItemsError } =
    productIds.length > 0
      ? await supabase
          .from("order_items")
          .select("product_id, unit_price, created_at, order_id")
          .in("product_id", productIds)
          .order("created_at", { ascending: false })
      : { data: [] };
  logError("order_items", orderItemsError);

  const latestPriceByProduct = new Map<string, OrderItemRow>();
  (orderItems ?? []).forEach((item) => {
    if (!item.product_id) return;
    if (!latestPriceByProduct.has(item.product_id)) {
      latestPriceByProduct.set(item.product_id, item);
    }
  });

  const latestOrderIds = Array.from(
    new Set(
      Array.from(latestPriceByProduct.values())
        .map((item) => item.order_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const { data: latestOrdersWithSupplier, error: latestOrdersWithSupplierError } =
    latestOrderIds.length > 0
      ? await supabase
          .from("orders")
          .select("id, suppliers:orders_supplier_id_fkey(country)")
          .in("id", latestOrderIds)
      : { data: [] as any[], error: null };
  logError("latest-orders-supplier-country", latestOrdersWithSupplierError);

  const countryByOrderId = new Map<string, string | null>();
  (latestOrdersWithSupplier ?? []).forEach((row: any) => {
    const supplierRaw = row?.suppliers;
    const supplier = Array.isArray(supplierRaw) ? supplierRaw[0] : supplierRaw;
    countryByOrderId.set(row.id, supplier?.country ?? null);
  });

  const latestCountryByProduct = new Map<string, string | null>();
  latestPriceByProduct.forEach((latestItem, productId) => {
    const country = latestItem.order_id ? countryByOrderId.get(latestItem.order_id) ?? null : null;
    latestCountryByProduct.set(productId, country);
  });

  const { data: attributeValues, error: attrError } =
    productIds.length > 0
      ? await supabase
          .from("product_attribute_values")
          .select(
            "product_id, value_text, value_number, product_attributes(name, unit, value_type)"
          )
          .in("product_id", productIds)
      : { data: [] };
  logError("product_attribute_values", attrError);

  const { data: extraAttributeValues, error: extraAttrError } =
    productIds.length > 0
      ? await supabase
          .from("product_extra_attributes")
          .select("product_id, name, unit, value_type, value_text, value_number")
          .in("product_id", productIds)
      : { data: [] };
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

  const gtipIds = Array.from(
    new Set(
      productsList
        .map((product) => product.gtip_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const { data: countryRates } = gtipIds.length
    ? await supabase
        .from("gtip_country_rates")
        .select(
          "gtip_id, country, customs_duty_rate, additional_duty_rate, anti_dumping_applicable, anti_dumping_rate, surveillance_applicable, surveillance_unit_value, vat_rate"
        )
        .in("gtip_id", gtipIds)
        .order("country")
    : { data: [] as any[] };

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
    const supplier = overrides.supplier ?? resolvedParams.supplier;
    const gtip = overrides.gtip ?? resolvedParams.gtip;
    const perPageValue = overrides.perPage ?? String(perPage);
    const pageValue = overrides.page ?? String(currentPage);

    if (q) params.set("q", q);
    if (normalizedGroups.length) params.set("group", normalizedGroups.join(","));
    if (supplier) params.set("supplier", supplier);
    if (gtip) params.set("gtip", gtip);
    if (perPageValue) params.set("perPage", String(perPageValue));
    if (pageValue && Number(pageValue) > 1) params.set("page", String(pageValue));

    const queryString = params.toString();
    return queryString ? `?${queryString}` : "";
  };

  const toggleGroupQuery = (groupId: string) => {
    const nextGroups = selectedGroupIds.includes(groupId)
      ? selectedGroupIds.filter((id) => id !== groupId)
      : [...selectedGroupIds, groupId];
    return buildQuery({ group: nextGroups, page: "1" });
  };

  const selectedGroupDetails = selectedGroupIds.map((id) => ({
    id,
    name: groups?.find((group) => group.id === id)?.name ?? id,
  }));

  return (
    <section className="space-y-6">
      <ProductsListToast />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Urunler
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            Urunler
          </h2>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/products/new"
              className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white"
            >
              + Yeni urun
            </Link>
            <Link
              href="/products/netsis-import"
              className="rounded-full border border-black/20 bg-white px-4 py-2 text-xs font-semibold text-black/70"
            >
              Netsis stok import
            </Link>
            <Link
              href="/products/import-update"
              className="rounded-full border border-black/20 bg-white px-4 py-2 text-xs font-semibold text-black/70"
            >
              ÃœrÃ¼n gÃ¼ncelle (import)
            </Link>
            <Link
              href="/product-groups"
              className="rounded-full border border-black/15 bg-white px-4 py-2 text-xs font-semibold"
            >
              Kategori yonetimi
            </Link>
            <ConfirmActionForm
              action={deleteSelectedProducts}
              confirmText="Secili urunler silinsin mi?"
              buttonText="Seciliyi sil"
              formId="products-delete-selected"
            />
            <ConfirmActionForm
              action={deleteAllProducts}
              confirmText="Tum urunler silinsin mi?"
              buttonText="Tumunu sil"
              formId="products-delete-all"
            />
          </div>
        ) : null}
      </div>

      <form className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <input type="hidden" name="page" value="1" />
        <div className="grid gap-4 lg:grid-cols-5">
          <label className="text-sm font-medium">
            Arama
            <input
              name="q"
              defaultValue={resolvedParams.q ?? ""}
              placeholder="Urun kodu, adi, not (birden fazla kelime yazabilirsin)"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Kategori
            <select
              name="group"
              multiple
              defaultValue={selectedGroupIds}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              {groups?.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Tedarikci
            <select
              name="supplier"
              defaultValue={resolvedParams.supplier ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              {suppliers?.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            GTIP
            <select
              name="gtip"
              defaultValue={resolvedParams.gtip ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              <option value="none">GTIP yok</option>
              {gtips?.map((gtip) => (
                <option key={gtip.id} value={gtip.id}>
                  {gtip.code}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Sayfada
            <select
              name="perPage"
              defaultValue={String(perPage)}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              {perPageOptions.map((option) => (
                <option key={option} value={option}>
                  {option} urun
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
            Filtrele
          </button>
          <Link
            href="/products"
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
          >
            Temizle
          </Link>
        </div>
      </form>

      <div className="rounded-3xl border border-black/10 bg-white p-5 text-sm shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-black/40">
              Urun istatistikleri
            </p>
            <p className="text-lg font-semibold text-black">
              Toplam urun: {totalProductsCount ?? 0}
            </p>
          </div>
          <div className="text-xs text-black/60">
            Gosterilen: {totalCount ? `${startIndex + 1}-${endIndex}` : "0"} /
            {` ${totalCount}`}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-black/70">
          {groupStats.map((group) => (
            <Link
              href={`/products${toggleGroupQuery(group.id)}`}
              key={group.id}
              className={`rounded-full border px-3 py-1 transition ${
                selectedGroupIds.includes(group.id)
                  ? "border-[var(--ocean)] bg-[var(--ocean)]/10 text-[var(--ocean)]"
                  : "border-black/10 bg-[var(--mint)]/40 text-black/70 hover:border-[var(--ocean)]/40"
              }`}
            >
              {group.name}: {group.count}
            </Link>
          ))}
          {uncategorizedCount ? (
            <span className="rounded-full border border-black/10 bg-[var(--peach)] px-3 py-1">
              Kategorisiz: {uncategorizedCount}
            </span>
          ) : null}
        </div>
        {selectedGroupDetails.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-black/60">Secili kategoriler:</span>
            {selectedGroupDetails.map((group) => (
              <Link
                key={group.id}
                href={`/products${buildQuery({
                  group: selectedGroupIds.filter((id) => id !== group.id),
                  page: "1",
                })}`}
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--ocean)]/10 px-3 py-1 font-semibold text-[var(--ocean)]"
              >
                {group.name}
                <span className="rounded-full bg-[var(--ocean)]/20 px-2 py-[2px] text-[10px] font-bold text-[var(--ocean)]/80 group-hover:bg-[var(--ocean)]/30">
                  Ã—
                </span>
              </Link>
            ))}
            <Link
              href="/products"
              className="rounded-full border border-black/20 px-3 py-1 font-semibold text-black/70"
            >
              Temizle
            </Link>
          </div>
        ) : null}
      </div>

      <div className="rounded-[36px] border border-black/10 bg-[radial-gradient(circle_at_top_left,#ffffff,#f6f7fb)] p-6 shadow-[0_40px_80px_-50px_rgba(12,45,52,0.7)]">
        {totalCount ? (
          <div className="overflow-x-auto">
            <div className="min-w-[980px] rounded-[30px] border border-black/10 bg-[linear-gradient(130deg,#f7f7fb,#eef1f7)] p-3">
              {canEdit ? <ProductsSelectionControls formId="products-delete-selected" /> : null}
              <table className="w-full border-separate border-spacing-y-4">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.3em] text-black/45">
                    {canEdit ? (
                      <th className="px-4 pt-2">
                        <span className="sr-only">Sec</span>
                      </th>
                    ) : null}
                    <th className="px-4 pt-2">Kod</th>
                    <th className="px-4 pt-2">Urun</th>
                    <th className="px-4 pt-2">Kategori</th>
                      <th className="px-4 pt-2">Netsis Stok</th>
                      <th className="px-4 pt-2">GTIP</th>
                      <th className="px-4 pt-2">Nitelikler</th>
                    {!isSales ? <th className="px-4 pt-2 text-right">Alis (son)</th> : null}
                    {!isSales ? (
                      <th className="px-4 pt-2 text-right">KDV'siz maliyet</th>
                    ) : null}
                    <th className="px-4 pt-2 text-right">Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {productsList.map((product, index) => {
                    const rowColors = rowColorsFromId(product.id);
                    const groupName =
                      groups?.find((group) => group.id === product.group_id)?.name ?? "-";
                    const productAttributes = mergedAttributesByProduct[product.id] ?? [];
                    const costInfo = costByProduct.get(product.id);
                    const weightKg = weightByProduct[product.id] ?? null;
                    return (
                      <tr
                        key={product.id}
                        className="group animate-[fade-up_0.35s_ease] transition hover:-translate-y-0.5 [&>td]:border [&>td]:border-black/10 [&>td]:bg-[var(--row-bg)] [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl hover:[&>td]:bg-[linear-gradient(120deg,rgba(11,47,54,0.06),rgba(242,166,90,0.14))]"
                        style={
                          {
                            animationDelay: `${index * 45}ms`,
                            ["--row-bg" as string]: rowColors.bg,
                            ["--row-accent" as string]: rowColors.accent,
                          } as CSSProperties
                        }
                      >
                        {canEdit ? (
                          <td className="px-4 py-4 text-sm text-black/60">
                            <input
                              type="checkbox"
                              name="product_ids"
                              value={product.id}
                              form="products-delete-selected"
                              className="h-4 w-4 rounded border-black/20 text-[var(--ocean)]"
                            />
                          </td>
                        ) : null}
                        <td className="px-4 py-4 text-sm font-semibold text-black">
                          <div className="flex items-center gap-3">
                            <span
                              className="h-9 w-1.5 rounded-full"
                              style={{ backgroundColor: "var(--row-accent)" }}
                            />
                            {product.code}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-semibold text-black">
                            {product.name}
                          </div>
                          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-black/50">
                            {product.brand ?? "Marka yok"}
                          </div>
                          <div className="mt-1 text-xs text-black/55">
                            {product.description ?? product.notes ?? "-"}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-black/70">{groupName}</td>
                          <td className="px-4 py-4 text-sm text-black/70">
                            {product.netsis_stok_kodu ? (
                              <div className="text-base font-semibold text-black">
                                {(() => {
                                  const key = String(product.netsis_stok_kodu).trim();
                                  const val = netsisStockMap.get(key);
                                  return val === null || val === undefined ? "-" : val;
                                })()}
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-4 py-4 text-sm text-black/70">
                            {(Array.isArray(product.gtips)
                              ? product.gtips[0]?.code
                              : (product.gtips as any)?.code) ?? "-"}
                          </td>
                          <td className="px-4 py-4 text-xs text-black/60">
                            {productAttributes.length ? productAttributes.join(", ") : "-"}
                          {weightKg !== null ? (
                            <div className="mt-1 text-[11px] text-black/50">
                              AÄŸÄ±rlÄ±k:{" "}
                              {Number(weightKg).toLocaleString("tr-TR", {
                                maximumFractionDigits: 2,
                              })}{" "}
                              kg
                            </div>
                          ) : null}
                        </td>
                        {!isSales ? (
                          <td className="px-4 py-4 text-right text-sm font-semibold text-black/80">
                            {fmtMoney(costInfo?.basePrice ?? null)}
                          </td>
                        ) : null}
                        {!isSales ? (
                          <td className="px-4 py-4 text-right text-sm font-semibold text-black">
                            {fmtMoney(costInfo?.kdvSizMaliyet ?? null)}
                          </td>
                        ) : null}
                        <td className="px-4 py-4 text-right">
                          <Link
                            href={`/products/${product.id}`}
                            className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold text-black/70"
                          >
                            Detay
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
            Henuz urun yok.
          </div>
        )}
        {totalCount > perPage ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-xs text-black/60">
              Sayfa {currentPage} / {totalPages}
            </span>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/products${buildQuery({ page: String(currentPage - 1) })}`}
                aria-disabled={currentPage <= 1}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  currentPage <= 1
                    ? "cursor-not-allowed border border-black/10 text-black/30"
                    : "border border-black/20 text-black/70"
                }`}
              >
                Onceki
              </Link>
              <Link
                href={`/products${buildQuery({ page: String(currentPage + 1) })}`}
                aria-disabled={currentPage >= totalPages}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  currentPage >= totalPages
                    ? "cursor-not-allowed border border-black/10 text-black/30"
                    : "border border-black/20 text-black/70"
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



