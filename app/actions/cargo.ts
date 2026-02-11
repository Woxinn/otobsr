"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export async function addCargoItem(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const shipmentId = String(formData.get("shipment_id") ?? "");
  if (!shipmentId) return;

  const { error } = await supabase.from("cargo_items").insert({
    shipment_id: shipmentId,
    description: nullIfEmpty(formData.get("description")),
    packages: normalizeNumber(formData.get("packages")),
    pallets: normalizeNumber(formData.get("pallets")),
    weight_kg: normalizeNumber(formData.get("weight_kg")),
    volume_cbm: normalizeNumber(formData.get("volume_cbm")),
    invoice_amount: normalizeNumber(formData.get("invoice_amount")),
    notes: nullIfEmpty(formData.get("notes")),
  });

  if (error) {
    console.error("Cargo insert failed", error);
    return;
  }

  revalidatePath(`/shipments/${shipmentId}`);
  revalidatePath(`/shipments/${shipmentId}/edit`);
  revalidatePath("/shipments");
}

export async function updateCargoItem(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const cargoId = String(formData.get("cargo_id") ?? "");
  const shipmentId = String(formData.get("shipment_id") ?? "");
  if (!cargoId || !shipmentId) return;

  const { error } = await supabase
    .from("cargo_items")
    .update({
      description: nullIfEmpty(formData.get("description")),
      packages: normalizeNumber(formData.get("packages")),
      pallets: normalizeNumber(formData.get("pallets")),
      weight_kg: normalizeNumber(formData.get("weight_kg")),
      volume_cbm: normalizeNumber(formData.get("volume_cbm")),
      invoice_amount: normalizeNumber(formData.get("invoice_amount")),
      notes: nullIfEmpty(formData.get("notes")),
    })
    .eq("id", cargoId);

  if (error) {
    console.error("Cargo update failed", error);
    return;
  }

  revalidatePath(`/shipments/${shipmentId}`);
  revalidatePath(`/shipments/${shipmentId}/edit`);
  revalidatePath("/shipments");
}

export async function deleteCargoItem(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const cargoId = String(formData.get("cargo_id") ?? "");
  const shipmentId = String(formData.get("shipment_id") ?? "");
  if (!cargoId || !shipmentId) return;

  const { error } = await supabase
    .from("cargo_items")
    .delete()
    .eq("id", cargoId);

  if (error) {
    console.error("Cargo delete failed", error);
    return;
  }

  revalidatePath(`/shipments/${shipmentId}`);
  revalidatePath(`/shipments/${shipmentId}/edit`);
  revalidatePath("/shipments");
}

