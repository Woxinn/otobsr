"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import AppVersionBadge from "@/components/AppVersionBadge";
import Logo from "@/components/Logo";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("returnTo") ?? searchParams.get("redirect") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError("Giriş başarısız. E-posta veya şifreyi kontrol edin.");
      return;
    }

    router.push(redirectTo);
    router.refresh();
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5efe3] text-[#1f2628]">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-[-10%] top-[-18%] h-[42rem] w-[42rem] animate-[spin_28s_linear_infinite] rounded-full bg-[radial-gradient(circle,rgba(214,174,98,0.24)_0%,rgba(214,174,98,0.06)_34%,transparent_70%)]" />
        <div className="absolute right-[-12%] top-[8%] h-[34rem] w-[34rem] animate-[spin_22s_linear_infinite_reverse] rounded-full bg-[radial-gradient(circle,rgba(62,145,135,0.22)_0%,rgba(62,145,135,0.06)_35%,transparent_74%)]" />
        <div className="absolute bottom-[-22%] left-[20%] h-[32rem] w-[32rem] animate-[spin_18s_linear_infinite] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.42)_0%,rgba(255,255,255,0.1)_40%,transparent_74%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,251,244,0.88)_0%,rgba(244,236,224,0.74)_48%,rgba(235,229,217,0.9)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,34,38,0.04)_1px,transparent_1px),linear-gradient(180deg,rgba(23,34,38,0.04)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md rounded-[34px] border border-black/8 bg-[rgba(255,252,246,0.76)] p-7 shadow-[0_30px_120px_-40px_rgba(31,38,40,0.26)] backdrop-blur-2xl sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Logo className="h-14 w-auto max-w-[210px] object-contain" alt="Oto Başar" />
              <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.34em] text-[#8d7754]">
                Yetkili erişim
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#172226] [font-family:var(--font-display)]">
                Giriş yapın
              </h1>
            </div>
            <AppVersionBadge className="border-black/10 bg-white/70 text-black/62" />
          </div>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/46">E-posta</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                autoComplete="email"
                className="mt-2 w-full rounded-[22px] border border-black/10 bg-white/85 px-4 py-3.5 text-sm text-[#172226] outline-none transition placeholder:text-black/22 focus:border-[#b99353] focus:bg-white focus:ring-4 focus:ring-[#b99353]/10"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/46">Şifre</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
                autoComplete="current-password"
                className="mt-2 w-full rounded-[22px] border border-black/10 bg-white/85 px-4 py-3.5 text-sm text-[#172226] outline-none transition placeholder:text-black/22 focus:border-[#b99353] focus:bg-white focus:ring-4 focus:ring-[#b99353]/10"
              />
            </label>

            {error ? (
              <p className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[linear-gradient(135deg,#cdb27d_0%,#e7d7ac_48%,#c59d53_100%)] px-5 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-[#1d2326] shadow-[0_20px_50px_-24px_rgba(231,215,172,0.8)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Giriş yapılıyor..." : "Giriş yap"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
