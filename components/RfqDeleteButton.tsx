"use client";

import { useState } from "react";
import { useToast } from "./ToastProvider";

export default function RfqDeleteButton({ rfqId }: { rfqId: string }) {
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const handle = async () => {
    const ok = window.confirm("RFQ'yi silmek istiyor musun? İlgili teklif ve satırlar da silinir.");
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetch("/api/rfq/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfq_id: rfqId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409) {
          addToast("Bağlı sipariş olduğu için silinememektedir.", "error");
        } else {
          addToast(data?.error ?? "Silinemedi", "error");
        }
      } else {
        addToast("RFQ silindi", "success");
        window.location.reload();
      }
    } catch (e) {
      console.error("[rfq-delete]", e);
      addToast("Sunucu hatası", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={loading}
      className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
    >
      {loading ? "Siliniyor..." : "Sil"}
    </button>
  );
}
