import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ImportRow = {
  boxCount?: number | string | null;
  productCode?: string | null;
  qtyPerBox?: number | string | null;
  netWeight?: number | string | null;
  grossWeight?: number | string | null;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  let text = String(value).trim().replace(/\s+/g, "");
  if (!text) return null;

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  if (hasComma && hasDot) {
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    if (lastComma > lastDot) {
      text = text.replace(/\./g, "");
      text = text.replace(/,/g, ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    text = text.replace(/\./g, "");
    text = text.replace(/,/g, ".");
  } else if (hasDot) {
    text = text.replace(/\.(?=.*\.)/g, "");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Gecersiz istek" }, { status: 400 });
  }

  const { orderId, supplierId, fileName, rows } = body as {
    orderId?: string;
    supplierId?: string;
    fileName?: string | null;
    rows?: ImportRow[];
  };

  if (!orderId || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "orderId ve rows zorunlu" }, { status: 400 });
  }

  const cleanedRows = rows
    .map((row) => ({
      boxCount: toNumber(row.boxCount) ?? null,
      productCode: String(row.productCode ?? "").trim(),
      qtyPerBox: toNumber(row.qtyPerBox) ?? 0,
      netWeight: toNumber(row.netWeight),
      grossWeight: toNumber(row.grossWeight),
    }))
    .filter((row) => row.productCode);

  if (!cleanedRows.length) {
    return NextResponse.json({ error: "Urun kodu bulunan satir yok" }, { status: 400 });
  }

  const { data: packingList, error: packingListError } = await supabase
    .from("packing_lists")
    .insert({
      order_id: orderId,
      supplier_id: supplierId ?? null,
      file_name: fileName ?? null,
      status: "imported",
      version: 1,
    })
    .select("id")
    .single();

  if (packingListError || !packingList) {
    return NextResponse.json(
      { error: packingListError?.message ?? "Packing list olusturulamadi" },
      { status: 500 }
    );
  }

  const grouped = new Map<
    string,
    { qty: number; boxes: number; netIn: number; grossIn: number }
  >();

  cleanedRows.forEach((row) => {
    const boxCount = row.boxCount ?? 0;
    const boxMultiplier = boxCount > 0 ? boxCount : 0; // koli toplamı
    const valueMultiplier = boxCount > 0 ? boxCount : 1; // adet/ağırlık
    const key = row.productCode;
    const current = grouped.get(key) ?? {
      qty: 0,
      boxes: 0,
      netIn: 0,
      grossIn: 0,
    };
    current.qty += (row.qtyPerBox ?? 0) * valueMultiplier;
    current.boxes += boxMultiplier;
    if (row.netWeight !== null) current.netIn += (row.netWeight ?? 0) * valueMultiplier;
    if (row.grossWeight !== null) current.grossIn += (row.grossWeight ?? 0) * valueMultiplier;
    grouped.set(key, current);
  });

  const productCodes = Array.from(grouped.keys());
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, code, name")
    .in("code", productCodes);

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }

  const productByCode = new Map(
    (products ?? []).filter((p) => p.code).map((p) => [String(p.code), p])
  );
  const productIds = (products ?? []).map((p) => p.id).filter(Boolean) as string[];

  // Ağırlıkları ürün niteliklerinden oku (weight/ağırlık içeren isimler)
  const weightByProductId = new Map<string, number>();
  if (productIds.length) {
    const { data: attrValues } = await supabase
      .from("product_attribute_values")
      .select("product_id, value_text, value_number, attribute:product_attributes(name)")
      .in("product_id", productIds);
    (attrValues ?? []).forEach((row) => {
      const attrName = (row as any).attribute?.name?.toLowerCase?.() ?? "";
      if (
        !attrName.includes("weight") &&
        !attrName.includes("ağırlık") &&
        !attrName.includes("agirlik")
      )
        return;
      const raw =
        row.value_number !== null && row.value_number !== undefined
          ? row.value_number
          : row.value_text;
      const num = toNumber(raw);
      if (num !== null && !weightByProductId.has(row.product_id)) {
        weightByProductId.set(row.product_id, num);
      }
    });

    // Extra attributes'ta da ağırlık varsa al
    const { data: extraValues } = await supabase
      .from("product_extra_attributes")
      .select("product_id, name, value_text, value_number")
      .in("product_id", productIds);
    (extraValues ?? []).forEach((row) => {
      const attrName = row.name?.toLowerCase?.() ?? "";
      if (
        !attrName.includes("weight") &&
        !attrName.includes("ağırlık") &&
        !attrName.includes("agirlik")
      )
        return;
      const raw =
        row.value_number !== null && row.value_number !== undefined
          ? row.value_number
          : row.value_text;
      const num = toNumber(raw);
      if (num !== null && !weightByProductId.has(row.product_id)) {
        weightByProductId.set(row.product_id, num);
      }
    });
  }

  const lines = productCodes.map((code, index) => {
    const agg = grouped.get(code) ?? { qty: 0, boxes: 0, netIn: 0, grossIn: 0 };
    const product = productByCode.get(code);
    const weight = (product?.id ? weightByProductId.get(product.id) : null) ?? 0;
    const netTotal = agg.netIn > 0 ? agg.netIn : weight * agg.qty;
    const grossTotal = agg.grossIn > 0 ? agg.grossIn : weight * agg.qty;
    return {
      packing_list_id: packingList.id,
      product_id: product?.id ?? null,
      product_name_raw: code,
      line_no: String(index + 1),
      quantity: agg.qty,
      net_weight: netTotal,
      gross_weight: grossTotal,
      packages_count: agg.boxes,
    };
  });

  const chunkSize = 500;
  for (let i = 0; i < lines.length; i += chunkSize) {
    const batch = lines.slice(i, i + chunkSize);
    const { error } = await supabase.from("packing_list_lines").insert(batch);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const autoTotals = lines.reduce(
    (acc, line) => {
      acc.packages += Number(line.packages_count ?? 0);
      acc.net += Number(line.net_weight ?? 0);
      acc.gross += Number(line.gross_weight ?? 0);
      return acc;
    },
    { packages: 0, net: 0, gross: 0 }
  );

  const { data: currentSummary } = await supabase
    .from("order_packing_list_summary")
    .select("total_cbm, notes")
    .eq("order_id", orderId)
    .maybeSingle();

  await supabase.from("order_packing_list_summary").upsert(
    [
      {
        order_id: orderId,
        total_packages: autoTotals.packages,
        total_net_weight_kg: autoTotals.net,
        total_gross_weight_kg: autoTotals.gross,
        total_cbm: Number(currentSummary?.total_cbm ?? 0),
        notes: currentSummary?.notes ?? null,
      },
    ],
    { onConflict: "order_id" }
  );

  return NextResponse.json({
    packingListId: packingList.id,
    importedLines: lines.length,
  });
}
