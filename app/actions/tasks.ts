"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function closeTask(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("tasks")
    .update({ status: "Kapali", closed_at: new Date().toISOString() })
    .eq("id", taskId);

  revalidatePath("/", "layout");
}

