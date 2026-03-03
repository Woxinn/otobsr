import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import sql from "mssql";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 10 yıllık pencere, mevcut sipariş planı ile tutarlı
const TEN_YEARS_DAYS = 3650;

const fmt0 = (n: number) => Number(n ?? 0);

const chunk = <T,>(arr: T[], size = 200) => {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
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

// MSSQL_DB_SALES_LIST virgüllü liste: her bir DB ayrı sütun olarak rapora eklenecek
const getSalesDbs = () => {
  const raw = process.env.MSSQL_DB_SALES_LIST ?? "";
  const arr = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const base = process.env.MSSQL_DB ? [process.env.MSSQL_DB] : [];
  return Array.from(new Set([...arr, ...base]));
};

const buildInClause = (alias: string, items: string[]) => {
  const params = items.map((_, idx) => `@${alias}${idx}`).join(",");
  return { clause: `(${params})`, params };
};

const fetchSalesPerDb = async (codes: string[]) => {
  type DbTotals = Map<string, number>; // dbName -> qty
  const result = new Map<string, DbTotals>();
  if (!codes.length) return result;
  const dbs = getSalesDbs();
  const start10y = new Date();
  start10y.setHours(0, 0, 0, 0);
  start10y.setDate(start10y.getDate() - TEN_YEARS_DAYS);

  for (const dbName of dbs) {
    const pool = await connectMssql(dbName);
    if (!pool) continue;
    try {
      for (const part of chunk(codes, 100)) {
        const { clause, params } = buildInClause("c", part);
        const req = pool.request().input("start10y", sql.DateTime, start10y);
        part.forEach((code, idx) => req.input(`c${idx}`, sql.VarChar, code.trim()));
        const query = `
          SELECT LTRIM(RTRIM(STOK_KODU)) AS code, SUM(STHAR_GCMIK) AS qty
          FROM TBLSTHAR
          WHERE UPPER(STHAR_GCKOD) = 'C'
            AND STHAR_TARIH >= @start10y
            AND LTRIM(RTRIM(STOK_KODU)) IN ${clause}
          GROUP BY LTRIM(RTRIM(STOK_KODU))
        `;
        const rs = await req.query(query);
        (rs.recordset ?? []).forEach((row: any) => {
          const code = String(row.code ?? "").trim();
          if (!code) return;
          const dbMap = result.get(code) ?? new Map<string, number>();
          dbMap.set(dbName, (dbMap.get(dbName) ?? 0) + Number(row.qty ?? 0));
          result.set(code, dbMap);
        });
      }
    } catch {
      /* ignore this db */
    } finally {
      await pool.close();
    }
  }
  return result;
};

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const url = new URL(req.url);

  const q = url.searchParams.get("q") ?? undefined;
  const groupParam = url.searchParams.get("group") ?? undefined;
  const supplier = url.searchParams.get("supplier") ?? undefined;
  const gtip = url.searchParams.get("gtip") ?? undefined;
  const batchSize = Math.max(
    100,
    Math.min(5000, Number(url.searchParams.get("batchSize") ?? "4000"))
  );
  const batch = Math.max(0, Number(url.searchParams.get("batch") ?? "0"));

  const selectedGroupIds = groupParam ? groupParam.split(",").filter(Boolean) : [];

  const baseSelect =
    "id, code, name, netsis_stok_kodu, group_id, product_groups!left(name), unit_price";
  const select = supplier ? `${baseSelect}, supplier_product_aliases!inner(supplier_id)` : baseSelect;

  const buildQuery = () => {
    let qb = supabase
      .from("products")
      .select(select, { count: "exact", head: false })
      .order("id", { ascending: true });

    if (q) {
      const safeQuery = q.replace(/,/g, " ").trim();
      const tokens = safeQuery
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (tokens.length === 1) {
        const term = tokens[0];
        qb = qb.or(
          `code.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`
        );
      } else {
        tokens.forEach((term) => {
          qb = qb.or(
            `code.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`
          );
        });
      }
    }
    if (selectedGroupIds.length) qb = qb.in("group_id", selectedGroupIds);
    if (supplier) qb = qb.eq("supplier_product_aliases.supplier_id", supplier);
    if (gtip) {
      if (gtip === "none") qb = qb.is("gtip_id", null);
      else qb = qb.eq("gtip_id", gtip);
    }
    return qb;
  };

  // Cursor-based sayfalama (id > lastId), her seferde 1000
  const pageSize = 1000;
  const productList: any[] = [];
  let lastId: string | null = null;
  const offset = batch * batchSize;
  let seen = 0;
  for (;;) {
    let qb = buildQuery().limit(pageSize);
    if (lastId) qb = qb.gt("id", lastId);
    const { data: pageRows } = await qb;
    if (!pageRows?.length) break;
    for (const row of pageRows) {
      if (seen < offset) {
        seen += 1;
        continue;
      }
      if (productList.length < batchSize) {
        productList.push(row);
        seen += 1;
      } else {
        seen += 1;
        break;
      }
    }
    if (productList.length >= batchSize) break;
    if (pageRows.length < pageSize) break;
    lastId = pageRows[pageRows.length - 1].id as string;
  }

  const productIds = Array.from(new Set(productList.map((p) => p.id).filter(Boolean)));
  const netsisCodes = Array.from(
    new Set(
      productList
        .map((p: any) => (p.netsis_stok_kodu ? String(p.netsis_stok_kodu).trim() : null))
        .filter(Boolean) as string[]
    )
  );

  // Tip / uzunluk / ağırlık attribute'larını çek (varsa) – chunk'lı
  const attrByProduct = new Map<string, Record<string, string>>();
  if (productIds.length) {
    const pidChunks = chunk(productIds, 500);
    for (const part of pidChunks) {
      const { data: attrRows } = await supabase
        .from("product_attribute_values")
        .select("product_id, value_text, value_number, attribute:product_attributes(name)")
        .in("product_id", part);
      (attrRows ?? []).forEach((row: any) => {
        const name = String(row.attribute?.name ?? "").toLowerCase();
        const val = row.value_text ?? row.value_number;
        if (!name || val === undefined || val === null) return;
        const bucket = attrByProduct.get(row.product_id) ?? {};
        if (name.includes("tip")) bucket.tip = String(val);
        if (name.includes("uzun")) bucket.uzunluk = String(val);
        if (name.includes("ağırl") || name.includes("agir")) bucket.agirlik = String(val);
        attrByProduct.set(row.product_id, bucket);
      });

      const { data: extraRows } = await supabase
        .from("product_extra_attributes")
        .select("product_id, name, value_text, value_number")
        .in("product_id", part);
      (extraRows ?? []).forEach((row: any) => {
        const name = String(row.name ?? "").toLowerCase();
        const val = row.value_text ?? row.value_number;
        if (!name || val === undefined || val === null) return;
        const bucket = attrByProduct.get(row.product_id) ?? {};
        if (name.includes("tip")) bucket.tip = String(val);
        if (name.includes("uzun")) bucket.uzunluk = String(val);
        if (name.includes("ağırl") || name.includes("agir")) bucket.agirlik = String(val);
        attrByProduct.set(row.product_id, bucket);
      });
    }
  }

  const salesPerDb = await fetchSalesPerDb(netsisCodes);
  const dbList = getSalesDbs();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("DB Bazlı Satış");

  ws.columns = [
    { header: "Product code", key: "code", width: 18 },
    { header: "Netsis code", key: "netsis", width: 18 },
    { header: "Product name", key: "name", width: 30 },
    { header: "Tip", key: "tip", width: 12 },
    { header: "Uzunluk", key: "uzunluk", width: 12 },
    { header: "Ağırlık", key: "agirlik", width: 12 },
    { header: "Toplam", key: "total", width: 14 },
    ...dbList.map((db) => ({ header: db, key: db, width: 14 })),
  ];

  productList.forEach((p) => {
    const netsis = p.netsis_stok_kodu ? String(p.netsis_stok_kodu).trim() : "";
    const attr = attrByProduct.get(p.id ?? "") ?? {};
    const dbMap = netsis ? salesPerDb.get(netsis) ?? new Map<string, number>() : new Map();
    let total = 0;
    const row: Record<string, any> = {
      code: p.code,
      netsis,
      name: p.name,
      tip: attr.tip ?? "",
      uzunluk: attr.uzunluk ?? "",
      agirlik: attr.agirlik ?? "",
    };
    dbList.forEach((db) => {
      const qty = fmt0(dbMap.get(db) ?? 0);
      row[db] = qty;
      total += qty;
    });
    row.total = fmt0(total);
    ws.addRow(row);
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="siparis-plani-sales-per-db-batch-${batch + 1}.xlsx"`,
      "x-batch-rows": String(productList.length),
      "x-batch-size": String(batchSize),
      "x-batch-index": String(batch),
    },
  });
}
