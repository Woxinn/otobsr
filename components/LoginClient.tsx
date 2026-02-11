"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

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
      setError("Giris basarisiz. Eposta veya sifreyi kontrol edin.");
      return;
    }

    router.push(redirectTo);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-[var(--background)] px-6 py-16 text-[var(--ink)]">
      <div className="mx-auto max-w-md rounded-3xl border border-black/10 bg-white/80 p-8 shadow-[0_20px_60px_-30px_rgba(15,61,62,0.55)] backdrop-blur">
        <div className="mb-6 flex items-center justify-center">
          <Logo className="h-10 w-auto" alt="Oto Basar" />
        </div>
        <h1 className="text-3xl font-semibold [font-family:var(--font-display)]">
          Admin girisi
        </h1>
        <p className="mt-2 text-sm text-black/60">
          Ithalat takip sistemi icin yetkili girisi.
        </p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium">
            Eposta
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
            />
          </label>
          <label className="block text-sm font-medium">
            Sifre
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
            />
          </label>
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--ocean)] px-5 py-3 text-sm font-semibold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Giris yapiliyor..." : "Giris yap"}
          </button>
        </form>
      </div>
    </div>
  );
}
