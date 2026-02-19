"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

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

  const canSubmit = useMemo(
    () => Boolean(!loading && supplierId && proformaNo.trim() && rows.length),
    [loading, supplierId, proformaNo, rows.length]
  );

  const handleFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = await parseFile(file);
      setRows(parsed);
      setFileName(file.name);
      setMessage(null);
    } catch (err: any) {
      setRows([]);
      setFileName("");
      setMessage(err?.message ?? "Dosya okunamadi.");
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setMessage(null);
    try {
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
        setMessage(data?.error ?? "Proforma olusturulamadi.");
        return;
      }
      router.push(`/proformalar/${data.id}`);
    } catch (err: any) {
      setMessage(err?.message ?? "Beklenmeyen hata.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium text-black/70">
          Tedarikci
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
          >
            <option value="">Secin</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-black/70">
          Proforma No
          <input
            value={proformaNo}
            onChange={(e) => setProformaNo(e.target.value)}
            className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium text-black/70">
          Proforma Adi
          <input
            value={proformaName}
            onChange={(e) => setProformaName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium text-black/70">
          Proforma Tarihi
          <input
            type="date"
            value={proformaDate}
            onChange={(e) => setProformaDate(e.target.value)}
            className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium text-black/70">
          Para Birimi
          <input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium text-black/70">
        Not
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-2 h-24 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
        />
      </label>

      <div className="mt-4 rounded-2xl border border-black/10 p-4">
        <div className="text-sm font-semibold text-black">Kalem dosyasi (xlsx/xls/csv)</div>
        <div className="mt-1 text-xs text-black/60">
          Zorunlu: product_code, quantity | Opsiyonel: product_name, unit_price, line_total
        </div>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="mt-3 text-sm"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className="mt-2 text-xs text-black/60">
          {fileName ? `${fileName} (${rows.length} satir)` : "Dosya secilmedi"}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-red-600">{message ?? ""}</span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white ${
            canSubmit ? "bg-[var(--ocean)] hover:-translate-y-0.5" : "cursor-not-allowed bg-black/30"
          }`}
        >
          {loading ? "Kaydediliyor..." : "Proforma olustur"}
        </button>
      </div>
    </div>
  );
}
