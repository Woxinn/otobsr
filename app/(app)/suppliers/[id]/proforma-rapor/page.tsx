import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";
import SupplierProformaReportTable from "@/components/SupplierProformaReportTable";

type SearchParams = {
  q?: string;
  proformas?: string | string[];
  orders?: string | string[];
  proformaFrom?: string;
  proformaTo?: string;
  orderFrom?: string;
  orderTo?: string;
  onlyDiff?: string;
  diffType?: string;
  sortBy?: string;
  sortDir?: string;
};

const toArray = (value: string | string[] | undefined) => {
  if (!value) return [] as string[];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
};

const fmtNum = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 4 });

const fmtMoney = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

const normalizeCode = (value: string | null | undefined) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ");

const looseCode = (value: string | null | undefined) =>
  normalizeCode(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const itemKeyFrom = (params: {
  productId?: string | null;
  productCode?: string | null;
  productName?: string | null;
}) => {
  const code = normalizeCode(params.productCode);
  if (code) return `code:${code.toLowerCase()}`;
  if (params.productId) return `id:${params.productId}`;
  const name = normalizeCode(params.productName);
  if (name) return `name:${name.toLowerCase()}`;
  return "unknown";
};

export default async function SupplierProformaReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id: supplierId }, resolved] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const isPriv = role === "Admin" || role === "Yonetim";
  if (!isPriv) {
    return <div className="p-6 text-sm text-red-600">Erisim yok.</div>;
  }

  const { data: supplier } = await supabase.from("suppliers").select("id, name").eq("id", supplierId).maybeSingle();
  if (!supplier) return notFound();

  const selectedProformaIds = toArray(resolved.proformas);
  const selectedOrderIds = toArray(resolved.orders);
  const proformaFrom = resolved.proformaFrom?.trim() || "";
  const proformaTo = resolved.proformaTo?.trim() || "";
  const orderFrom = resolved.orderFrom?.trim() || "";
  const orderTo = resolved.orderTo?.trim() || "";
  const onlyDiff = resolved.onlyDiff === "1";
  const q = (resolved.q ?? "").trim().toLowerCase();
  const diffType = (resolved.diffType ?? "all").trim().toLowerCase();
  const sortByRaw = (resolved.sortBy ?? "product_code").trim().toLowerCase();
  const sortDir = (resolved.sortDir ?? "asc").trim().toLowerCase() === "desc" ? "desc" : "asc";
  const sortBy = (
    [
      "product_code",
      "product_name",
      "proforma_qty",
      "order_qty",
      "diff_qty",
      "proforma_amount",
      "order_amount",
      "diff_amount",
    ] as const
  ).includes(sortByRaw as any)
    ? (sortByRaw as
        | "product_code"
        | "product_name"
        | "proforma_qty"
        | "order_qty"
        | "diff_qty"
        | "proforma_amount"
        | "order_amount"
        | "diff_amount")
    : "product_code";

  let proformaQuery = supabase
    .from("proformas")
    .select("id, proforma_no, name, proforma_date, status, currency, total_amount")
    .eq("supplier_id", supplierId)
    .neq("status", "iptal")
    .order("proforma_date", { ascending: false, nullsFirst: false });
  if (selectedProformaIds.length) proformaQuery = proformaQuery.in("id", selectedProformaIds);
  if (proformaFrom) proformaQuery = proformaQuery.gte("proforma_date", proformaFrom);
  if (proformaTo) proformaQuery = proformaQuery.lte("proforma_date", proformaTo);
  const { data: proformas, error: proformasErr } = await proformaQuery;
  if (proformasErr) {
    return <div className="p-6 text-sm text-red-600">Proformalar okunamadi: {proformasErr.message}</div>;
  }

  let ordersQuery = supabase
    .from("orders")
    .select("id, name, created_at, currency, total_amount, order_status")
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false });
  if (selectedOrderIds.length) ordersQuery = ordersQuery.in("id", selectedOrderIds);
  if (orderFrom) ordersQuery = ordersQuery.gte("created_at", `${orderFrom}T00:00:00`);
  if (orderTo) ordersQuery = ordersQuery.lte("created_at", `${orderTo}T23:59:59`);
  const { data: orders, error: ordersErr } = await ordersQuery;
  if (ordersErr) {
    return <div className="p-6 text-sm text-red-600">Siparisler okunamadi: {ordersErr.message}</div>;
  }

  const proformaIds = (proformas ?? []).map((p) => p.id);
  const orderIds = (orders ?? []).map((o) => o.id);
  const proformaById = new Map(
    (proformas ?? []).map((p) => [
      String(p.id),
      {
        no: String(p.proforma_no ?? p.id),
        name: String((p as any).name ?? "").trim() || null,
        date: p.proforma_date as string | null,
        currency: p.currency as string | null,
        status: p.status as string | null,
      },
    ])
  );
  const orderById = new Map(
    (orders ?? []).map((o) => [
      String(o.id),
      {
        name: String(o.name ?? o.id),
        date: o.created_at as string | null,
        currency: o.currency as string | null,
        status: o.order_status as string | null,
      },
    ])
  );

  const pageSize = 1000;
  const IN_CHUNK_SIZE = 60;
  const PRODUCT_ID_CHUNK_SIZE = 80;
  const fetchAllByIds = async (
    table: "proforma_items" | "order_items",
    idColumn: "proforma_id" | "order_id",
    ids: string[],
    select: string
  ) => {
    if (!ids.length) return [] as any[];
    const out: any[] = [];
    for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
      const idChunk = ids.slice(i, i + IN_CHUNK_SIZE);
      for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from(table)
          .select(select)
          .in(idColumn, idChunk)
          .range(from, to);
        if (error) throw error;
        const rows = data ?? [];
        out.push(...rows);
        if (rows.length < pageSize) break;
      }
    }
    return out;
  };

  let proformaItems: any[] = [];
  let orderItems: any[] = [];
  try {
    proformaItems = await fetchAllByIds(
      "proforma_items",
      "proforma_id",
      proformaIds,
      "id, proforma_id, product_id, product_code, product_name, quantity, unit_price, line_total"
    );
    orderItems = await fetchAllByIds(
      "order_items",
      "order_id",
      orderIds,
      "id, order_id, product_id, name, quantity, unit_price, total_amount"
    );
  } catch (err: any) {
    return <div className="p-6 text-sm text-red-600">Kalemler okunamadi: {err?.message ?? "bilinmeyen hata"}</div>;
  }

  const allProductIds = Array.from(
    new Set(
      [
        ...proformaItems.map((row) => row.product_id).filter(Boolean),
        ...orderItems.map((row) => row.product_id).filter(Boolean),
      ] as string[]
    )
  );
  const productsById = new Map<string, { code: string | null; name: string | null }>();
  if (allProductIds.length) {
    for (let i = 0; i < allProductIds.length; i += PRODUCT_ID_CHUNK_SIZE) {
      const chunk = allProductIds.slice(i, i + PRODUCT_ID_CHUNK_SIZE);
      const { data: products, error } = await supabase
        .from("products")
        .select("id, code, name")
        .in("id", chunk);
      if (error) {
        return <div className="p-6 text-sm text-red-600">Urunler okunamadi: {error.message}</div>;
      }
      (products ?? []).forEach((p) => {
        productsById.set(String(p.id), {
          code: p.code ?? null,
          name: p.name ?? null,
        });
      });
    }
  }

  // SipariÅŸ kaleminde product_id boÅŸ olan satÄ±rlar iÃ§in ad->kod fallback (yalnÄ±zca tekil eÅŸleÅŸme).
  const uniqueCodeByName = new Map<string, string>();
  const codeByCode = new Map<string, string>();
  const codeByNetsis = new Map<string, string>();
  const needsNameFallback = orderItems.some((row) => !row.product_id && row.name);
  if (needsNameFallback) {
    const { data: allProducts } = await supabase.from("products").select("code, name, netsis_stok_kodu");
    const nameToCodes = new Map<string, Set<string>>();
    (allProducts ?? []).forEach((p) => {
      const nameKey = normalizeCode(p.name).toLowerCase();
      const code = normalizeCode(p.code);
      const netsisCode = normalizeCode((p as { netsis_stok_kodu?: string | null }).netsis_stok_kodu);
      if (!nameKey || !code) return;
      codeByCode.set(code.toLowerCase(), code);
      if (netsisCode) {
        codeByNetsis.set(netsisCode.toLowerCase(), code);
      }
      const set = nameToCodes.get(nameKey) ?? new Set<string>();
      set.add(code);
      nameToCodes.set(nameKey, set);
    });
    nameToCodes.forEach((codes, nameKey) => {
      if (codes.size === 1) {
        uniqueCodeByName.set(nameKey, Array.from(codes)[0]);
      }
    });
  }

  const summary = {
    proformaQty: 0,
    proformaAmount: 0,
    orderQty: 0,
    orderAmount: 0,
  };
  type DocDetail = {
    id: string;
    label: string;
    date: string | null;
    qty: number;
    amount: number;
    currency: string | null;
    status: string | null;
  };
  const detailsMap = new Map<
    string,
    {
      proformas: Map<string, DocDetail>;
      orders: Map<string, DocDetail>;
    }
  >();
  const ensureDetails = (key: string) => {
    let row = detailsMap.get(key);
    if (!row) {
      row = { proformas: new Map<string, DocDetail>(), orders: new Map<string, DocDetail>() };
      detailsMap.set(key, row);
    }
    return row;
  };
  const rowsMap = new Map<
    string,
    {
      key: string;
      product_id: string | null;
      product_code: string;
      product_name: string;
      proforma_qty: number;
      proforma_amount: number;
      order_qty: number;
      order_amount: number;
    }
  >();

  proformaItems.forEach((row) => {
    const productMeta = row.product_id ? productsById.get(String(row.product_id)) : null;
    const productCode = normalizeCode(row.product_code) || normalizeCode(productMeta?.code) || "-";
    const productName = normalizeCode(row.product_name) || normalizeCode(productMeta?.name) || "-";
    const key = itemKeyFrom({
      productId: row.product_id,
      productCode: row.product_code || productMeta?.code,
      productName: row.product_name || productMeta?.name,
    });
    const qty = Number(row.quantity ?? 0);
    const amount = Number(row.line_total ?? 0) || qty * Number(row.unit_price ?? 0);
    summary.proformaQty += qty;
    summary.proformaAmount += amount;
    const existing = rowsMap.get(key) ?? {
      key,
      product_id: row.product_id ? String(row.product_id) : null,
      product_code: productCode,
      product_name: productName,
      proforma_qty: 0,
      proforma_amount: 0,
      order_qty: 0,
      order_amount: 0,
    };
    if (!existing.product_id && row.product_id) existing.product_id = String(row.product_id);
    if ((!existing.product_code || existing.product_code === "-") && productCode && productCode !== "-") {
      existing.product_code = productCode;
    }
    if ((!existing.product_name || existing.product_name === "-") && productName && productName !== "-") {
      existing.product_name = productName;
    }
    existing.proforma_qty += qty;
    existing.proforma_amount += amount;
    rowsMap.set(key, existing);
    const docId = String(row.proforma_id ?? "");
    if (docId) {
      const docInfo = proformaById.get(docId);
      const detailBucket = ensureDetails(key);
      const current = detailBucket.proformas.get(docId) ?? {
        id: docId,
        label: docInfo ? `${docInfo.no}${docInfo.name ? ` - ${docInfo.name}` : ""}` : docId,
        date: docInfo?.date ?? null,
        qty: 0,
        amount: 0,
        currency: docInfo?.currency ?? null,
        status: docInfo?.status ?? null,
      };
      current.qty += qty;
      current.amount += amount;
      detailBucket.proformas.set(docId, current);
    }
  });

  orderItems.forEach((row) => {
    const productMeta = row.product_id ? productsById.get(String(row.product_id)) : null;
    const normalizedOrderName = normalizeCode(row.name);
    const normalizedOrderNameLower = normalizedOrderName.toLowerCase();
    const fallbackCodeFromCode = codeByCode.get(normalizedOrderNameLower);
    const fallbackCodeFromNetsis = codeByNetsis.get(normalizedOrderNameLower);
    const fallbackCodeFromName = uniqueCodeByName.get(normalizedOrderNameLower);
    const resolvedCode =
      normalizeCode(productMeta?.code) ||
      fallbackCodeFromCode ||
      fallbackCodeFromNetsis ||
      fallbackCodeFromName ||
      "";
    const productCode = resolvedCode || "-";
    const productName = normalizeCode(productMeta?.name) || normalizedOrderName || "-";
    const key = itemKeyFrom({
      productId: row.product_id,
      productCode: resolvedCode || null,
      productName: row.name || productMeta?.name,
    });
    const qty = Number(row.quantity ?? 0);
    const amount = Number(row.total_amount ?? 0) || qty * Number(row.unit_price ?? 0);
    summary.orderQty += qty;
    summary.orderAmount += amount;
    const existing = rowsMap.get(key) ?? {
      key,
      product_id: row.product_id ? String(row.product_id) : null,
      product_code: productCode,
      product_name: productName,
      proforma_qty: 0,
      proforma_amount: 0,
      order_qty: 0,
      order_amount: 0,
    };
    if (!existing.product_id && row.product_id) existing.product_id = String(row.product_id);
    if ((!existing.product_code || existing.product_code === "-") && productCode && productCode !== "-") {
      existing.product_code = productCode;
    }
    if ((!existing.product_name || existing.product_name === "-") && productName && productName !== "-") {
      existing.product_name = productName;
    }
    existing.order_qty += qty;
    existing.order_amount += amount;
    rowsMap.set(key, existing);
    const docId = String(row.order_id ?? "");
    if (docId) {
      const docInfo = orderById.get(docId);
      const detailBucket = ensureDetails(key);
      const current = detailBucket.orders.get(docId) ?? {
        id: docId,
        label: docInfo?.name ?? docId,
        date: docInfo?.date ?? null,
        qty: 0,
        amount: 0,
        currency: docInfo?.currency ?? null,
        status: docInfo?.status ?? null,
      };
      current.qty += qty;
      current.amount += amount;
      detailBucket.orders.set(docId, current);
    }
  });

  let rows = Array.from(rowsMap.values()).map((row) => ({
    ...row,
    diff_qty: row.order_qty - row.proforma_qty,
    diff_amount: row.order_amount - row.proforma_amount,
    proforma_details: Array.from(detailsMap.get(row.key)?.proformas.values() ?? []).sort((a, b) =>
      String(b.date ?? "").localeCompare(String(a.date ?? ""))
    ),
    order_details: Array.from(detailsMap.get(row.key)?.orders.values() ?? []).sort((a, b) =>
      String(b.date ?? "").localeCompare(String(a.date ?? ""))
    ),
  }));
  rows = rows.map((row) => {
    if (row.product_code !== "-" || !row.product_name || row.product_name === "-") return row;
    const nameKey = normalizeCode(row.product_name).toLowerCase();
    const fallbackCode =
      codeByCode.get(nameKey) || codeByNetsis.get(nameKey) || uniqueCodeByName.get(nameKey) || "-";
    return fallbackCode === "-" ? row : { ...row, product_code: fallbackCode };
  });

  // id/code farkindan kaynakli parcali satirlari tek urunde birlestir.
  const mergedByCanonical = new Map<string, (typeof rows)[number]>();
  const mergeDocDetails = (left: any[], right: any[]) => {
    const docMap = new Map<string, any>();
    [...left, ...right].forEach((d) => {
      const key = String(d.id);
      const current = docMap.get(key);
      if (!current) {
        docMap.set(key, { ...d });
        return;
      }
      current.qty = Number(current.qty ?? 0) + Number(d.qty ?? 0);
      current.amount = Number(current.amount ?? 0) + Number(d.amount ?? 0);
      if (!current.date && d.date) current.date = d.date;
      if (!current.currency && d.currency) current.currency = d.currency;
      if (!current.status && d.status) current.status = d.status;
      if (!current.label && d.label) current.label = d.label;
    });
    return Array.from(docMap.values()).sort((a, b) =>
      String(b.date ?? "").localeCompare(String(a.date ?? ""))
    );
  };

  rows.forEach((row) => {
    const code = normalizeCode(row.product_code);
    const codeFromId = row.product_id ? normalizeCode(productsById.get(row.product_id)?.code) : "";
    const name = normalizeCode(row.product_name).toLowerCase();
    const loose = looseCode(code);
    const looseFromId = looseCode(codeFromId);
    const canonical =
      (loose ? `code:${loose}` : "") ||
      (looseFromId ? `code:${looseFromId}` : "") ||
      (row.product_id ? `id:${row.product_id}` : "") ||
      (name ? `name:${name}` : row.key);

    const existing = mergedByCanonical.get(canonical);
    if (!existing) {
      mergedByCanonical.set(canonical, { ...row, key: canonical });
      return;
    }

    existing.proforma_qty += row.proforma_qty;
    existing.proforma_amount += row.proforma_amount;
    existing.order_qty += row.order_qty;
    existing.order_amount += row.order_amount;
    existing.diff_qty = existing.order_qty - existing.proforma_qty;
    existing.diff_amount = existing.order_amount - existing.proforma_amount;
    if ((!existing.product_code || existing.product_code === "-") && row.product_code && row.product_code !== "-") {
      existing.product_code = row.product_code;
    }
    if ((!existing.product_name || existing.product_name === "-") && row.product_name && row.product_name !== "-") {
      existing.product_name = row.product_name;
    }
    if (!existing.product_id && row.product_id) existing.product_id = row.product_id;
    existing.proforma_details = mergeDocDetails(existing.proforma_details, row.proforma_details);
    existing.order_details = mergeDocDetails(existing.order_details, row.order_details);
  });
  rows = Array.from(mergedByCanonical.values());
  if (onlyDiff) {
    rows = rows.filter((row) => Math.abs(row.diff_qty) > 0.0001 || Math.abs(row.diff_amount) > 0.0001);
  }
  if (diffType === "missing") {
    rows = rows.filter((row) => row.diff_qty < -0.0001 || (Math.abs(row.diff_qty) <= 0.0001 && row.diff_amount < -0.0001));
  } else if (diffType === "excess") {
    rows = rows.filter((row) => row.diff_qty > 0.0001 || (Math.abs(row.diff_qty) <= 0.0001 && row.diff_amount > 0.0001));
  } else if (diffType === "equal") {
    rows = rows.filter((row) => Math.abs(row.diff_qty) <= 0.0001 && Math.abs(row.diff_amount) <= 0.0001);
  }
  if (q) {
    rows = rows.filter((row) =>
      [row.product_code, row.product_name].join(" ").toLowerCase().includes(q)
    );
  }
  rows.sort((a, b) => {
    const stringCompare = (x: string, y: string) => x.localeCompare(y, "tr");
    let result = 0;
    if (sortBy === "product_code") result = stringCompare(a.product_code, b.product_code);
    else if (sortBy === "product_name") result = stringCompare(a.product_name, b.product_name);
    else result = Number(a[sortBy]) - Number(b[sortBy]);
    return sortDir === "asc" ? result : -result;
  });

  const filteredSummary = rows.reduce(
    (acc, row) => {
      acc.proformaQty += Number(row.proforma_qty ?? 0);
      acc.proformaAmount += Number(row.proforma_amount ?? 0);
      acc.orderQty += Number(row.order_qty ?? 0);
      acc.orderAmount += Number(row.order_amount ?? 0);
      return acc;
    },
    { proformaQty: 0, proformaAmount: 0, orderQty: 0, orderAmount: 0 }
  );
  const diffQtyTotal = filteredSummary.orderQty - filteredSummary.proformaQty;
  const diffAmountTotal = filteredSummary.orderAmount - filteredSummary.proformaAmount;
  const diffQtyCardLabel =
    diffType === "missing" ? "Eksik adet" : diffType === "excess" ? "Fazla adet" : "Fark adet";
  const diffAmountCardLabel =
    diffType === "missing" ? "Eksik tutar" : diffType === "excess" ? "Fazla tutar" : "Fark tutar";
  const diffQtyCardValue =
    diffType === "missing"
      ? Math.max(0, -diffQtyTotal)
      : diffType === "excess"
      ? Math.max(0, diffQtyTotal)
      : diffQtyTotal;
  const diffAmountCardValue =
    diffType === "missing"
      ? Math.max(0, -diffAmountTotal)
      : diffType === "excess"
      ? Math.max(0, diffAmountTotal)
      : diffAmountTotal;
  const currencies = Array.from(
    new Set([...(proformas ?? []).map((p) => p.currency), ...(orders ?? []).map((o) => o.currency)].filter(Boolean))
  );
  const reportCurrency = currencies.length === 1 ? String(currencies[0]) : "KARISIK";

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">Detayli Karsilastirma Raporu</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">{supplier.name}</h1>
        </div>
        <Link
          href={`/suppliers/${supplierId}`}
          className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/70"
        >
          Tedarikci detayina don
        </Link>
      </div>

      <form className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <label className="text-sm font-medium text-black/70">
            Proforma tarih baÅŸlangÄ±Ã§
            <input
              type="date"
              name="proformaFrom"
              defaultValue={proformaFrom}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-black/70">
            Proforma tarih bitiÅŸ
            <input
              type="date"
              name="proformaTo"
              defaultValue={proformaTo}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-black/70">
            SipariÅŸ tarih baÅŸlangÄ±Ã§
            <input
              type="date"
              name="orderFrom"
              defaultValue={orderFrom}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-black/70">
            SipariÅŸ tarih bitiÅŸ
            <input
              type="date"
              name="orderTo"
              defaultValue={orderTo}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-black/70">
            ÃœrÃ¼n arama
            <input
              name="q"
              defaultValue={resolved.q ?? ""}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
              placeholder="Kod veya ad"
            />
          </label>
          <label className="flex items-end gap-2 text-sm font-medium text-black/70">
            <input type="checkbox" name="onlyDiff" value="1" defaultChecked={onlyDiff} />
            Sadece fark olanlar
          </label>
          <label className="text-sm font-medium text-black/70">
            Fark filtresi
            <select
              name="diffType"
              defaultValue={diffType}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            >
              <option value="all">Hepsi</option>
              <option value="missing">Sadece eksik olanlar</option>
              <option value="excess">Sadece fazla olanlar</option>
              <option value="equal">Sadece esit olanlar</option>
            </select>
          </label>
          <label className="text-sm font-medium text-black/70">
            Sirala
            <select
              name="sortBy"
              defaultValue={sortBy}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            >
              <option value="product_code">Urun kodu</option>
              <option value="product_name">Urun adi</option>
              <option value="proforma_qty">Proforma adet</option>
              <option value="order_qty">Siparis adet</option>
              <option value="diff_qty">Fark adet</option>
              <option value="proforma_amount">Proforma tutar</option>
              <option value="order_amount">Siparis tutar</option>
              <option value="diff_amount">Fark tutar</option>
            </select>
          </label>
          <label className="text-sm font-medium text-black/70">
            Sira yonu
            <select
              name="sortDir"
              defaultValue={sortDir}
              className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            >
              <option value="asc">Artan</option>
              <option value="desc">Azalan</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-black/70">
            Proformalar (Ã§oklu)
            <select
              name="proformas"
              multiple
              defaultValue={selectedProformaIds}
              className="mt-2 h-40 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            >
              {(proformas ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.proforma_no} {(p as any).name ? `- ${(p as any).name}` : ""} ({p.proforma_date ?? "-"})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-black/70">
            SipariÅŸler (Ã§oklu)
            <select
              name="orders"
              multiple
              defaultValue={selectedOrderIds}
              className="mt-2 h-40 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            >
              {(orders ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name ?? o.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
            Raporu gÃ¼ncelle
          </button>
          <button
            formAction={`/api/suppliers/${supplierId}/proforma-rapor/export`}
            className="rounded-full border border-[var(--ocean)]/40 bg-[var(--ocean)]/10 px-4 py-2 text-sm font-semibold text-[var(--ocean)]"
          >
            Excel export
          </button>
          <Link
            href={`/suppliers/${supplierId}/proforma-rapor`}
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold text-black/70"
          >
            SÄ±fÄ±rla
          </Link>
        </div>
      </form>

      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">Proforma adet</div>
          <div className="mt-2 text-xl font-semibold">{fmtNum(filteredSummary.proformaQty)}</div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">SipariÅŸ adet</div>
          <div className="mt-2 text-xl font-semibold">{fmtNum(filteredSummary.orderQty)}</div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">{diffQtyCardLabel}</div>
          <div className={`mt-2 text-xl font-semibold ${diffType === "all" && diffQtyTotal < 0 ? "text-red-700" : "text-black"}`}>
            {fmtNum(diffQtyCardValue)}
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">Proforma tutar</div>
          <div className="mt-2 text-xl font-semibold">{fmtMoney(filteredSummary.proformaAmount)} {reportCurrency}</div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">SipariÅŸ tutar</div>
          <div className="mt-2 text-xl font-semibold">{fmtMoney(filteredSummary.orderAmount)} {reportCurrency}</div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">{diffAmountCardLabel}</div>
          <div className={`mt-2 text-xl font-semibold ${diffType === "all" && diffAmountTotal < 0 ? "text-red-700" : "text-black"}`}>
            {fmtMoney(diffAmountCardValue)} {reportCurrency}
          </div>
        </div>
      </div>

      <SupplierProformaReportTable rows={rows} />

    </section>
  );
}

