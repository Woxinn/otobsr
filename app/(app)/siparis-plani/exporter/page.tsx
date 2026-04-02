"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

type Step =
  | "hazirlaniyor"
  | "supabase"
  | "mssql"
  | "excel"
  | "indiriliyor"
  | "bitti"
  | "hata";

const labels: Record<Step, string> = {
  hazirlaniyor: "Hazırlanıyor",
  supabase: "Supabase'den ürünler okunuyor",
  mssql: "MSSQL satışları çekiliyor",
  excel: "Excel oluşturuluyor",
  indiriliyor: "İndiriliyor",
  bitti: "Tamamlandı",
  hata: "Hata",
};

const stepOrder: Step[] = ["hazirlaniyor", "supabase", "mssql", "excel", "indiriliyor", "bitti"];

export default function OrderPlanExporterPage() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [batchInfo, setBatchInfo] = useState<{ current: number; rows: number } | null>(null);

  const query = useMemo(() => {
    const qp = searchParams?.toString() ?? "";
    return qp ? `?${qp}` : "";
  }, [searchParams]);

  const start = async () => {
    setErr(null);
    setStep("hazirlaniyor");
    setBatchInfo(null);
    try {
      const batchSize = 4000;
      let batch = 0;
      while (true) {
        setBatchInfo({ current: batch + 1, rows: 0 });
        setStep("supabase");
        const url = `/api/order-plan-export-bydb${query}${query ? "&" : "?"}batch=${batch}&batchSize=${batchSize}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Export isteği başarısız (${res.status})`);

        setStep("excel");
        const rows = Number(res.headers.get("x-batch-rows") ?? "0");
        const cd = res.headers.get("Content-Disposition") || "";
        const match = cd.match(/filename=\"?([^\";]+)\"?/i);
        const filename = match?.[1] ?? `siparis-plani-sales-per-db-batch-${batch + 1}.xlsx`;

        const blob = await res.blob();
        setStep("indiriliyor");

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(link.href);

        setBatchInfo({ current: batch + 1, rows });

        if (rows < batchSize) break; // son parti
        batch += 1;
      }

      setStep("bitti");
    } catch (e: any) {
      setErr(e?.message ?? "Bilinmeyen hata");
      setStep("hata");
    }
  };

  useEffect(() => {
    setStep(null);
    setErr(null);
    setBatchInfo(null);
  }, [query]);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-black/40">Sipariş Planı</p>
        <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">
          DB Bazlı Satış Export
        </h1>
        <p className="text-sm text-black/60 mt-1">
          Filtreler mevcut URL’den alınır. Başlat’a bastığında indirme otomatik başlayacak; aşağıdaki
          adımlardan durumu takip edebilirsin.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={start}
          className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--ocean-dark)]"
        >
          Başlat ve İndir
        </button>
        <a
          href={`/api/order-plan-export-bydb${query}`}
          data-skip-route-loader
          className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/70"
        >
          Direkt indir (progresssiz)
        </a>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-black/50 mb-3">İlerleme</p>
        <div className="space-y-2">
          {stepOrder.map((s) => {
            const active = step === s || (!!step && stepOrder.indexOf(s) < stepOrder.indexOf(step));
            return (
              <div
                key={s}
                className={`flex items-center gap-2 text-sm ${
                  active ? "text-[var(--ocean)]" : "text-black/50"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    active ? "bg-[var(--ocean)] animate-pulse" : "bg-black/20"
                  }`}
                />
                {labels[s]}
              </div>
            );
          })}
          {step === null && <div className="text-sm text-black/50">Hazır. Başlat’a bas.</div>}
          {batchInfo && (
            <div className="text-sm text-black/60">
              Parti: {batchInfo.current} — Satır: {batchInfo.rows}
            </div>
          )}
          {err && <div className="text-sm text-[var(--danger)] font-semibold">Hata: {err}</div>}
        </div>
      </div>
    </section>
  );
}
