"use client";

import { useState } from "react";

export default function ProductsAttributesExportPage() {
  const [downloading, setDownloading] = useState(false);
  const [rows, setRows] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setError(null);
    setRows(null);
    setDownloading(true);
    try {
      const res = await fetch("/api/products-attr-export");
      if (!res.ok) throw new Error(`Export başarısız (${res.status})`);
      const rowCount = Number(res.headers.get("x-row-count") ?? "0");
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename=\"?([^\";]+)\"?/i);
      const filename = match?.[1] ?? "urun-nitelik-export.xlsx";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setRows(rowCount || null);
    } catch (e: any) {
      setError(e?.message ?? "Bilinmeyen hata");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-black/40">Ürünler</p>
        <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">Ürün Nitelik Export</h1>
        <p className="text-sm text-black/60">
          Tüm ürünlerin kodu, kategorisi, tip / uzunluk / ağırlık alanlarını Supabase’den çekip Excel indirir. Limitlere takılmamak için admin key + sayfalama kullanır.
        </p>
      </div>

      <button
        onClick={handleDownload}
        disabled={downloading}
        className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
      >
        {downloading ? "Hazırlanıyor..." : "Excel indir"}
      </button>

      {rows !== null && <div className="text-sm text-[var(--ocean)]">İndirilen satır: {rows}</div>}
      {error && <div className="text-sm text-[var(--danger)] font-semibold">Hata: {error}</div>}
    </section>
  );
}
