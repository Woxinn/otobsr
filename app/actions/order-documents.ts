"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function deleteOrderDocument(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const documentId = String(formData.get("document_id") ?? "");
  const orderId = String(formData.get("order_id") ?? "");
  if (!documentId || !orderId) return;

  const { data: doc } = await supabase
    .from("order_documents")
    .select("storage_path")
    .eq("id", documentId)
    .single();

  if (doc?.storage_path) {
    await supabase.storage.from("documents").remove([doc.storage_path]);
  }

  const { error } = await supabase
    .from("order_documents")
    .delete()
    .eq("id", documentId);

  if (error) {
    console.error("Order document delete failed", error);
    return;
  }

  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?toast=document-deleted&tab=documents`);
}
