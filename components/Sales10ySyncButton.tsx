"use client";

import { useState, useTransition } from "react";

type ImportRow = { stok_kodu: string; total_10y: number };

const normalizeHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i");

const normalizeCode = (value: string) => value.trim().toUpperCase();

const parseNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const chunk = <T,>(arr: T[], size = 400) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const parseRowsFromText = (text: string) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => line.split(/[;,]/).map((cell) => cell.trim()));
};

const parseImportFile = async (file: File): Promise<ImportRow[]> => {
  const filename = file.name.toLowerCase();
  let rows: string[][] = [];

  if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const parsed = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    });
    rows = parsed.map((row) => row.map((cell) => String(cell ?? "").trim()));
  } else {
    rows = parseRowsFromText(await file.text());
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => normalizeHeader(String(h)));
  const codeIdx = headers.findIndex((h) =>
    ["stok_kodu", "stock_code", "code", "netsis_stok_kodu", "stok kodu"].includes(h)
  );
  const qtyIdx = headers.findIndex((h) =>
    [
      "adet",
      "qty",
      "miktar",
      "total_10y",
      "sales10y",
      "satis_10y",
      "10y",
      "toplam",
    ].includes(h)
  );
  if (codeIdx < 0 || qtyIdx < 0) {
    throw new Error("Baslik bulunamadi (stok_kodu + adet/total_10y)");
  }

  const totalsByCode = new Map<string, number>();
  rows.slice(1).forEach((row) => {
    const code = normalizeCode(String(row[codeIdx] ?? ""));
    if (!code) return;
    const qty = parseNumber(row[qtyIdx]);
    if (qty === null) return;
    totalsByCode.set(code, (totalsByCode.get(code) ?? 0) + qty);
  });

  return Array.from(totalsByCode.entries()).map(([stok_kodu, total_10y]) => ({
    stok_kodu,
    total_10y,
  }));
};

export default function Sales10ySyncButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    percent: number;
  } | null>(null);
  const [productId, setProductId] = useState<string>("930e3ba9-9514-4615-b22e-d333780a92d6");
  const [mode, setMode] = useState<"single" | "all">("single");

  const handleSync = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        const body = mode === "single" ? { product_id: productId } : {};
        const res = await fetch("/api/sales-10y-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const resp = await res.json().catch(() => ({}));
          setMessage(resp.error ? `Hata: ${resp.error}` : `Hata: ${res.status}`);
          return;
        }
        const resp = await res.json();
        if (Array.isArray(resp)) {
          const first = resp[0];
          setMessage(
            `Tamamlandi. ${resp.length} kayit. Ornek: ${first ? `${first.db ?? "-"} / ${first.code ?? "-"} / ${first.total ?? 0}` : "-"}`
          );
        } else {
          setMessage("Tamamlandi.");
        }
      } catch (err: unknown) {
        setMessage(`Hata: ${(err as Error).message}`);
      }
    });
  };

  const handleImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formEl = event.currentTarget;
    setImportMessage(null);
    setImportProgress(null);
    const formData = new FormData(formEl);
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      setImportMessage("Hata: Dosya seciniz.");
      return;
    }

    setImporting(true);
    try {
      const parsedRows = await parseImportFile(file as File);
      if (!parsedRows.length) {
        throw new Error("Dosyada gecerli satir bulunamadi.");
      }

      const parts = chunk(parsedRows, 400);
      let upserted = 0;
      let unmatched = 0;

      for (let i = 0; i < parts.length; i += 1) {
        const res = await fetch("/api/sales-10y-import/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: parts[i] }),
        });
        const resp = await res.json().catch(() => ({}));
        if (!res.ok || resp?.error) {
          throw new Error(resp?.error ?? `Import chunk hatasi (${i + 1}/${parts.length})`);
        }
        upserted += Number(resp.upsertedProducts ?? 0);
        unmatched += Number(resp.unmatchedCount ?? 0);
        const current = i + 1;
        setImportProgress({
          current,
          total: parts.length,
          percent: Math.round((current / parts.length) * 100),
        });
      }

      setImportMessage(
        `Tamamlandi. Islenen kod: ${parsedRows.length}, upsert: ${upserted}, eslesmeyen: ${unmatched}`
      );
      formEl.reset();
    } catch (err: unknown) {
      setImportMessage(`Hata: ${(err as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-black/50">10 yillik satis</p>
          <p className="text-sm font-semibold text-black">Supabase'e senkronize et</p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2 text-xs font-semibold text-black/70">
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="sync-mode"
                checked={mode === "single"}
                onChange={() => setMode("single")}
              />
              Tek urun
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                name="sync-mode"
                checked={mode === "all"}
                onChange={() => setMode("all")}
              />
              Tum urunler
            </label>
          </div>
          {mode === "single" ? (
            <input
              type="text"
              className="w-[320px] rounded-xl border border-black/15 px-3 py-2 text-xs"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="product_id (uuid)"
            />
          ) : null}
          <button
            type="button"
            onClick={handleSync}
            disabled={pending}
            className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Senkronize ediliyor..." : "Senkronize et"}
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-xs text-black/70">{message}</p> : null}

      <form onSubmit={handleImport} className="mt-4 rounded-2xl border border-black/10 bg-[var(--sand)]/30 p-3">
        <p className="text-xs font-semibold text-black/70">
          Manuel import (stok_kodu + adet/total_10y)
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="file"
            name="file"
            accept=".csv,.xlsx,.xls"
            className="text-xs"
            required
          />
          <button
            type="submit"
            disabled={importing}
            className="rounded-full border border-black/20 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {importing ? "Import ediliyor..." : "Import et"}
          </button>
        </div>
        {importProgress ? (
          <div className="mt-2">
            <div className="h-2 overflow-hidden rounded-full bg-black/10">
              <div
                className="h-full bg-[var(--ocean)] transition-all"
                style={{ width: `${importProgress.percent}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-black/60">
              Ilerleme: {importProgress.current}/{importProgress.total} chunk (%{importProgress.percent})
            </p>
          </div>
        ) : null}
        {importMessage ? <p className="mt-2 text-xs text-black/70">{importMessage}</p> : null}
      </form>
    </div>
  );
}

