"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type ParsedRow = { code: string; netsis: string };

export default function NetsisImportPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo<ParsedRow[]>(() => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed: ParsedRow[] = [];
    for (const line of lines) {
      // Öncelik noktalı virgül; yoksa ilk tab. Virgül AYIRAÇ DEĞİL.
      const semi = line.indexOf(";");
      const tab = line.indexOf("\t");
      const idx = [semi, tab].filter((i) => i >= 0).sort((a, b) => a - b)[0];
      if (idx === undefined) continue;
      const code = line.slice(0, idx).trim();
      const netsis = line.slice(idx + 1).trim();
      if (code && netsis) parsed.push({ code, netsis });
    }
    return parsed;
  }, [text]);

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!rows.length) {
        throw new Error("Hiç geçerli satır yok. Kod ve Netsis stok kodu dolu olmalı.");
      }
      const res = await fetch("/api/netsis-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Import hata");
      }
      const query = new URLSearchParams({
        toast: "netsis-import-ok",
        updated: String(data.updated ?? 0),
        missing: String(data.missing ?? 0),
      });
      router.push(`/products?${query.toString()}`);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const sample = ["URUN_KODU;NETSIS_STOK", "ABC-123;STK-001", "XYZ-900;STK-900"];

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">Import</p>
            <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">
              Netsis stok kodu import
            </h1>
            <p className="text-sm text-black/60">
              Ayraç: noktalı virgül (;) veya tab. Başlık şart değil.
            </p>
          </div>
          <Link
            href="/products"
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold text-black/70"
          >
            Listeye dön
          </Link>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-[var(--sand)] px-4 py-3 text-xs text-black/70">
            <div className="font-semibold text-black">Örnek format</div>
            <div className="mt-2 font-mono leading-6">
              {sample.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-dashed border-black/10 px-4 py-3 text-xs text-black/70">
            <div className="font-semibold text-black">Adımlar</div>
            <ol className="mt-2 list-decimal pl-4 space-y-1">
              <li>Excel’den Netsis kodlarını kopyala.</li>
              <li>Alanlara ; veya tab ile ayırarak yapıştır.</li>
              <li>“İçe aktar”a bas; bittiğinde otomatik listeye dönersin.</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-black/10 px-4 py-3 text-xs text-black/70">
            <div className="font-semibold text-black">Özet</div>
            <p className="mt-2">
              Geçerli satır: <strong>{rows.length}</strong>
            </p>
            <p className="text-[11px] text-black/60">
              Boş satırlar ve ayraç bulunmayanlar otomatik atlanır.
            </p>
          </div>
        </div>

        <textarea
          className="mt-4 w-full rounded-2xl border border-black/10 bg-[var(--sand)] px-4 py-3 font-mono text-sm"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"URUN_KODU;NETSIS_STOK\nABC-123;STK-001"}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <button
            onClick={handleImport}
            disabled={busy}
            className={`rounded-full px-5 py-2 font-semibold transition ${
              busy
                ? "cursor-not-allowed border border-black/10 text-black/40"
                : "border border-black/20 text-black/80 hover:-translate-y-0.5 hover:shadow-sm"
            }`}
          >
            {busy ? "Aktarılıyor..." : "İçe aktar"}
          </button>
          {error ? <div className="text-sm text-red-700">{error}</div> : null}
        </div>
      </div>
    </section>
  );
}
