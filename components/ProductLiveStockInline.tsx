"use client";

import { useEffect, useState } from "react";

type Props = {
  stockCode: string | null;
};

const cache = new Map<string, number | null>();
const inflight = new Map<string, Promise<number | null>>();

async function loadStock(code: string) {
  if (cache.has(code)) return cache.get(code) ?? null;
  const active = inflight.get(code);
  if (active) return active;

  const req = (async () => {
    try {
      const res = await fetch(`/api/products/live-stock?code=${encodeURIComponent(code)}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      const value = res.ok && typeof data?.value === "number" ? Number(data.value) : null;
      cache.set(code, value);
      return value;
    } catch {
      cache.set(code, null);
      return null;
    } finally {
      inflight.delete(code);
    }
  })();

  inflight.set(code, req);
  return req;
}

export default function ProductLiveStockInline({ stockCode }: Props) {
  const code = stockCode ? String(stockCode).trim() : "";
  const [value, setValue] = useState<number | null>(code ? (cache.get(code) ?? null) : null);
  const [loading, setLoading] = useState(Boolean(code && !cache.has(code)));

  useEffect(() => {
    if (!code) {
      setLoading(false);
      setValue(null);
      return;
    }
    if (cache.has(code)) {
      setLoading(false);
      setValue(cache.get(code) ?? null);
      return;
    }
    setLoading(true);
    loadStock(code).then((result) => {
      setValue(result);
      setLoading(false);
    });
  }, [code]);

  if (!code) return <>-</>;
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1">
        {[0, 1, 2].map((idx) => (
          <span
            key={idx}
            className="inline-block h-1.5 w-1.5 rounded-full bg-black/60 animate-pulse"
            style={{ animationDelay: `${idx * 140}ms` }}
          />
        ))}
      </span>
    );
  }

  return <>{value === null ? "-" : value}</>;
}

