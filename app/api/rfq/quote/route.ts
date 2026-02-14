import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (role === "Satis") return NextResponse.json({ error: "Yetki yok" }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const rfqId = body?.rfq_id as string | undefined;
  const supplierId = body?.supplier_id as string | undefined;
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!rfqId || !supplierId || !items.length) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  const { data: quote, error: qErr } = await supabase
    .from("rfq_quotes")
    .insert({
      rfq_id: rfqId,
      supplier_id: supplierId,
      total_amount: body?.total_amount ?? null,
      currency: body?.currency ?? null,
      validity_date: body?.validity_date ?? null,
      transit_time: body?.transit_time ?? null,
      notes: body?.notes ?? null,
    })
    .select("id")
    .single();
  if (qErr || !quote) return NextResponse.json({ error: "Teklif eklenemedi" }, { status: 500 });

  const itemPayload = items.map((it: any) => ({
    rfq_quote_id: quote.id,
    rfq_item_id: it.rfq_item_id,
    unit_price: it.unit_price ?? null,
    min_order: it.min_order ?? null,
    delivery_time: it.delivery_time ?? null,
    terms: it.terms ?? null,
  }));
  if (itemPayload.length) {
    await supabase.from("rfq_quote_items").insert(itemPayload);
  }

  await supabase.from("rfqs").update({ status: "answered" }).eq("id", rfqId);

  return NextResponse.json({ ok: true });
}
