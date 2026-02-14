import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (role === "Satis") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const product_id = body?.product_id as string | undefined;
  const value = body?.value as number | undefined;
  const need_qty = body?.need_qty as number | null | undefined;
  const suggest_qty = body?.suggest_qty as number | null | undefined;

  if (!product_id || Number.isNaN(Number(value))) {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("order_plan_entries")
    .upsert(
      {
        product_id,
        value,
        need_qty,
        suggest_qty,
        created_by: user?.id ?? null,
      },
      { onConflict: "product_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
