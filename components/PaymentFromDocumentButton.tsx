"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  orderId: string;
  documentId: string;
  storagePath: string | null;
  currency?: string | null;
};

export default function PaymentFromDocumentButton({
  orderId,
  documentId,
  storagePath,
  currency,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const run = async () => {
    if (!storagePath) {
      setError("Dosya yok");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tools/payment-from-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, documentId, storagePath, currency }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Hata");
      } else {
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.message ?? "Hata");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="rounded-lg border border-black/15 bg-white px-2 py-1 text-[11px] font-semibold text-black hover:bg-[var(--mint)]/40 disabled:opacity-50"
      >
        {loading ? "Oluşturuluyor..." : "PDF’den ödeme oluştur"}
      </button>
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
    </div>
  );
}
