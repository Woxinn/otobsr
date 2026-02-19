import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole, canViewModule } from "@/lib/roles";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) return NextResponse.json({ error: "Yetki yok" }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const rfqId = body?.rfq_id as string | undefined;
  const supplierId = body?.supplier_id as string | undefined;
  const currency = body?.currency as string | undefined;
  const transit = body?.transit_time as string | number | undefined | null;
  const items = Array.isArray(body?.items) ? body.items : [];

  if (!rfqId || !supplierId || !items.length) {
    return NextResponse.json({ error: "Eksik alan" }, { status: 400 });
  }

  // Teklif başlığı: varsa güncelle, yoksa oluştur
  const { data: existing, error: findErr } = await supabase
    .from("rfq_quotes")
    .select("id")
    .eq("rfq_id", rfqId)
    .eq("supplier_id", supplierId)
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

  let quoteId = existing?.id as string | undefined;
  if (!quoteId) {
    const { data, error } = await supabase
      .from("rfq_quotes")
      .insert({
        rfq_id: rfqId,
        supplier_id: supplierId,
        currency: currency ?? null,
        transit_time: transit ?? null,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    quoteId = data.id;
  } else {
    const { error: updErr } = await supabase
      .from("rfq_quotes")
      .update({ currency: currency ?? null, transit_time: transit ?? null })
      .eq("id", quoteId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const rows = items.map((it: any) => ({
    rfq_quote_id: quoteId!,
    rfq_item_id: it.rfq_item_id,
    unit_price: it.unit_price,
  }));

  // upsert için unique constraint olmayabilir; bu nedenle önce sil, sonra ekle (basit ve net)
  const { error: delErr } = await supabase
    .from("rfq_quote_items")
    .delete()
    .eq("rfq_quote_id", quoteId)
    .in(
      "rfq_item_id",
      rows.map((r: { rfq_item_id: string }) => r.rfq_item_id)
    );
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr } = await supabase.from("rfq_quote_items").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, rfq_quote_id: quoteId, inserted: rows.length });
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) return NextResponse.json({ error: "Yetki yok" }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const rfqId = body?.rfq_id as string | undefined;
  const supplierId = body?.supplier_id as string | undefined;
  if (!rfqId || !supplierId) return NextResponse.json({ error: "Eksik alan" }, { status: 400 });

  const { data: quote } = await supabase
    .from("rfq_quotes")
    .select("id")
    .eq("rfq_id", rfqId)
    .eq("supplier_id", supplierId)
    .maybeSingle();
  if (!quote) return NextResponse.json({ ok: true, deleted: 0 });

  const { error: delItemsErr } = await supabase.from("rfq_quote_items").delete().eq("rfq_quote_id", quote.id);
  if (delItemsErr) return NextResponse.json({ error: delItemsErr.message }, { status: 500 });

  const { error: delQuoteErr } = await supabase.from("rfq_quotes").delete().eq("id", quote.id);
  if (delQuoteErr) return NextResponse.json({ error: delQuoteErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: 1 });
}
