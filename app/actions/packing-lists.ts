"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function deletePackingList(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  const packingListId = String(formData.get("packing_list_id") ?? "");

  if (!orderId || !packingListId) return;

  const { error } = await supabase
    .from("packing_lists")
    .delete()
    .eq("id", packingListId);

  if (error) {
    console.error("Packing list delete failed", error);
    return;
  }

  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?tab=packing&toast=pl-deleted`);
}
