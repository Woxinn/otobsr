// FEATURE: product-type-compliance UI actions
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createProductType(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServerClient();
  const name = (formData.get("name") as string | null)?.trim();
  if (!name) return;
  await supabase.from("product_types").insert({ name });
  revalidatePath("/product-types");
}

export async function deleteProductType(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServerClient();
  const id = formData.get("id") as string | null;
  if (!id) return;
  await supabase.from("product_types").delete().eq("id", id);
  revalidatePath("/product-types");
}

export async function createCompliance(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServerClient();
  const product_type_id = formData.get("product_type_id") as string | null;
  if (!product_type_id) return;
  const country = (formData.get("country") as string | null)?.trim() || null;
  const tse_status = (formData.get("tse_status") as string | null)?.trim() || null;
  const analiz_gecerlilik = (formData.get("analiz_gecerlilik") as string | null) || null;
  const tareks_no = (formData.get("tareks_no") as string | null)?.trim() || null;
  const rapor_no = (formData.get("rapor_no") as string | null)?.trim() || null;
  const valid_from = (formData.get("valid_from") as string | null) || null;
  const valid_to = (formData.get("valid_to") as string | null) || null;

  await supabase.from("product_type_compliance").insert({
    product_type_id,
    country,
    tse_status,
    analiz_gecerlilik,
    tareks_no,
    rapor_no,
    valid_from,
    valid_to,
  });
  revalidatePath("/product-types");
}

export async function deleteCompliance(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServerClient();
  const id = formData.get("id") as string | null;
  if (!id) return;
  await supabase.from("product_type_compliance").delete().eq("id", id);
  revalidatePath("/product-types");
}

/**
 * Tek bir tip değeri (nitelikten okunan) için product_type oluşturur
 * ve bu değere sahip ürünlerin product_type_id alanını doldurur.
 */
export async function upsertTypeFromTipValue(formData: FormData) {
  "use server";
  const supabase = await createSupabaseServerClient();
  const selected = formData.getAll("tip_values");
  const tipValues = (Array.isArray(selected) ? selected : [])
    .map((v) => String(v).trim())
    .filter((v) => v.length);
  if (!tipValues.length) return;

  // Tipleri upsert et ve id haritasını oluştur
  const tipIdMap = new Map<string, string>(); // lower -> id
  for (const tipValue of tipValues) {
    const { data: upserted, error: upErr } = await supabase
      .from("product_types")
      .upsert({ name: tipValue }, { onConflict: "name" })
      .select("id")
      .maybeSingle();
    if (upErr || !upserted?.id) {
      console.error("upsertTypeFromTipValue upsert error", { tipValue, upErr });
      continue;
    }
    tipIdMap.set(tipValue.toLowerCase(), upserted.id);
  }

  // İlgili ürünleri bul
  const { data: attrRows, error: attrErr } = await supabase
    .from("product_attribute_values")
    .select(
      "product_id, value_text, value_number, attribute:product_attributes(name)"
    )
    .not("product_id", "is", null);
  if (attrErr) {
    console.error("upsertTypeFromTipValue attrErr", attrErr);
    return;
  }

  const targets: Record<string, Set<string>> = {};
  (attrRows ?? []).forEach((row: any) => {
    const attr = Array.isArray(row.attribute) ? row.attribute[0] : row.attribute;
    const attrName = attr?.name?.toLowerCase?.() ?? "";
    if (!attrName.includes("tip")) return;
    const val =
      row.value_text ??
      (row.value_number !== null && row.value_number !== undefined
        ? String(row.value_number)
        : null);
    const tipVal = val?.trim();
    if (!tipVal || !row.product_id) return;
    const norm = tipVal.toLowerCase();
    if (tipIdMap.has(norm)) {
      targets[norm] = targets[norm] ?? new Set<string>();
      targets[norm].add(row.product_id);
    }
  });

  // Ürünleri tip ID ile güncelle
  for (const [normTip, idSet] of Object.entries(targets)) {
    const typeId = tipIdMap.get(normTip);
    if (!typeId) continue;
    const productIds = Array.from(idSet);
    const batchSize = 200;
    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);
      const { error: updErr } = await supabase
        .from("products")
        .update({ product_type_id: typeId })
        .in("id", batch);
      if (updErr) {
        console.error("upsertTypeFromTipValue update error", { normTip, updErr });
      }
    }
  }

  revalidatePath("/product-types");
  revalidatePath("/products");
}

/**
 * Ürün niteliklerindeki "tip" değerlerinden otomatik product_types oluşturur
 * ve product_type_id boş olan ürünleri bu tipe bağlar.
 */
export async function syncTypesFromAttributes() {
  "use server";
  const supabase = await createSupabaseServerClient();

  // 1) Tip niteliğini taşıyan kayıtları çek
  const { data: attrRows, error: attrErr } = await supabase
    .from("product_attribute_values")
    .select(
      "product_id, value_text, value_number, attribute:product_attributes(name)"
    )
    .not("product_id", "is", null);

  if (attrErr) {
    console.error("syncTypesFromAttributes attrErr", attrErr);
    return;
  }

  // 2) Tip değerlerini normalize et
  type AttrRow = {
    product_id: string | null;
    value_text: string | null;
    value_number: number | null;
    attribute?: { name?: string | null } | null;
  };

  const typeMap = new Map<string, Set<string>>(); // tipName -> productIds
  (attrRows ?? []).forEach((row: any) => {
    const attr = Array.isArray(row.attribute) ? row.attribute[0] : row.attribute;
    const attrName = attr?.name?.toLowerCase?.() ?? "";
    if (!attrName.includes("tip")) return;
    const val =
      row.value_text ??
      (row.value_number !== null && row.value_number !== undefined
        ? String(row.value_number)
        : null);
    const typeName = val?.trim();
    if (!typeName || !row.product_id) return;
    const set = typeMap.get(typeName) ?? new Set<string>();
    set.add(row.product_id);
    typeMap.set(typeName, set);
  });

  if (!typeMap.size) return;

  // 3) Tipleri upsert et ve ürünleri güncelle
  for (const [typeName, productSet] of typeMap.entries()) {
    const { data: upserted, error: upErr } = await supabase
      .from("product_types")
      .upsert({ name: typeName }, { onConflict: "name" })
      .select("id")
      .maybeSingle();
    if (upErr) {
      console.error("syncTypesFromAttributes upsert error", upErr);
      continue;
    }
    const typeId = upserted?.id;
    if (!typeId) continue;
    const productIds = Array.from(productSet);
    // batch update in chunks to avoid URL limit
    const batchSize = 200;
    for (let i = 0; i < productIds.length; i += batchSize) {
      const batch = productIds.slice(i, i + batchSize);
      const { error: updErr } = await supabase
        .from("products")
        .update({ product_type_id: typeId })
        .in("id", batch)
        .is("product_type_id", null);
      if (updErr) {
        console.error("syncTypesFromAttributes update error", updErr);
      }
    }
  }

  revalidatePath("/product-types");
  revalidatePath("/products");
}
