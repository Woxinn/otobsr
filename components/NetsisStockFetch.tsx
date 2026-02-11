"use client";

import { useState } from "react";

export default function NetsisStockFetch({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<number | null>(null);

  const handle = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mssql-stock-one?productId=${encodeURIComponent(productId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Hata");
      setValue(data.net ?? 0);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2 text-sm">
      <button
        onClick={handle}
        disabled={loading}
        className={`rounded-full border px-3 py-1 text-xs font-semibold ${
          loading
            ? "cursor-not-allowed border-black/10 text-black/40"
            : "border-black/30 text-black/70"
        }`}
      >
        {loading ? "Çekiliyor..." : "MSSQL stok getir"}
      </button>
      {value !== null ? <span className="text-black/70">Stok: {value}</span> : null}
      {error ? <span className="text-red-600">{error}</span> : null}
    </div>
  );
}
