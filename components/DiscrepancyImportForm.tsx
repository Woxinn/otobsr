"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

type ParsedRow = {
  product_code: string;
  product_name: string;
  quantity: number;
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
  const text = String(value).trim();
  if (!text) return 0;
  const parsed = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

async function parseFile(file: File): Promise<ParsedRow[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // raw:false => Excel'de gorunen (formatlanmis) degeri alir; ham huge sayi sapmalarini engeller.
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  if (!json.length) return [];

  const keys = Object.keys(json[0] ?? {});
  const codeKey = findColumn(keys, [
    "product_code",
    "code",
    "urun_kodu",
    "stok_kodu",
    "netsis_stok_kodu",
    "item_code",
    "malzeme_kodu",
  ]);
  const nameKey = findColumn(keys, ["product_name", "name", "urun_adi", "stok_adi", "item_name"]);
  const qtyKey = findColumn(keys, ["quantity", "qty", "miktar", "adet"]);

  if (!codeKey || !qtyKey) {
    throw new Error("Dosyada zorunlu kolonlar bulunamadi (product_code ve quantity).");
  }

  const agg = new Map<string, ParsedRow>();
  json.forEach((row) => {
    const code = String(row[codeKey] ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!code) return;
    const qty = toNumber(row[qtyKey]);
    const name = nameKey ? String(row[nameKey] ?? "").trim() : "";
    const current = agg.get(code);
    if (current) {
      current.quantity += qty;
      if (!current.product_name && name) current.product_name = name;
      agg.set(code, current);
      return;
    }
    agg.set(code, { product_code: code, product_name: name, quantity: qty });
  });

  return Array.from(agg.values());
}

export default function DiscrepancyImportForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  const [orderFileName, setOrderFileName] = useState("");
  const [packingFileName, setPackingFileName] = useState("");
  const [orderRows, setOrderRows] = useState<ParsedRow[]>([]);
  const [packingRows, setPackingRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => Boolean(title.trim() && orderRows.length > 0 && packingRows.length > 0 && !loading),
    [title, orderRows.length, packingRows.length, loading]
  );

  const onPickOrder = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = await parseFile(file);
      setOrderRows(parsed);
      setOrderFileName(file.name);
      setMessage(null);
    } catch (err: any) {
      setMessage(err?.message ?? "Order dosyasi okunamadi.");
      setOrderRows([]);
      setOrderFileName("");
    }
  };

  const onPickPacking = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = await parseFile(file);
      setPackingRows(parsed);
      setPackingFileName(file.name);
      setMessage(null);
    } catch (err: any) {
      setMessage(err?.message ?? "Packing dosyasi okunamadi.");
      setPackingRows([]);
      setPackingFileName("");
    }
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/discrepancy-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          supplier_name: supplierName.trim(),
          notes: notes.trim(),
          order_file_name: orderFileName,
          packing_file_name: packingFileName,
          order_rows: orderRows,
          packing_rows: packingRows,
        }),
      });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : null;
      if (!res.ok) {
        if (Array.isArray(data?.overflow_details) && data.overflow_details.length) {
          const preview = data.overflow_details
            .slice(0, 3)
            .map((d: any) => `${d.product_code} (${d.source}: ${d.value})`)
            .join(", ");
          setMessage(`${data?.error ?? "Kayit olusturulamadi."} Ornek: ${preview}`);
        } else {
          setMessage(data?.error ?? "Kayit olusturulamadi.");
        }
        return;
      }
      if (!data?.id) {
        setMessage("Kayit olusturuldu ama run id donmedi. API cevabini kontrol edin.");
        return;
      }
      router.push(`/fark-kontrol/${data.id}`);
    } catch (err: any) {
      setMessage(err?.message ?? "Beklenmeyen hata.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-black/70">
          Baslik
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            placeholder="Orn: Mart 2026 - Siparis/Packing Karsilastirma"
          />
        </label>
        <label className="text-sm font-medium text-black/70">
          Tedarikci (opsiyonel)
          <input
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
            placeholder="Tedarikci adi"
          />
        </label>
      </div>

      <label className="mt-4 block text-sm font-medium text-black/70">
        Notlar (opsiyonel)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-2 h-24 w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
        />
      </label>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-black/10 p-4">
          <div className="text-sm font-semibold text-black">Order dosyasi</div>
          <div className="mt-1 text-xs text-black/60">Zorunlu kolonlar: product_code, quantity</div>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="mt-3 text-sm"
            onChange={(e) => onPickOrder(e.target.files?.[0])}
          />
          <div className="mt-2 text-xs text-black/60">
            {orderFileName ? `${orderFileName} (${orderRows.length} urun)` : "Dosya secilmedi"}
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 p-4">
          <div className="text-sm font-semibold text-black">Packing dosyasi</div>
          <div className="mt-1 text-xs text-black/60">Zorunlu kolonlar: product_code, quantity</div>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="mt-3 text-sm"
            onChange={(e) => onPickPacking(e.target.files?.[0])}
          />
          <div className="mt-2 text-xs text-black/60">
            {packingFileName ? `${packingFileName} (${packingRows.length} urun)` : "Dosya secilmedi"}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-xs text-red-600">{message ?? ""}</div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`rounded-2xl px-5 py-2 text-sm font-semibold text-white transition ${
            canSubmit ? "bg-[var(--ocean)] hover:-translate-y-0.5" : "cursor-not-allowed bg-black/30"
          }`}
        >
          {loading ? "Olusturuluyor..." : "Karsilastirma olustur"}
        </button>
      </div>
    </div>
  );
}
