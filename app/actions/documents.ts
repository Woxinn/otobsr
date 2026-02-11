"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const nullIfEmpty = (value: FormDataEntryValue | null) => {
  if (value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

export async function updateDocument(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const documentId = String(formData.get("document_id") ?? "");
  const shipmentId = String(formData.get("shipment_id") ?? "");

  if (!documentId) return;

  await supabase
    .from("documents")
    .update({
      shipment_id: nullIfEmpty(formData.get("shipment_id")),
      document_type_id: nullIfEmpty(formData.get("document_type_id")),
      status: nullIfEmpty(formData.get("status")),
      received_at: nullIfEmpty(formData.get("received_at")),
      notes: nullIfEmpty(formData.get("notes")),
    })
    .eq("id", documentId);

  if (shipmentId) {
    revalidatePath(`/shipments/${shipmentId}`);
  }
  revalidatePath("/documents");
}

export async function deleteDocument(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const documentId = String(formData.get("document_id") ?? "");
  const shipmentId = String(formData.get("shipment_id") ?? "");
  if (!documentId) return;

  const { data: doc } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .single();

  if (doc?.storage_path) {
    await supabase.storage.from("documents").remove([doc.storage_path]);
  }

  await supabase.from("documents").delete().eq("id", documentId);
  if (shipmentId) {
    revalidatePath(`/shipments/${shipmentId}`);
  }
  revalidatePath("/documents");
}

