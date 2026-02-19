"use client";

import { useState } from "react";
import * as XLSX from "xlsx";

type Props = {
  rfqId: string;
};

export default function RfqImportModal({ rfqId }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [pendingMissing, setPendingMissing] = useState<string[] | null>(null);
  const [pendingAmbiguous, setPendingAmbiguous] = useState<
    { input: string; options: { id: string; name: string }[]; chosen?: string }[] | null
  >(null);

  const handleImport = async (addMissing = false, supplierMap?: Record<string, string>) => {
    if (loading) return;
    setLoading(true);
    setMessage(null);
    try {
      const rows = parseCsv(text);
      if (!rows.length) {
        setMessage("Geçerli CSV yok (satır bulunamadı).");
        setLoading(false);
        return;
      }
      console.debug("[rfq-import] parsed rows", rows.length);
      const res = await fetch("/api/rfq/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfq_id: rfqId, rows, add_missing_products: addMissing, supplier_map: supplierMap }),
      });
      const textResp = await res.text();
      let data: any = null;
      try {
        data = textResp ? JSON.parse(textResp) : null;
      } catch {
        /* ignore */
      }
      console.debug("[rfq-import] api response", res.status, textResp);
      if (res.status === 422 && data?.need_confirmation) {
        setPendingMissing(data?.missing_products ?? []);
        setMessage(data?.message ?? "Eksik ürünler var");
      } else if (res.status === 422 && data?.need_supplier_choice) {
        setPendingAmbiguous(
          (data?.ambiguous_suppliers ?? []).map((a: any) => ({
            input: a.input,
            options: a.options ?? [],
            chosen: undefined,
          }))
        );
        setMessage(data?.message ?? "Tedarikçi seçin");
      } else if (!res.ok) {
        setMessage(data?.error ?? textResp ?? "İçe aktarılamadı");
        setPendingMissing(null);
        setPendingAmbiguous(null);
      } else {
        setResult(data);
        setMessage("İçe aktarma tamamlandı");
        setPendingMissing(null);
        setPendingAmbiguous(null);
      }
    } catch (err: any) {
      setMessage(err?.message ?? "Beklenmeyen hata");
      console.error("[rfq-import] error", err);
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
        Import / Belge
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">RFQ Import</h2>
              <button
                className="rounded-full px-3 py-1 text-sm text-black/60 hover:bg-black/5"
                onClick={() => setOpen(false)}
              >
                Kapat
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-black/60">
              <span>
                CSV formatı: product_code,supplier_name,unit_price,currency,quantity,transit_days,min_order,delivery_time,validity_date,notes
              </span>
              <a
                href={`/api/rfq/import/template?rfq_id=${encodeURIComponent(rfqId)}`}
                className="rounded-full border border-black/15 px-3 py-1 text-[11px] font-semibold text-black/70 hover:bg-black/5"
              >
                Şablon indir (XLSX)
              </a>
            </div>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-3">
                <input
                  type="file"
                  accept=".csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="text-sm"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setFileName(file.name);
                    const ext = file.name.toLowerCase();
                    if (ext.endsWith(".csv")) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const content = String(ev.target?.result ?? "");
                        setText(content);
                      };
                      reader.readAsText(file, "utf-8");
                    } else {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const data = ev.target?.result;
                        if (!data) return;
                        const wb = XLSX.read(data, { type: "array" });
                        const ws = wb.Sheets[wb.SheetNames[0]];
                        const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" }); // noktalı virgül ayırıcı
                        setText(csv);
                      };
                      reader.readAsArrayBuffer(file);
                    }
                  }}
                />
                <span className="text-black/60">{fileName}</span>
              </label>
              <span className="text-xs text-black/50">Alternatif: aşağıya yapıştırarak da yükleyebilirsiniz.</span>
            </div>
            <textarea
              className="mt-3 h-48 w-full rounded-2xl border border-black/15 px-3 py-2 text-sm font-mono"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="product_code,supplier_name,unit_price,currency,quantity&#10;ABC-01,Supplier A,1.2,USD,100"
            />
            <div className="mt-3 flex items-center justify-between">
              {message ? <span className="text-xs text-red-600">{message}</span> : <span />}
              <button
                type="button"
                onClick={() => handleImport()}
                disabled={loading}
                className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white transition ${
                  loading ? "cursor-not-allowed bg-black/30" : "bg-[var(--ocean)] hover:-translate-y-0.5 shadow-sm"
                }`}
              >
                {loading ? "İçe aktarılıyor..." : "İçe aktar"}
              </button>
            </div>
            {result ? (
              <div className="mt-4 rounded-2xl bg-black/5 p-3 text-sm text-black/70">
                <div>Eklenen fiyat satırı: {result.inserted_quote_items ?? 0}</div>
                {result.missing_products?.length ? (
                  <div className="mt-2">
                    Eksik ürünler: {result.missing_products.join(", ")}
                  </div>
                ) : null}
                {result.missing_suppliers?.length ? (
                  <div className="mt-2">
                    Eksik tedarikçiler: {result.missing_suppliers.join(", ")}
                  </div>
                ) : null}
                {result.debug ? (
                  <pre className="mt-2 whitespace-pre-wrap text-[11px] text-black/60">
{JSON.stringify(result.debug, null, 2)}
                  </pre>
                ) : null}
              </div>
            ) : null}
            {pendingMissing && (
              <div className="mt-3 rounded-2xl border border-[var(--ocean)]/40 bg-[var(--ocean)]/5 p-3 text-sm text-black/80">
                <div className="font-semibold">Eksik ürünler eklensin mi?</div>
                <div className="text-xs text-black/60 mt-1">{pendingMissing.join(", ")}</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-[var(--ocean)] px-3 py-1 text-xs font-semibold text-white"
                    onClick={() => handleImport(true, pendingAmbiguousMap())}
                  >
                    Ekle ve devam et
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-black/15 px-3 py-1 text-xs font-semibold text-black/70"
                    onClick={() => setPendingMissing(null)}
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            )}
            {pendingAmbiguous && (
              <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-black/80">
                <div className="font-semibold">Tedarikçi eşleştirme yapın</div>
                <div className="mt-2 space-y-2">
                  {pendingAmbiguous.map((amb, idx) => (
                    <div key={idx} className="rounded-xl border border-black/10 bg-white px-3 py-2">
                      <div className="text-xs text-black/60">Gelen isim: {amb.input}</div>
                      <select
                        className="mt-1 w-full rounded-lg border border-black/15 px-2 py-1 text-sm"
                        value={amb.chosen ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPendingAmbiguous((prev) =>
                            prev?.map((p, i) => (i === idx ? { ...p, chosen: val || undefined } : p)) ?? null
                          );
                        }}
                      >
                        <option value="">Seçin</option>
                        {amb.options.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded-xl bg-[var(--ocean)] px-3 py-1 text-xs font-semibold text-white"
                    onClick={() => {
                      const map = pendingAmbiguousMap();
                      if (!map) {
                        setMessage("Tüm tedarikçiler için seçim yapın");
                        return;
                      }
                      handleImport(false, map);
                    }}
                  >
                    Seç ve devam et
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-black/15 px-3 py-1 text-xs font-semibold text-black/70"
                    onClick={() => setPendingAmbiguous(null)}
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function pendingAmbiguousMap(
  pending?: { input: string; options: { id: string; name: string }[]; chosen?: string }[] | null
): Record<string, string> | undefined {
  const list = pending ?? [];
  if (!list.length) return undefined;
  const map: Record<string, string> = {};
  for (const amb of list) {
    if (!amb.chosen) return undefined;
    map[amb.input.toLowerCase()] = amb.chosen;
  }
  return map;
}

function parseCsv(raw: string): any[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const delimiter = ";"; // zorunlu noktalı virgül
  let header = lines[0].split(delimiter).map((h) => h.trim());
  const defaultHeader = [
    "product_code",
    "supplier_name",
    "unit_price",
    "currency",
    "quantity",
    "transit_days",
    "min_order",
    "delivery_time",
    "validity_date",
    "notes",
  ];
  const looksLikeHeader = header[0].includes("product") || header[0].includes("supplier");
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  if (!looksLikeHeader) header = defaultHeader;

  return dataLines.map((line) => {
    const cells = line.split(delimiter).map((c) => c.trim());
    const obj: any = {};
    header.forEach((h, idx) => {
      obj[h] = cells[idx] ?? "";
    });
    ["unit_price", "quantity", "transit_days", "min_order"].forEach((k) => {
      if (obj[k] !== undefined && obj[k] !== "") obj[k] = parseLocalizedNumber(obj[k]);
    });
    return obj;
  });
}

function parseLocalizedNumber(value: unknown): number | "" {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  const raw = String(value).trim();
  if (!raw) return "";
  const text = raw.replace(/\s+/g, "");
  const hasDot = text.includes(".");
  const hasComma = text.includes(",");
  let normalized = text;
  if (hasDot && hasComma) {
    const lastDot = text.lastIndexOf(".");
    const lastComma = text.lastIndexOf(",");
    normalized = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (hasComma) {
    normalized = text.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : "";
}

