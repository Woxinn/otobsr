"use client";

import { useState } from "react";

type RfqItem = { id: string; product_code?: string | null; product_name?: string | null };
type Supplier = { id: string; name: string };

type Props = {
  rfqId: string;
  rfqItems: RfqItem[];
  suppliers: Supplier[];
};

export default function QuoteModal({ rfqId, rfqItems, suppliers }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supplier, setSupplier] = useState<string>("");
  const [transit, setTransit] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [items, setItems] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = async () => {
    if (loading) return;
    if (!supplier) {
      setMessage("Tedarikçi seçin");
      return;
    }
    const payloadItems = rfqItems
      .map((it) => ({
        rfq_item_id: it.id,
        unit_price: Number(items[it.id] ?? 0) || null,
      }))
      .filter((p) => p.unit_price !== null);
    if (!payloadItems.length) {
      setMessage("En az bir fiyat girin");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rfq/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfq_id: rfqId,
          supplier_id: supplier,
          currency,
          transit_time: transit || null,
          items: payloadItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error ?? "Kaydedilemedi");
      } else {
        window.location.reload();
      }
    } catch {
      setMessage("Sunucu hatası");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-black/15 px-3 py-1 text-xs font-semibold text-black/70 hover:bg-black/5"
      >
        Teklif ekle
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Teklif ekle</h2>
              <button
                className="rounded-full px-3 py-1 text-sm text-black/60 hover:bg-black/5"
                onClick={() => setOpen(false)}
              >
                Kapat
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm text-black/70">
                Tedarikçi
                <select
                  className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                >
                  <option value="">Seçin</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-black/70">
                Transit time
                <input
                  className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
                  value={transit}
                  onChange={(e) => setTransit(e.target.value)}
                  placeholder="örn. 25 gün"
                />
              </label>
              <label className="text-sm text-black/70">
                Para birimi
                <select
                  className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option>USD</option>
                  <option>EUR</option>
                  <option>TRY</option>
                </select>
              </label>
            </div>

            <div className="mt-4 max-h-72 overflow-y-auto rounded-2xl border border-black/10 p-3">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-[0.18em] text-black/50">
                  <tr>
                    <th className="px-2 py-1">Kod</th>
                    <th className="px-2 py-1">Ürün</th>
                    <th className="px-2 py-1 text-right">Birim fiyat</th>
                  </tr>
                </thead>
                <tbody>
                  {rfqItems.map((it) => (
                    <tr key={it.id} className="border-b border-black/5 last:border-none">
                      <td className="px-2 py-2">{it.product_code ?? "-"}</td>
                      <td className="px-2 py-2">{it.product_name ?? "-"}</td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          step="0.0001"
                          className="w-28 rounded-lg border border-black/15 px-2 py-1 text-right text-sm"
                          value={items[it.id] ?? ""}
                          onChange={(e) => setItems((p) => ({ ...p, [it.id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              {message ? <span className="text-xs text-red-600">{message}</span> : <span />}
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white transition ${
                  loading ? "cursor-not-allowed bg-black/30" : "bg-[var(--ocean)] hover:-translate-y-0.5 shadow-sm"
                }`}
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
