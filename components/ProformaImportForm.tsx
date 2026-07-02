"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { useGlobalLoading } from "@/components/GlobalLoadingProvider";
import { CloudUpload, FileSpreadsheet, Trash2, Building, Hash, Calendar, DollarSign, FileText, Check, AlertCircle, Loader2 } from "lucide-react";

type Supplier = { id: string; name: string };
type ParsedRow = {
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("İ", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/[^a-z0-9]/g, "");

const findColumn = (keys: string[], candidates: string[]) => {
  const normalizedMap = new Map(keys.map((k) => [normalizeKey(k), k]));
  for (const candidate of candidates) {
    const found = normalizedMap.get(normalizeKey(candidate));
    if (found) return found;
  }
  return null;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  const text = raw.replace(/\s+/g, "");
  const hasDot = text.includes(".");
  const hasComma = text.includes(",");

  let normalized = text;
  if (hasDot && hasComma) {
    const lastDot = text.lastIndexOf(".");
    const lastComma = text.lastIndexOf(",");
    if (lastComma > lastDot) {
      normalized = text.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = text.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

async function parseFile(file: File): Promise<ParsedRow[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  if (!json.length) return [];

  const keys = Object.keys(json[0] ?? {});
  const codeKey = findColumn(keys, ["product_code", "code", "urun_kodu", "stok_kodu", "netsis_stok_kodu"]);
  const nameKey = findColumn(keys, ["product_name", "name", "urun_adi", "stok_adi"]);
  const qtyKey = findColumn(keys, ["quantity", "qty", "miktar", "adet"]);
  const unitPriceKey = findColumn(keys, ["unit_price", "price", "birim_fiyat", "fiyat"]);
  const lineTotalKey = findColumn(keys, ["line_total", "total", "satir_toplam", "tutar"]);

  if (!codeKey || !qtyKey) {
    throw new Error("Dosyada zorunlu kolonlar yok: product_code ve quantity gerekli.");
  }

  const rows: ParsedRow[] = [];
  json.forEach((row) => {
    const code = String(row[codeKey] ?? "")
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim()
      .replace(/\s+/g, " ");
    if (!code) return;
    const quantity = toNumber(row[qtyKey]);
    const unitPrice = unitPriceKey ? toNumber(row[unitPriceKey]) : 0;
    const lineTotal = lineTotalKey ? toNumber(row[lineTotalKey]) : quantity * unitPrice;
    rows.push({
      product_code: code,
      product_name: nameKey ? String(row[nameKey] ?? "").trim() : "",
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
    });
  });
  return rows;
}

export default function ProformaImportForm({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [proformaNo, setProformaNo] = useState("");
  const [proformaName, setProformaName] = useState("");
  const [proformaDate, setProformaDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [notes, setNotes] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { startLoading, updateLoading, stopLoading } = useGlobalLoading();

  const canSubmit = useMemo(
    () => Boolean(!loading && supplierId && proformaNo.trim() && rows.length),
    [loading, supplierId, proformaNo, rows.length]
  );

  const handleFile = async (file?: File) => {
    if (!file) return;
    startLoading({ label: "Proforma içe aktarma", detail: "Dosya okunuyor", progress: 16 });
    try {
      const parsed = await parseFile(file);
      setRows(parsed);
      setFileName(file.name);
      setMessage(null);
    } catch (err: any) {
      setRows([]);
      setFileName("");
      setMessage(err?.message ?? "Dosya okunamadı.");
    } finally {
      stopLoading();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        await handleFile(file);
      } else {
        setMessage("Lütfen geçerli bir Excel (.xlsx, .xls) veya CSV dosyası yükleyin.");
      }
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setMessage(null);
    startLoading({ label: "Proforma içe aktarma", detail: "Kalemler gönderiliyor", progress: 18 });
    try {
      updateLoading({ detail: `${rows.length} kalem hazırlanıyor`, progress: 38 });
      const res = await fetch("/api/proformas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_id: supplierId,
          proforma_no: proformaNo.trim(),
          proforma_name: proformaName.trim() || null,
          proforma_date: proformaDate || null,
          currency: currency || "USD",
          notes: notes.trim() || null,
          source_file_name: fileName || null,
          items: rows,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "Proforma oluşturulamadı.");
        return;
      }
      updateLoading({ detail: "Proforma oluşturuldu", progress: 92 });
      router.push(`/proformalar/${data.id}`);
    } catch (err: any) {
      setMessage(err?.message ?? "Beklenmeyen hata.");
    } finally {
      setLoading(false);
      stopLoading();
    }
  };

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm border-t-4 border-t-indigo-600">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <label htmlFor="supplier" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Tedarikçi
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Building className="h-4 w-4" />
            </span>
            <select
              id="supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200 appearance-none"
            >
              <option value="">Seçin</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="proformaNo" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Proforma No
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Hash className="h-4 w-4" />
            </span>
            <input
              id="proformaNo"
              value={proformaNo}
              onChange={(e) => setProformaNo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
              placeholder="Örn: PRF-2026-001"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="proformaName" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Proforma Adı
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <FileText className="h-4 w-4" />
            </span>
            <input
              id="proformaName"
              value={proformaName}
              onChange={(e) => setProformaName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
              placeholder="Örn: Hammadde Siparişi"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="proformaDate" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Proforma Tarihi
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Calendar className="h-4 w-4" />
            </span>
            <input
              type="date"
              id="proformaDate"
              value={proformaDate}
              onChange={(e) => setProformaDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="currency" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Para Birimi
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <DollarSign className="h-4 w-4" />
            </span>
            <input
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
              placeholder="USD"
            />
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-1.5">
        <label htmlFor="notes" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Notlar
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full h-24 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200 resize-none"
          placeholder="Varsa sipariş veya ithalat notları..."
        />
      </div>

      {/* Modern Excel Dropzone Area */}
      <div className="mt-6 space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Kalem Dosyası (Excel / CSV)
        </label>
        
        {!fileName ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
              isDragging
                ? "border-indigo-500 bg-indigo-50/30 scale-[0.99]"
                : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50"
            }`}
          >
            <input
              type="file"
              id="file-upload"
              accept=".xlsx,.xls,.csv"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="rounded-full bg-indigo-50 p-3 text-indigo-600 mb-3">
              <CloudUpload className="h-6 w-6 animate-bounce" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              Dosyanızı buraya sürükleyin veya <span className="text-indigo-600 underline">göz atın</span>
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Zorunlu kolonlar: <strong>product_code</strong>, <strong>quantity</strong>.<br/>
              Desteklenen formatlar: .xlsx, .xls, .csv
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 transition-all duration-200">
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-emerald-700 shrink-0">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate" title={fileName}>
                  {fileName}
                </p>
                <p className="text-xs text-emerald-700 font-medium mt-0.5">
                  <Check className="inline h-3 w-3 mr-0.5 align-middle" />
                  {rows.length} satır başarıyla okundu
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setFileName("");
                setRows([]);
              }}
              title="Dosyayı Kaldır"
              className="rounded-lg p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
            >
              <Trash2 className="h-4.5 w-4.5" />
            </button>
          </div>
        )}
      </div>

      {/* Submit / Actions Footer */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
        <span className="text-xs font-medium text-rose-600 flex items-center gap-1">
          {message ? (
            <>
              <AlertCircle className="h-4 w-4 shrink-0" />
              {message}
            </>
          ) : ""}
        </span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || loading}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer min-w-[130px]"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              İçe Aktarılıyor...
            </>
          ) : (
            "Proforma İçe Aktar"
          )}
        </button>
      </div>
    </div>
  );
}
