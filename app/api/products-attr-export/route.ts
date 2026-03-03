import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Daha küçük paketler: header overflow ihtimalini azaltmak için
const PAGE_SIZE = 400;
const ATTR_CHUNK = 200;
const ORDER_CHUNK = 200;

const aliasMatch = (name: string, keywords: string[]) => {
  const lower = name.toLowerCase();
  return keywords.some((k) => lower.includes(k));
};

const isNumeric = (val: string) => {
  const n = Number(String(val).replace(",", "."));
  return Number.isFinite(n);
};

export async function GET(req: NextRequest) {
  const supabase = createSupabaseAdminClient();
  const url = new URL(req.url);
  const groupParam = url.searchParams.get("group") ?? undefined;

  // fetch all products with range pagination
  const products: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let qb = supabase
      .from("products")
      // kategori adına ihtiyacımız var; ama header'ı küçültmek için sadece name
      .select("id, code, group_id, product_groups(name)")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (groupParam) qb = qb.in("group_id", groupParam.split(",").filter(Boolean));
    const { data: page, error } = await qb;
    if (error) throw error;
    const rows = page ?? [];
    products.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }

  const productIds = products.map((p) => p.id).filter(Boolean);
  const attrByProduct = new Map<string, Record<string, string>>();

  // pull attributes and extra attributes
  for (let i = 0; i < productIds.length; i += ATTR_CHUNK) {
    const slice = productIds.slice(i, i + ATTR_CHUNK);
    const { data: attrRows, error: attrErr } = await supabase
      .from("product_attribute_values")
      .select("product_id, value_text, value_number, attribute:product_attributes(name)")
      .in("product_id", slice);
    if (attrErr) throw attrErr;
    (attrRows ?? []).forEach((row: any) => {
      const name = String(row.attribute?.name ?? "").toLowerCase();
      const val = row.value_text ?? row.value_number;
      if (!name || val === undefined || val === null) return;
      const bucket = attrByProduct.get(row.product_id) ?? {};
      bucket[name] = String(val);
      attrByProduct.set(row.product_id, bucket);
    });

    const { data: extraRows, error: extraErr } = await supabase
      .from("product_extra_attributes")
      .select("product_id, name, value_text, value_number")
      .in("product_id", slice);
    if (extraErr) throw extraErr;
    (extraRows ?? []).forEach((row: any) => {
      const name = String(row.name ?? "").toLowerCase();
      const val = row.value_text ?? row.value_number;
      if (!name || val === undefined || val === null) return;
      const bucket = attrByProduct.get(row.product_id) ?? {};
      bucket[name] = String(val);
      attrByProduct.set(row.product_id, bucket);
    });
  }

  // fallback weight from order items
  const weightByProduct = new Map<string, number>();
  for (let i = 0; i < productIds.length; i += ORDER_CHUNK) {
    const slice = productIds.slice(i, i + ORDER_CHUNK);
    const { data: orderRows, error } = await supabase
      .from("order_items")
      .select("product_id, net_weight_kg, gross_weight_kg")
      .in("product_id", slice);
    if (error) throw error;
    (orderRows ?? []).forEach((row: any) => {
      if (!row.product_id) return;
      if (weightByProduct.has(row.product_id)) return;
      const w = Number(row.net_weight_kg ?? row.gross_weight_kg);
      if (Number.isFinite(w) && w > 0) weightByProduct.set(row.product_id, w);
    });
  }

  const pickValue = (pid: string, keywords: string[], numericFallback = false) => {
    const bucket = attrByProduct.get(pid);
    if (!bucket) return "";
    for (const [key, val] of Object.entries(bucket)) {
      if (aliasMatch(key, keywords)) return val;
    }
    for (const val of Object.values(bucket)) {
      const lowerVal = val.toLowerCase();
      if (keywords.some((k) => lowerVal.includes(k))) return val;
    }
    if (numericFallback) {
      const numericVal = Object.values(bucket).find((v) => isNumeric(String(v)));
      if (numericVal !== undefined) return String(numericVal);
    }
    return "";
  };

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Product Attributes");
  ws.columns = [
    { header: "Product code", key: "code", width: 18 },
    { header: "Category", key: "category", width: 24 },
    { header: "Tip", key: "tip", width: 18 },
    { header: "Uzunluk", key: "uzunluk", width: 18 },
    { header: "Agirlik", key: "agirlik", width: 18 },
  ];

  products.forEach((p) => {
    const pid = p.id;
    const tip = pickValue(pid, ["tip", "type", "model", "seri"]);
    const uzunluk = pickValue(pid, ["uzun", "uz.", "length", "boy", "uzunluk", "en", "boyut"]);
    const agirlikAttr = pickValue(
      pid,
      [
        "agir",
        "agirlik",
        "agrl",
        "weight",
        "wt",
        "net weight",
        "gross weight",
        "gw",
        "nw",
        "brut",
        "brut weight",
        "net",
        "kg",
        "n.w",
        "g.w",
      ],
      true
    );
    const agirlikOrder = weightByProduct.get(pid);
    const agirlik = agirlikAttr || (agirlikOrder ? String(agirlikOrder) : "");
    ws.addRow({
      code: p.code,
      category: p.product_groups?.name ?? "",
      tip,
      uzunluk,
      agirlik,
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="urun-nitelik-export.xlsx"`,
      "x-row-count": String(products.length),
    },
  });
}
