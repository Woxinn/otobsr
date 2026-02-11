"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  urun_kodu: string;
  ad?: string;
  birim_fiyat?: number | null;
  netsis?: string;
  agirlik?: number | null;
  tip?: string;
  gtip?: string;
};

const parseNumber = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export default function ProductsImportUpdatePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows: Row[] = useMemo(() => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    return lines
      .map((line) => {
        // ayraç öncelik: ; sonra tab
        const parts = line.includes(";") ? line.split(";") : line.split("\t");
        const [kodu, ad, fiyat, netsis, agirlik, tip, gtip] = parts.map((p) => p?.trim() ?? "");
        if (!kodu) return null;
        return {
          urun_kodu: kodu,
          ad: ad || undefined,
          birim_fiyat: parseNumber(fiyat),
          netsis: netsis || undefined,
          agirlik: parseNumber(agirlik),
          tip: tip || undefined,
          gtip: gtip || undefined,
        } as Row;
      })
      .filter(Boolean) as Row[];
  }, [text]);

  const validCount = rows.length;

  const handleImport = async () => {
    setError(null);
    setBusy(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      const res = await fetch("/api/products-import-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          groupId: groupId || undefined,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Import hatası");
      }
      router.push(
        `/products?toast=products-import-ok&updated=${data.updated ?? 0}&missing=${data.missing ?? 0}`,
      );
    } catch (e: any) {
      if (e?.name === "AbortError") {
        setError("İşlem çok uzun sürdü, tekrar deneyin.");
      } else {
        setError(e.message ?? String(e));
      }
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">
          Ürün toplu güncelleme (import)
        </h1>
        <p className="text-sm text-black/60">
          Format: <code>urun_kodu;ad;fiyat;netsis_kodu;agirlik;tip;gtip</code> — ayraç
          olarak noktalı virgül (;) yoksa tab kullanılır. Sadece ürün kodu zorunlu;
          diğer alanları girdiğin kadar güncellenir. Ağırlık ve fiyat sayısal olmalı
          (virgül/nokta fark etmez).
        </p>
        <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-700">
          Örnek satır: <br />
          <code>RXB-BCVB-2RXPB-2280-Lw-m;Urun adi;12,50;STK-001;0,85;18RHB;8414</code>
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a
            href="/api/products-import-update/template"
            className="rounded-full border border-black/20 bg-white px-4 py-2 text-xs font-semibold text-black/70 hover:border-black/40"
          >
            Şablon indir (CSV)
          </a>
          <span className="text-xs text-black/50">
            Format: urun_kodu;ad;fiyat;netsis_kodu;agirlik;tip;gtip
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-xs font-semibold text-black/60">Grup (opsiyonel)</p>
            <input
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="group_id"
              className="rounded-xl border border-black/10 px-3 py-2 text-sm"
            />
          </div>
          <div className="text-sm text-black/70">
            Geçerli satır: <span className="font-semibold text-emerald-700">{validCount}</span>
          </div>
          <button
            onClick={handleImport}
            disabled={busy || !validCount}
            className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition ${
              busy || !validCount
                ? "bg-slate-400 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {busy ? "Aktarılıyor..." : "İçe aktar ve güncelle"}
          </button>
          <button
            onClick={() => router.push("/products")}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-semibold hover:border-black/30"
          >
            Ürün listesine dön
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          className="w-full rounded-2xl border border-black/10 bg-slate-50 px-3 py-2 font-mono text-sm"
          placeholder="urun_kodu;ad;fiyat;netsis_kodu;agirlik;tip"
        />

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
