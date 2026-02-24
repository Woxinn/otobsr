"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const toNumber = (value: FormDataEntryValue | null) => {
  if (value === null) return null;
  const parsed = Number(String(value).trim().replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
};

export async function updateOrderPlanDefaults(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const lead = toNumber(formData.get("lead_time_days"));
  const safety = toNumber(formData.get("safety_days"));

  await supabase
    .from("order_plan_defaults")
    .upsert(
      {
        id: 1,
        lead_time_days: lead ?? 105,
        safety_days: safety ?? 15,
      },
      { onConflict: "id" }
    );

  revalidatePath("/siparis-plani");
}

