import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";

export async function PATCH(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) {
    return NextResponse.json({ error: "Yetki yok" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rfqId = String(body?.rfq_id ?? "").trim();
  const rfqItemId = String(body?.rfq_item_id ?? "").trim();
  const targetPriceRaw = body?.target_unit_price;
  const targetUnitPrice =
    targetPriceRaw === null || targetPriceRaw === "" || targetPriceRaw === undefined ? null : Number(targetPriceRaw);

  if (!rfqId || !rfqItemId || Number.isNaN(targetUnitPrice ?? 0)) {
    return NextResponse.json({ error: "rfq_id, rfq_item_id ve gecerli hedef fiyat gerekli" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("rfq_items")
    .update({ target_unit_price: targetUnitPrice })
    .eq("id", rfqItemId)
    .eq("rfq_id", rfqId)
    .select("id, rfq_id, target_unit_price")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "RFQ urunu bulunamadi" }, { status: 404 });

  return NextResponse.json({ ok: true, rfq_item_id: data.id, target_unit_price: data.target_unit_price });
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) {
    return NextResponse.json({ error: "Yetki yok" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rfqId = String(body?.rfq_id ?? "").trim();
  const rfqItemId = String(body?.rfq_item_id ?? "").trim();
  if (!rfqId || !rfqItemId) {
    return NextResponse.json({ error: "rfq_id ve rfq_item_id gerekli" }, { status: 400 });
  }

  const { data: rfqItem, error: rfqItemErr } = await supabase
    .from("rfq_items")
    .select("id, rfq_id, product_code")
    .eq("id", rfqItemId)
    .eq("rfq_id", rfqId)
    .maybeSingle();
  if (rfqItemErr) return NextResponse.json({ error: rfqItemErr.message }, { status: 500 });
  if (!rfqItem) return NextResponse.json({ error: "RFQ urunu bulunamadi" }, { status: 404 });

  const { data: linkedQuoteItems, error: linkedQuoteItemsErr } = await supabase
    .from("rfq_quote_items")
    .select("id")
    .eq("rfq_item_id", rfqItemId);
  if (linkedQuoteItemsErr) {
    return NextResponse.json({ error: linkedQuoteItemsErr.message }, { status: 500 });
  }

  const quoteItemIds = (linkedQuoteItems ?? []).map((row: any) => String(row.id));
  if (quoteItemIds.length) {
    const { count, error: linkedOrderErr } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .in("rfq_quote_item_id", quoteItemIds);
    if (linkedOrderErr) {
      return NextResponse.json({ error: linkedOrderErr.message }, { status: 500 });
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "Bu RFQ urunu siparise donusmus teklif satirlarina bagli oldugu icin silinemez." },
        { status: 409 }
      );
    }
  }

  if (quoteItemIds.length) {
    const { error: delQuoteItemsErr } = await supabase.from("rfq_quote_items").delete().in("id", quoteItemIds);
    if (delQuoteItemsErr) {
      return NextResponse.json({ error: delQuoteItemsErr.message }, { status: 500 });
    }
  }

  const { error: delItemErr } = await supabase.from("rfq_items").delete().eq("id", rfqItemId).eq("rfq_id", rfqId);
  if (delItemErr) return NextResponse.json({ error: delItemErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, deleted: rfqItemId, product_code: rfqItem.product_code ?? null });
}
