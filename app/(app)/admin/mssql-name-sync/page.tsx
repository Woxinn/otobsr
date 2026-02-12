"use client";

import { useState } from "react";

export default function MssqlNameSyncPage() {
  const [limit, setLimit] = useState(4);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  const runSync = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const qs = code ? `code=${encodeURIComponent(code)}` : `limit=${limit}`;
      const res = await fetch(`/api/mssql-name-sync?${qs}`, { method: "POST" });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      if (!res.ok) throw new Error(data?.error || data?.raw || "Hata");
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Hata");
    } finally {
      setLoading(false);
    }
  };

  const runBatch = async () => {
    setBatchRunning(true);
    setError(null);
    setResult(null);
    setLogs([]);
    try {
      let cursor: string | null = null;
      let keep = true;
      while (keep) {
        const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
        const res = await fetch(`/api/mssql-name-sync-batch${qs}`, { method: "POST" });
        const text = await res.text();
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = { raw: text };
        }
        if (!res.ok) throw new Error(data?.error || data?.raw || "Hata");
        setLogs((prev) => [...prev, data]);
        cursor = data.nextCursor || null;
        keep = !!cursor && data.processed > 0;
        if (!keep) {
          setResult(data);
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (e: any) {
      setError(e?.message || "Hata");
    } finally {
      setBatchRunning(false);
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">MSSQL Ürün İsmi Eşleştirme</h1>
      <p className="text-sm text-black/60">
        Netsis stok kodu dolu, adı boş ürünler için TBLSTSABIT.STOK_ADI değerini çekip products.name alanına yazar.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-black/70">Limit</label>
        <input
          type="number"
          min={1}
          max={50}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value) || 1)}
          className="w-24 rounded border px-2 py-1 text-sm"
          disabled={!!code}
        />
        <label className="text-sm text-black/70">Tek kod</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="R H 212 OBR"
          className="w-48 rounded border px-2 py-1 text-sm"
        />
        <button
          onClick={runSync}
          disabled={loading}
          className="rounded bg-black text-white px-3 py-2 text-sm disabled:opacity-50"
        >
          {loading ? "Çalışıyor..." : "Eşleştir"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={runBatch}
          disabled={batchRunning}
          className="rounded bg-emerald-600 text-white px-3 py-2 text-sm disabled:opacity-50"
        >
          {batchRunning ? "Batch çalışıyor..." : "Batch (ad boş) eşleştir"}
        </button>
        <span className="text-xs text-black/50">Limit: 300, tüm ürün isimlerini yeniler.</span>
      </div>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
      {result ? (
        <div className="rounded border p-3 text-sm space-y-2 bg-white">
          <div>İstenen: {result.requested} | Güncellenen: {result.matched} | Eksik: {result.missing}</div>
          {result.updated?.length ? (
            <div>
              <div className="font-semibold">Güncellenenler</div>
              <ul className="list-disc list-inside space-y-1">
                {result.updated.map((u: any) => (
                  <li key={u.id}>{u.code} → {u.name}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.missingCodes?.length ? (
            <div>
              <div className="font-semibold">Bulunamadı</div>
              <ul className="list-disc list-inside space-y-1 text-black/70">
                {result.missingCodes.map((c: string) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {logs.length ? (
        <div className="rounded border p-3 text-xs space-y-1 bg-white/60 max-h-72 overflow-auto">
          <div className="font-semibold">Batch log</div>
          {logs.map((l, idx) => (
            <div key={idx} className="border-b pb-1">
              <div>Run {idx + 1}: processed {l.processed}, matched {l.matched}, remaining {l.remaining}</div>
              {l.updated?.length ? (
                <div className="text-black/70">
                  {l.updated.slice(0, 5).map((u: any) => (
                    <span key={u.id} className="mr-2">
                      {u.code}:{u.name}({u.status})
                    </span>
                  ))}
                  {l.updated.length > 5 ? ` ... ${l.updated.length - 5} daha` : ""}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
