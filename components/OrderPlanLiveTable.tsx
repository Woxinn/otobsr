"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import OrderPlanInput from "@/components/OrderPlanInput";
import PlanRowClickBinder from "@/components/PlanRowClickBinder";

type LiveMetric = {
  stock: number;
  sales120: number;
  sales60: number;
  salesPrev60: number;
  sales10y: number;
};

type SalesWindows = {
  recent?: { start?: string; end?: string };
  last60?: { start?: string; end?: string };
  prev60?: { start?: string; end?: string };
};

type PlanRow = {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  description: string | null;
  groupName: string;
  netsisCode: string;
  inTransit: number;
  proformaOpen: number;
  rfqQty: number;
  sales10y: number;
  lead: number;
  safety: number;
  defaultValue: number | null;
};

type Props = {
  rows: PlanRow[];
  needOnly: boolean;
};

type PreparedRow = {
  row: PlanRow;
  metric: LiveMetric;
  plan: {
    base_order_quantity: number;
    trend_direction: "increasing" | "decreasing" | "stable";
    trend_based_suggestion: number;
  };
};

const fmt = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("tr-TR");

const fmtDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("tr-TR");
};

const rowColorsFromId = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
    hash &= hash;
  }
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsl(${hue}, 82%, 97%)`,
    accent: `hsl(${hue}, 70%, 45%)`,
  };
};

const ceil = (n: number) => Math.ceil(n);

const computeTrend = (
  sales60: number,
  salesPrev60: number
): { trend_direction: PreparedRow["plan"]["trend_direction"]; multiplier: number } => {
  if (salesPrev60 === 0) return { trend_direction: "stable", multiplier: 1 };
  const change_ratio = (sales60 - salesPrev60) / salesPrev60;
  if (change_ratio > 0.1) return { trend_direction: "increasing", multiplier: 1.15 };
  if (change_ratio < -0.1) return { trend_direction: "decreasing", multiplier: 0.85 };
  return { trend_direction: "stable", multiplier: 1 };
};

const computePlan = ({
  available_stock,
  sales_last_4_months,
  sales_last_60_days,
  sales_previous_60_days,
  lead_time_days,
  safety_days,
}: {
  available_stock: number;
  sales_last_4_months: number;
  sales_last_60_days: number;
  sales_previous_60_days: number;
  lead_time_days: number;
  safety_days: number;
}): PreparedRow["plan"] => {
  let base_order_quantity = 0;
  if (available_stock < sales_last_4_months) {
    base_order_quantity = sales_last_4_months;
  } else if (available_stock >= sales_last_4_months && lead_time_days + safety_days >= 120) {
    const target_stock = sales_last_4_months * 2;
    base_order_quantity = target_stock - available_stock;
  } else {
    base_order_quantity = 0;
  }
  if (base_order_quantity < 0) base_order_quantity = 0;
  base_order_quantity = ceil(base_order_quantity);

  const trend = computeTrend(sales_last_60_days, sales_previous_60_days);
  const trend_based_suggestion = ceil(base_order_quantity * trend.multiplier);

  return {
    base_order_quantity,
    trend_direction: trend.trend_direction,
    trend_based_suggestion,
  };
};

export default function OrderPlanLiveTable({ rows, needOnly }: Props) {
  const [metrics, setMetrics] = useState<Map<string, LiveMetric>>(new Map());
  const [salesWindows, setSalesWindows] = useState<SalesWindows | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draftValues, setDraftValues] = useState<Map<string, number | null>>(new Map());
  const [onlyZeroStock, setOnlyZeroStock] = useState(false);
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [onlySelected, setOnlySelected] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);
  const VIEW_KEY = "order-plan-view-v1";

  useEffect(() => {
    let active = true;
    const codes = Array.from(new Set(rows.map((row) => row.netsisCode).filter(Boolean)));
    setLoading(true);
    if (!codes.length) {
      setMetrics(new Map());
      setSalesWindows(null);
      setLoading(false);
      return;
    }

    const chunk = <T,>(arr: T[], size: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    const fetchMetricsChunk = async (chunkCodes: string[]) => {
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const response = await fetch("/api/order-plan/live-metrics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ codes: chunkCodes }),
            cache: "no-store",
          });
          const json = (await response.json()) as {
            ok?: boolean;
            metrics?: Record<string, LiveMetric>;
            windows?: SalesWindows;
          };
          if (!response.ok || !json.ok) {
            throw new Error("live-metrics not ok");
          }
          const partial = new Map<string, LiveMetric>();
          Object.entries(json.metrics ?? {}).forEach(([code, metric]) => {
            partial.set(code, {
              stock: Number(metric?.stock ?? 0),
              sales120: Number(metric?.sales120 ?? 0),
              sales60: Number(metric?.sales60 ?? 0),
              salesPrev60: Number(metric?.salesPrev60 ?? 0),
              sales10y: Number(metric?.sales10y ?? 0),
            });
          });
          return { partial, windows: json.windows ?? null };
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error("live-metrics failed");
    };

    const run = async () => {
      try {
        const next = new Map<string, LiveMetric>();
        const chunks = chunk(codes, 180);
        const concurrency = 2;
        let cursor = 0;

        const worker = async () => {
          while (active) {
            const idx = cursor;
            cursor += 1;
            if (idx >= chunks.length) return;
            try {
              const { partial, windows } = await fetchMetricsChunk(chunks[idx]);
              if (!active) return;
              partial.forEach((value, key) => next.set(key, value));
              if (windows) setSalesWindows(windows);
              setMetrics(new Map(next));
            } catch {
              // tek chunk fail olursa tum tabloyu sifirlamayalim
            }
          }
        };

        await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, () => worker()));
        if (!active) return;
        setMetrics(next);
      } catch {
        if (!active) return;
        // genel hata durumunda eldeki partial metrikleri koru
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [rows]);

  const preparedRows = useMemo<PreparedRow[]>(() => {
    const list = rows
      .map((row) => {
        const metric = row.netsisCode
          ? metrics.get(row.netsisCode) ?? { stock: 0, sales120: 0, sales60: 0, salesPrev60: 0, sales10y: 0 }
          : { stock: 0, sales120: 0, sales60: 0, salesPrev60: 0, sales10y: 0 };

        const available_stock = metric.stock + row.inTransit + row.proformaOpen;
        const plan = computePlan({
          available_stock,
          sales_last_4_months: metric.sales120,
          sales_last_60_days: metric.sales60,
          sales_previous_60_days: metric.salesPrev60,
          lead_time_days: row.lead,
          safety_days: row.safety,
        });
        return { row, metric, plan };
      })
      .filter((entry) => (needOnly ? entry.plan.base_order_quantity > 0 : true));

    return list;
  }, [rows, metrics, needOnly]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (!raw) return;
      const view = JSON.parse(raw) as {
        onlyZeroStock?: boolean;
        onlyChanged?: boolean;
        onlySelected?: boolean;
      };
      setOnlyZeroStock(Boolean(view.onlyZeroStock));
      setOnlyChanged(Boolean(view.onlyChanged));
      setOnlySelected(Boolean(view.onlySelected));
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        VIEW_KEY,
        JSON.stringify({
          onlyZeroStock,
          onlyChanged,
          onlySelected,
        })
      );
    } catch {
      // no-op
    }
  }, [onlyZeroStock, onlyChanged, onlySelected]);

  const displayRows = useMemo(() => {
    return preparedRows.filter((entry) => {
      if (onlyZeroStock && entry.metric.stock !== 0) return false;
      if (onlySelected && !selectedIds.has(entry.row.id)) return false;
      if (onlyChanged) {
        const localVal = draftValues.get(entry.row.id);
        const hasChanged = localVal !== null && localVal !== undefined && localVal !== entry.row.defaultValue;
        if (!hasChanged) return false;
      }
      return true;
    });
  }, [preparedRows, onlyZeroStock, onlySelected, onlyChanged, selectedIds, draftValues]);

  const summary = useMemo(() => {
    return displayRows.reduce(
      (acc, entry) => {
        acc.totalNeed += entry.plan.base_order_quantity;
        acc.totalSuggest += entry.plan.trend_based_suggestion;
        if (entry.plan.base_order_quantity > 0) acc.needCount += 1;
        if (entry.metric.stock === 0) acc.zeroStock += 1;
        return acc;
      },
      { totalNeed: 0, totalSuggest: 0, needCount: 0, zeroStock: 0 }
    );
  }, [displayRows]);

  const toggleSelection = (rowId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  };

  const selectVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      displayRows.forEach((entry) => {
        if (checked) next.add(entry.row.id);
        else next.delete(entry.row.id);
      });
      return next;
    });
  };

  const selectedCount = selectedIds.size;
  const allVisibleSelected = displayRows.length > 0 && displayRows.every((entry) => selectedIds.has(entry.row.id));

  const selectedRows = useMemo(() => {
    const byId = new Map(preparedRows.map((entry) => [entry.row.id, entry]));
    return Array.from(selectedIds)
      .map((id) => byId.get(id))
      .filter(Boolean) as PreparedRow[];
  }, [preparedRows, selectedIds]);

  const runBulkUpdate = async (mode: "suggest" | "clear") => {
    if (!selectedRows.length) return;
    setBulkPending(true);
    try {
      const updates = selectedRows.map((entry) => {
        const targetValue = mode === "clear" ? 0 : entry.plan.trend_based_suggestion;
        return {
          product_id: entry.row.id,
          value: targetValue,
          need_qty: entry.plan.base_order_quantity,
          suggest_qty: entry.plan.trend_based_suggestion,
        };
      });
      const response = await fetch("/api/order-plan/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!response.ok) throw new Error("bulk failed");
      setDraftValues((prev) => {
        const next = new Map(prev);
        selectedRows.forEach((entry) => {
          next.set(entry.row.id, mode === "clear" ? 0 : entry.plan.trend_based_suggestion);
        });
        return next;
      });
    } finally {
      setBulkPending(false);
    }
  };

  const exportVisibleCsv = () => {
    const headers = [
      "Kod",
      "Urun",
      "Grup",
      "Stok",
      "Yolda",
      "Proforma acik",
      "RFQ",
      "Onceki 60",
      "Son 60",
      "Son 120",
      "Ihtiyac",
      "Tavsiye",
    ];
    const rowsCsv = displayRows.map(({ row, metric, plan }) => [
      row.code,
      row.name,
      row.groupName,
      metric.stock,
      row.inTransit,
      row.proformaOpen,
      row.rfqQty,
      metric.salesPrev60,
      metric.sales60,
      metric.sales120,
      plan.base_order_quantity,
      plan.trend_based_suggestion,
    ]);
    const escape = (value: string | number) => `"${String(value).replaceAll("\"", "\"\"")}"`;
    const csv = [headers.map(escape).join(","), ...rowsCsv.map((line) => line.map(escape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "siparis-plani-gorunum.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PlanRowClickBinder />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-black/10 bg-[var(--mint)]/40 p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-black/50">Ihtiyacli urun</p>
          <p className="text-lg font-semibold text-black">{fmt(summary.needCount)}</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-[var(--sky)]/40 p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-black/50">Toplam ihtiyac</p>
          <p className="text-lg font-semibold text-black">{fmt(summary.totalNeed)}</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-[var(--peach)]/40 p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-black/50">Toplam tavsiye</p>
          <p className="text-lg font-semibold text-black">{fmt(summary.totalSuggest)}</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-black/50">0 stok urun</p>
          <p className="text-lg font-semibold text-black">{fmt(summary.zeroStock)}</p>
        </div>
      </div>

      <div className="mb-3 rounded-2xl border border-black/10 bg-white px-3 py-2 text-xs text-black/65">
        <span className="font-semibold text-black/75">Satis tarih araligi:</span>{" "}
        10 aylik {fmtDate(salesWindows?.recent?.start)} - {fmtDate(salesWindows?.recent?.end)}
        {"  |  "}Son 60: {fmtDate(salesWindows?.last60?.start)} - {fmtDate(salesWindows?.last60?.end)}
        {"  |  "}Onceki 60: {fmtDate(salesWindows?.prev60?.start)} - {fmtDate(salesWindows?.prev60?.end)}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-white p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyZeroStock((v) => !v)}
            className={`rounded-full border px-3 py-1 font-semibold ${
              onlyZeroStock ? "border-[var(--ocean)] bg-[var(--ocean)]/10 text-[var(--ocean)]" : "border-black/20 text-black/70"
            }`}
          >
            Sadece 0 stok
          </button>
          <button
            type="button"
            onClick={() => setOnlyChanged((v) => !v)}
            className={`rounded-full border px-3 py-1 font-semibold ${
              onlyChanged ? "border-[var(--ocean)] bg-[var(--ocean)]/10 text-[var(--ocean)]" : "border-black/20 text-black/70"
            }`}
          >
            Sadece degisenler
          </button>
          <button
            type="button"
            onClick={() => setOnlySelected((v) => !v)}
            className={`rounded-full border px-3 py-1 font-semibold ${
              onlySelected ? "border-[var(--ocean)] bg-[var(--ocean)]/10 text-[var(--ocean)]" : "border-black/20 text-black/70"
            }`}
          >
            Sadece secili
          </button>
          <button
            type="button"
            onClick={() => {
              setOnlyZeroStock(false);
              setOnlyChanged(false);
              setOnlySelected(false);
            }}
            className="rounded-full border border-black/20 px-3 py-1 font-semibold text-black/70"
          >
            Filtre temizle
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-black/60">Gorunen: {fmt(displayRows.length)}</span>
          <button
            type="button"
            onClick={exportVisibleCsv}
            className="rounded-full border border-black/20 px-3 py-1 font-semibold text-black/70"
          >
            Gorunumu CSV
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-white p-3 text-xs">
        <div className="text-black/60">Secili satir: {fmt(selectedCount)}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => runBulkUpdate("suggest")}
            disabled={!selectedCount || bulkPending}
            className="rounded-full border border-[var(--ocean)] px-3 py-1 font-semibold text-[var(--ocean)] disabled:opacity-40"
          >
            Seciliye tavsiye uygula
          </button>
          <button
            type="button"
            onClick={() => runBulkUpdate("clear")}
            disabled={!selectedCount || bulkPending}
            className="rounded-full border border-black/25 px-3 py-1 font-semibold text-black/70 disabled:opacity-40"
          >
            Seciliyi sifirla
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            disabled={!selectedCount || bulkPending}
            className="rounded-full border border-black/20 px-3 py-1 font-semibold text-black/70 disabled:opacity-40"
          >
            Secimi temizle
          </button>
        </div>
      </div>

      <table className="min-w-[980px] table-fixed border-separate border-spacing-y-1 text-sm">
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="text-left text-[11px] uppercase tracking-[0.28em] text-black/50">
            <th className="sticky left-0 z-20 bg-white px-3 text-center">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) => selectVisible(event.target.checked)}
                className="h-4 w-4 rounded border-black/30 text-[var(--ocean)]"
                aria-label="Tum gorunenleri sec"
              />
            </th>
            <th className="sticky left-10 z-20 bg-white px-4">Kod</th>
            <th className="px-4">Urun</th>
            <th className="px-4 text-right">Stok</th>
            <th className="px-4 text-right">Onceki 2 aylik satis</th>
            <th className="px-4 text-right">Son 2 aylik satis</th>
            <th className="px-4 text-right">10 aylik satis</th>
            <th className="px-4 text-right">10 yillik satis</th>
            <th className="px-4 text-left">Miktarlar</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map(({ row, metric, plan }) => {
            const rowColors = rowColorsFromId(row.id);
            const displaySales10y = row.sales10y > 0 ? row.sales10y : metric.sales10y;
            return (
              <tr
                key={row.id}
                data-plan-row="1"
                className="group [&>td]:border [&>td]:border-black/10 [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl hover:[&>td]:bg-[linear-gradient(120deg,rgba(11,47,54,0.05),rgba(242,166,90,0.12))]"
                style={
                  {
                    ["--row-bg" as string]: rowColors.bg,
                    ["--row-accent" as string]: rowColors.accent,
                  } as CSSProperties
                }
              >
                <td className="sticky left-0 z-[5] bg-white px-2.5 py-1 text-center align-middle">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={(event) => toggleSelection(row.id, event.target.checked)}
                    className="h-4 w-4 rounded border-black/30 text-[var(--ocean)]"
                  />
                </td>
                <td className="sticky left-10 z-[5] bg-white px-3 py-1 font-semibold text-black">
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-1.5 rounded-full" style={{ backgroundColor: "var(--row-accent)" }} />
                    <span className="block max-w-[220px] truncate">{row.code}</span>
                  </div>
                </td>
                <td className="px-3 py-1">
                  <div className="max-w-[280px] truncate font-semibold text-black">{row.name}</div>
                  <div className="max-w-[280px] truncate text-[11px] text-black/55">
                    {(row.brand ?? "-")} • {row.groupName}
                  </div>
                </td>
                <td className="px-3 py-1 text-right text-sm text-black/80">
                  <div className={`text-[11px] text-black/70 ${loading && row.netsisCode ? "animate-pulse" : ""}`}>
                    Stok: {fmt(metric.stock)}
                  </div>
                  <div className="text-[11px] text-black/70">
                    Yolda: {fmt(row.inTransit)} · Proforma acik: {fmt(row.proformaOpen)} · RFQ: {fmt(row.rfqQty)}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-black">
                    Toplam: {fmt(metric.stock + row.inTransit + row.proformaOpen + row.rfqQty)}
                  </div>
                </td>
                <td className={`px-3 py-1 text-right text-sm text-black/80 ${loading && row.netsisCode ? "animate-pulse" : ""}`}>
                  {fmt(metric.salesPrev60)}
                </td>
                <td className={`px-3 py-1 text-right text-sm text-black/80 ${loading && row.netsisCode ? "animate-pulse" : ""}`}>
                  {fmt(metric.sales60)}
                </td>
                <td className={`px-3 py-1 text-right text-sm text-black/80 ${loading && row.netsisCode ? "animate-pulse" : ""}`}>
                  {fmt(metric.sales120)}
                </td>
                <td className={`px-3 py-1 text-right text-sm text-black/80 ${loading && row.netsisCode ? "animate-pulse" : ""}`}>
                  {fmt(displaySales10y)}
                </td>
                <td className="px-3 py-1 text-left text-sm text-black">
                  <div className="text-[13px] font-semibold text-black">Ihtiyac: {fmt(plan.base_order_quantity)}</div>
                  <div className="text-xs text-black/70">
                    Tavsiye: {fmt(plan.trend_based_suggestion)} (
                    {plan.trend_direction === "increasing"
                      ? "satis artiyor"
                      : plan.trend_direction === "decreasing"
                      ? "satis azaliyor"
                      : "stabil"}
                    )
                  </div>
                  <div className="text-[10px] text-black/50">
                    Lead/Safety: {row.lead}g / {row.safety}g
                  </div>
                  <OrderPlanInput
                    productId={row.id}
                    need={plan.base_order_quantity}
                    suggest={plan.trend_based_suggestion}
                    defaultValue={row.defaultValue}
                    onLocalValueChange={(numeric) =>
                      setDraftValues((prev) => {
                        const next = new Map(prev);
                        next.set(row.id, numeric);
                        return next;
                      })
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
