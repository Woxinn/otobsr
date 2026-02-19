import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) return NextResponse.json({ error: "Yetki yok" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const rfqId = body?.rfq_id as string | undefined;
  const supplierId = body?.supplier_id as string | undefined;
  if (!rfqId || !supplierId) return NextResponse.json({ error: "Eksik alan" }, { status: 400 });

  // supplier'a ait teklif id'sini bul
  const { data: quote, error: quoteErr } = await supabase
    .from("rfq_quotes")
    .select("id")
    .eq("rfq_id", rfqId)
    .eq("supplier_id", supplierId)
    .maybeSingle();
  if (quoteErr) return NextResponse.json({ error: quoteErr.message }, { status: 500 });
  if (!quote) return NextResponse.json({ error: "Bu tedarikçiye ait teklif yok" }, { status: 404 });

  const payload: any = { selected_supplier_id: supplierId, status: "kapatildi" };
  // selected_quote_id kolon yoksa hata vermesin diye kontrol et
  const { error: updErr } = await supabase.from("rfqs").update(payload).eq("id", rfqId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, selected_quote_id: quote.id });
}
