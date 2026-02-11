"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function upsertGtipCountryRate(formData: FormData) {
  const gtipId = formData.get("gtip_id") as string | null;
  const country = (formData.get("country") as string | null)?.trim() || null;
  const customs = Number(formData.get("customs_duty_rate") ?? 0) || 0;
  const additional = Number(formData.get("additional_duty_rate") ?? 0) || 0;
  const antiDumping = formData.get("anti_dumping_applicable") === "on";
  const antiDumpingRate = Number(formData.get("anti_dumping_rate") ?? 0) || 0;
  const surveillance = formData.get("surveillance_applicable") === "on";
  const surveillanceValue = Number(formData.get("surveillance_unit_value") ?? 0) || 0;
  const vat = Number(formData.get("vat_rate") ?? 0) || 0;

  if (!gtipId || !country) return;

  const supabase = await createSupabaseServerClient();

  await supabase.from("gtip_country_rates").upsert(
    {
      gtip_id: gtipId,
      country,
      customs_duty_rate: customs,
      additional_duty_rate: additional,
      anti_dumping_applicable: antiDumping,
      anti_dumping_rate: antiDumpingRate,
      surveillance_applicable: surveillance,
      surveillance_unit_value: surveillanceValue,
      vat_rate: vat,
    },
    { onConflict: "gtip_id, country" }
  );

  revalidatePath(`/gtips/${gtipId}`);
  return;
}

export async function deleteGtipCountryRate(formData: FormData) {
  const id = formData.get("id") as string | null;
  const gtipId = formData.get("gtip_id") as string | null;
  if (!id || !gtipId) return;
  const supabase = await createSupabaseServerClient();
  await supabase.from("gtip_country_rates").delete().eq("id", id);
  revalidatePath(`/gtips/${gtipId}`);
  return;
}
