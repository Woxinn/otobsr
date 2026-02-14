"use client";

import { useMemo, useState } from "react";

type Supplier = { id: string; name: string };

type Props = {
  suppliers: Supplier[];
};

type FormState = {
  title: string;
  notes: string;
  due: string;
  currency: string;
  incoterm: string;
  supplierIds: string[];
};

const currencyOptions = ["USD", "EUR", "TRY"];
const incotermOptions = ["EXW", "FOB", "CFR", "CIF", "DAP", "DDP"];

export default function RfqCreateModal({ suppliers }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    title: "",
    notes: "",
    due: "",
    currency: "USD",
    incoterm: "FOB",
    supplierIds: [],
  });

  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const toggleSupplier = (id: string) => {
    setForm((prev) => {
      const exists = prev.supplierIds.includes(id);
      return {
        ...prev,
        supplierIds: exists ? prev.supplierIds.filter((x) => x !== id) : [...prev.supplierIds, id],
      };
    });
  };

  const handleSubmit = async () => {
    if (loading) return;
    const selected = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="plan_select"]:checked')
    );
    const ids = selected.map((el) => el.value);
    if (!ids.length) {
      setMessage("Ürün seçin");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const payload = {
        product_ids: ids,
        title: form.title,
        notes: form.notes,
        response_due_date: form.due || null,
        currency: form.currency || null,
        incoterm: form.incoterm || null,
        supplier_ids: form.supplierIds,
      };
      console.debug("[rfq-create] payload", payload);
      const res = await fetch("/api/rfq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // keep raw text
      }
      console.debug("[rfq-create] response", res.status, text);
      if (!res.ok) {
        setMessage(data?.error ?? text ?? "RFQ oluşturulamadı");
      } else if (data?.id) {
        window.location.href = `/rfqs/${data.id}`;
      } else {
        setMessage("Beklenmeyen yanıt");
      }
    } catch (err: any) {
      setMessage(`Sunucu hatası: ${err?.message ?? err}`);
      console.error("[rfq-create] error", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-2xl bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
      >
        Seçilenlerle RFQ oluştur
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Yeni RFQ</h2>
              <button
                type="button"
                className="rounded-full px-3 py-1 text-sm text-black/60 hover:bg-black/5"
                onClick={() => setOpen(false)}
              >
                Kapat
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm text-black/70">
                Başlık
                <input
                  className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                />
              </label>
              <label className="text-sm text-black/70">
                Son yanıt tarihi
                <input
                  type="date"
                  className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
                  value={form.due}
                  onChange={(e) => setForm((p) => ({ ...p, due: e.target.value }))}
                />
              </label>
              <label className="text-sm text-black/70">
                Para birimi
                <select
                  className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
                  value={form.currency}
                  onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                >
                  {currencyOptions.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-black/70">
                Incoterm
                <select
                  className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
                  value={form.incoterm}
                  onChange={(e) => setForm((p) => ({ ...p, incoterm: e.target.value }))}
                >
                  {incotermOptions.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="md:col-span-2 text-sm text-black/70">
                Notlar
                <textarea
                  className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </label>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/50">
                Hedef tedarikçiler
              </p>
              <div className="mt-2 grid max-h-44 grid-cols-2 gap-2 overflow-y-auto rounded-2xl border border-black/10 p-3">
                {suppliers.map((s) => {
                  const checked = form.supplierIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                        checked ? "border-[var(--ocean)] bg-[var(--ocean)]/5" : "border-black/10"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--ocean)]"
                        checked={checked}
                        onChange={() => toggleSupplier(s.id)}
                      />
                      <span className="truncate">{supplierMap.get(s.id) ?? s.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
              {message ? <span className="text-xs text-red-600">{message}</span> : <span />}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white transition ${
                  loading ? "cursor-not-allowed bg-black/30" : "bg-[var(--ocean)] hover:-translate-y-0.5 shadow-sm"
                }`}
              >
                {loading ? "Gönderiliyor..." : "RFQ oluştur"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
