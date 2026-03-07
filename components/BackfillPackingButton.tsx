"use client";

import { useState } from "react";

type Props = {
  limit?: number;
};

export default function BackfillPackingButton({ limit = 1000 }: Props) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tools/backfill-packing-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, offset: 0 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error ?? "Başarısız");
      } else {
        setMessage(`Processed: ${data.processed}. ${data.remainingHint ?? ""}`);
      }
    } catch (err: any) {
      setMessage(err?.message ?? "Hata");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-black/10 bg-white/70 px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-black">Packing Summary Backfill</p>
          <p className="text-xs text-black/60">
            Eski siparişlerin net/brüt ağırlık özetini yeniden hesaplar (limit {limit}).
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
        >
          {running ? "Çalışıyor..." : "Backfill çalıştır"}
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-black/70">{message}</p>}
    </div>
  );
}
