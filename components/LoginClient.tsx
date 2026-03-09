"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

const highlights = [
  "Sipariş, RFQ ve plan akışları tek ekranda",
  "Canlı stok, belge ve maliyet takibi",
  "Operasyon odaklı hızlı yönetim paneli",
];

const badges = ["RFQ", "Sipariş", "Maliyet", "Belge", "Stok", "Plan"];

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";
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
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(18,93,95,0.18),_transparent_36%),linear-gradient(135deg,#f2ede3_0%,#ebe4d6_45%,#d8d9d2_100%)] px-4 py-4 text-[#1d2228] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-[34px] border border-black/10 bg-[#f7f3eb]/90 shadow-[0_28px_90px_-38px_rgba(13,37,51,0.45)] backdrop-blur lg:grid lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative flex min-h-[320px] flex-col justify-between overflow-hidden bg-[linear-gradient(150deg,#183038_0%,#0f4c50_45%,#1f7166_100%)] px-6 py-6 text-white sm:px-8 sm:py-8 lg:px-10 lg:py-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,214,102,0.18),transparent_26%),radial-gradient(circle_at_85%_15%,rgba(255,255,255,0.16),transparent_20%),radial-gradient(circle_at_70%_80%,rgba(255,214,102,0.14),transparent_24%)]" />
          <div className="relative">
            <div className="flex min-h-[148px] items-center justify-center rounded-[32px] border border-white/12 bg-white/8 px-8 py-8 shadow-[0_22px_50px_-30px_rgba(0,0,0,0.58)] backdrop-blur">
              <Logo className="h-24 w-full max-w-[420px] object-contain" alt="Oto Başar" />
            </div>

            <div className="mt-10 max-w-xl">
              <p className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-1 text-[11px] uppercase tracking-[0.28em] text-[#ffd666]">
                Admin paneli
              </p>
              <h1 className="mt-5 max-w-lg text-4xl font-semibold leading-[1.02] tracking-[-0.04em] [font-family:var(--font-display)] sm:text-5xl">
                Ticaret akışlarının hepsini tek panelde yönetin.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/76 sm:text-[15px]">
                RFQ, sipariş, belge, maliyet ve stok verilerini tek bir operasyon
                arayüzünde toparlayan iç ekip paneli.
              </p>
            </div>
          </div>

          <div className="relative mt-8 grid gap-4 lg:mt-0">
            <div className="grid gap-3 sm:grid-cols-3">
              {highlights.map((item, index) => (
                <div
                  key={item}
                  className="rounded-[24px] border border-white/14 bg-white/10 px-4 py-4 backdrop-blur"
                >
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/50">
                    0{index + 1}
                  </p>
                  <p className="mt-2 text-sm leading-5 text-white/88">{item}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-white/15 bg-black/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-white/72"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(248,243,235,0.96))] px-4 py-5 sm:px-6 lg:px-8">
          <div className="w-full max-w-md rounded-[30px] border border-black/8 bg-white/82 p-6 shadow-[0_20px_60px_-30px_rgba(17,37,47,0.4)] backdrop-blur sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#8f7d64]">
                  Yetkili erişim
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] [font-family:var(--font-display)]">
                  Panele giriş yapın
                </h2>
              </div>
              <div className="rounded-[20px] bg-[#efe7d8] px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.24em] text-[#8e6d36]">
                  Versiyon
                </p>
                <p className="mt-1 text-sm font-semibold text-[#6f5526]">v0.1b</p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-black/58">
              Yalnızca yetkili ekip üyeleri için. Giriş sonrası rol bazlı ekranlar
              otomatik açılır.
            </p>

            <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/48">
                  E-posta
                </span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  required
                  autoComplete="email"
                  className="mt-2 w-full rounded-[22px] border border-black/10 bg-[#fcfaf6] px-4 py-3.5 text-sm outline-none transition focus:border-[#1f7166] focus:bg-white focus:ring-4 focus:ring-[#1f7166]/10"
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/48">
                  Şifre
                </span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  required
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-[22px] border border-black/10 bg-[#fcfaf6] px-4 py-3.5 text-sm outline-none transition focus:border-[#1f7166] focus:bg-white focus:ring-4 focus:ring-[#1f7166]/10"
                />
              </label>

              {error ? (
                <p className="rounded-[20px] border border-[#efb9b0] bg-[#fff3f0] px-4 py-3 text-sm text-[#b24432]">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-[linear-gradient(135deg,#133c45_0%,#1f7166_100%)] px-5 py-3.5 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_18px_40px_-22px_rgba(13,60,69,0.75)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Giriş yapılıyor..." : "Giriş yap"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
