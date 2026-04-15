import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type UserRole = "Admin" | "Yonetim" | "Satis";

const normalizeRole = (value: string | null | undefined): UserRole => {
  const raw = (value ?? "").toLowerCase();
  if (raw === "yonetim") return "Yonetim";
  if (raw === "satis") return "Satis";
  if (raw === "admin") return "Admin";
  return "Admin";
};

type RoleClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function getCurrentUserRole(
  supabaseClient?: RoleClient,
  currentUser?: User | null
) {
  const supabase = supabaseClient ?? (await createSupabaseServerClient());
  const user =
    currentUser ??
    (
      await supabase.auth.getUser()
    ).data.user;
  if (!user) return { role: "Admin" as UserRole, userId: null };

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return { role: normalizeRole(data?.role), userId: user.id };
}

export const canEdit = (role: UserRole) => role === "Admin";
export const canViewFinance = (role: UserRole) => role === "Admin" || role === "Yonetim";
export const canViewCostInputs = (role: UserRole) => role === "Admin" || role === "Yonetim";
export const canManageOrdersAndProducts = (role: UserRole) => role === "Admin";

export async function requireAdminRole() {
  const { role, userId } = await getCurrentUserRole();
  if (role !== "Admin") {
    throw new Error("Yetki yok");
  }
  return { role, userId };
}

export const canViewModule = (role: UserRole, moduleKey: string) => {
  if (role === "Satis") {
    return moduleKey === "orders" || moduleKey === "products";
  }
  return true;
};
