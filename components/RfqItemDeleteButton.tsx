"use client";

import { useState } from "react";
import { useToast } from "./ToastProvider";

type Props = {
  rfqId: string;
  rfqItemId: string;
  productCode?: string | null;
};

export default function RfqItemDeleteButton({ rfqId, rfqItemId, productCode }: Props) {
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const handleDelete = async () => {
    const label = productCode ? `${productCode} urununu` : "bu urunu";
    const ok = window.confirm(`${label} RFQ'dan silmek istiyor musun? Ilgili teklif satirlari da silinir.`);
    if (!ok || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/rfq/item", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfq_id: rfqId, rfq_item_id: rfqItemId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        addToast(data?.error ?? "Urun silinemedi", "error");
        return;
      }
      addToast("Urun RFQ'dan silindi", "success");
      window.location.reload();
    } catch (error) {
      console.error("[rfq-item-delete]", error);
      addToast("Sunucu hatasi", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
    >
      {loading ? "Siliniyor..." : "Sil"}
    </button>
  );
}
