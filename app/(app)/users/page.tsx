import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";
import { updateUserRole, deleteUser } from "@/app/actions/users";

type UserRow = {
  user_id: string;
  email: string | null;
  role: string | null;
};

const normalizeRoleValue = (value: string | null | undefined): "Admin" | "Yonetim" | "Satis" => {
  const raw = String(value ?? "Admin").trim().toLowerCase();
  if (raw === "yonetim") return "Yonetim";
  if (raw === "satis") return "Satis";
  return "Admin";
};

async function fetchUsers() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, email, role")
    .order("email");
  if (error) throw error;
  return (data ?? []) as UserRow[];
}

export default async function UsersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { role } = await getCurrentUserRole();
  if (role !== "Admin") {
    redirect("/");
  }

  const users = await fetchUsers();

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-black/40">Kullanıcılar</p>
        <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">Kullanıcı ve roller</h2>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Aktif kullanici</h3>
        <p className="mt-2 text-sm text-black/70">
          {user?.email ?? "Giriş yapilmamis."}
        </p>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Mevcut kullanicilar</h3>
          <a
            href="/admin/new-user"
            className="rounded-full border border-black/15 bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white"
          >
            Yeni kullanici ekle
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-y-3 text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.25em] text-black/50">
                <th className="px-3 py-2">Eposta</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2 text-right">Islem</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr
                  key={row.user_id}
                  className="rounded-2xl border border-black/10 bg-[var(--mint)]/30 [&>td]:px-3 [&>td]:py-2"
                >
                  <td className="font-semibold text-black">{row.email ?? "(email yok)"}</td>
                  <td>
                    <form action={updateUserRole}>
                      <input type="hidden" name="user_id" value={row.user_id} />
                      <select
                        defaultValue={normalizeRoleValue(row.role)}
                        name="role"
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                      >
                        <option value="Admin">Admin</option>
                        <option value="Yonetim">Yonetim</option>
                        <option value="Satis">Satis</option>
                      </select>
                      <button className="ml-2 rounded-full border border-black/15 px-3 py-1 text-xs font-semibold">
                        Kaydet
                      </button>
                    </form>
                  </td>
                  <td className="text-right">
                    <form action={deleteUser} className="inline">
                      <input type="hidden" name="user_id" value={row.user_id} />
                      <button className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold text-black/70 hover:border-black/40">
                        Sil
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!users.length ? (
            <div className="mt-3 rounded-xl border border-black/10 bg-[var(--peach)] px-3 py-2 text-xs text-black/70">
              Henüz kullanici yok.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}


