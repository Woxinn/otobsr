"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const nullIfEmpty = (value: FormDataEntryValue | null) => {
  if (value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

export async function createSupplier(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const name = nullIfEmpty(formData.get("name"));
  if (!name) return;
  await supabase.from("suppliers").insert({
    name,
    contact_name: nullIfEmpty(formData.get("contact_name")),
    email: nullIfEmpty(formData.get("email")),
    phone: nullIfEmpty(formData.get("phone")),
    address: nullIfEmpty(formData.get("address")),
    city: nullIfEmpty(formData.get("city")),
    country: nullIfEmpty(formData.get("country")),
    tax_no: nullIfEmpty(formData.get("tax_no")),
    notes: nullIfEmpty(formData.get("notes")),
  });
  revalidatePath("/suppliers");
}

export async function updateSupplier(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabase
    .from("suppliers")
    .update({
      name: nullIfEmpty(formData.get("name")),
      contact_name: nullIfEmpty(formData.get("contact_name")),
      email: nullIfEmpty(formData.get("email")),
      phone: nullIfEmpty(formData.get("phone")),
      address: nullIfEmpty(formData.get("address")),
      city: nullIfEmpty(formData.get("city")),
      country: nullIfEmpty(formData.get("country")),
      tax_no: nullIfEmpty(formData.get("tax_no")),
      notes: nullIfEmpty(formData.get("notes")),
    })
    .eq("id", id);
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
}

export async function createForwarder(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const name = nullIfEmpty(formData.get("name"));
  if (!name) return;
  await supabase.from("forwarders").insert({
    name,
    contact_name: nullIfEmpty(formData.get("contact_name")),
    email: nullIfEmpty(formData.get("email")),
    phone: nullIfEmpty(formData.get("phone")),
    notes: nullIfEmpty(formData.get("notes")),
  });
  revalidatePath("/forwarders");
}

export async function updateForwarder(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabase
    .from("forwarders")
    .update({
      name: nullIfEmpty(formData.get("name")),
      contact_name: nullIfEmpty(formData.get("contact_name")),
      email: nullIfEmpty(formData.get("email")),
      phone: nullIfEmpty(formData.get("phone")),
      notes: nullIfEmpty(formData.get("notes")),
    })
    .eq("id", id);
  revalidatePath("/forwarders");
  revalidatePath(`/forwarders/${id}`);
}

export async function createPort(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const name = nullIfEmpty(formData.get("name"));
  if (!name) return;
  await supabase.from("ports").insert({ name, notes: nullIfEmpty(formData.get("notes")) });
  revalidatePath("/ports");
}

export async function updatePort(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabase
    .from("ports")
    .update({ name: nullIfEmpty(formData.get("name")), notes: nullIfEmpty(formData.get("notes")) })
    .eq("id", id);
  revalidatePath("/ports");
}

export async function createDocumentType(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const name = nullIfEmpty(formData.get("name"));
  const codeInput = nullIfEmpty(formData.get("code"));
  const appliesTo = nullIfEmpty(formData.get("applies_to"));
  if (!name) return;
  const code = (codeInput ?? name).toUpperCase();
  const isBl = name.toUpperCase() === "BL";
  await supabase.from("document_types").insert({
    code,
    name,
    is_required: isBl ? true : formData.get("is_required") === "on",
    is_critical: isBl ? true : formData.get("is_critical") === "on",
    applies_to: appliesTo,
  });
  revalidatePath("/document-types");
}

export async function updateDocumentType(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const name = nullIfEmpty(formData.get("name")) ?? "";
  const codeInput = nullIfEmpty(formData.get("code"));
  const appliesTo = nullIfEmpty(formData.get("applies_to"));
  const isBl = name.toUpperCase() === "BL";
  await supabase
    .from("document_types")
    .update({
      code: codeInput ? codeInput.toUpperCase() : undefined,
      name,
      is_required: isBl ? true : formData.get("is_required") === "on",
      is_critical: isBl ? true : formData.get("is_critical") === "on",
      applies_to: appliesTo,
    })
    .eq("id", id);
  revalidatePath("/document-types");
}

