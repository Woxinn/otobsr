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
  const status = (body?.status as string | undefined) ?? "Siparis Verildi";
  const itemsOverride = Array.isArray(body?.items) ? body.items : [];

  if (!rfqId || !supplierId) return NextResponse.json({ error: "Eksik alan" }, { status: 400 });

  const { data: rfq, error: rfqErr } = await supabase
    .from("rfqs")
    .select(
      "id, code, incoterm, currency, response_due_date, rfq_quotes!rfq_id(id, supplier_id, currency, transit_time, rfq_quote_items(id, rfq_item_id, unit_price), suppliers(name)), rfq_items(id, product_id, product_code, product_name, quantity)"
    )
    .eq("id", rfqId)
    .maybeSingle();
  if (rfqErr) return NextResponse.json({ error: rfqErr.message }, { status: 500 });
  if (!rfq) return NextResponse.json({ error: "RFQ yok" }, { status: 404 });

  const quote = (rfq.rfq_quotes ?? []).find((q: any) => q.supplier_id === supplierId);
  if (!quote) return NextResponse.json({ error: "Bu tedarikçiye ait teklif yok" }, { status: 404 });

  // Para birimi kontrolü
  if (quote.currency && rfq.currency && quote.currency !== rfq.currency) {
    return NextResponse.json({ error: "Para birimi uyumsuz: RFQ vs Teklif" }, { status: 400 });
  }

  const quoteItemMap = new Map(
    (quote.rfq_quote_items ?? []).map((qi: any) => [qi.rfq_item_id, { price: qi.unit_price ?? null, id: qi.id }])
  );

  // Ürün listesi ve miktar belirleme
  // Ürün kodundan product_id doldurmak için lookup
  const codes = Array.from(new Set((rfq.rfq_items ?? []).map((it: any) => it.product_code).filter(Boolean)));
  let productByCode = new Map<string, string>();
  if (codes.length) {
    const { data: prodRows } = await supabase.from("products").select("id, code").in("code", codes);
    (prodRows ?? []).forEach((p: any) => {
      if (p.code) productByCode.set(String(p.code).toLowerCase(), p.id);
    });
  }

  const itemsPayload = (rfq.rfq_items ?? []).map((it: any) => {
    const override = itemsOverride.find((io: any) => io.rfq_item_id === it.id);
    const qty = override?.quantity ?? it.quantity ?? 0;
    const qItem = quoteItemMap.get(it.id);
    const unit = qItem?.price ?? null;
    const pid =
      it.product_id ??
      (it.product_code ? productByCode.get(String(it.product_code).toLowerCase()) ?? null : null);
    return {
      rfq_item_id: it.id,
      rfq_quote_item_id: qItem?.id ?? null,
      product_id: pid,
      name: it.product_name ?? it.product_code ?? "",
      quantity: Number(qty ?? 0),
      unit_price: unit,
    };
  });

  // Eksik fiyat kontrolü
  const missingPrice = itemsPayload.find((it) => it.unit_price === null);
  if (missingPrice) {
    return NextResponse.json({ error: "Seçili tedarikçide fiyatı olmayan ürün var." }, { status: 400 });
  }

  const supplierObj: any = Array.isArray(quote.suppliers) ? quote.suppliers[0] : quote.suppliers;
  const supplierName = supplierObj?.name;
  const name = `${rfq.code ?? "RFQ"} - ${supplierName ?? supplierId}`;

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      name,
      supplier_id: supplierId,
      incoterm: rfq.incoterm ?? null,
      currency: quote.currency ?? rfq.currency ?? "USD",
      notes: `rfq:${rfqId}`,
      rfq_id: rfqId,
      order_status: status === "Taslak" ? "Taslak" : status,
    })
    .select("id")
    .single();
  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

  const itemsInsert = itemsPayload.map((it) => ({
    order_id: order.id,
    product_id: it.product_id,
    name: it.name,
    quantity: it.quantity,
    unit_price: it.unit_price,
    total_amount: Number(it.unit_price ?? 0) * Number(it.quantity ?? 0),
    net_weight_kg: null,
    gross_weight_kg: null,
    notes: null,
    rfq_quote_item_id: it.rfq_quote_item_id,
  }));

  if (itemsInsert.length) {
    const { error: itemErr } = await supabase.from("order_items").insert(itemsInsert);
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
    const total = itemsInsert.reduce((s, it) => s + Number(it.total_amount ?? 0), 0);
    await supabase.from("orders").update({ total_amount: total }).eq("id", order.id);
  }

  return NextResponse.json({ ok: true, order_id: order.id });
}
