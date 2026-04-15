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

type PlanRow = {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  description: string | null;
  groupName: string;
  netsisCode: string;
  inTransit: number;
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

const fmt = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("tr-TR");

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

const computeTrend = (sales60: number, salesPrev60: number) => {
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
}) => {
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const codes = Array.from(new Set(rows.map((row) => row.netsisCode).filter(Boolean)));
    if (!codes.length) {
      setLoading(false);
      return;
    }

    const run = async () => {
      try {
        const response = await fetch("/api/order-plan/live-metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codes }),
          cache: "no-store",
        });
        const json = (await response.json()) as {
          ok?: boolean;
          metrics?: Record<string, LiveMetric>;
        };
        if (!active) return;
        const next = new Map<string, LiveMetric>();
        Object.entries(json.metrics ?? {}).forEach(([code, metric]) => {
          next.set(code, {
            stock: Number(metric?.stock ?? 0),
            sales120: Number(metric?.sales120 ?? 0),
            sales60: Number(metric?.sales60 ?? 0),
            salesPrev60: Number(metric?.salesPrev60 ?? 0),
            sales10y: Number(metric?.sales10y ?? 0),
          });
        });
        setMetrics(next);
      } catch {
        if (!active) return;
        setMetrics(new Map());
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [rows]);

  const preparedRows = useMemo(() => {
    const list = rows
      .map((row) => {
        const metric = row.netsisCode
          ? metrics.get(row.netsisCode) ?? { stock: 0, sales120: 0, sales60: 0, salesPrev60: 0, sales10y: 0 }
          : { stock: 0, sales120: 0, sales60: 0, salesPrev60: 0, sales10y: 0 };

        const available_stock = metric.stock + row.inTransit;
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

  return (
    <>
      <PlanRowClickBinder />
      <table className="min-w-[980px] border-separate border-spacing-y-4 text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.28em] text-black/50">
            <th className="px-3 text-center">
              <span className="sr-only">Sec</span>
            </th>
            <th className="px-4">Kod</th>
            <th className="px-4">Urun</th>
            <th className="px-4 text-right">Stok</th>
            <th className="px-4 text-right">Onceki 2 aylik satis</th>
            <th className="px-4 text-right">Son 2 aylik satis</th>
            <th className="px-4 text-right">4 aylik satis</th>
            <th className="px-4 text-right">10 yillik satis</th>
            <th className="px-4 text-left">Miktarlar</th>
          </tr>
        </thead>
        <tbody>
          {preparedRows.map(({ row, metric, plan }) => {
            const rowColors = rowColorsFromId(row.id);
            const displaySales10y = row.sales10y > 0 ? row.sales10y : metric.sales10y;
            return (
              <tr
                key={row.id}
                data-plan-row="1"
                className="group transition hover:-translate-y-0.5 [&>td]:border [&>td]:border-black/10 [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl hover:[&>td]:bg-[linear-gradient(120deg,rgba(11,47,54,0.05),rgba(242,166,90,0.12))]"
                style={
                  {
                    ["--row-bg" as string]: rowColors.bg,
                    ["--row-accent" as string]: rowColors.accent,
                  } as CSSProperties
                }
              >
                <td className="px-3 py-4 text-center align-middle">
                  <input
                    type="checkbox"
                    name="plan_select"
                    value={row.id}
                    className="h-4 w-4 rounded border-black/30 text-[var(--ocean)]"
                  />
                </td>
                <td className="px-4 py-4 font-semibold text-black">
                  <div className="flex items-center gap-3">
                    <span className="h-9 w-1.5 rounded-full" style={{ backgroundColor: "var(--row-accent)" }} />
                    {row.code}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="font-semibold text-black">{row.name}</div>
                  <div className="text-xs text-black/60">{row.brand ?? "-"}</div>
                  <div className="text-xs text-black/50">{row.description ?? ""}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-black/45">{row.groupName}</div>
                </td>
                <td className="px-4 py-4 text-right text-sm text-black/80">
                  <div className={`text-[12px] text-black/70 ${loading && row.netsisCode ? "animate-pulse" : ""}`}>
                    Stok: {fmt(metric.stock)}
                  </div>
                  <div className="text-[12px] text-black/70">Yolda: {fmt(row.inTransit)}</div>
                  <div className="text-[12px] text-black/70">RFQ: {fmt(row.rfqQty)}</div>
                  <div className="mt-1 text-base font-semibold text-black">
                    Toplam: {fmt(metric.stock + row.inTransit + row.rfqQty)}
                  </div>
                </td>
                <td className={`px-4 py-4 text-right text-sm text-black/80 ${loading && row.netsisCode ? "animate-pulse" : ""}`}>
                  {fmt(metric.salesPrev60)}
                </td>
                <td className={`px-4 py-4 text-right text-sm text-black/80 ${loading && row.netsisCode ? "animate-pulse" : ""}`}>
                  {fmt(metric.sales60)}
                </td>
                <td className={`px-4 py-4 text-right text-sm text-black/80 ${loading && row.netsisCode ? "animate-pulse" : ""}`}>
                  {fmt(metric.sales120)}
                </td>
                <td className={`px-4 py-4 text-right text-sm text-black/80 ${loading && row.netsisCode ? "animate-pulse" : ""}`}>
                  {fmt(displaySales10y)}
                </td>
                <td className="px-4 py-4 text-left text-sm text-black">
                  <div className="font-semibold text-black">Ihtiyac: {fmt(plan.base_order_quantity)}</div>
                  <div className="text-black/70">
                    Tavsiye: {fmt(plan.trend_based_suggestion)} (
                    {plan.trend_direction === "increasing"
                      ? "satis artiyor"
                      : plan.trend_direction === "decreasing"
                      ? "satis azaliyor"
                      : "stabil"}
                    )
                  </div>
                  <div className="text-[11px] text-black/50">
                    Lead/Safety: {row.lead}g / {row.safety}g
                  </div>
                  <OrderPlanInput
                    productId={row.id}
                    need={plan.base_order_quantity}
                    suggest={plan.trend_based_suggestion}
                    defaultValue={row.defaultValue}
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
