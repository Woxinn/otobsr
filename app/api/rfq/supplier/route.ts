import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { role } = await getCurrentUserRole();

    if (role === "Satis") {
      return NextResponse.json({ error: "Yetki yok" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const rfqId = String(body?.rfq_id ?? "").trim();
    const supplierId = String(body?.supplier_id ?? "").trim();

    if (!rfqId || !supplierId) {
      return NextResponse.json({ error: "RFQ ve tedarikci gerekli" }, { status: 400 });
    }

    const { data: rfq, error: rfqErr } = await supabase
      .from("rfqs")
      .select("id, target_suppliers")
      .eq("id", rfqId)
      .maybeSingle();
    if (rfqErr) {
      return NextResponse.json({ error: rfqErr.message ?? "RFQ okunamadi" }, { status: 500 });
    }
    if (!rfq) {
      return NextResponse.json({ error: "RFQ bulunamadi" }, { status: 404 });
    }

    const { data: supplier, error: supplierErr } = await supabase
      .from("suppliers")
      .select("id")
      .eq("id", supplierId)
      .maybeSingle();
    if (supplierErr) {
      return NextResponse.json({ error: supplierErr.message ?? "Tedarikci okunamadi" }, { status: 500 });
    }
    if (!supplier) {
      return NextResponse.json({ error: "Tedarikci bulunamadi" }, { status: 404 });
    }

    const { data: existing, error: existingErr } = await supabase
      .from("rfq_suppliers")
      .select("id")
      .eq("rfq_id", rfqId)
      .eq("supplier_id", supplierId)
      .maybeSingle();
    if (existingErr) {
      return NextResponse.json({ error: existingErr.message ?? "Tedarikci kontrol edilemedi" }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json({ error: "Bu tedarikci zaten ekli" }, { status: 409 });
    }

    const { error: insertErr } = await supabase.from("rfq_suppliers").insert({
      rfq_id: rfqId,
      supplier_id: supplierId,
      invite_status: "pending",
    });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message ?? "Tedarikci eklenemedi" }, { status: 500 });
    }

    const targetSupplierIds = Array.isArray(rfq.target_suppliers)
      ? rfq.target_suppliers.map((value: unknown) => String(value)).filter(Boolean)
      : [];
    const nextTargetSupplierIds = targetSupplierIds.includes(supplierId)
      ? targetSupplierIds
      : [...targetSupplierIds, supplierId];

    const { error: updateErr } = await supabase
      .from("rfqs")
      .update({ target_suppliers: nextTargetSupplierIds })
      .eq("id", rfqId);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message ?? "RFQ guncellenemedi" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[rfq-supplier] unknown error", error);
    return NextResponse.json({ error: error?.message ?? "Bilinmeyen hata" }, { status: 500 });
  }
}
