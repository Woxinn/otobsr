import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i");

const normalizeCode = (value: string) => value.trim().toUpperCase();

const parseNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const chunk = <T,>(arr: T[], size = 500) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const readRows = async (file: File) => {
  const filename = file.name.toLowerCase();
  if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    });
    return rows.map((row) => row.map((cell) => String(cell ?? "").trim()));
  }

  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => line.split(/[;,]/).map((cell) => cell.trim()));
};

export async function POST(req: Request) {
  const { role } = await getCurrentUserRole();
  if (role === "Satis") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const rows = await readRows(file as File);
  if (rows.length < 2) {
    return NextResponse.json({ error: "empty file" }, { status: 400 });
  }

  const headers = rows[0].map((h) => normalizeHeader(String(h)));
  const codeIdx = headers.findIndex((h) =>
    ["stok_kodu", "stock_code", "code", "netsis_stok_kodu", "stok kodu"].includes(h)
  );
  const qtyIdx = headers.findIndex((h) =>
    [
      "adet",
      "qty",
      "miktar",
      "total_10y",
      "sales10y",
      "satis_10y",
      "10y",
      "toplam",
    ].includes(h)
  );

  if (codeIdx < 0 || qtyIdx < 0) {
    return NextResponse.json(
      { error: "headers not found (expected stok_kodu + adet/total_10y)" },
      { status: 400 }
    );
  }

  const totalsByCode = new Map<string, number>();
  rows.slice(1).forEach((row) => {
    const code = normalizeCode(String(row[codeIdx] ?? ""));
    if (!code) return;
    const qty = parseNumber(row[qtyIdx]);
    if (qty === null) return;
    totalsByCode.set(code, (totalsByCode.get(code) ?? 0) + qty);
  });

  const codes = Array.from(totalsByCode.keys());
  if (!codes.length) {
    return NextResponse.json({ error: "no valid rows" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const codeToProductId = new Map<string, string>();
  for (const codeChunk of chunk(codes, 300)) {
    const { data, error } = await supabase
      .from("products")
      .select("id, netsis_stok_kodu")
      .in("netsis_stok_kodu", codeChunk as any);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    (data ?? []).forEach((row) => {
      const key = normalizeCode(String(row.netsis_stok_kodu ?? ""));
      if (key && row.id) codeToProductId.set(key, row.id);
    });
  }

  const upsertRows: { product_id: string; total_10y: number }[] = [];
  const unmatched: string[] = [];
  totalsByCode.forEach((total, code) => {
    const productId = codeToProductId.get(code);
    if (!productId) {
      unmatched.push(code);
      return;
    }
    upsertRows.push({ product_id: productId, total_10y: total });
  });

  for (const rowsChunk of chunk(upsertRows, 500)) {
    const { error } = await supabase
      .from("product_sales_10y_totals")
      .upsert(rowsChunk, { onConflict: "product_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    totalRows: rows.length - 1,
    parsedCodes: codes.length,
    upsertedProducts: upsertRows.length,
    unmatchedCount: unmatched.length,
    unmatchedPreview: unmatched.slice(0, 20),
  });
}

