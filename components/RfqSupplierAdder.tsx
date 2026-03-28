"use client";

import { useMemo, useState } from "react";

type SupplierOption = {
  id: string;
  name: string;
};

export default function RfqSupplierAdder({
  rfqId,
  suppliers,
}: {
  rfqId: string;
  suppliers: SupplierOption[];
}) {
  const options = useMemo(
    () => [...suppliers].sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [suppliers]
  );
  const [supplierId, setSupplierId] = useState<string>(options[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!supplierId || loading) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rfq/supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfq_id: rfqId, supplier_id: supplierId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "Tedarikci eklenemedi");
        return;
      }
      if (typeof window !== "undefined") window.location.reload();
    } catch (error) {
      console.error("[rfq-supplier-add]", error);
      setMessage("Tedarikci eklenemedi");
    } finally {
      setLoading(false);
    }
  };

  if (!options.length) {
    return <p className="text-xs text-black/45">Eklenebilecek tedarikci kalmadi.</p>;
  }

  return (
    <div className="space-y-2 rounded-2xl border border-black/10 bg-black/5 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/50">Tedarikci ekle</p>
      <div className="flex gap-2">
        <select
          className="min-w-0 flex-1 rounded-xl border border-black/15 bg-white px-3 py-2 text-sm"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          disabled={loading}
        >
          {options.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAdd}
          disabled={loading || !supplierId}
          className="rounded-full border border-black/15 bg-white px-4 py-2 text-xs font-semibold text-black/70 disabled:opacity-50"
        >
          {loading ? "Ekleniyor..." : "Ekle"}
        </button>
      </div>
      {message ? <p className="text-xs text-red-600">{message}</p> : null}
    </div>
  );
}
