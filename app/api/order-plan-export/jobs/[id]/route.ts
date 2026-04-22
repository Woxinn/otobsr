import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchLiveSalesAgg, fetchLiveStockMap } from "@/lib/live-mssql";

const CHUNK_SIZE = 300;

const progressOf = (processed: number, total: number) => {
  if (total <= 0) return 100;
  return Math.min(100, Math.round((processed / total) * 100));
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const processStep = req.nextUrl.searchParams.get("process") !== "0";

  const { data: job, error: jobError } = await supabase
    .from("order_plan_export_jobs")
    .select("id, status, total_products, total_codes, processed_codes, error, created_at, started_at, finished_at")
    .eq("id", id)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ ok: false, message: "Job bulunamadi." }, { status: 404 });
  }

  let currentJob = job;

  if (processStep && (job.status === "queued" || job.status === "running")) {
    if (job.status === "queued") {
      await supabase
        .from("order_plan_export_jobs")
        .update({ status: "running", started_at: new Date().toISOString(), error: null })
        .eq("id", id);
      currentJob = { ...currentJob, status: "running", started_at: new Date().toISOString(), error: null };
    }

    const { data: pendingCodes, error: pendingError } = await supabase
      .from("order_plan_export_job_codes")
      .select("netsis_code")
      .eq("job_id", id)
      .eq("fetched", false)
      .limit(CHUNK_SIZE);

    if (pendingError) {
      await supabase
        .from("order_plan_export_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: pendingError.message,
        })
        .eq("id", id);
      return NextResponse.json({ ok: false, message: "Job kodlari okunamadi." }, { status: 500 });
    }

    const codes = Array.from(
      new Set((pendingCodes ?? []).map((row) => String(row.netsis_code ?? "").trim()).filter(Boolean))
    );

    if (!codes.length) {
      await supabase
        .from("order_plan_export_jobs")
        .update({ status: "ready", finished_at: new Date().toISOString(), processed_codes: job.total_codes })
        .eq("id", id);
      currentJob = {
        ...currentJob,
        status: "ready",
        processed_codes: job.total_codes,
        finished_at: new Date().toISOString(),
      };
    } else {
      try {
        const [stockMap, salesMap] = await Promise.all([
          fetchLiveStockMap(codes, "prefix"),
          fetchLiveSalesAgg(codes),
        ]);

        const updates = codes.map((code) => {
          const sales = salesMap.get(code);
          return {
            job_id: id,
            netsis_code: code,
            stock: Number(stockMap.get(code) ?? 0),
            sales120: Number(sales?.sales120 ?? 0),
            sales60: Number(sales?.sales60 ?? 0),
            sales_prev60: Number(sales?.salesPrev60 ?? 0),
            sales10y: Number(sales?.sales10y ?? 0),
            fetched: true,
            updated_at: new Date().toISOString(),
          };
        });

        const { error: upsertError } = await supabase
          .from("order_plan_export_job_codes")
          .upsert(updates, { onConflict: "job_id,netsis_code" });
        if (upsertError) throw upsertError;

        const nextProcessed = Math.min(
          Number(currentJob.total_codes ?? 0),
          Number(currentJob.processed_codes ?? 0) + codes.length
        );
        const nextStatus = nextProcessed >= Number(currentJob.total_codes ?? 0) ? "ready" : "running";

        await supabase
          .from("order_plan_export_jobs")
          .update({
            status: nextStatus,
            processed_codes: nextProcessed,
            finished_at: nextStatus === "ready" ? new Date().toISOString() : null,
            error: null,
          })
          .eq("id", id);

        currentJob = {
          ...currentJob,
          status: nextStatus,
          processed_codes: nextProcessed,
          finished_at: nextStatus === "ready" ? new Date().toISOString() : currentJob.finished_at,
          error: null,
        };
      } catch (error: any) {
        const message = String(error?.message ?? "MSSQL metrikleri alinamadi");
        await supabase
          .from("order_plan_export_jobs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error: message,
          })
          .eq("id", id);
        currentJob = {
          ...currentJob,
          status: "failed",
          error: message,
          finished_at: new Date().toISOString(),
        };
      }
    }
  }

  return NextResponse.json({
    ok: true,
    job: {
      id: currentJob.id,
      status: currentJob.status,
      totalProducts: Number(currentJob.total_products ?? 0),
      totalCodes: Number(currentJob.total_codes ?? 0),
      processedCodes: Number(currentJob.processed_codes ?? 0),
      progress: progressOf(Number(currentJob.processed_codes ?? 0), Number(currentJob.total_codes ?? 0)),
      error: currentJob.error ?? null,
      createdAt: currentJob.created_at,
      startedAt: currentJob.started_at,
      finishedAt: currentJob.finished_at,
    },
  });
}
