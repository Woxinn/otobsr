"use client";

import { useState } from "react";

interface MonthlyOrdersChartProps {
  data: { month: string; count: number }[];
}

export default function MonthlyOrdersChart({
  data,
}: MonthlyOrdersChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-black/40">
        Veri bulunamadı
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const barWidth = 40;
  const gap = 24;
  const chartHeight = 180;
  const labelHeight = 32;
  const topPadding = 24;
  const svgWidth = data.length * (barWidth + gap) - gap + 32;
  const svgHeight = chartHeight + labelHeight + topPadding;

  /* horizontal grid lines */
  const gridLines = 4;
  const gridStep = maxCount / gridLines;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="mx-auto block"
        style={{ maxWidth: svgWidth, width: "100%" }}
      >
        {/* grid lines */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y =
            topPadding + chartHeight - (i / gridLines) * chartHeight;
          const label = Math.round(gridStep * i);
          return (
            <g key={`grid-${i}`}>
              <line
                x1={16}
                y1={y}
                x2={svgWidth - 16}
                y2={y}
                stroke="rgba(0,0,0,0.06)"
                strokeDasharray="4 4"
              />
              <text
                x={8}
                y={y - 4}
                fontSize={9}
                fill="rgba(0,0,0,0.35)"
                textAnchor="start"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* bars */}
        {data.map((item, idx) => {
          const barHeight = (item.count / maxCount) * chartHeight;
          const x = 16 + idx * (barWidth + gap);
          const y = topPadding + chartHeight - barHeight;
          const isHovered = hoveredIndex === idx;

          return (
            <g
              key={item.month}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{ cursor: "pointer" }}
            >
              {/* bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={6}
                fill={isHovered ? "var(--clay)" : "var(--ocean)"}
                opacity={isHovered ? 1 : 0.85}
                style={{
                  transition: "all 250ms ease",
                }}
              />

              {/* count label on top */}
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={isHovered ? "var(--clay)" : "rgba(0,0,0,0.6)"}
                style={{ transition: "fill 250ms ease" }}
              >
                {item.count}
              </text>

              {/* month label */}
              <text
                x={x + barWidth / 2}
                y={topPadding + chartHeight + 16}
                textAnchor="middle"
                fontSize={10}
                fontWeight={500}
                fill="rgba(0,0,0,0.55)"
              >
                {item.month}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
