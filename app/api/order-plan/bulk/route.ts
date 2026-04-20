import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

type BulkUpdateRow = {
  product_id?: string;
  value?: number;
  need_qty?: number | null;
  suggest_qty?: number | null;
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (role === "Satis") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { updates?: BulkUpdateRow[] };
  const updates = Array.isArray(body.updates) ? body.updates : [];

  const normalized = updates
    .map((row) => {
      const product_id = String(row.product_id ?? "").trim();
      const value = Number(row.value ?? Number.NaN);
      if (!product_id || Number.isNaN(value)) return null;
      return {
        product_id,
        value,
        need_qty: row.need_qty ?? null,
        suggest_qty: row.suggest_qty ?? null,
      };
    })
    .filter(Boolean) as {
    product_id: string;
    value: number;
    need_qty: number | null;
    suggest_qty: number | null;
  }[];

  if (!normalized.length) {
    return NextResponse.json({ error: "updates bos" }, { status: 400 });
  }

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id ?? null;

  const chunkSize = 500;
  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize).map((row) => ({
      ...row,
      created_by: userId,
    }));
    const { error } = await supabase.from("order_plan_entries").upsert(chunk, { onConflict: "product_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, count: normalized.length });
}

