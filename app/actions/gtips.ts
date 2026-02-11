"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const toNumber = (value: FormDataEntryValue | null) =>
  value === null || value === undefined || value === "" ? null : Number(value);

const toBoolean = (value: FormDataEntryValue | null) => value === "on";

export async function createGtip(formData: FormData) {
  const supabase = await createSupabaseServerClient();

  const payload = {
    code: (formData.get("code") as string | null)?.trim() ?? "",
    description: (formData.get("description") as string | null) ?? null,
    customs_duty_rate: toNumber(formData.get("customs_duty_rate")),
    additional_duty_rate: toNumber(formData.get("additional_duty_rate")),
    anti_dumping_applicable: toBoolean(formData.get("anti_dumping_applicable")),
    anti_dumping_rate: toNumber(formData.get("anti_dumping_rate")),
    surveillance_applicable: toBoolean(formData.get("surveillance_applicable")),
    surveillance_unit_value: toNumber(formData.get("surveillance_unit_value")),
    vat_rate: toNumber(formData.get("vat_rate")),
  };

  const { error, data } = await supabase.from("gtips").insert(payload).select("id").single();
  if (error) {
    if (error.code === "23505" && payload.code) {
      const { data: existing } = await supabase
        .from("gtips")
        .select("id")
        .eq("code", payload.code)
        .maybeSingle();
      if (existing?.id) {
        redirect(`/gtips/${existing.id}?toast=exists`);
      }
      redirect(`/gtips/new?toast=duplicate`);
    }
    throw error;
  }

  revalidatePath("/gtips");
  redirect(`/gtips/${data.id}`);
}

export async function updateGtip(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = formData.get("id") as string;

  const payload = {
    code: (formData.get("code") as string | null)?.trim() ?? "",
    description: (formData.get("description") as string | null) ?? null,
    customs_duty_rate: toNumber(formData.get("customs_duty_rate")),
    additional_duty_rate: toNumber(formData.get("additional_duty_rate")),
    anti_dumping_applicable: toBoolean(formData.get("anti_dumping_applicable")),
    anti_dumping_rate: toNumber(formData.get("anti_dumping_rate")),
    surveillance_applicable: toBoolean(formData.get("surveillance_applicable")),
    surveillance_unit_value: toNumber(formData.get("surveillance_unit_value")),
    vat_rate: toNumber(formData.get("vat_rate")),
  };

  const { error } = await supabase.from("gtips").update(payload).eq("id", id);
  if (error) throw error;

  revalidatePath(`/gtips/${id}`);
  revalidatePath("/gtips");
  redirect(`/gtips/${id}`);
}

export async function deleteGtip(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = formData.get("id") as string;

  const { error } = await supabase.from("gtips").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/gtips");
  redirect("/gtips");
}
