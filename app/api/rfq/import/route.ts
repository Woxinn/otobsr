import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

type ImportRow = {
  product_code?: string | null;
  supplier_name?: string | null;
  unit_price?: number | null;
  currency?: string | null;
  quantity?: number | null;
  transit_days?: number | null;
  min_order?: number | null;
  delivery_time?: string | null;
  validity_date?: string | null;
  notes?: string | null;
};

const DB_PAGE_SIZE = 1000;

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (!items.length) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const toNumber = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;

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
  return Number.isFinite(parsed) ? parsed : null;
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (role === "Satis") return NextResponse.json({ error: "Yetki yok" }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch (err) {
    console.error("[rfq-import] json parse", err);
    return NextResponse.json({ error: "JSON okunamadı" }, { status: 400 });
  }

  const rfqId = body?.rfq_id as string | undefined;
  const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
  if (!rfqId || !rows.length) {
    return NextResponse.json({ error: "rfq_id veya satır yok" }, { status: 400 });
  }

  const debug: any = { rows_received: rows.length };

  const rfqItems: any[] = [];
  for (let from = 0; ; from += DB_PAGE_SIZE) {
    const to = from + DB_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("rfq_items")
      .select("id, product_id, product_code, product_name")
      .eq("rfq_id", rfqId)
      .range(from, to);
    if (error) {
      console.error("[rfq-import] rfqItemsErr", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const rows = data ?? [];
    rfqItems.push(...rows);
    if (rows.length < DB_PAGE_SIZE) break;
  }

  const rfqItemsByCode = new Map<string, any>();
  (rfqItems ?? []).forEach((it) => {
    const code = (it.product_code ?? "").trim();
    if (code) rfqItemsByCode.set(code.toLowerCase(), it);
  });

  const productCodes = Array.from(new Set(rows.map((r) => (r.product_code ?? "").trim()).filter(Boolean)));
  const supplierNames = Array.from(new Set(rows.map((r) => (r.supplier_name ?? "").trim()).filter(Boolean)));

  const products: any[] = [];
  if (productCodes.length) {
    const productCodeChunks = chunkArray(productCodes, 400);
    for (const codeChunk of productCodeChunks) {
      const { data, error } = await supabase.from("products").select("id, code, name").in("code", codeChunk);
      if (error) {
        console.error("[rfq-import] products", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      products.push(...(data ?? []));
    }
  }
  const productByCode = new Map<string, any>();
  products.forEach((p) => productByCode.set((p.code ?? "").toLowerCase(), p));

  const suppliers: any[] = [];
  if (supplierNames.length) {
    const supplierNameChunks = chunkArray(supplierNames, 400);
    for (const supplierChunk of supplierNameChunks) {
      const { data, error } = await supabase.from("suppliers").select("id, name").in("name", supplierChunk);
      if (error) {
        console.error("[rfq-import] suppliers", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      suppliers.push(...(data ?? []));
    }
  }
  const supplierByName = new Map<string, any>();
  suppliers.forEach((s) => supplierByName.set((s.name ?? "").toLowerCase(), s));

  // RFQ özel tedarikçi listesi
  const { data: rfqSuppliers } = await supabase
    .from("rfq_suppliers")
    .select("supplier_id, suppliers(name)")
    .eq("rfq_id", rfqId);
  const rfqSupplierList = (rfqSuppliers ?? []).map((r) => ({
    id: r.supplier_id,
    name: (r as any).suppliers?.name ?? "",
  }));

  const missingProducts: Set<string> = new Set();
  const missingSuppliers: Set<string> = new Set();
  const ambiguousSuppliers: Array<{ input: string; options: { id: string; name: string }[] }> = [];

  const newItemsPayload: any[] = [];
  rows.forEach((r) => {
    const code = (r.product_code ?? "").trim();
    if (!code) return;
    const key = code.toLowerCase();
    if (rfqItemsByCode.has(key)) return; // RFQ'de zaten var

    missingProducts.add(code); // RFQ'ye eklenecek her yeni satırı kullanıcıya sor
    const prod = productByCode.get(key);
    newItemsPayload.push({
      rfq_id: rfqId,
      product_id: prod?.id ?? null,
      product_code: prod?.code ?? code,
      product_name: prod?.name ?? code,
      quantity: 0,
    });
  });

  const wantCreateMissing = body?.add_missing_products === true;
  if (missingProducts.size && !wantCreateMissing) {
    return NextResponse.json(
      {
        ok: false,
        need_confirmation: true,
        missing_products: Array.from(missingProducts),
        message: "Eksik ürünler var, ekleyelim mi?",
      },
      { status: 422 }
    );
  }
  if (ambiguousSuppliers.length) {
    return NextResponse.json(
      {
        ok: false,
        need_supplier_choice: true,
        ambiguous_suppliers: ambiguousSuppliers,
        message: "Tedarikçi eşleşmesi net değil, seçim yapın",
      },
      { status: 422 }
    );
  }

  if (newItemsPayload.length) {
    const createdItems: any[] = [];
    for (const payloadChunk of chunkArray(newItemsPayload, 500)) {
      const { data, error } = await supabase
        .from("rfq_items")
        .insert(payloadChunk)
        .select("id, product_code");
      if (error) {
        console.error("[rfq-import] createItemsErr", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      createdItems.push(...(data ?? []));
    }
    (createdItems ?? []).forEach((it) => rfqItemsByCode.set((it.product_code ?? "").toLowerCase(), it));
  }

  type Key = string;
  const grouped: Record<
    Key,
    {
      supplier_id: string;
      product_id?: string | null;
      rfq_item_id?: string | null;
      currency?: string | null;
      unit_price?: number | null;
      quantity: number;
      transit?: number | null;
      min_order?: number | null;
      delivery_time?: string | null;
      validity_date?: string | null;
      notes?: string | null;
    }[]
  > = {};

  const supplierMapInput: Record<string, string> = {};
  if (Array.isArray(body?.supplier_map)) {
    (body.supplier_map as any[]).forEach((m) => {
      if (m?.input && m?.supplier_id) supplierMapInput[m.input.toLowerCase()] = String(m.supplier_id);
    });
  }

  const findSupplier = (inputName: string) => {
    const tokens = inputName.toLowerCase().split(/\s+/).filter(Boolean);
    const candidates = rfqSupplierList.length ? rfqSupplierList : suppliers;
    const matches = candidates.filter((c) =>
      tokens.every((t) => (c.name ?? "").toLowerCase().includes(t))
    );
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      ambiguousSuppliers.push({ input: inputName, options: matches });
      return null;
    }
    return null;
  };

  for (const row of rows) {
    const code = (row.product_code ?? "").trim();
    const supName = (row.supplier_name ?? "").trim();
    if (!code || !supName) continue;

    let supplierId: string | null = supplierMapInput[supName.toLowerCase()] ?? null;
    if (!supplierId) {
      const supplier = supplierByName.get(supName.toLowerCase()) ?? findSupplier(supName);
      supplierId = supplier?.id ?? null;
    }

    if (!supplierId) {
      missingSuppliers.add(supName);
      continue;
    }

    const rfqItem = rfqItemsByCode.get(code.toLowerCase());
    const unitPrice = toNumber(row.unit_price);
    const qtyNum = toNumber(row.quantity) ?? 0;
    const minOrderNum = toNumber(row.min_order);
    const transitNum = toNumber(row.transit_days);
    const key = `${supplierId}__${code.toLowerCase()}__${row.currency ?? ""}__${row.unit_price ?? ""}`;

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({
      supplier_id: supplierId,
      rfq_item_id: rfqItem?.id ?? null,
      product_id: rfqItem?.product_id ?? productByCode.get(code.toLowerCase())?.id ?? null,
      currency: row.currency ?? null,
      unit_price: unitPrice,
      quantity: qtyNum,
      transit: transitNum,
      min_order: minOrderNum,
      delivery_time: row.delivery_time ?? null,
      validity_date: row.validity_date ?? null,
      notes: row.notes ?? null,
    });
  }

  const aggregated: any[] = [];
  Object.values(grouped).forEach((arr) => {
    const sample = arr[0];
    const totalQty = arr.reduce((s, x) => s + Number(x.quantity ?? 0), 0);
    aggregated.push({
      ...sample,
      quantity: totalQty,
    });
  });

  debug.grouped_keys = Object.keys(grouped).length;
  debug.aggregated_rows = aggregated.length;
  debug.products_found = products.length;
  debug.suppliers_found = suppliers.length;
  debug.ambiguous_suppliers = ambiguousSuppliers;

  const supplierQuotes = new Map<string, any>();
  for (const agg of aggregated) {
    if (supplierQuotes.has(agg.supplier_id)) continue;
    const { data: existing } = await supabase
      .from("rfq_quotes")
      .select("id, supplier_id, currency")
      .eq("rfq_id", rfqId)
      .eq("supplier_id", agg.supplier_id)
      .maybeSingle();
    if (existing) {
      supplierQuotes.set(agg.supplier_id, existing);
      continue;
    }
    const { data: created, error: createQuoteErr } = await supabase
      .from("rfq_quotes")
      .insert({
        rfq_id: rfqId,
        supplier_id: agg.supplier_id,
        currency: agg.currency ?? null,
      })
      .select("id, supplier_id, currency")
      .single();
    if (createQuoteErr) {
      console.error("[rfq-import] createQuoteErr", createQuoteErr);
      return NextResponse.json({ error: createQuoteErr.message, debug }, { status: 500 });
    }
    if (created) supplierQuotes.set(agg.supplier_id, created);
  }

  const quoteItemsPayload = aggregated.map((agg) => ({
    rfq_quote_id: supplierQuotes.get(agg.supplier_id)?.id,
    rfq_item_id: agg.rfq_item_id,
    product_id: agg.product_id,
    unit_price: agg.unit_price,
    min_order: agg.min_order,
    delivery_time: agg.delivery_time,
    terms: null,
    notes: agg.notes,
  }));

  // Mevcut satırları bul ve güncelle / yeni satırları ekle
  const targetQuoteIds = Array.from(supplierQuotes.values()).map((q: any) => q.id);
  const targetItemIds = quoteItemsPayload.map((p) => p.rfq_item_id).filter(Boolean);
  let existingMap = new Map<string, any>();
  if (targetQuoteIds.length && targetItemIds.length) {
    const wantedItemIds = new Set(targetItemIds as string[]);
    const existingItems: any[] = [];
    for (const quoteChunk of chunkArray(targetQuoteIds, 200)) {
      for (let from = 0; ; from += DB_PAGE_SIZE) {
        const to = from + DB_PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from("rfq_quote_items")
          .select("id, rfq_quote_id, rfq_item_id")
          .in("rfq_quote_id", quoteChunk)
          .range(from, to);
        if (error) {
          console.error("[rfq-import] existing quote items err", error);
          return NextResponse.json({ error: error.message, debug }, { status: 500 });
        }
        const rows = (data ?? []).filter((row: any) => wantedItemIds.has(String(row.rfq_item_id)));
        existingItems.push(...rows);
        if ((data ?? []).length < DB_PAGE_SIZE) break;
      }
    }
    existingMap = new Map(
      (existingItems ?? []).map((row: any) => [`${row.rfq_quote_id}_${row.rfq_item_id}`, row])
    );
  }

  const updates: any[] = [];
  const inserts: any[] = [];
  for (const payload of quoteItemsPayload) {
    const key = `${payload.rfq_quote_id}_${payload.rfq_item_id}`;
    const exist = existingMap.get(key);
    if (exist) {
      updates.push({ id: exist.id, ...payload });
    } else {
      inserts.push(payload);
    }
  }

  if (updates.length) {
    for (const updateChunk of chunkArray(updates, 500)) {
      const { error: updErr } = await supabase.from("rfq_quote_items").upsert(updateChunk, { onConflict: "id" });
      if (updErr) {
        console.error("[rfq-import] quoteItems update err", updErr);
        return NextResponse.json({ error: updErr.message, debug }, { status: 500 });
      }
    }
  }
  if (inserts.length) {
    for (const insertChunk of chunkArray(inserts, 500)) {
      const { error: insErr } = await supabase.from("rfq_quote_items").insert(insertChunk);
      if (insErr) {
        console.error("[rfq-import] quoteItems insert err", insErr);
        return NextResponse.json({ error: insErr.message, debug }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    inserted_quote_items: quoteItemsPayload.length,
    missing_products: Array.from(missingProducts),
    missing_suppliers: Array.from(missingSuppliers),
    debug,
  });
}
