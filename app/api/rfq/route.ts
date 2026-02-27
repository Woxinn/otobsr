import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { role, userId } = await getCurrentUserRole();

    if (role === "Satis") {
      return NextResponse.json({ error: "Yetki yok" }, { status: 403 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch (err) {
      console.error("[rfq] parse error", err);
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }

    const productIds = Array.isArray(body?.product_ids)
      ? (body.product_ids as unknown[]).map(String).filter(Boolean)
      : [];

    const itemsFromBody = Array.isArray(body?.items)
      ? (body.items as any[]).map((it) => ({
          product_id: String(it?.product_id ?? "").trim(),
          quantity: Number(it?.quantity ?? 0),
        }))
      : [];

    let items:
      | { product_id: string; plan_entry_id?: string | null; quantity: number }[]
      | null = null;
    let planUsed = false;

    if (itemsFromBody.length) {
      const filtered = itemsFromBody.filter((it) => it.product_id && Number(it.quantity) > 0);
      if (!filtered.length) {
        return NextResponse.json({ error: "Geçerli miktar yok" }, { status: 400 });
      }
      items = filtered.map((it) => ({
        product_id: it.product_id,
        plan_entry_id: null,
        quantity: Number(it.quantity),
      }));
    } else {
      if (!productIds.length) {
        return NextResponse.json({ error: "Ürün seçilmedi" }, { status: 400 });
      }

      const { data: planEntries, error: planErr } = await supabase
        .from("order_plan_entries")
        .select("id, product_id, value")
        .in("product_id", productIds);

      if (planErr) {
        console.error("[rfq] planErr", planErr);
        return NextResponse.json({ error: planErr.message ?? "Plan okunamadı" }, { status: 500 });
      }

      items = (planEntries ?? [])
        .map((row) => ({
          product_id: row.product_id,
          plan_entry_id: row.id,
          quantity: Number(row.value ?? 0),
        }))
        .filter((row) => row.quantity > 0);

      if (!items.length) {
        return NextResponse.json({ error: "Seçilen ürünlerde miktar yok" }, { status: 400 });
      }
      planUsed = true;
    }

    const lookupIds = items.map((it) => it.product_id);
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, code, name")
      .in("id", lookupIds);
    if (prodErr) {
      console.error("[rfq] products error", prodErr);
      return NextResponse.json({ error: prodErr.message ?? "Ürün okunamadı" }, { status: 500 });
    }
    const productMap = new Map<string, { code: string | null; name: string | null }>();
    (products ?? []).forEach((p) => productMap.set(p.id, { code: p.code, name: p.name }));

    const now = new Date();
    const code = `RFQ-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
      now.getDate()
    ).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

    const { data: rfqInsert, error: rfqErr } = await supabase
      .from("rfqs")
      .insert({
        code,
        title: body?.title ?? code,
        notes: body?.notes ?? null,
        status: "draft",
        created_by: userId,
        target_suppliers: body?.supplier_ids ?? null,
        currency: body?.currency ?? null,
        incoterm: body?.incoterm ?? null,
        response_due_date: body?.response_due_date ?? null,
      })
      .select("id")
      .single();

    if (rfqErr || !rfqInsert) {
      console.error("[rfq] rfqErr", rfqErr);
      return NextResponse.json({ error: rfqErr?.message ?? "RFQ oluşturulamadı" }, { status: 500 });
    }

    const itemsPayload = items.map((row) => {
      const snap = productMap.get(row.product_id) ?? { code: null, name: null };
      return {
        rfq_id: rfqInsert.id,
        product_id: row.product_id,
        plan_entry_id: row.plan_entry_id,
        quantity: row.quantity,
        product_code: snap.code,
        product_name: snap.name,
      };
    });

    const { error: itemsErr } = await supabase.from("rfq_items").insert(itemsPayload);
    if (itemsErr) {
      console.error("[rfq] itemsErr", itemsErr);
      return NextResponse.json({ error: itemsErr.message ?? "RFQ kalemleri eklenemedi" }, { status: 500 });
    }

    if (Array.isArray(body?.supplier_ids) && body.supplier_ids.length) {
      const supPayload = (body.supplier_ids as unknown[]).map((sid) => ({
        rfq_id: rfqInsert.id,
        supplier_id: String(sid),
        invite_status: "pending",
      }));
      const { error: supErr } = await supabase.from("rfq_suppliers").insert(supPayload);
      if (supErr) {
        console.error("[rfq] supErr", supErr);
        return NextResponse.json({ error: supErr.message ?? "Tedarikçi eklenemedi" }, { status: 500 });
      }
    }

    if (planUsed) {
      const { error: clearErr } = await supabase
        .from("order_plan_entries")
        .update({ value: 0 })
        .in("product_id", productIds);
      if (clearErr) {
        console.error("[rfq] clearErr", clearErr);
        return NextResponse.json({ error: clearErr.message ?? "Plan güncellenemedi" }, { status: 500 });
      }
    }

    return NextResponse.json({ id: rfqInsert.id });
  } catch (err: any) {
    console.error("[rfq] unknown error", err);
    return NextResponse.json({ error: err?.message ?? "Bilinmeyen hata" }, { status: 500 });
  }
}
