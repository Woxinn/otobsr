import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const normalizeRole = (value: string): "Admin" | "Yonetim" | "Satis" => {
  const raw = value?.toLowerCase?.() ?? "admin";
  if (raw === "yonetim") return "Yonetim";
  if (raw === "satis") return "Satis";
  return "Admin";
};

export async function createUserWithRole(formData: FormData) {
  "use server";
  if (!url || !serviceKey) {
    throw new Error("Supabase service key eksik.");
  }
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = normalizeRole(String(formData.get("role") ?? "Admin"));

  if (!email || !password) {
    throw new Error("Eposta ve sifre zorunlu.");
  }

  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error("Kullanıcı olusturulamadi.");
  }

  await adminClient.from("user_roles").upsert({
    user_id: data.user.id,
    role,
    email,
  });

  revalidatePath("/users");
  redirect("/users");
}

export async function updateUserRole(formData: FormData) {
  "use server";
  if (!url || !serviceKey) throw new Error("Supabase service key eksik.");
  const userId = String(formData.get("user_id") ?? "");
  const role = normalizeRole(String(formData.get("role") ?? "Admin"));
  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await adminClient.from("user_roles").update({ role }).eq("user_id", userId);
  revalidatePath("/users");
  redirect("/users");
}

export async function deleteUser(formData: FormData) {
  "use server";
  if (!url || !serviceKey) throw new Error("Supabase service key eksik.");
  const userId = String(formData.get("user_id") ?? "");
  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await adminClient.from("user_roles").delete().eq("user_id", userId);
  await adminClient.auth.admin.deleteUser(userId);
  revalidatePath("/users");
  redirect("/users");
}

