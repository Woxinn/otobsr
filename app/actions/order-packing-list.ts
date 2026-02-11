"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const nullIfEmpty = (value: FormDataEntryValue | null) => {
  if (value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
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

export async function importOrderPackingList(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const file = formData.get("file");
  if (!file || typeof file === "string" || !("text" in file)) {
    redirect(`/orders/${orderId}?tab=packing&toast=pl-import-failed`);
  }

  const text = await (file as File).text();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    redirect(`/orders/${orderId}?tab=packing&toast=pl-import-empty`);
  }

  const headerLine = lines[0];
  const delimiter = headerLine.includes(";")
    ? ";"
    : headerLine.includes("\t")
    ? "\t"
    : ",";
  const headers = parseCsvLine(headerLine, delimiter);

  const idxCode = resolveHeaderIndex(headers, ["product_code", "code", "urun_kodu"]);
  const idxDescription = resolveHeaderIndex(headers, [
    "description",
    "desc",
    "aciklama",
    "urun_adi",
    "product_name",
    "name",
  ]);
  const idxQty = resolveHeaderIndex(headers, [
    "qty_pc",
    "qty (pc)",
    "quantity",
    "qty",
    "adet",
  ]);
  const idxPackages = resolveHeaderIndex(headers, [
    "no_of_ctn",
    "no of ctn",
    "no. of ctn",
    "packages",
    "koli",
    "koli_adedi",
    "koli adedi",
  ]);
  const idxCtnNo = resolveHeaderIndex(headers, [
    "ctn_no",
    "ctn no",
    "ctn no.",
    "carton_no",
    "carton no",
    "koli_no",
    "koli no",
  ]);
  const idxNetWeight = resolveHeaderIndex(headers, [
    "net_weight_kg",
    "net_weight",
    "n.w.",
    "n.w. (kg)",
    "net agirlik",
    "net_agirlik",
    "net",
  ]);
  const idxGrossWeight = resolveHeaderIndex(headers, [
    "gross_weight_kg",
    "gross_weight",
    "g.w.",
    "g.w. (kg)",
    "brut agirlik",
    "brut_agirlik",
    "gross",
  ]);
  const idxWeight = resolveHeaderIndex(headers, [
    "weight_kg",
    "weight",
    "agirlik",
    "agirlik_kg",
  ]);
  const idxNotes = resolveHeaderIndex(headers, ["notes", "note", "not"]);

  const rows = lines.slice(1).map((line) => parseCsvLine(line, delimiter));

  const codes =
    idxCode >= 0
      ? rows
          .map((row) => (row[idxCode] ?? "").trim())
          .filter((value) => value.length > 0)
      : [];
  const uniqueCodes = [...new Set(codes)];

  const { data: products } = uniqueCodes.length
    ? await supabase
        .from("products")
        .select("id, code, name")
        .in("code", uniqueCodes)
    : { data: [] };
  const productByCode = new Map(
    (products ?? []).map((product) => [product.code, product])
  );

  const payload = rows
    .map((row) => {
      const rawCode = idxCode >= 0 ? (row[idxCode] ?? "").trim() : "";
      const product = rawCode ? productByCode.get(rawCode) : null;
      const description = idxDescription >= 0 ? (row[idxDescription] ?? "").trim() : "";
      const quantity = idxQty >= 0 ? toNumberFromText(row[idxQty]) : null;
      const packages = idxPackages >= 0 ? toNumberFromText(row[idxPackages]) : null;
      const ctnNo = idxCtnNo >= 0 ? (row[idxCtnNo] ?? "").trim() : "";
      const netWeight = idxNetWeight >= 0 ? toNumberFromText(row[idxNetWeight]) : null;
      const grossWeight =
        idxGrossWeight >= 0 ? toNumberFromText(row[idxGrossWeight]) : null;
      const fallbackWeight = idxWeight >= 0 ? toNumberFromText(row[idxWeight]) : null;
      const notes = idxNotes >= 0 ? (row[idxNotes] ?? "").trim() : "";

      const resolvedCode = rawCode || product?.code || "";
      const resolvedName = description || product?.name || "";
      const resolvedNetWeight = netWeight ?? fallbackWeight;
      const resolvedGrossWeight = grossWeight ?? fallbackWeight;

      const isEmpty =
        !ctnNo &&
        !resolvedCode &&
        !resolvedName &&
        quantity === null &&
        packages === null &&
        resolvedNetWeight === null &&
        resolvedGrossWeight === null &&
        !notes;
      if (isEmpty) return null;

      return {
        order_id: orderId,
        product_id: product?.id ?? null,
        product_code: resolvedCode || null,
        product_name: resolvedName || null,
        ctn_no: ctnNo || null,
        quantity,
        packages,
        net_weight_kg: resolvedNetWeight,
        gross_weight_kg: resolvedGrossWeight,
        weight_kg: fallbackWeight,
        notes: notes || null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (!payload.length) {
    redirect(`/orders/${orderId}?tab=packing&toast=pl-import-empty`);
  }

  const { error } = await supabase.from("order_packing_list_items").insert(payload);
  if (error) {
    console.error("Packing list import failed", error);
    redirect(`/orders/${orderId}?tab=packing&toast=pl-import-failed`);
  }

  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?tab=packing&toast=pl-imported`);
}

export async function saveOrderPackingListSummary(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const totalPackages = toNumberFromText(
    (formData.get("total_packages") as string | null) ?? null
  );
  const totalNet = toNumberFromText(
    (formData.get("total_net_weight_kg") as string | null) ?? null
  );
  const totalGross = toNumberFromText(
    (formData.get("total_gross_weight_kg") as string | null) ?? null
  );
  const totalCbm = toNumberFromText(
    (formData.get("total_cbm") as string | null) ?? null
  );
  const notes = nullIfEmpty(formData.get("notes"));

  await supabase
    .from("order_packing_list_summary")
    .upsert(
      [
        {
          order_id: orderId,
          total_packages: totalPackages,
          total_net_weight_kg: totalNet,
          total_gross_weight_kg: totalGross,
          total_cbm: totalCbm,
          notes,
        },
      ],
      { onConflict: "order_id" }
    );

  revalidatePath(`/orders/${orderId}?tab=packing`);
}

export async function createOrderPackingListItem(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const productIdRaw = String(formData.get("product_id") ?? "").trim();
  const productId = productIdRaw.length ? productIdRaw : null;
  const ctnNo = String(formData.get("ctn_no") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const quantity = toNumberFromText(String(formData.get("quantity") ?? ""));
  const packages = toNumberFromText(String(formData.get("packages") ?? ""));
  const netWeight = toNumberFromText(String(formData.get("net_weight_kg") ?? ""));
  const grossWeight = toNumberFromText(String(formData.get("gross_weight_kg") ?? ""));

  const { data: product } = productId
    ? await supabase
        .from("products")
        .select("id, code, name")
        .eq("id", productId)
        .single()
    : { data: null };

  const resolvedCode = product?.code ?? "";
  const resolvedDescription = description || product?.name || "";
  const fallbackWeight = netWeight ?? grossWeight ?? null;

  const isEmpty =
    !ctnNo &&
    !resolvedCode &&
    !resolvedDescription &&
    quantity === null &&
    packages === null &&
    netWeight === null &&
    grossWeight === null;

  if (isEmpty) {
    redirect(`/orders/${orderId}?tab=packing&toast=pl-create-empty`);
  }

  const { error } = await supabase.from("order_packing_list_items").insert({
    order_id: orderId,
    product_id: productId,
    product_code: resolvedCode || null,
    product_name: resolvedDescription || null,
    ctn_no: ctnNo || null,
    quantity,
    packages,
    net_weight_kg: netWeight,
    gross_weight_kg: grossWeight,
    weight_kg: fallbackWeight,
  });

  if (error) {
    console.error("Packing list item create failed", error);
    redirect(`/orders/${orderId}?tab=packing&toast=pl-create-failed`);
  }

  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?tab=packing&toast=pl-created`);
}

export async function deleteOrderPackingListItem(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  if (!orderId || !itemId) return;

  const { error } = await supabase
    .from("order_packing_list_items")
    .delete()
    .eq("id", itemId);

  if (error) {
    console.error("Packing list item delete failed", error);
    return;
  }

  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?tab=packing&toast=pl-deleted`);
}

export async function deleteAllOrderPackingListItems(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const { error } = await supabase
    .from("order_packing_list_items")
    .delete()
    .eq("order_id", orderId);

  if (error) {
    console.error("Packing list delete all failed", error);
    return;
  }

  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?tab=packing&toast=pl-deleted-all`);
}

