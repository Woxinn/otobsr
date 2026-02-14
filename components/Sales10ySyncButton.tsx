"use client";

import { useState, useTransition } from "react";

export default function Sales10ySyncButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [productId, setProductId] = useState<string>("930e3ba9-9514-4615-b22e-d333780a92d6");
  const [mode, setMode] = useState<"single" | "all">("single");

  const handleSync = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        const body = mode === "single" ? { product_id: productId } : {};
        const res = await fetch("/api/sales-10y-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const resp = await res.json().catch(() => ({}));
          setMessage(resp.error ? `Hata: ${resp.error}` : `Hata: ${res.status}`);
          return;
        }
        const resp = await res.json();
        console.log("sales-10y-sync debug", resp);
        if (Array.isArray(resp)) {
          const first = resp[0];
          setMessage(
            `Tamamlandı. ${resp.length} kayıt. Örnek: ${
              first ? `${first.db ?? "-"} / ${first.code ?? "-"} / ${first.total ?? 0}` : "-"
            }`
          );
        } else {
          setMessage("Tamamlandı.");
        }
      } catch (err: unknown) {
        setMessage(`Hata: ${(err as Error).message}`);
      }
    });
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-black/50">10 yıllık satış</p>
          <p className="text-sm font-semibold text-black">Supabase&#39;e senkronize et</p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2 text-xs font-semibold text-black/70">
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="sync-mode"
                checked={mode === "single"}
                onChange={() => setMode("single")}
              />
              Tek ürün
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="sync-mode"
                checked={mode === "all"}
                onChange={() => setMode("all")}
              />
              Tüm ürünler
            </label>
          </div>
          {mode === "single" ? (
            <input
              type="text"
              className="w-[320px] rounded-xl border border-black/15 px-3 py-2 text-xs"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="product_id (uuid)"
            />
          ) : null}
          <button
            type="button"
            onClick={handleSync}
            disabled={pending}
            className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Senkronize ediliyor..." : "Senkronize et"}
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-xs text-black/70">{message}</p> : null}
    </div>
  );
}
