import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/roles";
import { createUserWithRole } from "@/app/actions/users";

export default async function NewUserPage() {
  const { role } = await getCurrentUserRole();
  if (role !== "Admin") {
    redirect("/");
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-black/40">Kullanıcı</p>
        <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">Yeni kullanici ekle</h2>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <form action={createUserWithRole} className="grid gap-3 md:grid-cols-3">
          <input
            name="email"
            placeholder="Eposta"
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Şifre"
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            required
          />
          <select
            name="role"
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            defaultValue="Admin"
          >
            <option value="Admin">Admin</option>
            <option value="Yonetim">Yonetim</option>
            <option value="Satis">Satis</option>
          </select>
          <div className="md:col-span-3 flex gap-2">
            <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
              Kullanıcı ekle
            </button>
            <p className="text-xs text-black/60">
              Kullanıcı email onaysiz acilir ve aninda giris yapabilir.
            </p>
          </div>
        </form>
      </div>
    </section>
  );
}

