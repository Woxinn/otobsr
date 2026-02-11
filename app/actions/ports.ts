"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function createPort(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const latRaw = formData.get("lat");
  const lonRaw = formData.get("lon");
  const lat = latRaw ? Number(latRaw) : null;
  const lon = lonRaw ? Number(lonRaw) : null;

  if (!name) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("ports").insert({ name, notes, lat, lon });

  revalidatePath("/ports");
}

export async function updatePort(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const latRaw = formData.get("lat");
  const lonRaw = formData.get("lon");
  const lat = latRaw ? Number(latRaw) : null;
  const lon = lonRaw ? Number(lonRaw) : null;
  if (!id || !name) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("ports").update({ name, notes, lat, lon }).eq("id", id);

  revalidatePath(`/ports/${id}`);
  revalidatePath("/ports");
  redirect(`/ports/${id}`);
}

export async function deletePort(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("ports").delete().eq("id", id);

  revalidatePath("/ports");
  redirect("/ports");
}
