"use client";

import { useState } from "react";

export default function ProductTypesImportForm() {
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const file = form.file?.files?.[0];
    if (!file) {
      setStatus("Dosya seçiniz.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setPending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/product-types/import", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus(json?.error ?? "Import hatası");
      } else {
        setStatus(`Import ok: ${json.imported} satır`);
        window.location.reload();
      }
    } catch (err: any) {
      setStatus(String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Excel import</p>
          <p className="text-xs text-black/60">
            Şablon: Tip, Ülke, TSE, Analiz tarihi, TAREKS, Rapor, Geçerlilik (CSV veya XLSX)
          </p>
        </div>
        <a
          href="/api/product-types/template"
          className="rounded-full border border-black/20 px-4 py-2 text-xs font-semibold transition hover:border-black/40"
        >
          Şablonu indir
        </a>
      </div>
      <input
        type="file"
        name="file"
        accept=".xlsx,.xls,.csv,.txt"
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
      >
        {pending ? "İçe aktarılıyor..." : "İçe aktar"}
      </button>
      {status ? <p className="text-xs text-black/70">{status}</p> : null}
    </form>
  );
}
