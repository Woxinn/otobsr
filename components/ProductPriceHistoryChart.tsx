"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ProductPriceHistoryPoint = {
  orderId: string;
  orderName: string;
  date: string | null;
  supplierName: string | null;
  unitPrice: number;
  quantity: number;
  currency: string | null;
};

type ChartPoint = ProductPriceHistoryPoint & {
  x: number;
  y: number;
  barHeight: number;
  changePct: number | null;
};

interface ProductPriceHistoryChartProps {
  data: ProductPriceHistoryPoint[];
}

const formatDate = (value: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
};

const formatMoney = (value: number, currency: string | null, digits = 4) =>
  `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })} ${currency ?? "USD"}`;

const formatNumber = (value: number) =>
  value.toLocaleString("tr-TR", {
    maximumFractionDigits: 2,
  });

const formatPct = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
};

export default function ProductPriceHistoryChart({
  data,
}: ProductPriceHistoryChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const chart = useMemo(() => {
    const clean = data
      .filter((item) => Number.isFinite(item.unitPrice))
      .sort((a, b) => {
        const at = a.date ? new Date(a.date).getTime() : 0;
        const bt = b.date ? new Date(b.date).getTime() : 0;
        return at - bt;
      });

    const prices = clean.map((item) => item.unitPrice);
    const quantities = clean.map((item) => item.quantity);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceSpan = Math.max(maxPrice - minPrice, maxPrice * 0.08, 1);
    const priceFloor = Math.max(0, minPrice - priceSpan * 0.18);
    const priceCeil = maxPrice + priceSpan * 0.18;
    const maxQty = Math.max(...quantities, 1);

    const width = Math.max(760, clean.length * 92);
    const height = 280;
    const padding = { top: 28, right: 30, bottom: 52, left: 64 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = 172;
    const barBaseY = padding.top + plotHeight + 24;
    const barMaxHeight = 34;

    const points: ChartPoint[] = clean.map((item, index) => {
      const x =
        clean.length === 1
          ? padding.left + plotWidth / 2
          : padding.left + (index / (clean.length - 1)) * plotWidth;
      const normalized = (item.unitPrice - priceFloor) / (priceCeil - priceFloor);
      const y = padding.top + plotHeight - normalized * plotHeight;
      const previous = clean[index - 1]?.unitPrice;
      const changePct =
        previous && previous > 0 ? ((item.unitPrice - previous) / previous) * 100 : null;
      return {
        ...item,
        x,
        y,
        barHeight: (Math.max(item.quantity, 0) / maxQty) * barMaxHeight,
        changePct,
      };
    });

    const path = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
    const areaPath = points.length
      ? `${path} L ${points[points.length - 1].x} ${barBaseY - 48} L ${points[0].x} ${
          barBaseY - 48
        } Z`
      : "";

    return {
      clean,
      points,
      path,
      areaPath,
      width,
      height,
      padding,
      plotHeight,
      barBaseY,
      minPrice,
      maxPrice,
      priceFloor,
      priceCeil,
    };
  }, [data]);

  if (!data.length || !chart.points.length) {
    return (
      <div className="rounded-lg border border-black/10 bg-[var(--sand)] px-4 py-4 text-center text-sm text-black/60">
        Fiyat geçmişi için sipariş kaydı bulunamadı.
      </div>
    );
  }

  const latest = chart.clean[chart.clean.length - 1];
  const first = chart.clean[0];
  const avg =
    chart.clean.reduce((sum, item) => sum + item.unitPrice, 0) / chart.clean.length;
  const totalQty = chart.clean.reduce((sum, item) => sum + item.quantity, 0);
  const fullChange =
    first.unitPrice > 0
      ? ((latest.unitPrice - first.unitPrice) / first.unitPrice) * 100
      : null;
  const currencies = Array.from(
    new Set(chart.clean.map((item) => item.currency ?? "USD").filter(Boolean))
  );
  const currencyLabel = currencies.length === 1 ? currencies[0] : "Çoklu";
  const hover = hoveredIndex !== null ? chart.points[hoveredIndex] : null;
  const labelStep = Math.max(1, Math.ceil(chart.points.length / 8));

  return (
    <div className="overflow-hidden rounded-lg border border-white/30 bg-[#0f3d3e] text-white shadow-[0_24px_60px_-42px_rgba(15,61,62,0.75)]">
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.13),rgba(255,255,255,0.02))] p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.32em] text-white/55">
              Sipariş referanslı trend
            </p>
            <h3 className="mt-1 text-lg font-semibold [font-family:var(--font-display)]">
              Fiyat Geçmişi
            </h3>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-right ${
              fullChange === null
                ? "border-white/15 bg-white/10"
                : fullChange > 0
                ? "border-rose-300/40 bg-rose-400/15"
                : "border-emerald-300/40 bg-emerald-400/15"
            }`}
          >
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/55">
              İlk/Son Fark
            </p>
            <p className="mt-0.5 text-lg font-semibold">{formatPct(fullChange)}</p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {[
            { label: "Son fiyat", value: formatMoney(latest.unitPrice, latest.currency) },
            { label: "Ortalama", value: formatMoney(avg, latest.currency) },
            {
              label: "Min / Max",
              value: `${formatMoney(chart.minPrice, latest.currency, 2)} / ${formatMoney(
                chart.maxPrice,
                latest.currency,
                2
              )}`,
            },
            { label: "Toplam adet", value: `${formatNumber(totalQty)} (${currencyLabel})` },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2"
            >
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/50">
                {item.label}
              </p>
              <p className="mt-1 truncate text-sm font-semibold text-white">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative overflow-x-auto px-1.5 pb-3 pt-2">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="block min-w-[760px]"
          style={{ width: chart.width, maxWidth: "none" }}
          role="img"
          aria-label="Ürün fiyat geçmişi çizgi grafiği"
        >
          <defs>
            <linearGradient id="price-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f7b38a" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#f7b38a" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="price-line" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#b9d6c2" />
              <stop offset="50%" stopColor="#f7b38a" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
            <filter id="price-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {[0, 1, 2, 3].map((line) => {
            const y =
              chart.padding.top + (line / 3) * chart.plotHeight;
            const value =
              chart.priceCeil - (line / 3) * (chart.priceCeil - chart.priceFloor);
            return (
              <g key={`grid-${line}`}>
                <line
                  x1={chart.padding.left}
                  x2={chart.width - chart.padding.right}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.12)"
                  strokeDasharray="5 7"
                />
                <text
                  x={chart.padding.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="rgba(255,255,255,0.55)"
                >
                  {value.toFixed(2)}
                </text>
              </g>
            );
          })}

          {chart.points.map((point, index) => (
            <rect
              key={`qty-${point.orderId}`}
              x={point.x - 13}
              y={chart.barBaseY - point.barHeight}
              width={26}
              height={point.barHeight}
              rx={8}
              fill="rgba(255,255,255,0.16)"
              stroke="rgba(255,255,255,0.12)"
            />
          ))}

          <path d={chart.areaPath} fill="url(#price-area)" />
          <path
            d={chart.path}
            fill="none"
            stroke="url(#price-line)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#price-glow)"
          />

          {chart.points.map((point, index) => {
            const active = hoveredIndex === index;
            return (
              <g
                key={point.orderId}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: "pointer" }}
              >
                <line
                  x1={point.x}
                  x2={point.x}
                  y1={chart.padding.top}
                  y2={chart.barBaseY + 8}
                  stroke={active ? "rgba(255,255,255,0.32)" : "transparent"}
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={active ? 8 : 5}
                  fill={active ? "#ffffff" : "#f7b38a"}
                  stroke="#0f3d3e"
                  strokeWidth={3}
                  style={{ transition: "all 180ms ease" }}
                />
                {(index % labelStep === 0 || index === chart.points.length - 1) && (
                  <text
                    x={point.x}
                    y={chart.barBaseY + 34}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="rgba(255,255,255,0.62)"
                  >
                    {formatDate(point.date)}
                  </text>
                )}
              </g>
            );
          })}

          {hover ? (
            <g>
              <line
                x1={hover.x}
                x2={hover.x}
                y1={chart.padding.top}
                y2={chart.barBaseY + 8}
                stroke="rgba(255,255,255,0.28)"
              />
              <g
                transform={`translate(${Math.min(
                  Math.max(hover.x - 112, chart.padding.left),
                  chart.width - chart.padding.right - 224
                )}, ${Math.max(18, hover.y - 96)})`}
              >
                <rect
                  width={224}
                  height={82}
                  rx={16}
                  fill="rgba(255,255,255,0.96)"
                  stroke="rgba(15,61,62,0.18)"
                />
                <text x={14} y={24} fontSize={12} fontWeight={700} fill="#0f3d3e">
                  {hover.orderName}
                </text>
                <text x={14} y={43} fontSize={11} fill="rgba(0,0,0,0.62)">
                  {formatDate(hover.date)} · {hover.supplierName ?? "-"}
                </text>
                <text x={14} y={63} fontSize={13} fontWeight={700} fill="#111827">
                  {formatMoney(hover.unitPrice, hover.currency)}
                </text>
                <text x={142} y={63} fontSize={11} fontWeight={700} fill="#0f766e">
                  {formatPct(hover.changePct)}
                </text>
              </g>
            </g>
          ) : null}
        </svg>
      </div>

      <div className="grid gap-2 border-t border-white/10 bg-black/10 p-3 md:grid-cols-3">
        {chart.clean
          .slice(-3)
          .reverse()
          .map((item) => (
            <Link
              key={`latest-${item.orderId}`}
              href={`/orders/${item.orderId}`}
              className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm transition hover:-translate-y-0.5 hover:bg-white/15"
            >
              <p className="truncate font-semibold">{item.orderName}</p>
              <p className="mt-1 text-xs text-white/55">
                {formatDate(item.date)} · {item.supplierName ?? "-"}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {formatMoney(item.unitPrice, item.currency)} · {formatNumber(item.quantity)} adet
              </p>
            </Link>
          ))}
      </div>
    </div>
  );
}
