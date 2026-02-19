import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";

export async function PATCH(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) {
    return NextResponse.json({ error: "Erişim yok" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rfqId = body?.rfq_id as string | undefined;
  const supplierId = body?.supplier_id as string | undefined;
  const rfqItemId = body?.rfq_item_id as string | undefined;
  const unitPriceRaw = body?.unit_price;
  const unitPrice = unitPriceRaw === null || unitPriceRaw === "" ? null : Number(unitPriceRaw);

  if (!rfqId || !supplierId || !rfqItemId || Number.isNaN(unitPrice ?? 0)) {
    return NextResponse.json({ error: "Eksik veya hatalı veri" }, { status: 400 });
  }

  let quoteId: string | null = null;
  {
    const { data: quote, error: quoteErr } = await supabase
      .from("rfq_quotes")
      .select("id")
      .eq("rfq_id", rfqId)
      .eq("supplier_id", supplierId)
      .maybeSingle();
    if (quoteErr) {
      console.error("[rfq-quote-item] quoteErr", quoteErr);
      return NextResponse.json({ error: quoteErr.message }, { status: 500 });
    }
    if (quote) {
      quoteId = quote.id;
    }
  }

  // Yoksa oluştur
  if (!quoteId) {
    const { data: created, error: createErr } = await supabase
      .from("rfq_quotes")
      .insert({ rfq_id: rfqId, supplier_id: supplierId, currency: null, transit_time: null })
      .select("id")
      .single();
    if (createErr) {
      console.error("[rfq-quote-item] create quote err", createErr);
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    quoteId = created.id;
  }

  // Var mı kontrol et, varsa update, yoksa insert — constraint gerektirmiyor
  const { data: existing, error: findErr } = await supabase
    .from("rfq_quote_items")
    .select("id")
    .eq("rfq_quote_id", quoteId)
    .eq("rfq_item_id", rfqItemId)
    .maybeSingle();
  if (findErr) {
    console.error("[rfq-quote-item] findErr", findErr);
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  let saved: any = null;
  if (existing) {
    const { data, error } = await supabase
      .from("rfq_quote_items")
      .update({ unit_price: unitPrice })
      .eq("id", existing.id)
      .select("id, rfq_quote_id, rfq_item_id, unit_price")
      .maybeSingle();
    if (error) {
      console.error("[rfq-quote-item] updateErr", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    saved = data;
  } else {
    const { data, error } = await supabase
      .from("rfq_quote_items")
      .insert({
        rfq_quote_id: quoteId,
        rfq_item_id: rfqItemId,
        unit_price: unitPrice,
        product_id: null,
        min_order: null,
        delivery_time: null,
        terms: null,
        notes: null,
      })
      .select("id, rfq_quote_id, rfq_item_id, unit_price")
      .maybeSingle();
    if (error) {
      console.error("[rfq-quote-item] insertErr", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    saved = data;
  }

  return NextResponse.json({
    ok: true,
    rfq_quote_id: quoteId,
    rfq_item_id: rfqItemId,
    unit_price: unitPrice,
    saved,
  });
}
