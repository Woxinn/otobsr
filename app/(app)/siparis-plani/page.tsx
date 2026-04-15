import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole, canViewModule } from "@/lib/roles";
import Sales10ySyncButton from "@/components/Sales10ySyncButton";
import RfqCreateModal from "@/components/RfqCreateModal";
import OrderPlanLiveTable from "@/components/OrderPlanLiveTable";
import { updateOrderPlanDefaults } from "@/app/actions/order-plan";

const FALLBACK_LEAD_TIME_DAYS = 105;
const FALLBACK_SAFETY_DAYS = 15;

type SearchParams = {
  q?: string;
  page?: string;
  perPage?: string;
  group?: string | string[];
  supplier?: string;
  gtip?: string;
  filledOnly?: string;
  needOnly?: string;
  quantityFilter?: string;
};

const DELIVERED_STATUS_TOKENS = new Set(["depoya teslim edildi", "depoya teslim", "delivered"]);

const normalizeStatusToken = (value: string | null | undefined) =>
  String(value ?? "")
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("İ", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/\s+/g, " ")
    .trim();

const extractOrderStatus = (ordersField: any) => {
  if (!ordersField) return "";
  if (Array.isArray(ordersField)) return String(ordersField[0]?.order_status ?? "");
  return String(ordersField.order_status ?? "");
};

const fetchTransitByProduct = async (supabase: any, productIds: string[]) => {
  const totals: Record<string, number> = {};
  if (!productIds.length) return totals;

  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("order_items")
      .select("product_id, quantity, orders!inner(order_status)")
      .in("product_id", productIds)
      .range(from, to);

    if (error) {
      // eslint-disable-next-line no-console
      console.error("[siparis-plani] transit(order_items) query error", error);
      break;
    }
    if (!data?.length) break;

    (data as any[]).forEach((row) => {
      const pid = row.product_id as string | null;
      if (!pid) return;
      const status = normalizeStatusToken(extractOrderStatus(row.orders));
      if (DELIVERED_STATUS_TOKENS.has(status)) return;
      const qty = Number(row.quantity ?? 0);
      totals[pid] = (totals[pid] ?? 0) + qty;
    });

    if (data.length < pageSize) break;
  }

  // Fallback: view'den kalan eksikleri tamamla (özellikle eski/null product_id senaryoları için).
  const unresolved = productIds.filter((id) => totals[id] === undefined);
  if (!unresolved.length) return totals;

  const { data: viewRows, error: viewError } = await supabase
    .from("order_transit_totals")
    .select("product_id, transit_qty")
    .in("product_id", unresolved);

  if (viewError) {
    // eslint-disable-next-line no-console
    console.error("[siparis-plani] transit(order_transit_totals) fallback error", viewError);
    return totals;
  }

  (viewRows ?? []).forEach((row: any) => {
    const pid = row.product_id as string | null;
    if (!pid) return;
    totals[pid] = Number(row.transit_qty ?? 0);
  });

  return totals;
};


export const metadata: Metadata = {
  title: "Sipariş Planı",
};

export default async function OrderPlanPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "order-plan")) {
    return <div className="p-6 text-sm text-red-600">Erişim yok.</div>;
  }

  const { data: groups } = await supabase
    .from("product_groups")
    .select("id, name, lead_time_days, safety_days")
    .order("name");

  const { data: planDefaults } = await supabase
    .from("order_plan_defaults")
    .select("lead_time_days, safety_days")
    .eq("id", 1)
    .maybeSingle();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name");

  const { data: gtips } = await supabase.from("gtips").select("id, code").order("code");

  const { data: groupStatsRaw } = await supabase
    .from("product_groups")
    .select("id, name, products(count)")
    .order("name");

  const { count: totalProductsCount } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true });

  const { count: uncategorizedCount } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .is("group_id", null);

  const query = resolvedParams.q?.trim();
  const safeQuery = query ? query.replace(/,/g, " ") : "";
  const queryTokens = safeQuery
    ? safeQuery
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
    : [];
  const perPageOptions = [10, 20, 50, 100, 250, 500, 1000];
  const perPageParam = Number(resolvedParams.perPage ?? "");
  const perPage = perPageOptions.includes(perPageParam) ? perPageParam : 100;
  const requestedPage = Math.max(1, Number(resolvedParams.page ?? "1") || 1);
  const quantityFilter = resolvedParams.quantityFilter ?? "";
  const filledOnly =
    quantityFilter === "filled" || quantityFilter === "both"
      ? true
      : (resolvedParams.filledOnly ?? "") === "1";
  const needOnly =
    quantityFilter === "need" || quantityFilter === "both"
      ? true
      : (resolvedParams.needOnly ?? "") === "1";
  const quantityFilterDefault =
    resolvedParams.quantityFilter ??
    (filledOnly && needOnly ? "both" : filledOnly ? "filled" : needOnly ? "need" : "");
  const selectedGroupIds = Array.isArray(resolvedParams.group)
    ? resolvedParams.group
    : resolvedParams.group
    ? resolvedParams.group.split(",").filter(Boolean)
    : [];

  const resolveLeadSafety = (groupId?: string | null) => {
    const group = groups?.find((g) => g.id === groupId);
    const lead = group?.lead_time_days ?? planDefaults?.lead_time_days ?? FALLBACK_LEAD_TIME_DAYS;
    const safety = group?.safety_days ?? planDefaults?.safety_days ?? FALLBACK_SAFETY_DAYS;
    return { lead, safety };
  };
  const { data: filledEntries } = filledOnly
    ? await supabase.from("order_plan_entries").select("product_id").gt("value", 0)
    : { data: null as { product_id: string }[] | null };
  const filledProductIds = filledOnly
    ? Array.from(
        new Set((filledEntries ?? []).map((row) => row.product_id).filter(Boolean))
      )
    : [];

  const buildProductsQuery = (forCount: boolean) => {
    const baseSelect =
      "id, code, name, brand, description, netsis_stok_kodu, group_id, gtip_id";
    const select = resolvedParams.supplier
      ? `${baseSelect}, supplier_product_aliases!inner(supplier_id)`
      : baseSelect;
    let queryBuilder = supabase
      .from("products")
      .select(select, { count: "exact", head: forCount })
      .order("created_at", { ascending: false });

    if (queryTokens.length) {
      if (queryTokens.length === 1) {
        const term = queryTokens[0];
        queryBuilder = queryBuilder.or(
          `code.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`
        );
      } else {
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
    if (resolvedParams.supplier) {
      queryBuilder = queryBuilder.eq("supplier_product_aliases.supplier_id", resolvedParams.supplier);
    }
    if (resolvedParams.gtip) {
      if (resolvedParams.gtip === "none") {
        queryBuilder = queryBuilder.is("gtip_id", null);
      } else {
        queryBuilder = queryBuilder.eq("gtip_id", resolvedParams.gtip);
      }
    }
    if (filledOnly && filledProductIds.length > 0) {
      queryBuilder = queryBuilder.in("id", filledProductIds);
    }
    return queryBuilder;
  };
  let totalCount = 0;
  let totalPages = 1;
  let currentPage = 1;
  let startIndexProducts = 0;
  let productList: any[] = [];

  if (!(filledOnly && filledProductIds.length === 0)) {
    const { count: totalCountRaw } = await buildProductsQuery(true);
    totalCount = totalCountRaw ?? 0;
    totalPages = Math.max(1, Math.ceil(totalCount / perPage));
    currentPage = Math.min(requestedPage, totalPages);
    startIndexProducts = totalCount ? (currentPage - 1) * perPage : 0;

    const { data: products } = await buildProductsQuery(false).range(
      startIndexProducts,
      Math.max(startIndexProducts, startIndexProducts + perPage - 1)
    );
    productList = (products ?? []) as any[];
  }

  const productIds = Array.from(new Set(productList.map((p: any) => p.id).filter(Boolean)));

  const { data: sales10yRows } = await supabase
    .from("product_sales_10y_totals")
    .select("product_id, total_10y");

  const sales10yByProduct = new Map<string, number>();
  (sales10yRows ?? []).forEach((row) => {
    if (row.product_id) sales10yByProduct.set(row.product_id, Number(row.total_10y ?? 0));
  });

  const inTransitByProduct = await fetchTransitByProduct(supabase, productIds);

  // RFQ'da bekleyen miktarlar (kapatildi/closed hariç)
  const { data: rfqItems } = await supabase
    .from("rfq_items")
    .select("product_id, quantity, rfqs!inner(status)")
    .not("rfqs.status", "in", "(kapatildi,closed)");
  const rfqByProduct = new Map<string, number>();
  (rfqItems ?? []).forEach((row) => {
    const pid = row.product_id as string | null;
    if (!pid) return;
    const qty = Number(row.quantity ?? 0);
    rfqByProduct.set(pid, (rfqByProduct.get(pid) ?? 0) + qty);
  });

  const { data: planEntries } = await supabase.from("order_plan_entries").select("*");
  const planByProduct = new Map<
    string,
    { value?: number | null; need_qty?: number | null; suggest_qty?: number | null }
  >();
  (planEntries ?? []).forEach((row) => {
    planByProduct.set(row.product_id, row);
  });

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
    const quantityFilterValue = overrides.quantityFilter ?? resolvedParams.quantityFilter ?? "";
    let filledOnlyValue = overrides.filledOnly ?? resolvedParams.filledOnly;
    let needOnlyValue = overrides.needOnly ?? resolvedParams.needOnly;
    if (quantityFilterValue === "filled") {
      filledOnlyValue = "1";
      needOnlyValue = "";
    } else if (quantityFilterValue === "need") {
      needOnlyValue = "1";
      filledOnlyValue = "";
    } else if (quantityFilterValue === "both") {
      filledOnlyValue = "1";
      needOnlyValue = "1";
    }
    const perPageValue = overrides.perPage ?? String(perPage);
    const pageValue = overrides.page ?? String(currentPage);
    if (q) params.set("q", q);
    if (normalizedGroups.length) params.set("group", normalizedGroups.join(","));
    if (supplier) params.set("supplier", supplier);
    if (gtip) params.set("gtip", gtip);
    if (quantityFilterValue) params.set("quantityFilter", quantityFilterValue);
    if (filledOnlyValue === "1") params.set("filledOnly", "1");
    if (needOnlyValue === "1") params.set("needOnly", "1");
    if (perPageValue) params.set("perPage", String(perPageValue));
    if (pageValue && Number(pageValue) > 1) params.set("page", String(pageValue));
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const toggleGroupQuery = (groupId: string) => {
    const nextGroups = selectedGroupIds.includes(groupId)
      ? selectedGroupIds.filter((id) => id !== groupId)
      : [...selectedGroupIds, groupId];
    return buildQuery({ group: nextGroups, page: "1" });
  };

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

  const startIndex = startIndexProducts;
  const endIndex = totalCount ? Math.min(startIndexProducts + perPage, totalCount) : 0;
  const orderPlanRows = productList.map((p: any) => {
    const inTransit = inTransitByProduct[p.id] ?? 0;
    const rfqQty = rfqByProduct.get(p.id) ?? 0;
    const { lead, safety } = resolveLeadSafety((p as { group_id?: string | null })?.group_id);
    const existing = planByProduct.get(p.id);
    return {
      id: String(p.id),
      code: String(p.code ?? ""),
      name: String(p.name ?? ""),
      brand: p.brand ? String(p.brand) : null,
      description: p.description ? String(p.description) : null,
      groupName: groups?.find((g) => g.id === (p as { group_id?: string })?.group_id)?.name ?? "Kategori yok",
      netsisCode: p.netsis_stok_kodu ? String(p.netsis_stok_kodu).trim() : "",
      inTransit,
      rfqQty,
      sales10y: sales10yByProduct.get(p.id) ?? 0,
      lead,
      safety,
      defaultValue: existing?.value ?? null,
    };
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">Sipariş Planı</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">Sipariş Planı</h1>
        </div>
        <div className="flex items-center gap-3">
          <RfqCreateModal suppliers={suppliers ?? []} />
          <Link
            href={`/api/order-plan-export${buildQuery({})}`}
            className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/70"
          >
            Excel Dışa Aktar
          </Link>
          <Link
            href={`/api/order-plan-export-bydb${buildQuery({})}`}
            className="rounded-full border border-[var(--ocean)] px-4 py-2 text-sm font-semibold text-[var(--ocean)] hover:bg-[var(--ocean)]/10"
          >
            DB Bazlı Satış Excel
          </Link>
          <Link
            href="/products"
            className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/70"
          >
            Ürünler
          </Link>
        </div>
      </div>

      <Sales10ySyncButton />

      {(role === "Admin" || role === "Yonetim") && (
        <div className="grid gap-3 rounded-3xl border border-black/10 bg-white p-5 shadow-sm md:grid-cols-3">
          <div className="md:col-span-2">
            <p className="text-xs uppercase tracking-[0.25em] text-black/45">Lead / Safety</p>
            <p className="text-sm text-black/70">
              Varsayılan değerleri buradan güncelle. Kategori bazlı override için{" "}
              <Link href="/product-groups" className="font-semibold text-[var(--ocean)] underline">
                Ürün kategorileri
              </Link>{" "}
              sayfasında ilgili satırı düzenle.
            </p>
          </div>
          <form action={updateOrderPlanDefaults} className="flex items-end gap-3 md:justify-end">
            <div>
              <label className="text-xs text-black/60">Lead time (gün)</label>
              <input
                type="number"
                name="lead_time_days"
                min={0}
                defaultValue={planDefaults?.lead_time_days ?? FALLBACK_LEAD_TIME_DAYS}
                className="w-28 rounded-xl border border-black/10 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-black/60">Safety (gün)</label>
              <input
                type="number"
                name="safety_days"
                min={0}
                defaultValue={planDefaults?.safety_days ?? FALLBACK_SAFETY_DAYS}
                className="w-28 rounded-xl border border-black/10 px-3 py-2 text-sm"
              />
            </div>
            <button className="h-10 rounded-full bg-[var(--ocean)] px-4 text-xs font-semibold text-white">
              Kaydet
            </button>
          </form>
        </div>
      )}

      <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-black/40">Ürün istatistikleri</p>
            <p className="text-lg font-semibold text-black">
              Toplam ürün: {totalProductsCount ?? 0}
            </p>
          </div>
          <div className="text-xs text-black/60">
            Gösterilen: {totalCount ? `${startIndex + 1}-${endIndex}` : "0"} / {` ${totalCount}`}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-black/70">
          {groupStats.map((group) => (
            <Link
              href={`/siparis-plani${toggleGroupQuery(group.id)}`}
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
        {selectedGroupIds.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-black/60">Seçili kategoriler:</span>
            {selectedGroupIds.map((gid) => (
              <Link
                key={gid}
                href={`/siparis-plani${buildQuery({
                  group: selectedGroupIds.filter((id) => id !== gid),
                  page: "1",
                })}`}
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--ocean)]/10 px-3 py-1 font-semibold text-[var(--ocean)]"
              >
                {groups?.find((g) => g.id === gid)?.name ?? gid}
                <span className="rounded-full bg-[var(--ocean)]/20 px-2 py-[2px] text-[10px] font-bold text-[var(--ocean)]/80 group-hover:bg-[var(--ocean)]/30">
                  ×
                </span>
              </Link>
            ))}
            <Link
              href="/siparis-plani"
              className="rounded-full border border-black/20 px-3 py-1 font-semibold text-black/70"
            >
              Temizle
            </Link>
          </div>
        ) : null}
      </div>

      <form className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <input type="hidden" name="page" value="1" />
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <label className="text-sm font-medium text-black/70">
            Arama
            <input
              name="q"
              defaultValue={resolvedParams.q ?? ""}
              placeholder="Ürün kodu, adı, marka"
            className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
        </label>
          <label className="text-sm font-medium text-black/70">
            Kategori
            <select
              name="group"
              multiple
              defaultValue={selectedGroupIds}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            >
              {groups?.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-black/70">
            Tedarikçi
            <select
              name="supplier"
              defaultValue={resolvedParams.supplier ?? ""}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-black/70">
            GTIP
            <select
              name="gtip"
              defaultValue={resolvedParams.gtip ?? ""}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              <option value="none">GTIP yok</option>
              {gtips?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-black/70">
            Miktar filtresi
            <select
              name="quantityFilter"
              defaultValue={quantityFilterDefault}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              <option value="filled">Sadece inputu dolu olanlar</option>
              <option value="need">Sadece ihtiyac &gt; 0 olanlar</option>
              <option value="both">Inputu dolu VE ihtiyacı &gt; 0 olanlar</option>
            </select>
          </label>
          <label className="text-sm font-medium text-black/70">
            Sayfada
            <select
              name="perPage"
              defaultValue={String(perPage)}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            >
              {perPageOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} ürün
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
            Filtrele
          </button>
          <Link
            href="/siparis-plani"
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold text-black/70"
          >
            Temizle
          </Link>
        </div>
      </form>

      <div className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm">
        <div className="overflow-x-auto">
          <OrderPlanLiveTable rows={orderPlanRows} needOnly={needOnly} />
        </div>
        {totalCount > perPage ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-xs text-black/60">
              Sayfa {currentPage} / {totalPages}
            </span>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/siparis-plani${buildQuery({ page: String(currentPage - 1) })}`}
                aria-disabled={currentPage <= 1}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  currentPage <= 1
                    ? "cursor-not-allowed border border-black/10 text-black/30"
                    : "border border-black/20 text-black/70"
                }`}
              >
                Önceki
              </Link>
              <Link
                href={`/siparis-plani${buildQuery({ page: String(currentPage + 1) })}`}
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





