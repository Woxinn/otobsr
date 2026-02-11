"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Role = "Admin" | "Yonetim" | "Satis";

export default function CreateUserClient() {
  const supabase = createSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("Admin");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!email || !password) {
      setMessage("Eposta ve sifre zorunlu.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error || !data?.user?.id) {
      setMessage("Kullanici olusturulamadi.");
      setLoading(false);
      return;
    }
    await supabase.from("user_roles").upsert({
      user_id: data.user.id,
      role,
      email,
    });
    setEmail("");
    setPassword("");
    setRole("Admin");
    setMessage("Kullanici olusturuldu.");
    setLoading(false);
  };

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold">Yeni kullanici</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Eposta"
          className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Sifre"
          className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
        >
          <option value="Admin">Admin</option>
          <option value="Yonetim">Yonetim</option>
          <option value="Satis">Satis</option>
        </select>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleCreate}
          disabled={loading}
          className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Kaydediliyor..." : "Kullanici ekle"}
        </button>
        {message ? (
          <span className="rounded-full border border-black/10 bg-[var(--sand)] px-3 py-1 text-xs">
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
