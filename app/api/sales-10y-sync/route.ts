import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";
import { fetchLiveSales10yChunk } from "@/lib/live-mssql";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (role === "Satis") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const targetProductId = body?.product_id as string | undefined;

  const { data: products } = await supabase
    .from("products")
    .select("id, netsis_stok_kodu")
    .not("netsis_stok_kodu", "is", null)
    .match(targetProductId ? { id: targetProductId } : {});

  const codes = Array.from(
    new Set(
      (products ?? [])
        .map((product) =>
          product.netsis_stok_kodu ? String(product.netsis_stok_kodu).trim() : null
        )
        .filter(Boolean) as string[]
    )
  );

  if (!codes.length) {
    return NextResponse.json({ error: "no codes" }, { status: 400 });
  }

  const totals = new Map<string, number>();
  const dbDebug: { db: string; code: string; total: number; fisnos: string | null }[] = [];

  for (let i = 0; i < codes.length; i += 100) {
    const part = codes.slice(i, i + 100);
    const { totals: partTotals, debug } = await fetchLiveSales10yChunk(part);
    for (const [code, total] of partTotals.entries()) {
      totals.set(code, (totals.get(code) ?? 0) + Number(total ?? 0));
    }
    dbDebug.push(...debug);
  }

  const rows = (products ?? []).map((product) => {
    const code = product.netsis_stok_kodu ? String(product.netsis_stok_kodu).trim() : "";
    return {
      product_id: product.id,
      total_10y: totals.get(code) ?? 0,
    };
  });

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("product_sales_10y_totals")
      .upsert(chunk, { onConflict: "product_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  console.log("[sales-10y-sync] debug", dbDebug);
  return NextResponse.json(dbDebug);
}
