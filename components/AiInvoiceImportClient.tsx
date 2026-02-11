"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const HEADER_MAP: Record<string, string[]> = {
  product_code: ["product_code", "urun_kodu", "urun kodu", "kod", "code"],
  name: ["name", "urun_adi", "urun adi", "aciklama", "description"],
  quantity: ["quantity", "adet", "miktar", "qty"],
  unit_price: ["unit_price", "birim_fiyat", "birim fiyat", "fiyat", "price"],
};

const findHeaderIndex = (headers: string[], options: string[]) => {
  const normalized = headers.map((h) => normalizeHeader(h));
  for (const option of options) {
    const idx = normalized.indexOf(normalizeHeader(option));
    if (idx >= 0) return idx;
  }
  return -1;
};

type OrderRow = {
  rowNo: number;
  product_code: string;
  name: string;
  quantity: number | null;
  unit_price: number | null;
  matched?: boolean;
  product_id?: string | null;
  matched_name?: string | null;
  matched_code?: string | null;
  error?: string | null;
};

export default function AiInvoiceImportClient({
  orders,
}: {
  orders: { id: string; name: string | null }[];
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [rawPreview, setRawPreview] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"idle" | "parsed" | "matched">("idle");

  const canParse = Boolean(file && orderId);
  const matchedCount = useMemo(
    () => rows.filter((row) => row.matched).length,
    [rows]
  );

  const handleParse = async () => {
    if (!file || !orderId) {
      addToast("Siparis ve dosya secmelisin.", "error");
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("orderId", orderId);

    try {
      const response = await fetch("/api/ai-invoice-import/parse", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Islem basarisiz");
      setRows(data.rows ?? []);
      setRawPreview(data.preview ?? []);
      setStep("parsed");
    } catch (error: any) {
      addToast(error.message ?? "Islem basarisiz", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!orderId || !rows.length) return;
    setLoading(true);
    try {
      const response = await fetch("/api/ai-invoice-import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, rows }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Islem basarisiz");
      addToast("Siparise aktarildi.", "success");
      router.push(`/orders/${orderId}`);
      router.refresh();
    } catch (error: any) {
      addToast(error.message ?? "Islem basarisiz", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Deneme Modulu
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            AI Fatura Import (Deneysel)
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Excel dosyasini yukle, satirlari eslet ve onaylayip siparise aktar.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm space-y-5">
          <div>
            <h3 className="text-lg font-semibold">Dosya yukle</h3>
            <p className="text-xs text-black/55">
              Excel formatinda fatura dosyasi.
            </p>
          </div>
          <div className="grid gap-3">
            <select
              className="rounded-2xl border border-black/10 bg-white p-3 text-sm"
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.name ?? order.id}
                </option>
              ))}
            </select>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="rounded-2xl border border-black/10 bg-white p-3 text-sm"
            />
            <button
              className="rounded-full bg-[var(--ocean)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={!canParse || loading}
              onClick={handleParse}
            >
              {loading ? "Isleniyor..." : "Dosyayi tara"}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-[var(--sky)] p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold">Eslestirme ozeti</h3>
          <div className="grid gap-3 text-sm">
            <div className="rounded-2xl border border-black/10 bg-white px-4 py-3">
              {rows.length} satir okundu
            </div>
            <div className="rounded-2xl border border-black/10 bg-white px-4 py-3">
              {matchedCount} satir otomatik eslesti
            </div>
          </div>
          <button
            className="rounded-full border border-black/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
            disabled={rows.length === 0 || loading}
            onClick={handleCommit}
          >
            Siparise aktar
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Onizleme</h3>
            <p className="text-xs text-black/55">
              Eslestirmeleri onaylamadan siparise yazilmaz.
            </p>
          </div>
        </div>

        {rawPreview.length ? (
          <div className="rounded-2xl border border-black/10 bg-[var(--sand)] p-3 text-xs text-black/70">
            <p className="mb-1 text-[10px] uppercase tracking-[0.3em] text-black/45">
              Okunan basliklar
            </p>
            {rawPreview.join(" | ")}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.25em] text-black/45">
                <th className="px-4">Satir</th>
                <th className="px-4">Urun Kodu</th>
                <th className="px-4">Fatura Adi</th>
                <th className="px-4">Adet</th>
                <th className="px-4">Birim Fiyat</th>
                <th className="px-4">Eslesme</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.rowNo}-${row.product_code}`}
                  className="bg-[var(--sky)] text-black/80 [&>td]:border [&>td]:border-black/10 [&>td]:bg-white [&>td:first-child]:rounded-l-xl [&>td:last-child]:rounded-r-xl"
                >
                  <td className="px-4 py-3 text-xs font-semibold">{row.rowNo}</td>
                  <td className="px-4 py-3 font-semibold">{row.product_code}</td>
                  <td className="px-4 py-3">{row.name || row.matched_name || "-"}</td>
                  <td className="px-4 py-3">{row.quantity ?? "-"}</td>
                  <td className="px-4 py-3">{row.unit_price ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        row.matched ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {row.matched ? "Eslesti" : "Eslmedi"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
