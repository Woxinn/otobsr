import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) return NextResponse.json({ error: "Yetki yok" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const rfqId = body?.rfq_id as string | undefined;
  if (!rfqId) return NextResponse.json({ error: "rfq_id gerekli" }, { status: 400 });

  // Bagli siparis varsa hicbir kayit silinmez.
  const { count: linkedOrderCount, error: linkedOrderErr } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("rfq_id", rfqId);
  if (linkedOrderErr) return NextResponse.json({ error: linkedOrderErr.message }, { status: 500 });
  if ((linkedOrderCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "Bağlı sipariş olduğu için silinememektedir." },
      { status: 409 }
    );
  }

  // İlişkili teklifleri ve satırlarını temizle
  const { data: quoteIds } = await supabase.from("rfq_quotes").select("id").eq("rfq_id", rfqId);
  const quoteIdList = (quoteIds ?? []).map((q: any) => q.id);
  if (quoteIdList.length) {
    await supabase.from("rfq_quote_items").delete().in("rfq_quote_id", quoteIdList);
    await supabase.from("rfq_quotes").delete().in("id", quoteIdList);
  }

  // rfq_items ve rfq_suppliers
  await supabase.from("rfq_items").delete().eq("rfq_id", rfqId);
  await supabase.from("rfq_suppliers").delete().eq("rfq_id", rfqId);

  // Bağlı sipariş varsa FK engel koyar, hatayı döndür
  const { error: delErr } = await supabase.from("rfqs").delete().eq("id", rfqId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: rfqId });
}
