"use client";

import { useCallback, useEffect, useState } from "react";

type Props = {
  stockCode: string | null;
};

export default function ProductLiveStockCard({ stockCode }: Props) {
  const [loading, setLoading] = useState(Boolean(stockCode));
  const [value, setValue] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!stockCode) {
      setLoading(false);
      setValue(null);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/products/live-stock?code=${encodeURIComponent(stockCode)}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setValue(null);
        return;
      }
      if (typeof data?.value === "number") {
        setValue(data.value);
      } else {
        setValue(null);
      }
    } catch {
      setValue(null);
    } finally {
      setLoading(false);
    }
  }, [stockCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const stockText =
    value === null
      ? "-"
      : value.toLocaleString("tr-TR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        });

  return (
    <div className="mt-3 inline-flex items-center gap-3 rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-sm backdrop-blur shadow-[0_14px_38px_-26px_rgba(15,61,62,0.8)]">
      <div className="flex flex-col leading-tight">
        <span className="text-[11px] uppercase tracking-[0.2em] text-white/70">Canli stok</span>
        <span className="text-2xl font-semibold text-white">
          {loading ? (
            <span className="inline-flex items-center gap-1">
              {[0, 1, 2].map((idx) => (
                <span
                  key={idx}
                  className="inline-block h-2 w-2 rounded-full bg-white/90 animate-pulse"
                  style={{ animationDelay: `${idx * 180}ms` }}
                />
              ))}
            </span>
          ) : (
            stockText
          )}
        </span>
      </div>
    </div>
  );
}
