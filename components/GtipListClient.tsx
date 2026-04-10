"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type GtipRow = {
  id: string;
  code: string | null;
  description: string | null;
  customs_duty_rate: number | null;
  additional_duty_rate: number | null;
  vat_rate: number | null;
  anti_dumping_applicable: boolean | null;
  anti_dumping_rate: number | null;
  surveillance_applicable: boolean | null;
  surveillance_unit_value: number | null;
  products: { count?: number }[] | { count?: number } | null;
};

const norm = (value: string | null | undefined) =>
  (value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const fmt = (value: number | null | undefined) => Number(value ?? 0).toLocaleString("tr-TR");

export default function GtipListClient({ gtips }: { gtips: GtipRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = norm(query).trim();
    if (!q) return gtips;
    return gtips.filter((g) => {
      const code = norm(g.code);
      const desc = norm(g.description);
      return code.includes(q) || desc.includes(q);
    });
  }, [gtips, query]);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-black/10 bg-[linear-gradient(135deg,#ffffff_0%,#f6fbff_60%,#eef7f3_100%)] p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[280px] flex-1 text-sm font-medium">
            Canlı arama (kod / açıklama)
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Örn: 7318, civata, vida"
              className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition focus:border-[var(--ocean)] focus:outline-none"
            />
          </label>
          <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/70">
            Sonuç: {fmt(filtered.length)}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white shadow-sm">
        <div>
          <div>
            <div className="sticky top-2 z-30 border-b border-black/10 bg-[var(--sand)]/95 shadow-sm backdrop-blur">
              <div className="grid grid-cols-[1.1fr_2.2fr_.8fr_.9fr_.8fr_1fr_1fr_.8fr_.8fr] items-center text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-black/60">
                <div className="px-4 py-3">Kod</div>
                <div className="px-4 py-3">Açıklama</div>
                <div className="px-4 py-3 text-right">GV %</div>
                <div className="px-4 py-3 text-right">İlave GV %</div>
                <div className="px-4 py-3 text-right">KDV %</div>
                <div className="px-4 py-3 text-right">Dumping</div>
                <div className="px-4 py-3 text-right">Gözetim</div>
                <div className="px-4 py-3 text-right">Ürün</div>
                <div className="px-4 py-3 text-right">Detay</div>
              </div>
            </div>

            {filtered.length ? (
              filtered.map((g, index) => {
                const productCount = Array.isArray(g.products)
                  ? g.products[0]?.count
                  : (g.products as { count?: number } | null | undefined)?.count;
                return (
                  <div
                    key={g.id}
                    style={{ animationDelay: `${index * 25}ms` }}
                    className="grid animate-[fade-up_0.35s_ease] grid-cols-[1.1fr_2.2fr_.8fr_.9fr_.8fr_1fr_1fr_.8fr_.8fr] items-center border-b border-dashed border-black/8 text-sm transition hover:bg-[rgba(15,61,62,0.04)]"
                  >
                    <div className="px-4 py-3 font-semibold text-black">{g.code ?? "-"}</div>
                    <div className="px-4 py-3 text-black/70">{g.description ?? "-"}</div>
                    <div className="px-4 py-3 text-right">{fmt(g.customs_duty_rate)}</div>
                    <div className="px-4 py-3 text-right">{fmt(g.additional_duty_rate)}</div>
                    <div className="px-4 py-3 text-right">{fmt(g.vat_rate)}</div>
                    <div className="px-4 py-3 text-right">
                      {g.anti_dumping_applicable ? (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                          {fmt(g.anti_dumping_rate)} /kg
                        </span>
                      ) : (
                        <span className="text-black/50">Yok</span>
                      )}
                    </div>
                    <div className="px-4 py-3 text-right">
                      {g.surveillance_applicable ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                          {fmt(g.surveillance_unit_value)} /kg
                        </span>
                      ) : (
                        <span className="text-black/50">Yok</span>
                      )}
                    </div>
                    <div className="px-4 py-3 text-right font-semibold text-black/70">{fmt(productCount)}</div>
                    <div className="px-4 py-3 text-right">
                      <Link
                        href={`/gtips/${g.id}`}
                        className="rounded-full border border-black/15 px-3 py-1 text-xs font-semibold text-black/70 transition hover:-translate-y-0.5 hover:border-black/30"
                      >
                        Gör
                      </Link>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-8 text-sm text-black/60">Sonuç bulunamadı.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
