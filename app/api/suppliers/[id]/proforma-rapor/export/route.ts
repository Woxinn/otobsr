import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

const toArray = (value: string | null) =>
  String(value ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const toArrayFromParams = (searchParams: URLSearchParams, key: string) => {
  const out: string[] = [];
  searchParams.getAll(key).forEach((raw) => {
    out.push(...toArray(raw));
  });
  return Array.from(new Set(out));
};

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

const fmtNum = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 4 });

const fmtMoney = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!(role === "Admin" || role === "Yonetim")) {
    return NextResponse.json({ error: "Erisim yok" }, { status: 403 });
  }

  const { id: supplierId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const selectedProformaIds = toArrayFromParams(searchParams, "proformas");
  const selectedOrderIds = toArrayFromParams(searchParams, "orders");
  const proformaFrom = searchParams.get("proformaFrom")?.trim() || "";
  const proformaTo = searchParams.get("proformaTo")?.trim() || "";
  const orderFrom = searchParams.get("orderFrom")?.trim() || "";
  const orderTo = searchParams.get("orderTo")?.trim() || "";
  const onlyDiff = searchParams.get("onlyDiff") === "1";
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const diffType = (searchParams.get("diffType") ?? "all").trim().toLowerCase();
  const sortByRaw = (searchParams.get("sortBy") ?? "product_code").trim().toLowerCase();
  const sortDir = (searchParams.get("sortDir") ?? "asc").trim().toLowerCase() === "desc" ? "desc" : "asc";
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

  const { data: supplier } = await supabase.from("suppliers").select("id, name").eq("id", supplierId).maybeSingle();
  if (!supplier) return NextResponse.json({ error: "Tedarikci bulunamadi" }, { status: 404 });

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
  if (proformasErr) return NextResponse.json({ error: proformasErr.message }, { status: 500 });

  let ordersQuery = supabase
    .from("orders")
    .select("id, name, created_at, currency, total_amount, order_status")
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: false });
  if (selectedOrderIds.length) ordersQuery = ordersQuery.in("id", selectedOrderIds);
  if (orderFrom) ordersQuery = ordersQuery.gte("created_at", `${orderFrom}T00:00:00`);
  if (orderTo) ordersQuery = ordersQuery.lte("created_at", `${orderTo}T23:59:59`);
  const { data: orders, error: ordersErr } = await ordersQuery;
  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 });

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
    return NextResponse.json({ error: err?.message ?? "Kalemler okunamadi" }, { status: 500 });
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
        .select("id, code, name, netsis_stok_kodu")
        .in("id", chunk);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      (products ?? []).forEach((p) => {
        productsById.set(String(p.id), { code: p.code ?? null, name: p.name ?? null });
      });
    }
  }

  const uniqueCodeByName = new Map<string, string>();
  const codeByCode = new Map<string, string>();
  const codeByNetsis = new Map<string, string>();
  const needsNameFallback = orderItems.some((row) => !row.product_id && row.name);
  if (needsNameFallback) {
    const { data: allProducts } = await supabase.from("products").select("code, name, netsis_stok_kodu");
    const nameToCodes = new Map<string, Set<string>>();
    (allProducts ?? []).forEach((p: any) => {
      const nameKey = normalizeCode(p.name).toLowerCase();
      const code = normalizeCode(p.code);
      const netsisCode = normalizeCode(p.netsis_stok_kodu);
      if (!nameKey || !code) return;
      codeByCode.set(code.toLowerCase(), code);
      if (netsisCode) codeByNetsis.set(netsisCode.toLowerCase(), code);
      const set = nameToCodes.get(nameKey) ?? new Set<string>();
      set.add(code);
      nameToCodes.set(nameKey, set);
    });
    nameToCodes.forEach((codes, nameKey) => {
      if (codes.size === 1) uniqueCodeByName.set(nameKey, Array.from(codes)[0]);
    });
  }

  type DocDetail = { id: string; label: string; qty: number; amount: number; currency: string | null };
  const detailsMap = new Map<string, { proformas: Map<string, DocDetail>; orders: Map<string, DocDetail> }>();
  const ensureDetails = (key: string) => {
    let row = detailsMap.get(key);
    if (!row) {
      row = { proformas: new Map<string, DocDetail>(), orders: new Map<string, DocDetail>() };
      detailsMap.set(key, row);
    }
    return row;
  };

  const rowsMap = new Map<string, any>();
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
    existing.proforma_qty += qty;
    existing.proforma_amount += amount;
    if ((!existing.product_code || existing.product_code === "-") && productCode && productCode !== "-") {
      existing.product_code = productCode;
    }
    if ((!existing.product_name || existing.product_name === "-") && productName && productName !== "-") {
      existing.product_name = productName;
    }
    rowsMap.set(key, existing);
    const docId = String(row.proforma_id ?? "");
    if (docId) {
      const info = proformaById.get(docId);
      const bucket = ensureDetails(key);
      const current = bucket.proformas.get(docId) ?? {
        id: docId,
        label: info ? `${info.no}${info.name ? ` - ${info.name}` : ""}` : docId,
        qty: 0,
        amount: 0,
        currency: info?.currency ?? null,
      };
      current.qty += qty;
      current.amount += amount;
      bucket.proformas.set(docId, current);
    }
  });

  orderItems.forEach((row) => {
    const productMeta = row.product_id ? productsById.get(String(row.product_id)) : null;
    const normalizedName = normalizeCode(row.name);
    const low = normalizedName.toLowerCase();
    const resolvedCode =
      normalizeCode(productMeta?.code) || codeByCode.get(low) || codeByNetsis.get(low) || uniqueCodeByName.get(low) || "";
    const productCode = resolvedCode || "-";
    const productName = normalizeCode(productMeta?.name) || normalizedName || "-";
    const key = itemKeyFrom({
      productId: row.product_id,
      productCode: resolvedCode || null,
      productName: row.name || productMeta?.name,
    });
    const qty = Number(row.quantity ?? 0);
    const amount = Number(row.total_amount ?? 0) || qty * Number(row.unit_price ?? 0);
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
    existing.order_qty += qty;
    existing.order_amount += amount;
    if ((!existing.product_code || existing.product_code === "-") && productCode && productCode !== "-") {
      existing.product_code = productCode;
    }
    if ((!existing.product_name || existing.product_name === "-") && productName && productName !== "-") {
      existing.product_name = productName;
    }
    rowsMap.set(key, existing);
    const docId = String(row.order_id ?? "");
    if (docId) {
      const info = orderById.get(docId);
      const bucket = ensureDetails(key);
      const current = bucket.orders.get(docId) ?? {
        id: docId,
        label: info?.name ?? docId,
        qty: 0,
        amount: 0,
        currency: info?.currency ?? null,
      };
      current.qty += qty;
      current.amount += amount;
      bucket.orders.set(docId, current);
    }
  });

  let rows = Array.from(rowsMap.values()).map((row: any) => ({
    ...row,
    diff_qty: row.order_qty - row.proforma_qty,
    diff_amount: row.order_amount - row.proforma_amount,
    proforma_details: Array.from(detailsMap.get(row.key)?.proformas.values() ?? []),
    order_details: Array.from(detailsMap.get(row.key)?.orders.values() ?? []),
  }));

  const mergedByCanonical = new Map<string, (typeof rows)[number]>();
  rows.forEach((row) => {
    const code = normalizeCode(row.product_code);
    const codeFromId = row.product_id ? normalizeCode(productsById.get(row.product_id)?.code) : "";
    const name = normalizeCode(row.product_name).toLowerCase();
    const canonical =
      (looseCode(code) ? `code:${looseCode(code)}` : "") ||
      (looseCode(codeFromId) ? `code:${looseCode(codeFromId)}` : "") ||
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
    existing.proforma_details = [...existing.proforma_details, ...row.proforma_details];
    existing.order_details = [...existing.order_details, ...row.order_details];
  });
  rows = Array.from(mergedByCanonical.values());

  if (onlyDiff) rows = rows.filter((row) => Math.abs(row.diff_qty) > 0.0001 || Math.abs(row.diff_amount) > 0.0001);
  if (diffType === "missing") {
    rows = rows.filter((row) => row.diff_qty < -0.0001 || (Math.abs(row.diff_qty) <= 0.0001 && row.diff_amount < -0.0001));
  } else if (diffType === "excess") {
    rows = rows.filter((row) => row.diff_qty > 0.0001 || (Math.abs(row.diff_qty) <= 0.0001 && row.diff_amount > 0.0001));
  } else if (diffType === "equal") {
    rows = rows.filter((row) => Math.abs(row.diff_qty) <= 0.0001 && Math.abs(row.diff_amount) <= 0.0001);
  }
  if (q) rows = rows.filter((row) => [row.product_code, row.product_name].join(" ").toLowerCase().includes(q));

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
  const filterSummary = {
    q,
    onlyDiff: onlyDiff ? "Evet" : "Hayir",
    diffType,
    sortBy,
    sortDir,
    proformaFrom: proformaFrom || "-",
    proformaTo: proformaTo || "-",
    orderFrom: orderFrom || "-",
    orderTo: orderTo || "-",
    selectedProformas: selectedProformaIds.length,
    selectedOrders: selectedOrderIds.length,
  };

  const header = [
    "Urun kodu",
    "Urun adi",
    "Proforma adet",
    "Siparis adet",
    "Fark adet",
    "Proforma tutar",
    "Siparis tutar",
    "Fark tutar",
    "Proforma kaynaklari",
    "Siparis kaynaklari",
  ];

  const aoa = [
    header,
    ...rows.map((row) => [
      row.product_code ?? "",
      row.product_name ?? "",
      row.proforma_qty ?? 0,
      row.order_qty ?? 0,
      row.diff_qty ?? 0,
      row.proforma_amount ?? 0,
      row.order_amount ?? 0,
      row.diff_amount ?? 0,
      row.proforma_details
        .map((d: any) => `${d.label}: adet=${fmtNum(d.qty)} tutar=${fmtMoney(d.amount)} ${d.currency ?? ""}`.trim())
        .join(" | "),
      row.order_details
        .map((d: any) => `${d.label}: adet=${fmtNum(d.qty)} tutar=${fmtMoney(d.amount)} ${d.currency ?? ""}`.trim())
        .join(" | "),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 24 },
    { wch: 34 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 48 },
    { wch: 48 },
  ];

  const summaryAoa = [
    ["Tedarikci", supplier.name ?? ""],
    ["Export tarihi", new Date().toISOString()],
    ["Toplam satir", rows.length],
    [],
    ["Arama", filterSummary.q || "-"],
    ["Sadece fark olanlar", filterSummary.onlyDiff],
    ["Fark filtresi", filterSummary.diffType],
    ["Siralama", `${filterSummary.sortBy} (${filterSummary.sortDir})`],
    ["Proforma tarih baslangic", filterSummary.proformaFrom],
    ["Proforma tarih bitis", filterSummary.proformaTo],
    ["Siparis tarih baslangic", filterSummary.orderFrom],
    ["Siparis tarih bitis", filterSummary.orderTo],
    ["Secilen proforma", filterSummary.selectedProformas],
    ["Secilen siparis", filterSummary.selectedOrders],
    [],
    ["Proforma adet", filteredSummary.proformaQty],
    ["Siparis adet", filteredSummary.orderQty],
    ["Fark adet", diffQtyTotal],
    ["Proforma tutar", filteredSummary.proformaAmount],
    ["Siparis tutar", filteredSummary.orderAmount],
    ["Fark tutar", diffAmountTotal],
  ];
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoa);
  summaryWs["!cols"] = [{ wch: 28 }, { wch: 42 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summaryWs, "Ozet");
  XLSX.utils.book_append_sheet(wb, ws, "Detayli Rapor");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  const safeSupplier = String(supplier.name ?? "supplier").replace(/[\\/:*?"<>|]/g, "_");
  const fileName = `proforma_rapor_${safeSupplier}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${fileName}\"`,
    },
  });
}
