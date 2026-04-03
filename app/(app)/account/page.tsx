import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";
import { changeOwnPassword } from "@/app/actions/account-security";

type SearchParams = Promise<{
  status?: string;
  error?: string;
}>;

const statusMessage = (status: string | undefined) => {
  if (status === "password-updated") return "Şifre güncellendi.";
  return null;
};

const errorMessage = (error: string | undefined) => {
  if (error === "password-length") return "Şifre en az 8 karakter olmalı.";
  if (error === "password-match") return "Şifre alanları eşleşmiyor.";
  if (error === "password-update") return "Şifre güncellenemedi.";
  return null;
};

export default async function AccountPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { role } = await getCurrentUserRole();

  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-black/10 bg-white/90 p-6 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.28em] text-black/45">Hesap ayarları</p>
        <h1 className="mt-3 text-3xl font-semibold text-black">Güvenlik</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-black/62">
          Bu ekranda sadece kendi parolanızı güncelleyebilirsiniz. Cihaz onayları artık merkezi yönetim ekranından yalnızca
          admin tarafından yönetilir.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-black/60">
          <span className="rounded-full border border-black/10 bg-[var(--paper)] px-3 py-1">{user.email}</span>
          <span className="rounded-full border border-black/10 bg-[var(--paper)] px-3 py-1">{role}</span>
        </div>
        {statusMessage(params.status) ? (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {statusMessage(params.status)}
          </p>
        ) : null}
        {errorMessage(params.error) ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage(params.error)}
          </p>
        ) : null}
      </div>

      <div className="rounded-[28px] border border-black/10 bg-white/90 p-6 shadow-sm xl:max-w-xl">
        <p className="text-[11px] uppercase tracking-[0.24em] text-black/45">Şifre değiştir</p>
        <h2 className="mt-2 text-xl font-semibold text-black">Yeni parola belirle</h2>
        <p className="mt-3 text-sm leading-6 text-black/62">
          Bu işlem aktif oturumunuz üzerinden yapılır. En az 8 karakterlik yeni bir şifre girin.
        </p>

        <form action={changeOwnPassword} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/48">Yeni şifre</span>
            <input
              name="password"
              type="password"
              minLength={8}
              required
              className="mt-2 w-full rounded-[22px] border border-black/10 bg-[#fcfaf6] px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/48">Şifre tekrar</span>
            <input
              name="confirm_password"
              type="password"
              minLength={8}
              required
              className="mt-2 w-full rounded-[22px] border border-black/10 bg-[#fcfaf6] px-4 py-3 text-sm outline-none"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-full bg-[linear-gradient(135deg,#133c45_0%,#1f7166_100%)] px-5 py-3 text-sm font-semibold text-white"
          >
            Şifreyi güncelle
          </button>
        </form>
      </div>
    </section>
  );
}
