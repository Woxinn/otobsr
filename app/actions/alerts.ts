"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function resolveAlert(formData: FormData) {
  const alertId = String(formData.get("alert_id") ?? "");
  if (!alertId) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("alerts")
    .update({ status: "resolved" })
    .eq("id", alertId);

  revalidatePath("/", "layout");
}
