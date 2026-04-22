"use client";

import { useEffect, useMemo, useState } from "react";

type JobStatus = "queued" | "running" | "ready" | "failed";

type ExportJob = {
  id: string;
  status: JobStatus;
  totalProducts: number;
  totalCodes: number;
  processedCodes: number;
  progress: number;
  error?: string | null;
};

type Props = {
  queryString: string;
};

export default function OrderPlanExportJobButton({ queryString }: Props) {
  const [job, setJob] = useState<ExportJob | null>(null);
  const [busy, setBusy] = useState(false);

  const statusLabel = useMemo(() => {
    if (!job) return "Hazir";
    if (job.status === "queued") return "Kuyrukta";
    if (job.status === "running") return `Hazirlaniyor %${job.progress}`;
    if (job.status === "ready") return "Hazir";
    return "Hata";
  }, [job]);

  const startJob = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/order-plan-export/jobs${queryString}`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; job?: ExportJob; message?: string };
      if (!res.ok || !json.ok || !json.job) {
        throw new Error(json.message ?? "Export isi baslatilamadi.");
      }
      setJob({ ...json.job, progress: 0 });
    } catch (error: any) {
      setJob((prev) => ({
        id: prev?.id ?? "",
        status: "failed",
        totalProducts: prev?.totalProducts ?? 0,
        totalCodes: prev?.totalCodes ?? 0,
        processedCodes: prev?.processedCodes ?? 0,
        progress: prev?.progress ?? 0,
        error: String(error?.message ?? "Export isi baslatilamadi."),
      }));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!job?.id) return;
    if (!(job.status === "queued" || job.status === "running")) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/order-plan-export/jobs/${job.id}?process=1`, {
          cache: "no-store",
        });
        const json = (await res.json()) as { ok?: boolean; job?: ExportJob; message?: string };
        if (!res.ok || !json.ok || !json.job) {
          throw new Error(json.message ?? "Export durumu alinamadi.");
        }
        setJob(json.job);
      } catch (error: any) {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: "failed",
                error: String(error?.message ?? "Export durumu alinamadi."),
              }
            : null
        );
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [job]);

  const canDownload = job?.status === "ready" && !!job.id;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={startJob}
        disabled={busy || job?.status === "running" || job?.status === "queued"}
        className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/70 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Baslatiliyor..." : "Excel Hazirla"}
      </button>
      {canDownload ? (
        <a
          href={`/api/order-plan-export/jobs/${job.id}/download`}
          className="rounded-full border border-[var(--ocean)] px-4 py-2 text-sm font-semibold text-[var(--ocean)]"
        >
          Excel Indir
        </a>
      ) : null}
      <span className="text-xs text-black/60">{statusLabel}</span>
      {job?.status === "running" ? (
        <span className="text-[11px] text-black/50">
          ({job.processedCodes}/{job.totalCodes} kod - {job.totalProducts} urun)
        </span>
      ) : null}
      {job?.status === "failed" && job.error ? (
        <span className="text-[11px] text-[var(--danger)]">{job.error}</span>
      ) : null}
    </div>
  );
}
