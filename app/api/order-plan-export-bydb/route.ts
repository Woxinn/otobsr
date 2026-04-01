import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchLiveSalesPerDb } from "@/lib/live-mssql";

// 10 yıllık pencere, mevcut sipariş planı ile tutarlı
const TEN_YEARS_DAYS = 3650;

const fmt0 = (n: number) => Number(n ?? 0);

const chunk = <T,>(arr: T[], size = 200) => {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
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
  // type parser bazen embed string'i hatalı parse ediyor; spaces'ı kaldırıp any olarak cast ediyoruz
  const select = supplier
    ? ("id,code,name,netsis_stok_kodu,group_id,product_groups!left(name),unit_price,supplier_product_aliases!inner(supplier_id)" as const)
    : ("id,code,name,netsis_stok_kodu,group_id,product_groups!left(name),unit_price" as const);

  const buildQuery = () => {
    let qb = supabase
      .from("products")
      .select(select as any, { count: "exact", head: false })
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
    const { data: pageRows, error: pageErr } = await qb;
    if (pageErr) throw pageErr;
    if (!pageRows || pageRows.length === 0) break;
    for (const row of pageRows as any[]) {
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
    lastId = (pageRows[pageRows.length - 1] as any)?.id as string;
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

  const salesPerDb = await fetchLiveSalesPerDb(netsisCodes, TEN_YEARS_DAYS);
  const dbList = getSalesDbs();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("DB Bazlı Satış");

  ws.columns = [
    { header: "Product code", key: "code", width: 18 },
    { header: "Stock code", key: "netsis", width: 18 },
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
