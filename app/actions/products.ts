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

const normalizeNumber = (value: FormDataEntryValue | null) => {
  const text = nullIfEmpty(value);
  if (!text) return null;
  return text.replace(",", ".");
};

const toNumber = (value: FormDataEntryValue | null) => {
  const normalized = normalizeNumber(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeNumberText = (value: string | null | undefined) => {
  if (!value) return null;
  const cleaned = value.trim().replace(",", ".");
  return cleaned.length ? cleaned : null;
};

const toNumberFromText = (value: string | null | undefined) => {
  const normalized = normalizeNumberText(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
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

const resolveHeaderIndex = (headers: string[], options: string[]) => {
  const lower = headers.map((item) => item.toLowerCase());
  for (const option of options) {
    const idx = lower.indexOf(option);
    if (idx >= 0) return idx;
  }
  return -1;
};

const parseAttributeValues = (
  formData: FormData,
  attributes: { id: string; value_type: string }[]
) => {
  const attributeById = new Map(attributes.map((attr) => [attr.id, attr]));
  const values: {
    attribute_id: string;
    value_text: string | null;
    value_number: number | null;
  }[] = [];

  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith("attr_")) continue;
    const attributeId = key.replace("attr_", "");
    const attribute = attributeById.get(attributeId);
    if (!attribute) continue;
    const value = nullIfEmpty(rawValue);
    if (attribute.value_type === "text") {
      values.push({ attribute_id: attributeId, value_text: value, value_number: null });
    } else {
      values.push({ attribute_id: attributeId, value_text: null, value_number: toNumber(rawValue) });
    }
  }

  return values;
};

const parseExtraAttributes = (formData: FormData) => {
  const extras = new Map<
    number,
    {
      name?: FormDataEntryValue;
      unit?: FormDataEntryValue;
      valueType?: FormDataEntryValue;
      value?: FormDataEntryValue;
    }
  >();

  for (const [key, rawValue] of formData.entries()) {
    const match = key.match(/^extra_(name|unit|type|value)_(\d+)$/);
    if (!match) continue;
    const field = match[1];
    const index = Number(match[2]);
    const current = extras.get(index) ?? {};
    if (field === "name") current.name = rawValue;
    if (field === "unit") current.unit = rawValue;
    if (field === "type") current.valueType = rawValue;
    if (field === "value") current.value = rawValue;
    extras.set(index, current);
  }

  const parsed = Array.from(extras.values())
    .map((item) => {
      const name = nullIfEmpty(item.name ?? null);
      if (!name) return null;
      const valueType = (nullIfEmpty(item.valueType ?? null) ?? "text") as
        | "text"
        | "number";
      if (valueType === "number") {
        return {
          name,
          unit: nullIfEmpty(item.unit ?? null),
          value_type: valueType,
          value_text: null,
          value_number: toNumber(item.value ?? null),
        };
      }
      return {
        name,
        unit: nullIfEmpty(item.unit ?? null),
        value_type: valueType,
        value_text: nullIfEmpty(item.value ?? null),
        value_number: null,
      };
    })
    .filter(Boolean);

  return parsed as {
    name: string;
    unit: string | null;
    value_type: "text" | "number";
    value_text: string | null;
    value_number: number | null;
  }[];
};

export async function createProductGroup(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const name = nullIfEmpty(formData.get("name"));
  if (!name) return;
  await supabase.from("product_groups").insert({
    name,
    notes: nullIfEmpty(formData.get("notes")),
  });
  revalidatePath("/product-groups");
}

export async function deleteProductGroup(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = String(formData.get("group_id") ?? "");
  if (!id) return;
  await supabase.from("product_groups").delete().eq("id", id);
  revalidatePath("/product-groups");
  revalidatePath("/products");
}

export async function deleteProductGroupsBulk(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const ids = formData.getAll("group_ids").map(String).filter(Boolean);
  if (!ids.length) return;

  // Topla Ã¼rÃ¼n id'leri
  const { data: products } = await supabase
    .from("products")
    .select("id")
    .in("group_id", ids);

  const productIds = (products ?? []).map((p) => p.id).filter(Boolean);

  // Ürünlere baÄŸlÄ± order_items varsa sil
  if (productIds.length) {
    await supabase.from("order_items").delete().in("product_id", productIds);
  }

  // Ürünleri sil
  await supabase.from("products").delete().in("group_id", ids);

  // Kategorileri sil
  await supabase.from("product_groups").delete().in("id", ids);

  revalidatePath("/product-groups");
  revalidatePath("/products");
}

export async function updateProductGroup(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const lead = toNumber(formData.get("lead_time_days"));
  const safety = toNumber(formData.get("safety_days"));
  await supabase
    .from("product_groups")
    .update({
      name: nullIfEmpty(formData.get("name")),
      notes: nullIfEmpty(formData.get("notes")),
      lead_time_days: lead ?? null,
      safety_days: safety ?? null,
    })
    .eq("id", id);
  revalidatePath("/product-groups");
  revalidatePath(`/product-groups/${id}`);
}

export async function createProductAttribute(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const groupId = String(formData.get("group_id") ?? "");
  const name = nullIfEmpty(formData.get("name"));
  if (!groupId || !name) return;
  await supabase.from("product_attributes").insert({
    group_id: groupId,
    name,
    unit: nullIfEmpty(formData.get("unit")),
    value_type: nullIfEmpty(formData.get("value_type")) ?? "number",
    is_required: formData.get("is_required") === "on",
    sort_order: toNumber(formData.get("sort_order")) ?? 0,
  });
  revalidatePath(`/product-groups/${groupId}`);
}

export async function updateProductAttribute(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = String(formData.get("id") ?? "");
  const groupId = String(formData.get("group_id") ?? "");
  if (!id || !groupId) return;
  await supabase
    .from("product_attributes")
    .update({
      name: nullIfEmpty(formData.get("name")),
      unit: nullIfEmpty(formData.get("unit")),
      value_type: nullIfEmpty(formData.get("value_type")) ?? "number",
      is_required: formData.get("is_required") === "on",
      sort_order: toNumber(formData.get("sort_order")) ?? 0,
    })
    .eq("id", id);
  revalidatePath(`/product-groups/${groupId}`);
}

export async function deleteProductAttribute(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = String(formData.get("id") ?? "");
  const groupId = String(formData.get("group_id") ?? "");
  if (!id || !groupId) return;
  await supabase.from("product_attributes").delete().eq("id", id);
  revalidatePath(`/product-groups/${groupId}`);
}

export async function createProduct(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const code = nullIfEmpty(formData.get("code"));
  const name = nullIfEmpty(formData.get("name"));
  const groupId = nullIfEmpty(formData.get("group_id"));
  const brand = nullIfEmpty(formData.get("brand"));
  const gtipId = nullIfEmpty(formData.get("gtip_id"));
  const domesticCostPercent = toNumber(formData.get("domestic_cost_percent"));
  if (!code || !name) return;

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      code,
      name,
      group_id: groupId,
      unit_price: toNumber(formData.get("unit_price")),
      brand,
      gtip_id: gtipId,
      domestic_cost_percent: domesticCostPercent ?? 0,
      description: nullIfEmpty(formData.get("description")),
      notes: nullIfEmpty(formData.get("notes")),
    })
    .select("id")
    .single();

  if (error || !product) {
    console.error("Product insert failed", error);
    if (error?.code === "23505") {
      redirect("/products/new?toast=duplicate-code");
    }
    redirect("/products/new?toast=create-failed");
  }

  if (groupId) {
    const { data: attributes } = await supabase
      .from("product_attributes")
      .select("id, value_type")
      .eq("group_id", groupId);

    const values = parseAttributeValues(formData, attributes ?? []).map((value) => ({
      product_id: product.id,
      ...value,
    }));
    if (values.length) {
      await supabase.from("product_attribute_values").insert(values);
    }
  }

  const extraAttributes = parseExtraAttributes(formData).map((item) => ({
    product_id: product.id,
    ...item,
  }));
  if (extraAttributes.length) {
    await supabase.from("product_extra_attributes").insert(extraAttributes);
  }

  revalidatePath("/products");
  redirect(`/products/${product.id}?toast=created`);
}

export async function updateProduct(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const groupId = nullIfEmpty(formData.get("group_id"));
  const brand = nullIfEmpty(formData.get("brand"));
  const gtipId = nullIfEmpty(formData.get("gtip_id"));
  const domesticCostPercent = toNumber(formData.get("domestic_cost_percent"));

  const { error } = await supabase
    .from("products")
    .update({
      code: nullIfEmpty(formData.get("code")),
      name: nullIfEmpty(formData.get("name")),
      group_id: groupId,
      unit_price: toNumber(formData.get("unit_price")),
      brand,
      gtip_id: gtipId,
      domestic_cost_percent: domesticCostPercent ?? 0,
      description: nullIfEmpty(formData.get("description")),
      notes: nullIfEmpty(formData.get("notes")),
    })
    .eq("id", id);

  if (error) {
    console.error("Product update failed", error);
    return;
  }

  if (groupId) {
    const { data: attributes } = await supabase
      .from("product_attributes")
      .select("id, value_type")
      .eq("group_id", groupId);

    const values = parseAttributeValues(formData, attributes ?? []).map((value) => ({
      product_id: id,
      ...value,
    }));

    if (values.length) {
      await supabase
        .from("product_attribute_values")
        .upsert(values, { onConflict: "product_id,attribute_id" });
    }
  }

  const extraAttributes = parseExtraAttributes(formData).map((item) => ({
    product_id: id,
    ...item,
  }));
  await supabase.from("product_extra_attributes").delete().eq("product_id", id);
  if (extraAttributes.length) {
    await supabase.from("product_extra_attributes").insert(extraAttributes);
  }

  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}?toast=updated`);
}

export async function createSupplierProductAlias(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const productId = String(formData.get("product_id") ?? "");
  const supplierId = String(formData.get("supplier_id") ?? "");
  const supplierName = nullIfEmpty(formData.get("supplier_name"));
  if (!productId || !supplierId || !supplierName) return;
  await supabase.from("supplier_product_aliases").insert({
    product_id: productId,
    supplier_id: supplierId,
    supplier_name: supplierName,
  });
  revalidatePath(`/products/${productId}`);
}

export async function deleteSupplierProductAlias(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = String(formData.get("id") ?? "");
  const productId = String(formData.get("product_id") ?? "");
  if (!id || !productId) return;
  await supabase.from("supplier_product_aliases").delete().eq("id", id);
  revalidatePath(`/products/${productId}`);
}

export async function deleteSelectedProducts(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const ids = formData
    .getAll("product_ids")
    .map((value) => String(value))
    .filter(Boolean);

  if (!ids.length) {
    revalidatePath("/products");
    return;
  }

  const { data: inUse } = await supabase
    .from("order_items")
    .select("product_id")
    .in("product_id", ids)
    .limit(1);
  if (inUse && inUse.length) {
    redirect("/products?toast=delete-blocked");
  }

  const { error } = await supabase.from("products").delete().in("id", ids);
  if (error) {
    console.error("Selected products delete failed", error);
  }
  revalidatePath("/products");
}

export async function deleteProduct(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = String(formData.get("product_id") ?? "");
  if (!id) return;

  const { data: inUse } = await supabase
    .from("order_items")
    .select("product_id")
    .eq("product_id", id)
    .limit(1);

  if (inUse && inUse.length) {
    redirect("/products?toast=delete-blocked");
  }

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) {
    console.error("Product delete failed", error);
    redirect(`/products/${id}?toast=delete-failed`);
  }

  revalidatePath("/products");
  redirect("/products?toast=deleted");
}

export async function deleteAllProducts() {
  const supabase = await createSupabaseServerClient();
  const { data: inUse } = await supabase
    .from("order_items")
    .select("id")
    .not("product_id", "is", null)
    .limit(1);
  if (inUse && inUse.length) {
    redirect("/products?toast=delete-blocked-all");
  }
  const { error } = await supabase
    .from("products")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    console.error("All products delete failed", error);
  }
  revalidatePath("/products");
}

export async function importProducts(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const file = formData.get("file");
  if (!file || typeof file === "string" || !("text" in file)) {
    redirect("/products/new?toast=import-failed");
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
    redirect("/products/new?toast=import-empty");
  }

  const headers = rows[0];

  const idxCode = resolveHeaderIndex(headers, ["code", "product_code", "urun_kodu"]);
  const idxName = resolveHeaderIndex(headers, ["name", "product", "urun_adi"]);
  const idxCategory = resolveHeaderIndex(headers, [
    "category",
    "group",
    "group_name",
    "kategori",
  ]);
  const idxUnitPrice = resolveHeaderIndex(headers, [
    "unit_price",
    "birim_fiyat",
    "unit price",
  ]);
  const idxBrand = resolveHeaderIndex(headers, ["brand", "marka"]);
  const idxDescription = resolveHeaderIndex(headers, ["description", "aciklama"]);
  const idxNotes = resolveHeaderIndex(headers, ["notes", "note", "not"]);

  const attributeColumns = new Map<
    number,
    { nameIdx?: number; valueIdx?: number; unitIdx?: number; typeIdx?: number }
  >();
  headers.forEach((header, index) => {
    const match = header.toLowerCase().match(/^attr_(name|value|unit|type)_(\d+)$/);
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

  const dataRows = rows.slice(1);
  const categoryNames = [
    ...new Set(
      dataRows
        .map((row) => (idxCategory >= 0 ? row[idxCategory] : ""))
        .map((value) => value.trim())
        .filter((value) => value.length)
    ),
  ];

  if (categoryNames.length) {
    await supabase
      .from("product_groups")
      .upsert(categoryNames.map((name) => ({ name })), { onConflict: "name" });
  }

  const { data: groups } = categoryNames.length
    ? await supabase
        .from("product_groups")
        .select("id, name")
        .in("name", categoryNames)
    : { data: [] };
  const groupByName = new Map(
    (groups ?? []).map((group) => [group.name.toLowerCase(), group.id])
  );

  const attrDefinitions = new Map<
    string,
    { group_id: string; name: string; unit: string | null; value_type: "text" | "number" }
  >();

  rows.forEach((row) => {
    const category = idxCategory >= 0 ? (row[idxCategory] ?? "").trim() : "";
    if (!category) return;
    const groupId = groupByName.get(category.toLowerCase());
    if (!groupId) return;

    for (const entry of attributeColumns.values()) {
      const name =
        entry.nameIdx !== undefined ? (row[entry.nameIdx] ?? "").trim() : "";
      if (!name) continue;
      const unit =
        entry.unitIdx !== undefined ? nullIfEmpty(row[entry.unitIdx] ?? null) : null;
      const declaredType =
        entry.typeIdx !== undefined
          ? (row[entry.typeIdx] ?? "").trim().toLowerCase()
          : "";
      const rawValue =
        entry.valueIdx !== undefined ? (row[entry.valueIdx] ?? "").trim() : "";

      const valueType =
        declaredType === "number" || declaredType === "text"
          ? declaredType
          : toNumberFromText(rawValue) !== null
          ? "number"
          : "text";

      const key = `${groupId}:${name.toLowerCase()}`;
      if (!attrDefinitions.has(key)) {
        attrDefinitions.set(key, {
          group_id: groupId,
          name,
          unit,
          value_type: valueType,
        });
      }
    }
  });

  const groupIdsForAttrs = [
    ...new Set(Array.from(attrDefinitions.values()).map((item) => item.group_id)),
  ];

  const { data: existingAttributes } = groupIdsForAttrs.length
    ? await supabase
        .from("product_attributes")
        .select("id, group_id, name, unit, value_type")
        .in("group_id", groupIdsForAttrs)
    : { data: [] };

  const existingAttrKeys = new Set(
    (existingAttributes ?? []).map(
      (attr) => `${attr.group_id}:${attr.name.toLowerCase()}`
    )
  );

  const attributesToCreate = Array.from(attrDefinitions.values()).filter(
    (attr) => !existingAttrKeys.has(`${attr.group_id}:${attr.name.toLowerCase()}`)
  );

  if (attributesToCreate.length) {
    await supabase.from("product_attributes").insert(
      attributesToCreate.map((attr, index) => ({
        ...attr,
        sort_order: index,
        is_required: false,
      }))
    );
  }

  const productsPayload = dataRows
    .map((row) => {
      const code = idxCode >= 0 ? (row[idxCode] ?? "").trim() : "";
      const name = idxName >= 0 ? (row[idxName] ?? "").trim() : "";
      if (!code || !name) return null;

      const category = idxCategory >= 0 ? (row[idxCategory] ?? "").trim() : "";
      const groupId = category
        ? groupByName.get(category.toLowerCase()) ?? null
        : null;
      const unitPrice = idxUnitPrice >= 0 ? toNumberFromText(row[idxUnitPrice]) : null;
      const brand = idxBrand >= 0 ? nullIfEmpty(row[idxBrand]) : null;
      const description = idxDescription >= 0 ? row[idxDescription] : "";
      const notes = idxNotes >= 0 ? row[idxNotes] : "";

      const payload: {
        code: string;
        name: string;
        group_id: string | null;
        unit_price?: number;
        brand?: string;
        description?: string;
        notes?: string;
      } = { code, name, group_id: groupId };

      if (unitPrice !== null) payload.unit_price = unitPrice;
      if (brand) payload.brand = brand;
      if (description?.trim()) payload.description = description.trim();
      if (notes?.trim()) payload.notes = notes.trim();

      return payload;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (!productsPayload.length) {
    redirect("/products/new?toast=import-empty");
  }

  const { data: upsertedProducts, error } = await supabase
    .from("products")
    .upsert(productsPayload, { onConflict: "code" })
    .select("id, code, group_id");

  if (error) {
    console.error("Product import failed", error);
    redirect("/products/new?toast=import-failed");
  }

  const productByCode = new Map(
    (upsertedProducts ?? []).map((product) => [product.code, product])
  );

  const groupIds = [
    ...new Set(
      (upsertedProducts ?? [])
        .map((product) => product.group_id)
        .filter((value): value is string => Boolean(value))
    ),
  ];

  const { data: groupAttributes } = groupIds.length
    ? await supabase
        .from("product_attributes")
        .select("id, group_id, name, unit, value_type")
        .in("group_id", groupIds)
    : { data: [] };

  const attributesByGroup = new Map<string, Map<string, any>>();
  (groupAttributes ?? []).forEach((attr) => {
    if (!attr.group_id || !attr.name) return;
    const key = String(attr.group_id);
    const map = attributesByGroup.get(key) ?? new Map();
    map.set(attr.name.toLowerCase(), attr);
    attributesByGroup.set(key, map);
  });

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
    value_type: string;
    value_text: string | null;
    value_number: number | null;
  }[] = [];

  dataRows.forEach((row) => {
    const code = idxCode >= 0 ? (row[idxCode] ?? "").trim() : "";
    if (!code) return;
    const product = productByCode.get(code);
    if (!product) return;

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

      const groupMap = product.group_id
        ? attributesByGroup.get(String(product.group_id))
        : undefined;
      const matchedAttribute = groupMap?.get(name.toLowerCase());

      if (matchedAttribute) {
        const valueType = matchedAttribute.value_type ?? "text";
        if (valueType === "number") {
          attributeValuesPayload.push({
            product_id: product.id,
            attribute_id: matchedAttribute.id,
            value_text: null,
            value_number: toNumberFromText(rawValue),
          });
        } else {
          attributeValuesPayload.push({
            product_id: product.id,
            attribute_id: matchedAttribute.id,
            value_text: rawValue,
            value_number: null,
          });
        }
        continue;
      }

      const fallbackType =
        declaredType === "number" || declaredType === "text"
          ? declaredType
          : toNumberFromText(rawValue) !== null
          ? "number"
          : "text";

      extraAttributesPayload.push({
        product_id: product.id,
        name,
        unit,
        value_type: fallbackType,
        value_text: fallbackType === "text" ? rawValue : null,
        value_number: fallbackType === "number" ? toNumberFromText(rawValue) : null,
      });
    }
  });

  if (attributeValuesPayload.length) {
    await supabase
      .from("product_attribute_values")
      .upsert(attributeValuesPayload, { onConflict: "product_id,attribute_id" });
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

  revalidatePath("/products");
  const addedCount = upsertedProducts?.length ?? 0;
  redirect(`/products/new?toast=imported&added=${addedCount}`);
}

export async function updateGroupDomesticCost(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const groupId = String(formData.get("group_id") ?? "");
  if (!groupId) return;
  const pct = toNumber(formData.get("domestic_cost_percent"));
  await supabase.from("products").update({ domestic_cost_percent: pct }).eq("group_id", groupId);
  revalidatePath("/product-groups");
  revalidatePath("/products");
}

