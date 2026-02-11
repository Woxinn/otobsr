"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

const nullIfEmpty = (value: FormDataEntryValue | null) => {
  if (value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const normalizeNumberText = (value: string | null | undefined) => {
  if (!value) return null;
  const raw = value
    .trim()
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, "");
  if (!raw.length) return null;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    if (lastComma > lastDot) {
      // 1.234,56 => 1234.56
      return raw.replace(/\./g, "").replace(",", ".");
    }
    // 1,234.56 => 1234.56
    return raw.replace(/,/g, "");
  }

  if (hasComma) {
    return raw.replace(",", ".");
  }

  return raw;
};

const toNumberFromText = (value: string | null | undefined) => {
  const normalized = normalizeNumberText(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const toIntegerFromText = (value: string | null | undefined) => {
  const parsed = toNumberFromText(value);
  if (parsed === null) return null;
  return Math.round(parsed);
};

const parseCsvLine = (line: string, delimiter: string) => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current);
  return result.map((value) => value.trim());
};

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const resolveHeaderIndex = (headers: string[], options: string[]) => {
  const normalized = headers.map((item) => normalizeHeader(item));
  for (const option of options) {
    const idx = normalized.indexOf(normalizeHeader(option));
    if (idx >= 0) return idx;
  }
  return -1;
};

const normalizeProductCode = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, "");

const normalizeAttributeName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131|\u0130/g, "i");

const isWeightName = (value: string) => {
  const normalized = normalizeAttributeName(value);
  return normalized.includes("agirlik") || normalized.includes("weight");
};

const pickWeightValue = (valueNumber: number | null, valueText: string | null) => {
  if (valueNumber !== null && valueNumber !== undefined) return valueNumber;
  return toNumberFromText(valueText ?? "");
};

const tokenizeCode = (value: string) =>
  normalizeProductCode(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);

const fuzzyMatchProduct = (
  code: string,
  products: { id: string; code: string; name?: string | null }[]
) => {
  const tokens = tokenizeCode(code);
  if (!tokens.length) return null;

  let best: { product: typeof products[number]; score: number } | null = null as any;

  products.forEach((product) => {
    const productTokens = tokenizeCode(product.code ?? "");
    if (!productTokens.length) return;

    // Tüm arama token'ları ürün kodu içinde yer almalı
    const productFlat = productTokens.join("");
    const allPresent = tokens.every((t) => productFlat.includes(t));
    if (!allPresent) return;

    // Skor: toplam token uzunluğu / ürün kodu uzunluğu (daha sıkı)
    const score =
      tokens.reduce((sum, t) => sum + t.length, 0) /
      (productFlat.length || 1);

    if (!best || score > best.score) {
      best = { product, score };
    }
  });

  if (best && best.score >= 0.4) {
    return best.product;
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("Fuzzy not matched", {
      code,
      tokens,
      sampleProduct: products[0]?.code,
      triedCount: products.length,
      bestScore: best?.score ?? 0,
      bestCode: best?.product.code ?? null,
    });
  }
  return null;
};

const buildWeightByProductIds = async (
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productIds: string[]
) => {
  const weightByProduct = new Map<string, number>();
  if (!productIds.length) return weightByProduct;

  const batchSize = 120;
  for (let i = 0; i < productIds.length; i += batchSize) {
    const batch = productIds.slice(i, i + batchSize);

    const { data: attributeValues, error: attrError } = await supabase
      .from("product_attribute_values")
      .select("product_id, value_text, value_number, product_attributes(name)")
      .in("product_id", batch);

    if (attrError) {
      console.error("Order items weight fetch failed (attributes)", attrError);
    }

    (attributeValues ?? []).forEach((item) => {
      if (!item.product_id) return;
      const attribute = Array.isArray(item.product_attributes)
        ? item.product_attributes[0]
        : item.product_attributes;
      if (!attribute?.name || !isWeightName(attribute.name)) return;
      const value = pickWeightValue(item.value_number, item.value_text);
      if (value === null) return;
      if (!weightByProduct.has(item.product_id)) {
        weightByProduct.set(item.product_id, value);
      }
    });

    const { data: extraValues, error: extraError } = await supabase
      .from("product_extra_attributes")
      .select("product_id, name, value_text, value_number")
      .in("product_id", batch);

    if (extraError) {
      console.error("Order items weight fetch failed (extras)", extraError);
    }

    (extraValues ?? []).forEach((item) => {
      if (!item.product_id || !item.name) return;
      if (!isWeightName(item.name)) return;
      const value = pickWeightValue(item.value_number, item.value_text);
      if (value === null) return;
      if (!weightByProduct.has(item.product_id)) {
        weightByProduct.set(item.product_id, value);
      }
    });
  }

  return weightByProduct;
};

const ENABLE_FUZZY_MATCH = process.env.IMPORT_FUZZY_MATCH === "1";

type MissingRow = {
  code: string;
  name: string | null;
  group_id?: string | null;
  group_name?: string | null;
  line_no?: number | null;
  quantity: number | null;
  unit_price: number | null;
  total_amount: number | null;
  net_weight_kg: number | null;
  gross_weight_kg: number | null;
  notes: string | null;
  attributes: {
    name: string;
    unit: string | null;
    valueType: "text" | "number";
    rawValue: string;
  }[];
};

const resolveProductBySearch = async (
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  productId: string | null,
  productCode: string | null,
  productSearch: string | null
) => {
  if (productId) {
    const { data } = await supabase
      .from("products")
      .select("id, code, name, unit_price, group_id")
      .eq("id", productId)
      .single();
    return data ?? null;
  }

  const code = productCode?.trim();
  if (code) {
    const { data } = await supabase
      .from("products")
      .select("id, code, name, unit_price, group_id")
      .eq("code", code)
      .single();
    if (data) return data;
  }

  const search = productSearch?.trim();
  if (!search) return null;

  const codeCandidate = search.split(" - ")[0]?.trim();
  if (codeCandidate) {
    const { data } = await supabase
      .from("products")
      .select("id, code, name, unit_price, group_id")
      .eq("code", codeCandidate)
      .single();
    if (data) return data;
  }

  const { data } = await supabase
    .from("products")
    .select("id, code, name, unit_price, group_id")
    .or(`code.ilike.%${search}%,name.ilike.%${search}%`)
    .limit(1)
    .maybeSingle();
  return data ?? null;
};

const updateOrderTotals = async (
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  orderId: string
) => {
  const { data: items, error } = await supabase
    .from("order_items")
    .select(
      "quantity, unit_price, total_amount, net_weight_kg, gross_weight_kg, product_id"
    )
    .eq("order_id", orderId);

  if (error) {
    console.error("Order totals fetch failed", error);
    return;
  }

  const productIds = Array.from(
    new Set(
      (items ?? [])
        .map((item) => item.product_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const weightByProduct = await buildWeightByProductIds(supabase, productIds);

    const totals = (items ?? []).reduce(
      (acc, item) => {
        const quantity = Number(item.quantity ?? 0);
        acc.qty += quantity;

      let weight: number | null = null;
      if (item.net_weight_kg !== null && item.net_weight_kg !== undefined) {
        weight = Number(item.net_weight_kg);
      } else if (
        item.gross_weight_kg !== null &&
        item.gross_weight_kg !== undefined
      ) {
        weight = Number(item.gross_weight_kg);
      } else if (item.product_id && weightByProduct.has(item.product_id)) {
        weight = (weightByProduct.get(item.product_id) ?? 0) * quantity;
      }

      if (weight !== null && !Number.isNaN(weight)) {
        acc.weight += weight;
      }

      return acc;
    },
      { qty: 0, amount: 0, weight: 0 }
    );

    const { data: totalsRow, error: totalsError } = await supabase.rpc(
      "order_totals",
      {
        _order_id: orderId,
      }
    );
    if (totalsError) {
      console.error("Order totals rpc failed", totalsError);
    }

    const dbTotalAmount =
      Array.isArray(totalsRow) && totalsRow.length
        ? Number(totalsRow[0]?.total_amount ?? 0)
        : totals.amount;

    await supabase
      .from("orders")
      .update({ total_amount: dbTotalAmount, weight_kg: totals.weight })
      .eq("id", orderId);
};

export async function createOrderItem(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const productId = nullIfEmpty(formData.get("product_id"));
  const productCode = nullIfEmpty(formData.get("product_code"));
  const productSearch = nullIfEmpty(formData.get("product_search"));
  const product = await resolveProductBySearch(
    supabase,
    productId,
    productCode,
    productSearch
  );

  const resolvedProductId = product?.id ?? productId ?? null;
  const quantity = toIntegerFromText(String(formData.get("quantity") ?? ""));
  const unitPriceInput = toNumberFromText(String(formData.get("unit_price") ?? ""));
  const unitPrice = unitPriceInput ?? product?.unit_price ?? null;

  let netWeight = toNumberFromText(String(formData.get("net_weight_kg") ?? ""));
  let grossWeight = toNumberFromText(
    String(formData.get("gross_weight_kg") ?? "")
  );

  if (
    netWeight === null &&
    grossWeight === null &&
    resolvedProductId &&
    quantity !== null
  ) {
    const weightByProduct = await buildWeightByProductIds(supabase, [
      resolvedProductId,
    ]);
    const perUnit = weightByProduct.get(resolvedProductId);
    if (perUnit !== undefined && perUnit !== null) {
      netWeight = perUnit * quantity;
      grossWeight = grossWeight ?? netWeight;
    }
  }

  const totalAmount =
    unitPrice !== null && quantity !== null ? unitPrice * quantity : null;

  const name = nullIfEmpty(formData.get("name")) ?? product?.name ?? null;

  const { error } = await supabase.from("order_items").insert({
    order_id: orderId,
    product_id: resolvedProductId,
    name,
    quantity,
    unit_price: unitPrice,
    total_amount: totalAmount,
    net_weight_kg: netWeight,
    gross_weight_kg: grossWeight,
    notes: nullIfEmpty(formData.get("notes")),
  });

  if (error) {
    console.error("Order item create failed", error);
    return;
  }

  await updateOrderTotals(supabase, orderId);
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?toast=item-created`);
}

export async function updateOrderItem(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  const orderItemId = String(formData.get("order_item_id") ?? "");
  if (!orderId || !orderItemId) return;

  const productId = nullIfEmpty(formData.get("product_id"));
  const product = productId
    ? await resolveProductBySearch(supabase, productId, null, null)
    : null;

  const quantity = toIntegerFromText(String(formData.get("quantity") ?? ""));
  const unitPriceInput = toNumberFromText(String(formData.get("unit_price") ?? ""));
  const unitPrice = unitPriceInput ?? product?.unit_price ?? null;

  let netWeight = toNumberFromText(String(formData.get("net_weight_kg") ?? ""));
  let grossWeight = toNumberFromText(
    String(formData.get("gross_weight_kg") ?? "")
  );

  if (netWeight === null && grossWeight === null && productId && quantity !== null) {
    const weightByProduct = await buildWeightByProductIds(supabase, [productId]);
    const perUnit = weightByProduct.get(productId);
    if (perUnit !== undefined && perUnit !== null) {
      netWeight = perUnit * quantity;
      grossWeight = grossWeight ?? netWeight;
    }
  }

  const totalAmount =
    unitPrice !== null && quantity !== null ? unitPrice * quantity : null;

  const name = nullIfEmpty(formData.get("name")) ?? product?.name ?? null;

  const { error } = await supabase
    .from("order_items")
    .update({
      product_id: productId,
      name,
      quantity,
      unit_price: unitPrice,
      total_amount: totalAmount,
      net_weight_kg: netWeight,
      gross_weight_kg: grossWeight,
      notes: nullIfEmpty(formData.get("notes")),
    })
    .eq("id", orderItemId)
    .eq("order_id", orderId);

  if (error) {
    console.error("Order item update failed", error);
    return;
  }

  await updateOrderTotals(supabase, orderId);
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?toast=item-updated`);
}

export async function deleteOrderItem(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  if (!orderId || !itemId) return;

  const { error } = await supabase
    .from("order_items")
    .delete()
    .eq("id", itemId)
    .eq("order_id", orderId);

  if (error) {
    console.error("Order item delete failed", error);
    return;
  }

  await updateOrderTotals(supabase, orderId);
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?toast=item-deleted`);
}

export async function deleteAllOrderItems(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const { error } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (error) {
    console.error("Order items delete all failed", error);
    return;
  }

  await updateOrderTotals(supabase, orderId);
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?toast=items-deleted-all`);
}

export async function importOrderItems(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const file = formData.get("file");
  if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
    redirect(`/orders/${orderId}?toast=items-import-failed`);
  }

  const upload = file as File;
  const filename = upload.name.toLowerCase();
  const isExcel = filename.endsWith(".xlsx");

  let rows: string[][] = [];
  if (isExcel) {
    const buffer = await upload.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      blankrows: false,
    });
    rows = sheetRows
      .map((row) => row.map((cell) => String(cell ?? "").trim()))
      .filter((row) => row.some((cell) => cell.length));
  } else {
    const text = await upload.text();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length) {
      const headerLine = lines[0];
      const delimiter = headerLine.includes(";")
        ? ";"
        : headerLine.includes("\t")
        ? "\t"
        : ",";
      rows = lines.map((line) => parseCsvLine(line, delimiter));
    }
  }

  if (!rows.length) {
    redirect(`/orders/${orderId}?toast=items-import-empty`);
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);
  console.log("[order-items-import] rows", rows.length, "dataRows", dataRows.length);
  console.log("[order-items-import] headers", headers);

  const idxCode = resolveHeaderIndex(headers, ["product_code", "code", "urun_kodu"]);
  const idxName = resolveHeaderIndex(headers, [
    "product_name",
    "name",
    "urun_adi",
    "description",
  ]);
  const idxQty = resolveHeaderIndex(headers, ["quantity", "qty", "adet"]);
  const idxUnitPrice = resolveHeaderIndex(headers, [
    "unit_price",
    "birim_fiyat",
    "unit price",
  ]);
  const idxTotalAmount = resolveHeaderIndex(headers, [
    "total_amount",
    "toplam_tutar",
    "total",
  ]);
  const idxNetWeight = resolveHeaderIndex(headers, [
    "net_weight_kg",
    "net_weight",
    "net_agirlik",
    "net agirlik",
  ]);
  const idxGrossWeight = resolveHeaderIndex(headers, [
    "gross_weight_kg",
    "gross_weight",
    "gross_agirlik",
    "brut agirlik",
    "brut_agirlik",
  ]);
  const idxNotes = resolveHeaderIndex(headers, ["notes", "note", "not"]);
  console.log("[order-items-import] idx", {
    idxCode,
    idxName,
    idxQty,
    idxUnitPrice,
    idxTotalAmount,
    idxNetWeight,
    idxGrossWeight,
    idxNotes,
  });

  const attributeColumns = new Map<
    number,
    { nameIdx?: number; valueIdx?: number; unitIdx?: number; typeIdx?: number }
  >();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const match = normalized.match(/^attr_(name|value|unit|type)_(\d+)$/);
    if (!match) return;
    const field = match[1];
    const key = Number(match[2]);
    const current = attributeColumns.get(key) ?? {};
    if (field === "name") current.nameIdx = index;
    if (field === "value") current.valueIdx = index;
    if (field === "unit") current.unitIdx = index;
    if (field === "type") current.typeIdx = index;
    attributeColumns.set(key, current);
  });

  const rawCodes = dataRows
    .map((row) => (idxCode >= 0 ? (row[idxCode] ?? "").trim() : ""))
    .filter((value) => value.length);
  const uniqueCodes = [...new Set(rawCodes)];
  console.log("[order-items-import] rawCodes", rawCodes.length, "uniqueCodes", uniqueCodes.length);
  console.log("[order-items-import] sample rows", dataRows.slice(0, 5));

  const fetchProductsByCodes = async (codes: string[]) => {
    const results: {
      id: string;
      code: string;
      name: string | null;
      unit_price: number | null;
      group_id: string | null;
    }[] = [];
    const batchSize = 200;
    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, unit_price, group_id")
        .in("code", batch);
      if (error) {
        console.error("Order items product fetch failed", error);
      }
      if (data?.length) {
        results.push(...data);
      }
    }
    return results;
  };

  const products = uniqueCodes.length ? await fetchProductsByCodes(uniqueCodes) : [];
  let productByNormalizedCode = new Map(
    products.map((product) => [normalizeProductCode(product.code), product])
  );

  let allProductsForFuzzy:
    | { id: string; code: string; name: string | null; unit_price: number | null; group_id: string | null }[]
    | null = null;

  if (ENABLE_FUZZY_MATCH && uniqueCodes.length) {
    const { data: allProducts, error } = await supabase
      .from("products")
      .select("id, code, name, unit_price, group_id")
      .range(0, 99999);
    if (error) {
      console.error("Order items full product fetch failed (fuzzy)", error);
    }
    if (allProducts?.length) {
      allProductsForFuzzy = allProducts;
      productByNormalizedCode = new Map(
        allProducts.map((product) => [
          normalizeProductCode(product.code),
          product,
        ])
      );
    }
  }

  const productIds = Array.from(
    new Set(
      Array.from(productByNormalizedCode.values()).map((product) => product.id)
    )
  );
  const weightByProduct = await buildWeightByProductIds(supabase, productIds);

  const groupIds = Array.from(
    new Set(
      Array.from(productByNormalizedCode.values())
        .map((product) => product.group_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const { data: groupAttributes } = groupIds.length
    ? await supabase
        .from("product_attributes")
        .select("id, group_id, name, value_type")
        .in("group_id", groupIds)
    : { data: [] };

  const attributesByGroup = new Map<string, Map<string, any>>();
  (groupAttributes ?? []).forEach((attr) => {
    if (!attr.group_id || !attr.name) return;
    const key = String(attr.group_id);
    const map = attributesByGroup.get(key) ?? new Map();
    map.set(normalizeAttributeName(attr.name), attr);
    attributesByGroup.set(key, map);
  });

    const orderItemsPayload: {
      order_id: string;
      product_id: string | null;
      name: string | null;
      line_no?: number | null;
      quantity: number | null;
      unit_price: number | null;
      total_amount: number | null;
      net_weight_kg: number | null;
      gross_weight_kg: number | null;
    notes: string | null;
  }[] = [];

  const missingRows: MissingRow[] = [];

  const productUpdates = new Map<string, { id: string; unit_price: number }>();
  const attributeValuesPayload: {
    product_id: string;
    attribute_id: string;
    value_text: string | null;
    value_number: number | null;
  }[] = [];
  const extraAttributesPayload: {
    product_id: string;
    name: string;
    unit: string | null;
    value_type: "text" | "number";
    value_text: string | null;
    value_number: number | null;
  }[] = [];

    dataRows.forEach((row, rowIndex) => {
      const rawCode = idxCode >= 0 ? (row[idxCode] ?? "").trim() : "";
      const normalizedCode = rawCode ? normalizeProductCode(rawCode) : "";
    let product = normalizedCode
      ? productByNormalizedCode.get(normalizedCode)
      : undefined;

    if (!product && ENABLE_FUZZY_MATCH && allProductsForFuzzy) {
      const fuzzy = fuzzyMatchProduct(rawCode, allProductsForFuzzy);
      if (fuzzy) {
        product = fuzzy as any;
      }
    }

    const nameInput = idxName >= 0 ? (row[idxName] ?? "").trim() : "";
    const quantity = idxQty >= 0 ? toIntegerFromText(row[idxQty]) : null;
    const unitPriceInput = idxUnitPrice >= 0 ? toNumberFromText(row[idxUnitPrice]) : null;
    const totalAmountInput =
      idxTotalAmount >= 0 ? toNumberFromText(row[idxTotalAmount]) : null;
    const netWeightInput =
      idxNetWeight >= 0 ? toNumberFromText(row[idxNetWeight]) : null;
    const grossWeightInput =
      idxGrossWeight >= 0 ? toNumberFromText(row[idxGrossWeight]) : null;
    const notes = idxNotes >= 0 ? (row[idxNotes] ?? "").trim() : "";

    let rowWeightFromAttrs: number | null = null;

    const attributeEntries: {
      name: string;
      unit: string | null;
      valueType: "text" | "number";
      rawValue: string;
    }[] = [];

    for (const entry of attributeColumns.values()) {
      const name =
        entry.nameIdx !== undefined ? (row[entry.nameIdx] ?? "").trim() : "";
      const rawValue =
        entry.valueIdx !== undefined ? (row[entry.valueIdx] ?? "").trim() : "";
      if (!name || !rawValue) continue;
      const unit =
        entry.unitIdx !== undefined ? nullIfEmpty(row[entry.unitIdx] ?? null) : null;
      const declaredType =
        entry.typeIdx !== undefined
          ? (row[entry.typeIdx] ?? "").trim().toLowerCase()
          : "";
      const valueType =
        declaredType === "number" || declaredType === "text"
          ? (declaredType as "text" | "number")
          : toNumberFromText(rawValue) !== null
          ? "number"
          : "text";
      attributeEntries.push({ name, unit, valueType, rawValue });

      if (rowWeightFromAttrs === null && isWeightName(name)) {
        const parsedWeight = toNumberFromText(rawValue);
        if (parsedWeight !== null) {
          rowWeightFromAttrs = parsedWeight;
        }
      }
    }

    if (product && unitPriceInput !== null) {
      productUpdates.set(product.id, { id: product.id, unit_price: unitPriceInput });
    }

    const unitPrice = unitPriceInput ?? product?.unit_price ?? null;

    let resolvedNetWeight = netWeightInput;
    let resolvedGrossWeight = grossWeightInput;

    if (resolvedNetWeight === null && resolvedGrossWeight === null && quantity !== null) {
      let perUnitWeight = rowWeightFromAttrs;
      if (perUnitWeight === null && product?.id) {
        const fallbackWeight = weightByProduct.get(product.id);
        if (fallbackWeight !== undefined && fallbackWeight !== null) {
          perUnitWeight = fallbackWeight;
        }
      }
      if (perUnitWeight !== null) {
        resolvedNetWeight = perUnitWeight * quantity;
        resolvedGrossWeight = resolvedGrossWeight ?? resolvedNetWeight;
      }
    }

    const totalAmount =
      totalAmountInput ??
      (unitPrice !== null && quantity !== null ? unitPrice * quantity : null);

    const resolvedName = nameInput || product?.name || null;

    const isEmpty =
      !rawCode &&
      !resolvedName &&
      quantity === null &&
      unitPrice === null &&
      totalAmount === null &&
      resolvedNetWeight === null &&
      resolvedGrossWeight === null &&
      !notes;
    if (isEmpty) return;

      if (!product) {
        missingRows.push({
          code: rawCode,
          name: resolvedName,
          line_no: rowIndex + 1,
          quantity,
          unit_price: unitPrice,
          total_amount: totalAmount,
        net_weight_kg: resolvedNetWeight,
        gross_weight_kg: resolvedGrossWeight,
        notes: notes || null,
        attributes: attributeEntries,
      });
      return;
    }

    const groupMap = product.group_id
      ? attributesByGroup.get(String(product.group_id))
      : undefined;

    attributeEntries.forEach((entry) => {
      if (groupMap) {
        const matched = groupMap.get(normalizeAttributeName(entry.name));
        if (matched) {
          if (matched.value_type === "number") {
            attributeValuesPayload.push({
              product_id: product.id,
              attribute_id: matched.id,
              value_text: null,
              value_number: toNumberFromText(entry.rawValue),
            });
          } else {
            attributeValuesPayload.push({
              product_id: product.id,
              attribute_id: matched.id,
              value_text: entry.rawValue,
              value_number: null,
            });
          }
          return;
        }
      }

      extraAttributesPayload.push({
        product_id: product.id,
        name: entry.name,
        unit: entry.unit,
        value_type: entry.valueType,
        value_text: entry.valueType === "text" ? entry.rawValue : null,
        value_number: entry.valueType === "number" ? toNumberFromText(entry.rawValue) : null,
      });
    });

      orderItemsPayload.push({
        order_id: orderId,
        product_id: product?.id ?? null,
        name: resolvedName,
        line_no: rowIndex + 1,
        quantity,
        unit_price: unitPrice,
        total_amount: totalAmount,
        net_weight_kg: resolvedNetWeight,
        gross_weight_kg: resolvedGrossWeight,
      notes: notes || null,
    });
  });
  if (missingRows.length) {
    console.warn(
      "[order-items-import] missingRows sample",
      missingRows.slice(0, 5).map((row) => ({
        code: row.code,
        name: row.name,
        qty: row.quantity,
      }))
    );
  }

  if (!orderItemsPayload.length) {
    redirect(`/orders/${orderId}?toast=items-import-empty`);
  }

  const chunkSize = 500;
  for (let i = 0; i < orderItemsPayload.length; i += chunkSize) {
    const chunk = orderItemsPayload.slice(i, i + chunkSize);
    const { error } = await supabase.from("order_items").insert(chunk);
    if (error) {
      console.error("Order items import failed", error);
      redirect(`/orders/${orderId}?toast=items-import-failed`);
    }
  }

  if (productUpdates.size) {
    const updates = Array.from(productUpdates.values());
    await supabase.from("products").upsert(updates, { onConflict: "id" });
  }

  const attributeByKey = new Map<string, typeof attributeValuesPayload[number]>();
  attributeValuesPayload.forEach((item) => {
    const key = `${item.product_id}:${item.attribute_id}`;
    attributeByKey.set(key, item);
  });
  const dedupedAttributes = Array.from(attributeByKey.values());
  if (dedupedAttributes.length) {
    await supabase
      .from("product_attribute_values")
      .upsert(dedupedAttributes, { onConflict: "product_id,attribute_id" });
  }

  const extraByKey = new Map<string, typeof extraAttributesPayload[number]>();
  extraAttributesPayload.forEach((item) => {
    const key = `${item.product_id}:${normalizeAttributeName(item.name)}`;
    extraByKey.set(key, item);
  });
  const dedupedExtras = Array.from(extraByKey.values());
  if (dedupedExtras.length) {
    for (const entry of dedupedExtras) {
      await supabase
        .from("product_extra_attributes")
        .delete()
        .eq("product_id", entry.product_id)
        .eq("name", entry.name);
    }
    await supabase.from("product_extra_attributes").insert(dedupedExtras);
  }

  await updateOrderTotals(supabase, orderId);
  revalidatePath(`/orders/${orderId}`);

  if (missingRows.length) {
    const { data: staging, error: stagingError } = await supabase
      .from("order_item_import_staging")
      .insert({ order_id: orderId, payload: missingRows })
      .select("id")
      .single();
    if (stagingError || !staging) {
      console.error("Staging missing products failed", stagingError);
      redirect(`/orders/${orderId}?toast=items-import-failed`);
    }
    redirect(`/orders/${orderId}/missing-products?stagingId=${staging.id}`);
  }

  redirect(`/orders/${orderId}?toast=items-imported`);
}

export async function completeMissingOrderProducts(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const stagingId = String(formData.get("staging_id") ?? "");
  const orderId = String(formData.get("order_id") ?? "");
  if (!stagingId || !orderId) {
    redirect(`/orders/${orderId || ""}?toast=missing-products-error`);
  }

  const { data: staging } = await supabase
    .from("order_item_import_staging")
    .select("id, order_id, payload")
    .eq("id", stagingId)
    .single();

  if (!staging || staging.order_id !== orderId) {
    redirect(`/orders/${orderId}?toast=missing-products-error`);
  }

  const rows = (staging.payload as MissingRow[]) ?? [];

    const rowMeta: {
      code: string;
      name: string;
      group_id: string | null;
      group_name: string | null;
      line_no: number | null;
      quantity: number | null;
      unit_price: number | null;
      total_amount: number | null;
      net_weight_kg: number | null;
      gross_weight_kg: number | null;
    notes: string | null;
    attrs: MissingRow["attributes"];
  }[] = [];
  const requestedGroupNames = new Set<string>();
  const catAttributesByCode = new Map<
    string,
    { attribute_id: string; value_text: string | null; value_number: number | null }[]
  >();

  rows.forEach((row, index) => {
    const name =
      nullIfEmpty(formData.get(`row_${index}_name`)) ??
      row.name ??
      row.code ??
      "-";
    const groupId = nullIfEmpty(formData.get(`row_${index}_group_id`));
    const groupName = nullIfEmpty(formData.get(`row_${index}_new_group`));
    if (!groupId && groupName) {
      requestedGroupNames.add(groupName.toLowerCase());
    }
    const unitPrice =
      toNumberFromText(String(formData.get(`row_${index}_unit_price`) ?? "")) ??
      row.unit_price ??
      null;
    const notes =
      nullIfEmpty(formData.get(`row_${index}_notes`)) ?? row.notes ?? null;

    const attrs: MissingRow["attributes"] = (row.attributes ?? []).map((attr, attrIndex) => {
      const editedValue =
        nullIfEmpty(formData.get(`row_${index}_attr_${attrIndex}_value`)) ??
        attr.rawValue;
      const editedUnit =
        nullIfEmpty(formData.get(`row_${index}_attr_${attrIndex}_unit`)) ??
        attr.unit;
      return {
        ...attr,
        rawValue: editedValue ?? "",
        unit: editedUnit,
      };
    });

    // Ek nitelikler (2 slot)
    for (let extraIndex = 0; extraIndex < 2; extraIndex += 1) {
      const extraName = nullIfEmpty(
        formData.get(`row_${index}_extra_attr_name_${extraIndex}`)
      );
      if (!extraName) continue;
      const extraValue =
        nullIfEmpty(formData.get(`row_${index}_extra_attr_value_${extraIndex}`)) ?? "";
      const extraUnit = nullIfEmpty(
        formData.get(`row_${index}_extra_attr_unit_${extraIndex}`)
      );
      const extraType = (nullIfEmpty(
        formData.get(`row_${index}_extra_attr_type_${extraIndex}`)
      ) ?? "text") as "text" | "number";
      attrs.push({
        name: extraName,
        unit: extraUnit,
        valueType: extraType,
        rawValue: extraValue,
      });
    }

    // Kategori nitelikleri (varsa)
    for (let catIndex = 0; ; catIndex += 1) {
      const attrId = nullIfEmpty(formData.get(`row_${index}_cat_attr_id_${catIndex}`));
      if (!attrId) break;
      const attrType =
        (nullIfEmpty(formData.get(`row_${index}_cat_attr_type_${catIndex}`)) ?? "text") as
          | "text"
          | "number";
      const attrValue = nullIfEmpty(formData.get(`row_${index}_cat_attr_value_${catIndex}`));
      const valueNumber =
        attrType === "number" ? toNumberFromText(attrValue ?? "") : null;
      const valueText = attrType === "text" ? attrValue : null;
      if (valueNumber === null && valueText === null) continue;
      const list = catAttributesByCode.get(row.code) ?? [];
      list.push({
        attribute_id: attrId,
        value_text: valueText,
        value_number: valueNumber,
      });
      catAttributesByCode.set(row.code, list);
    }

    let perUnitWeight: number | null = null;
    attrs.forEach((attr) => {
      if (perUnitWeight !== null) return;
      if (!isWeightName(attr.name)) return;
      const parsed = toNumberFromText(attr.rawValue);
      if (parsed !== null) perUnitWeight = parsed;
    });

    const net = row.net_weight_kg;
    const gross = row.gross_weight_kg;
    let resolvedNet = net;
    let resolvedGross = gross;
    if (resolvedNet === null && resolvedGross === null && row.quantity !== null) {
      if (perUnitWeight !== null) {
        resolvedNet = perUnitWeight * row.quantity;
        resolvedGross = resolvedGross ?? resolvedNet;
      }
    }

      rowMeta.push({
        code: row.code,
        name,
        group_id: groupId,
        group_name: groupName ?? null,
        line_no: row.line_no ?? null,
        quantity: row.quantity,
        unit_price: unitPrice,
        total_amount: row.total_amount,
        net_weight_kg: resolvedNet,
        gross_weight_kg: resolvedGross,
      notes,
      attrs,
    });
  });

  let groupIdByName = new Map<string, string>();
  if (requestedGroupNames.size) {
    const names = Array.from(requestedGroupNames.values());
    const { data: insertedGroups, error: groupError } = await supabase
      .from("product_groups")
      .upsert(names.map((name) => ({ name })), { onConflict: "name" })
      .select("id, name");
    if (!groupError && insertedGroups) {
      groupIdByName = new Map(
        insertedGroups.map((g) => [g.name.toLowerCase(), g.id])
      );
    }
  }

  const productInserts: {
    code: string;
    name: string;
    group_id: string | null;
    unit_price: number | null;
    notes: string | null;
  }[] = rowMeta.map((row) => ({
    code: row.code,
    name: row.name,
    group_id:
      row.group_id ??
      (row.group_name ? groupIdByName.get(row.group_name.toLowerCase()) ?? null : null),
    unit_price: row.unit_price,
    notes: row.notes,
  }));

  const { data: products, error: insertError } = await supabase
    .from("products")
    .upsert(productInserts, { onConflict: "code" })
    .select("id, code");

  if (insertError || !products) {
    console.error("Missing products create failed", insertError);
    redirect(`/orders/${orderId}?toast=missing-products-error`);
  }

  const productByCode = new Map(products.map((p) => [p.code, p]));

  const attributeValuesPayload: {
    product_id: string;
    attribute_id: string;
    value_text: string | null;
    value_number: number | null;
  }[] = [];
  const extraAttributesPayload: {
    product_id: string;
    name: string;
    unit: string | null;
    value_type: "text" | "number";
    value_text: string | null;
    value_number: number | null;
  }[] = [];

    const orderItemsPayload: {
      order_id: string;
      product_id: string | null;
      name: string | null;
      line_no: number | null;
      quantity: number | null;
      unit_price: number | null;
      total_amount: number | null;
      net_weight_kg: number | null;
      gross_weight_kg: number | null;
    notes: string | null;
  }[] = [];

  rowMeta.forEach((row, index) => {
    const product = productByCode.get(rows[index]?.code);
    if (!product) return;

    const catAttrs = catAttributesByCode.get(rows[index]?.code) ?? [];
    catAttrs.forEach((attr) => {
      attributeValuesPayload.push({
        product_id: product.id,
        attribute_id: attr.attribute_id,
        value_text: attr.value_text,
        value_number: attr.value_number,
      });
    });

      orderItemsPayload.push({
        order_id: orderId,
        product_id: product.id,
        name: rows[index]?.name ?? product.code,
        line_no: row.line_no ?? null,
        quantity: row.quantity,
        unit_price: productInserts[index]?.unit_price ?? null,
        total_amount:
        rows[index]?.total_amount ??
        ((productInserts[index]?.unit_price ?? null) !== null && row.quantity !== null
          ? (productInserts[index]?.unit_price as number) * row.quantity
          : null),
      net_weight_kg: row.net_weight_kg,
      gross_weight_kg: row.gross_weight_kg,
      notes: row.notes,
    });

    row.attrs.forEach((attr) => {
      extraAttributesPayload.push({
        product_id: product.id,
        name: attr.name,
        unit: attr.unit,
        value_type: attr.valueType,
        value_text: attr.valueType === "text" ? attr.rawValue : null,
        value_number: attr.valueType === "number" ? toNumberFromText(attr.rawValue) : null,
      });
    });
  });

  if (orderItemsPayload.length) {
    const chunkSize = 500;
    for (let i = 0; i < orderItemsPayload.length; i += chunkSize) {
      const chunk = orderItemsPayload.slice(i, i + chunkSize);
      const { error } = await supabase.from("order_items").insert(chunk);
      if (error) {
        console.error("Order items (missing) insert failed", error);
        redirect(`/orders/${orderId}?toast=missing-products-error`);
      }
    }
  }

  if (extraAttributesPayload.length) {
    for (const entry of extraAttributesPayload) {
      await supabase
        .from("product_extra_attributes")
        .delete()
        .eq("product_id", entry.product_id)
        .eq("name", entry.name);
    }
    await supabase.from("product_extra_attributes").insert(extraAttributesPayload);
  }

  if (attributeValuesPayload.length) {
    await supabase
      .from("product_attribute_values")
      .upsert(attributeValuesPayload, { onConflict: "product_id,attribute_id" });
  }

  await supabase.from("order_item_import_staging").delete().eq("id", stagingId);

  await updateOrderTotals(supabase, orderId);
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?toast=items-imported`);
}
