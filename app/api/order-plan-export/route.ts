import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import sql from "mssql";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Aynı sabitler
const FALLBACK_LEAD_TIME_DAYS = 105;
const FALLBACK_SAFETY_DAYS = 15;
const DELIVERED_STATUS_TOKENS = new Set([
  "depoya teslim edildi",
  "depoya teslim",
  "delivered",
]);

const fmt0 = (n: number) => Number(n ?? 0);

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

const connectMssql = async (databaseName?: string) => {
  const {
    MSSQL_SERVER,
    MSSQL_PORT,
    MSSQL_DB,
    MSSQL_USER,
    MSSQL_PASS,
    MSSQL_TRUST_CERT,
    MSSQL_ENCRYPT,
  } = process.env;
  if (!MSSQL_SERVER || !MSSQL_DB || !MSSQL_USER || !MSSQL_PASS) return null;
  try {
    const pool = new sql.ConnectionPool({
      server: MSSQL_SERVER,
      port: MSSQL_PORT ? Number(MSSQL_PORT) : 1433,
      database: databaseName ?? MSSQL_DB,
      user: MSSQL_USER,
      password: MSSQL_PASS,
      options: {
        encrypt: MSSQL_ENCRYPT !== "false",
        trustServerCertificate: MSSQL_TRUST_CERT === "true",
        cryptoCredentialsDetails: { minVersion: "TLSv1", maxVersion: "TLSv1.2" },
        enableArithAbort: true,
      },
    });
    pool.setMaxListeners(0);
    await pool.connect();
    return pool;
  } catch {
    return null;
  }
};

const fetchNetsisStockMap = async (codes: string[]) => {
  const map = new Map<string, number>();
  const pool = await connectMssql();
  if (!pool) return map;
  try {
    for (const code of codes) {
      const key = code.trim();
      try {
        const result = await pool
          .request()
          .input("stok", sql.VarChar, `${key}%`)
          .query(
            `SELECT SUM(CASE WHEN UPPER(Har.STHAR_GCKOD)='G' THEN Har.STHAR_GCMIK ELSE -Har.STHAR_GCMIK END) AS NetMiktar
             FROM TBLSTHAR Har
             WHERE LTRIM(RTRIM(Har.STOK_KODU)) LIKE @stok`
          );
        const net = Number(result.recordset?.[0]?.NetMiktar ?? 0);
        map.set(key, net);
      } catch {
        map.set(key, 0);
      }
    }
  } finally {
    await pool.close();
  }
  return map;
};

const fetchSalesAgg = async (codes: string[]) => {
  type SalesAgg = { sales120: number; sales60: number; salesPrev60: number; sales10y: number };
  const res = new Map<string, SalesAgg>();
  const salesDbs = (() => {
    const raw = process.env.MSSQL_DB_SALES_LIST ?? "";
    const arr = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const base = process.env.MSSQL_DB ? [process.env.MSSQL_DB] : [];
    return Array.from(new Set([...arr, ...base]));
  })();
  const pools: any[] = [];
  for (const dbName of salesDbs) {
    const pool = await connectMssql(dbName);
    if (pool) pools.push(pool);
  }
  if (!pools.length) return res;

  const today = new Date();
  const start120 = new Date(today);
  start120.setHours(0, 0, 0, 0);
  start120.setDate(start120.getDate() - 120);
  const start60 = new Date(today);
  start60.setHours(0, 0, 0, 0);
  start60.setDate(start60.getDate() - 60);
  const startPrev60 = new Date(today);
  startPrev60.setHours(0, 0, 0, 0);
  startPrev60.setDate(startPrev60.getDate() - 120);
  const start10y = new Date(today);
  start10y.setHours(0, 0, 0, 0);
  start10y.setDate(start10y.getDate() - 3650);

  try {
    for (const code of codes) {
      const key = code.trim();
      let agg = { sales120: 0, sales60: 0, salesPrev60: 0, sales10y: 0 };
      for (const pool of pools) {
        try {
          const query = `
            SELECT
              SUM(CASE WHEN STHAR_TARIH >= @start120 THEN STHAR_GCMIK ELSE 0 END) AS sales120,
              SUM(CASE WHEN STHAR_TARIH >= @start60 THEN STHAR_GCMIK ELSE 0 END) AS sales60,
              SUM(CASE WHEN STHAR_TARIH >= @startPrev60 AND STHAR_TARIH < @start60 THEN STHAR_GCMIK ELSE 0 END) AS salesPrev60,
              SUM(CASE WHEN STHAR_TARIH >= @start10y THEN STHAR_GCMIK ELSE 0 END) AS sales10y
            FROM TBLSTHAR
            WHERE LTRIM(RTRIM(STOK_KODU)) LIKE @code AND UPPER(STHAR_GCKOD) = 'C'
          `;
          const result = await pool
            .request()
            .input("start120", sql.DateTime, start120)
            .input("start60", sql.DateTime, start60)
            .input("startPrev60", sql.DateTime, startPrev60)
            .input("start10y", sql.DateTime, start10y)
            .input("code", sql.VarChar, `${key}%`)
            .query(query);
          const row = result.recordset?.[0] ?? {};
          agg = {
            sales120: agg.sales120 + Number(row.sales120 ?? 0),
            sales60: agg.sales60 + Number(row.sales60 ?? 0),
            salesPrev60: agg.salesPrev60 + Number(row.salesPrev60 ?? 0),
            sales10y: agg.sales10y + Number(row.sales10y ?? 0),
          };
        } catch {
          /* ignore */
        }
      }
      res.set(key, agg);
    }
  } finally {
    await Promise.all(pools.map((p) => p.close()));
  }
  return res;
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

    if (error) break;
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

  return totals;
};

const computeTrend = (sales60: number, salesPrev60: number) => {
  if (salesPrev60 === 0) return { trend_direction: "stable", multiplier: 1 };
  const change_ratio = (sales60 - salesPrev60) / salesPrev60;
  if (change_ratio > 0.1) return { trend_direction: "increasing", multiplier: 1.15 };
  if (change_ratio < -0.1) return { trend_direction: "decreasing", multiplier: 0.85 };
  return { trend_direction: "stable", multiplier: 1 };
};

const ceil = (n: number) => Math.ceil(n);

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const url = new URL(req.url);

  const q = url.searchParams.get("q") ?? undefined;
  const groupParam = url.searchParams.get("group") ?? undefined;
  const supplier = url.searchParams.get("supplier") ?? undefined;
  const gtip = url.searchParams.get("gtip") ?? undefined;
  const filledOnly = url.searchParams.get("filledOnly") === "1";

  const selectedGroupIds = groupParam ? groupParam.split(",").filter(Boolean) : [];

  const { data: groups } = await supabase
    .from("product_groups")
    .select("id, name, lead_time_days, safety_days")
    .order("name");

  const { data: planDefaults } = await supabase
    .from("order_plan_defaults")
    .select("lead_time_days, safety_days")
    .eq("id", 1)
    .maybeSingle();

  const resolveLeadSafety = (groupId?: string | null) => {
    const group = groups?.find((g) => g.id === groupId);
    const lead = group?.lead_time_days ?? planDefaults?.lead_time_days ?? FALLBACK_LEAD_TIME_DAYS;
    const safety = group?.safety_days ?? planDefaults?.safety_days ?? FALLBACK_SAFETY_DAYS;
    return { lead, safety, groupName: group?.name ?? "" };
  };

  const buildProductsQuery = (forCount: boolean) => {
    const baseSelect =
      "id, code, name, brand, description, netsis_stok_kodu, group_id, gtip_id, product_groups!left(name)";
    const select = supplier
      ? `${baseSelect}, supplier_product_aliases!inner(supplier_id)`
      : baseSelect;
    let queryBuilder = supabase
      .from("products")
      .select(select, { count: "exact", head: forCount })
      .order("created_at", { ascending: false });

    if (q) {
      const safeQuery = q.replace(/,/g, " ").trim();
      const tokens = safeQuery
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (tokens.length === 1) {
        const term = tokens[0];
        queryBuilder = queryBuilder.or(
          `code.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`
        );
      } else {
        tokens.forEach((term) => {
          queryBuilder = queryBuilder.or(
            `code.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`
          );
        });
      }
    }
    if (selectedGroupIds.length > 0) queryBuilder = queryBuilder.in("group_id", selectedGroupIds);
    if (supplier) queryBuilder = queryBuilder.eq("supplier_product_aliases.supplier_id", supplier);
    if (gtip) {
      if (gtip === "none") queryBuilder = queryBuilder.is("gtip_id", null);
      else queryBuilder = queryBuilder.eq("gtip_id", gtip);
    }
    if (filledOnly) {
      queryBuilder = queryBuilder.in(
        "id",
        supabase
          .from("order_plan_entries")
          .select("product_id", { count: "exact", head: false })
          .gt("value", 0) as any
      );
    }
    return queryBuilder;
  };

  // Fetch products
  const { count: totalCount } = await buildProductsQuery(true);
  const { data: products } = await buildProductsQuery(false).range(0, 9999);
  const productList = (products ?? []) as any[];

  const productIds = Array.from(new Set(productList.map((p) => p.id).filter(Boolean)));
  const codes = Array.from(
    new Set(
      productList
        .map((p: any) => (p.netsis_stok_kodu ? String(p.netsis_stok_kodu).trim() : null))
        .filter(Boolean) as string[]
    )
  );

  const [stockMap, salesMap] = await Promise.all([fetchNetsisStockMap(codes), fetchSalesAgg(codes)]);

  const { data: sales10yRows } = await supabase
    .from("product_sales_10y_totals")
    .select("product_id, total_10y");
  const sales10yByProduct = new Map<string, number>();
  (sales10yRows ?? []).forEach((row) => {
    if (row.product_id) sales10yByProduct.set(row.product_id, Number(row.total_10y ?? 0));
  });

  const inTransitByProduct = await fetchTransitByProduct(supabase, productIds);

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
  const planByProduct = new Map<string, number>();
  (planEntries ?? []).forEach((row) => {
    planByProduct.set(row.product_id, Number(row.value ?? 0));
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Siparis Plani");
  ws.columns = [
    { header: "Kod", key: "code", width: 18 },
    { header: "Ürün", key: "name", width: 30 },
    { header: "Kategori", key: "group", width: 18 },
    { header: "Stok", key: "stock", width: 12 },
    { header: "Yolda", key: "transit", width: 12 },
    { header: "RFQ", key: "rfq", width: 12 },
    { header: "Toplam", key: "total_stock", width: 14 },
    { header: "Önceki 2A", key: "sales_prev60", width: 14 },
    { header: "Son 2A", key: "sales_60", width: 14 },
    { header: "4A", key: "sales_120", width: 14 },
    { header: "10Y", key: "sales_10y", width: 14 },
    { header: "Lead", key: "lead", width: 10 },
    { header: "Safety", key: "safety", width: 10 },
    { header: "İhtiyaç", key: "need", width: 14 },
    { header: "Tavsiye", key: "suggest", width: 14 },
    { header: "Trend", key: "trend", width: 12 },
    { header: "Plan Girişi", key: "plan_value", width: 14 },
  ];

  productList.forEach((p) => {
    const netsisCode = p.netsis_stok_kodu ? String(p.netsis_stok_kodu).trim() : "";
    const stock = netsisCode ? stockMap.get(netsisCode) ?? 0 : 0;
    const inTransit = inTransitByProduct[p.id] ?? 0;
    const rfqQty = rfqByProduct.get(p.id) ?? 0;
    const sales = netsisCode
      ? salesMap.get(netsisCode)
      : { sales120: 0, sales60: 0, salesPrev60: 0, sales10y: 0 };
    const sales10y = sales10yByProduct.get(p.id) ?? sales?.sales10y ?? 0;
    const available_stock = stock + inTransit;
    const { lead, safety, groupName } = resolveLeadSafety(p.group_id);

    const trend = computeTrend(sales?.sales60 ?? 0, sales?.salesPrev60 ?? 0);
    let need = 0;
    if (available_stock < (sales?.sales120 ?? 0)) {
      need = sales?.sales120 ?? 0;
    } else if (available_stock >= (sales?.sales120 ?? 0) && lead + safety >= 120) {
      need = sales!.sales120 * 2 - available_stock;
    }
    if (need < 0) need = 0;
    need = ceil(need);
    const suggest = ceil(need * trend.multiplier);

    ws.addRow({
      code: p.code,
      name: p.name,
      group: groupName || "Kategori yok",
      stock: fmt0(stock),
      transit: fmt0(inTransit),
      rfq: fmt0(rfqQty),
      total_stock: fmt0(stock + inTransit + rfqQty),
      sales_prev60: fmt0(sales?.salesPrev60 ?? 0),
      sales_60: fmt0(sales?.sales60 ?? 0),
      sales_120: fmt0(sales?.sales120 ?? 0),
      sales_10y: fmt0(sales10y ?? 0),
      lead,
      safety,
      need,
      suggest,
      trend:
        trend.trend_direction === "increasing"
          ? "satış artıyor"
          : trend.trend_direction === "decreasing"
          ? "satış azalıyor"
          : "stabil",
      plan_value: fmt0(planByProduct.get(p.id) ?? 0),
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"siparis-plani.xlsx\"`,
      "x-total-count": String(totalCount ?? 0),
    },
  });
}

