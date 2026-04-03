"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Oturum bulunamadı.");
  }

  return { supabase, user };
}

export async function changeOwnPassword(formData: FormData) {
  const { supabase } = await requireCurrentUser();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (password.length < 8) {
    redirect("/account?error=password-length");
  }

  if (password !== confirmPassword) {
    redirect("/account?error=password-match");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect("/account?error=password-update");
  }

  redirect("/account?status=password-updated");
}
