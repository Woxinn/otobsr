import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

type ItemInput = {
  product_code?: string | null;
  product_name?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
  notes?: string | null;
};

const normalizeCode = (value: string | null | undefined) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ");

const codeKey = (value: string | null | undefined) => normalizeCode(value).toLowerCase();

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  const text = raw.replace(/\s+/g, "");
  const hasDot = text.includes(".");
  const hasComma = text.includes(",");

  let normalized = text;
  if (hasDot && hasComma) {
    const lastDot = text.lastIndexOf(".");
    const lastComma = text.lastIndexOf(",");
    if (lastComma > lastDot) {
      normalized = text.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = text.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (role === "Satis") return NextResponse.json({ error: "Yetki yok" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const supplierId = String(body?.supplier_id ?? "").trim();
  const proformaNo = String(body?.proforma_no ?? "").trim();
  const proformaName = String(body?.proforma_name ?? "").trim();
  const proformaDate = body?.proforma_date ? String(body.proforma_date) : null;
  const currency = String(body?.currency ?? "USD").trim() || "USD";
  const notes = body?.notes ? String(body.notes) : null;
  const items = (Array.isArray(body?.items) ? body.items : []) as ItemInput[];

  if (!supplierId || !proformaNo) {
    return NextResponse.json({ error: "supplier_id ve proforma_no gerekli" }, { status: 400 });
  }
  if (!items.length) return NextResponse.json({ error: "Kalem yok" }, { status: 400 });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: proforma, error: proformaErr } = await supabase
    .from("proformas")
    .insert({
      supplier_id: supplierId,
      proforma_no: proformaNo,
      name: proformaName || null,
      proforma_date: proformaDate,
      currency,
      notes,
      created_by: user?.id ?? null,
      status: "taslak",
    })
    .select("id")
    .single();
  if (proformaErr || !proforma) {
    return NextResponse.json({ error: proformaErr?.message ?? "Proforma olusturulamadi" }, { status: 500 });
  }

  const productMap = new Map<string, string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data: products, error: productsErr } = await supabase
      .from("products")
      .select("id, code")
      .range(from, to);
    if (productsErr) {
      await supabase.from("proformas").delete().eq("id", proforma.id);
      return NextResponse.json({ error: productsErr.message }, { status: 500 });
    }
    if (!products?.length) break;
    (products ?? []).forEach((p) => {
      productMap.set(codeKey(p.code as string), String(p.id));
    });
    if (products.length < pageSize) break;
  }

  const grouped = new Map<
    string,
    {
      product_code: string;
      product_name: string | null;
      quantity: number;
      unit_price: number;
      line_total: number;
      notes: string | null;
      product_id: string | null;
    }
  >();
  const missingProductCodes = new Set<string>();

  items.forEach((item) => {
    const code = normalizeCode(item.product_code);
    if (!code) return;
    const quantity = toNumber(item.quantity);
    const unitPrice = toNumber(item.unit_price);
    const lineTotalRaw = toNumber(item.line_total);
    const lineTotal = lineTotalRaw || quantity * unitPrice;
    const key = `${codeKey(code)}__${unitPrice}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += quantity;
      existing.line_total += lineTotal;
      grouped.set(key, existing);
      return;
    }
    const resolvedProductId = productMap.get(codeKey(code)) ?? null;
    if (!resolvedProductId) {
      missingProductCodes.add(code);
    }
    grouped.set(key, {
      product_code: code,
      product_name: item.product_name ? String(item.product_name).trim() : null,
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      notes: item.notes ? String(item.notes) : null,
      product_id: resolvedProductId,
    });
  });

  const payload = Array.from(grouped.values()).map((row) => ({
    proforma_id: proforma.id,
    product_id: row.product_id,
    product_code: row.product_code,
    product_name: row.product_name,
    quantity: row.quantity,
    unit_price: row.unit_price,
    line_total: row.line_total,
    notes: row.notes,
  }));

  if (!payload.length) {
    await supabase.from("proformas").delete().eq("id", proforma.id);
    return NextResponse.json({ error: "Gecerli kalem bulunamadi" }, { status: 400 });
  }

  if (missingProductCodes.size) {
    console.warn("[proforma-import] sistemde olmayan urun kodlari", {
      proforma_no: proformaNo,
      supplier_id: supplierId,
      count: missingProductCodes.size,
      codes: Array.from(missingProductCodes),
    });
  }

  const chunkSize = 1000;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error } = await supabase.from("proforma_items").insert(chunk);
    if (error) {
      await supabase.from("proformas").delete().eq("id", proforma.id);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const totalAmount = payload.reduce((sum, row) => sum + Number(row.line_total ?? 0), 0);
  await supabase.from("proformas").update({ total_amount: totalAmount }).eq("id", proforma.id);

  return NextResponse.json({
    ok: true,
    id: proforma.id,
    item_count: payload.length,
    total_amount: totalAmount,
  });
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (role === "Satis") return NextResponse.json({ error: "Yetki yok" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const proformaId = String(body?.proforma_id ?? "").trim();
  if (!proformaId) {
    return NextResponse.json({ error: "proforma_id gerekli" }, { status: 400 });
  }

  const { error } = await supabase.from("proformas").delete().eq("id", proformaId);
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "Bagli kayit oldugu icin proforma silinemiyor." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
