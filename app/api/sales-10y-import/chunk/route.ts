import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

type ImportRow = {
  stok_kodu?: string;
  total_10y?: number;
};

const normalizeCode = (value: string) => value.trim().toUpperCase();

const chunk = <T,>(arr: T[], size = 300) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export async function POST(req: Request) {
  const { role } = await getCurrentUserRole();
  if (role === "Satis") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { rows?: ImportRow[] };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) {
    return NextResponse.json({ error: "rows required" }, { status: 400 });
  }

  const totalsByCode = new Map<string, number>();
  rows.forEach((row) => {
    const code = normalizeCode(String(row.stok_kodu ?? ""));
    const total = Number(row.total_10y ?? 0);
    if (!code || !Number.isFinite(total)) return;
    totalsByCode.set(code, (totalsByCode.get(code) ?? 0) + total);
  });

  const codes = Array.from(totalsByCode.keys());
  if (!codes.length) {
    return NextResponse.json({ upsertedProducts: 0, unmatchedCount: 0, unmatchedPreview: [] });
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
    upsertedProducts: upsertRows.length,
    unmatchedCount: unmatched.length,
    unmatchedPreview: unmatched.slice(0, 20),
  });
}

