"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "./ToastProvider";

type Item = {
  id: string;
  product_code?: string | null;
  product_name?: string | null;
  quantity?: number | null;
  price?: number | null;
};

type Props = {
  rfqId: string;
  supplierId: string | null;
  currency?: string | null;
  items: Item[];
};

export default function RfqConvertModal({ rfqId, supplierId, currency, items }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"Taslak" | "Siparis Verildi">("Siparis Verildi");
  const [rows, setRows] = useState<{ id: string; qty: number; price: number | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [availability, setAvailability] = useState<Record<string, { transit: number; open: number; stock: number | null }>>(
    {}
  );
  const { addToast } = useToast();

  useEffect(() => {
    setRows(
      items.map((it) => ({
        id: it.id,
        qty: Number(it.quantity ?? 0),
        price: it.price ?? null,
      }))
    );
  }, [items]);

  const fetchAvailability = async () => {
    if (!items.length) return;
    setLoadingInfo(true);
    try {
      const res = await fetch("/api/products/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: items.map((i) => i.id) }),
      });
      const data = await res.json();
      if (res.ok && data?.items) {
        const map: Record<string, any> = {};
        data.items.forEach((it: any) => {
          map[it.product_id] = { transit: Number(it.transit_qty ?? 0), open: Number(it.open_order_qty ?? 0), stock: it.stock_qty ?? null };
        });
        setAvailability(map);
      }
    } catch (e) {
      console.error("[availability]", e);
    } finally {
      setLoadingInfo(false);
    }
  };

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + (Number(r.price ?? 0) * Number(r.qty ?? 0) || 0), 0);
    return { total };
  }, [rows]);

  const handleSubmit = async () => {
    if (!supplierId) {
      addToast("Önce kazanan tedarikçiyi seç", "error");
      return;
    }
    const missingPrice = rows.find((r) => r.price === null);
    if (missingPrice) {
      addToast("Fiyatı boş ürün var", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/rfq/convert-to-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rfq_id: rfqId,
          supplier_id: supplierId,
          status,
          items: rows.map((r) => ({ rfq_item_id: r.id, quantity: r.qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data?.error ?? "Sipariş oluşturulamadı", "error");
        return;
      }
      addToast("Sipariş oluşturuldu", "success");
      if (data?.order_id) window.location.href = `/orders/${data.order_id}`;
    } catch (e) {
      console.error("[rfq-convert]", e);
      addToast("Sunucu hatası", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          fetchAvailability();
        }}
        disabled={!supplierId}
        className="rounded-full border border-[var(--ocean)] bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-black/20 disabled:border-black/10"
      >
        Siparişe dönüştür
      </button>
      {open ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl border border-black/10 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Siparişe dönüştür</h2>
                <p className="text-xs text-black/50">Para birimi: {currency ?? "-"}</p>
              </div>
              <button
                type="button"
                className="rounded-full px-3 py-1 text-sm text-black/60 hover:bg-black/5"
                onClick={() => setOpen(false)}
              >
                Kapat
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="order_status"
                  value="Siparis Verildi"
                  checked={status === "Siparis Verildi"}
                  onChange={() => setStatus("Siparis Verildi")}
                />
                Direkt sipariş
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="order_status"
                  value="Taslak"
                  checked={status === "Taslak"}
                  onChange={() => setStatus("Taslak")}
                />
                Taslak
              </label>
            </div>

            <div className="mt-4 max-h-80 overflow-auto rounded-2xl border border-black/10">
              <table className="w-full text-sm">
                <thead className="bg-black/5 text-left text-[11px] uppercase tracking-[0.2em] text-black/50">
                  <tr>
                    <th className="px-3 py-2">Kod</th>
                    <th className="px-3 py-2">Ürün</th>
                    <th className="px-3 py-2 text-right">Miktar</th>
                    <th className="px-3 py-2 text-right">Stok/Transit/Açık</th>
                    <th className="px-3 py-2 text-right">Fiyat</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const row = rows.find((r) => r.id === it.id) ?? { qty: 0, price: null };
                    const av = availability[it.id] ?? { transit: 0, open: 0, stock: null };
                    const needed = Number(row.qty ?? 0);
                    const cover = (av.stock ?? 0) + av.transit + av.open;
                    const warn = needed > cover;
                    return (
                      <tr key={it.id} className="border-b border-black/5 last:border-none">
                        <td className="px-3 py-2">{it.product_code ?? "-"}</td>
                        <td className="px-3 py-2">{it.product_name ?? "-"}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            className="w-24 rounded-lg border border-black/15 px-2 py-1 text-right"
                            value={row.qty}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r) => (r.id === it.id ? { ...r, qty: Number(e.target.value) } : r))
                              )
                            }
                          />
                        </td>
                        <td className={`px-3 py-2 text-right text-xs ${warn ? "text-red-600 font-semibold" : "text-black/60"}`}>
                          {av.stock ?? 0} / {av.transit} / {av.open}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            className="w-24 rounded-lg border border-black/15 px-2 py-1 text-right"
                            value={row.price ?? ""}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r) =>
                                  r.id === it.id ? { ...r, price: e.target.value === "" ? null : Number(e.target.value) } : r
                                )
                              )
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <div className="text-black/60">
                Toplam: {totals.total.toFixed(2)} {currency ?? ""}
                {loadingInfo ? " (stok hesaplanıyor...)" : ""}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-black/15 px-3 py-1 text-sm text-black/70"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="rounded-full border border-[var(--ocean)] bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-black/20"
                >
                  {loading ? "Oluşturuluyor..." : "Siparişe dönüştür"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
