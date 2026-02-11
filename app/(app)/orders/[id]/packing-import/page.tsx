"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type ImportRow = {
  boxCount: number | null;
  productCode: string;
  qtyPerBox: number | null;
  netWeight: number | null;
  grossWeight: number | null;
};

type AggregatedRow = {
  productCode: string;
  totalBoxes: number;
  totalQty: number;
  totalNet: number;
  totalGross: number;
};

const parseNumber = (value: string | null | undefined) => {
  if (!value) return null;
  let text = value.trim().replace(/\s+/g, "");
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  if (hasComma && hasDot) {
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    if (lastComma > lastDot) {
      text = text.replace(/\./g, "");
      text = text.replace(/,/g, ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    text = text.replace(/\./g, "");
    text = text.replace(/,/g, ".");
  } else if (hasDot) {
    text = text.replace(/\.(?=.*\.)/g, "");
  }
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const detectDelimiter = (text: string) => {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length);
  if (!firstLine) return ";";
  if (firstLine.includes(";")) return ";";
  if (firstLine.includes("\t")) return "\t";
  return ",";
};

const parseRows = (text: string): ImportRow[] => {
  const delimiter = detectDelimiter(text);
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
  return lines
    .map((line) => line.split(delimiter).map((item) => item.trim()))
    .map((cols, index) => {
      const [boxCountRaw, productCodeRaw, qtyRaw, netRaw, grossRaw] = cols;
      const productCode = productCodeRaw ?? "";
      if (!productCode || productCode.toLowerCase().includes("urun")) {
        if (index === 0) return null; // header satiri atla
      }
      return {
        boxCount: parseNumber(boxCountRaw),
        productCode,
        qtyPerBox: parseNumber(qtyRaw),
        netWeight: parseNumber(netRaw),
        grossWeight: parseNumber(grossRaw),
      };
    })
    .filter((row): row is ImportRow => Boolean(row?.productCode));
};

const aggregateRows = (rows: ImportRow[]): AggregatedRow[] => {
  const map = new Map<string, AggregatedRow>();
  rows.forEach((row) => {
    const boxMultiplier = row.boxCount && row.boxCount > 0 ? row.boxCount : 0;
    const valueMultiplier = row.boxCount && row.boxCount > 0 ? row.boxCount : 1;
    const key = row.productCode;
    const current = map.get(key) ?? {
      productCode: key,
      totalBoxes: 0,
      totalQty: 0,
      totalNet: 0,
      totalGross: 0,
    };
    current.totalBoxes += boxMultiplier;
    current.totalQty += (row.qtyPerBox ?? 0) * valueMultiplier;
    if (row.netWeight !== null) current.totalNet += (row.netWeight ?? 0) * valueMultiplier;
    if (row.grossWeight !== null) current.totalGross += (row.grossWeight ?? 0) * valueMultiplier;
    map.set(key, current);
  });
  return Array.from(map.values());
};

const fmt = (value: number | null) => {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export default function PackingImportPage() {
  const params = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const orderId = Array.isArray(params?.id) ? params?.id?.[0] : params?.id;
  const supplierId = search.get("supplier") ?? undefined;

  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "ready" | "submitting">("idle");

  const aggregated = useMemo(() => aggregateRows(rows), [rows]);
  const totals = useMemo(
    () =>
      aggregated.reduce(
        (acc, row) => {
          acc.totalBoxes += row.totalBoxes;
          acc.totalQty += row.totalQty;
          return acc;
        },
        { totalBoxes: 0, totalQty: 0, totalNet: 0, totalGross: 0 }
      ),
    [aggregated]
  );

  const handleFile = (file: File) => {
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setRawText(text);
      const parsed = parseRows(text);
      setRows(parsed);
      setStatus(parsed.length ? "ready" : "idle");
    };
    reader.readAsText(file);
  };

  const handleParse = () => {
    setError(null);
    const parsed = parseRows(rawText);
    setRows(parsed);
    setStatus(parsed.length ? "ready" : "idle");
  };

  const handleImport = async () => {
    if (!orderId || !rows.length) return;
    setStatus("submitting");
    setError(null);
    try {
      const response = await fetch("/api/packing-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          supplierId,
          fileName,
          rows,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Import basarisiz");
      }
      router.push(`/orders/${orderId}?tab=packing`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import basarisiz");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Packing list import
          </p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">
            CSV yukleme sihirbazi
          </h1>
          <p className="text-sm text-black/60">
            Format:{" "}
            <span className="font-semibold">
              KoliSayisi, UrunKodu, KolidekiAdet, NetKg, BrutKg
            </span>
          </p>
        </div>
        {orderId ? (
          <Link
            href={`/orders/${orderId}?tab=packing`}
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
          >
            Siparise don
          </Link>
        ) : null}
      </div>

      {!orderId ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Siparis bulunamadi.
        </div>
      ) : null}

      <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold cursor-pointer">
            Dosya sec (CSV)
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
          <button
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
            onClick={handleParse}
          >
            Yapistirilan metni tara
          </button>
          <span className="text-xs text-black/60">Ornek: 12, ABC-001, 48, 10.5, 11</span>
        </div>

        <textarea
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder="CSV verisini buraya yapistirin..."
          rows={8}
          className="w-full rounded-2xl border border-black/10 bg-[var(--sand)]/30 px-4 py-3 text-sm"
        />

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="rounded-2xl border border-black/10 bg-[var(--sky)]/40 px-4 py-3 text-xs text-black/70">
          <div className="flex flex-wrap gap-4">
            <span>Ham satir: {rows.length}</span>
            <span>Urun grubu: {aggregated.length}</span>
            <span>Toplam koli: {fmt(totals.totalBoxes)}</span>
            <span>Toplam adet: {fmt(totals.totalQty)}</span>
            <span>Toplam net: {fmt(totals.totalNet)}</span>
            <span>Toplam brüt: {fmt(totals.totalGross)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Urun toplamlari</h3>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-sm text-black/70">
              <thead className="text-left text-[11px] uppercase tracking-[0.2em] text-black/40">
                <tr>
                  <th className="py-2">Urun kodu</th>
                  <th className="py-2">Koli</th>
                  <th className="py-2">Adet</th>
                  <th className="py-2">Net</th>
                  <th className="py-2">Brüt</th>
                </tr>
              </thead>
              <tbody>
                {aggregated.length ? (
                  aggregated.map((row) => (
                    <tr key={row.productCode} className="border-b border-black/5">
                      <td className="py-2 font-semibold">{row.productCode}</td>
                      <td className="py-2">{fmt(row.totalBoxes)}</td>
                      <td className="py-2">{fmt(row.totalQty)}</td>
                      <td className="py-2">{fmt(row.totalNet)}</td>
                      <td className="py-2">{fmt(row.totalGross)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-3 text-sm text-black/50" colSpan={5}>
                      Henuz veri yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Ham satirlar (ilk 20)</h3>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-xs text-black/70">
              <thead className="text-left text-[11px] uppercase tracking-[0.2em] text-black/40">
                <tr>
                  <th className="py-2">Koli</th>
                  <th className="py-2">Urun</th>
                  <th className="py-2">Adet</th>
                  <th className="py-2">Net</th>
                  <th className="py-2">Brüt</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.slice(0, 20).map((row, index) => (
                    <tr key={`${row.productCode}-${index}`} className="border-b border-black/5">
                      <td className="py-2">{fmt(row.boxCount)}</td>
                      <td className="py-2 font-semibold">{row.productCode}</td>
                      <td className="py-2">{fmt(row.qtyPerBox)}</td>
                      <td className="py-2">{fmt(row.netWeight)}</td>
                      <td className="py-2">{fmt(row.grossWeight)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="py-3 text-sm text-black/50" colSpan={5}>
                      Henuz veri yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-black/50">
          Import butonu sadece satirlar ve siparis oldugunda aktif olur.
        </p>
        <button
          onClick={handleImport}
          disabled={!orderId || !rows.length || status === "submitting"}
          className="rounded-full bg-[var(--ocean)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {status === "submitting" ? "Içe aktariliyor..." : "Içe aktar"}
        </button>
      </div>
    </section>
  );
}
