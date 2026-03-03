"use client";

import { useState } from "react";

interface SupplierDonutChartProps {
    data: { name: string; count: number }[];
}

const COLORS = [
    "var(--ocean)",
    "var(--clay)",
    "var(--peach)",
    "var(--mint)",
    "var(--sky)",
    "#7c6f9b",
];

export default function SupplierDonutChart({
    data,
}: SupplierDonutChartProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    const total = data.reduce((sum, d) => sum + d.count, 0);

    if (!total) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-black/40">
                Veri bulunamadı
            </div>
        );
    }

    const radius = 70;
    const strokeWidth = 28;
    const circumference = 2 * Math.PI * radius;
    const center = radius + strokeWidth / 2 + 4;
    const svgSize = center * 2;

    /* Build segments */
    let cumulativeOffset = 0;
    const segments = data.map((item, idx) => {
        const fraction = item.count / total;
        const dashLength = fraction * circumference;
        const gapLength = circumference - dashLength;
        const offset = -cumulativeOffset;
        cumulativeOffset += dashLength;

        return {
            ...item,
            idx,
            fraction,
            dashArray: `${dashLength} ${gapLength}`,
            dashOffset: offset,
            color: COLORS[idx % COLORS.length],
        };
    });

    return (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
            {/* Donut */}
            <div className="relative flex-shrink-0">
                <svg
                    width={svgSize}
                    height={svgSize}
                    viewBox={`0 0 ${svgSize} ${svgSize}`}
                    className="block"
                >
                    {/* background ring */}
                    <circle
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke="rgba(0,0,0,0.04)"
                        strokeWidth={strokeWidth}
                    />

                    {/* segments */}
                    {segments.map((seg) => (
                        <circle
                            key={seg.name}
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth={
                                hoveredIndex === seg.idx
                                    ? strokeWidth + 6
                                    : strokeWidth
                            }
                            strokeDasharray={seg.dashArray}
                            strokeDashoffset={seg.dashOffset}
                            strokeLinecap="butt"
                            opacity={
                                hoveredIndex === null || hoveredIndex === seg.idx
                                    ? 1
                                    : 0.35
                            }
                            transform={`rotate(-90 ${center} ${center})`}
                            style={{
                                transition: "all 250ms ease",
                                cursor: "pointer",
                            }}
                            onMouseEnter={() => setHoveredIndex(seg.idx)}
                            onMouseLeave={() => setHoveredIndex(null)}
                        />
                    ))}

                    {/* center text */}
                    <text
                        x={center}
                        y={center - 6}
                        textAnchor="middle"
                        fontSize={22}
                        fontWeight={700}
                        fill="var(--ink)"
                    >
                        {total}
                    </text>
                    <text
                        x={center}
                        y={center + 12}
                        textAnchor="middle"
                        fontSize={9}
                        fill="rgba(0,0,0,0.45)"
                        fontWeight={500}
                        letterSpacing="0.08em"
                    >
                        SİPARİŞ
                    </text>
                </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-2 sm:flex-col sm:gap-1.5 sm:pt-2">
                {segments.map((seg) => {
                    const pct = Math.round(seg.fraction * 100);
                    const isActive = hoveredIndex === null || hoveredIndex === seg.idx;

                    return (
                        <div
                            key={seg.name}
                            className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-all duration-200"
                            style={{
                                opacity: isActive ? 1 : 0.4,
                                background:
                                    hoveredIndex === seg.idx
                                        ? "rgba(0,0,0,0.04)"
                                        : "transparent",
                            }}
                            onMouseEnter={() => setHoveredIndex(seg.idx)}
                            onMouseLeave={() => setHoveredIndex(null)}
                        >
                            <span
                                className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
                                style={{ background: seg.color }}
                            />
                            <span className="max-w-[140px] truncate text-xs font-medium text-black/75">
                                {seg.name}
                            </span>
                            <span className="text-[10px] font-semibold text-black/50">
                                {seg.count} ({pct}%)
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
