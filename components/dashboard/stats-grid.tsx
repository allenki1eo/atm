import type { ElementType } from "react";
import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: string | number;
  icon: ElementType;
  color: string;
  bgColor: string;
  change?: string;
  sparklineData?: number[];
}

interface StatsGridProps {
  stats: Stat[];
}

function MiniBarChart({ values, barClass }: { values: number[]; barClass: string }) {
  const max = Math.max(...values, 1);
  const W = 88;
  const H = 44;
  const n = values.length;
  const slotW = W / n;
  const barW = Math.max(slotW * 0.55, 3);
  const gap = (slotW - barW) / 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-[88px] h-11 shrink-0"
      aria-hidden="true"
    >
      {values.map((v, i) => {
        const h = Math.max((v / max) * H, v > 0 ? 3 : 1);
        const x = i * slotW + gap;
        return (
          <rect
            key={i}
            x={x}
            y={H - h}
            width={barW}
            height={h}
            rx={1.5}
            className={barClass}
          />
        );
      })}
    </svg>
  );
}

const FALLBACK_SPARKLINES = [
  [3, 5, 4, 7, 6, 8, 6, 9, 7, 10, 8, 9],
  [7, 8, 7, 9, 8, 10, 9, 10, 8, 9, 10, 9],
  [8, 7, 9, 6, 8, 7, 9, 8, 7, 9, 8, 10],
  [5, 6, 4, 7, 5, 8, 6, 7, 5, 6, 7, 8],
];

const BAR_CLASSES: Record<string, string> = {
  "text-blue-600":  "fill-blue-400/70",
  "text-green-600": "fill-green-400/70",
  "text-amber-600": "fill-amber-400/70",
  "text-red-600":   "fill-red-400/70",
};

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat, idx) => {
        const sparkValues =
          stat.sparklineData && stat.sparklineData.some((v) => v > 0)
            ? stat.sparklineData
            : FALLBACK_SPARKLINES[idx % FALLBACK_SPARKLINES.length];
        const barClass = BAR_CLASSES[stat.color] ?? "fill-gray-400/70";

        return (
          <div
            key={stat.label}
            className="rounded-xl border bg-card p-5 flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow"
          >
            {/* Left: text */}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                {stat.label}
              </p>
              <p className="text-2xl font-bold text-foreground leading-none mb-1">
                {stat.value}
              </p>
              {stat.change && (
                <p className="text-xs text-muted-foreground">{stat.change}</p>
              )}
            </div>

            {/* Right: mini bar chart */}
            <MiniBarChart values={sparkValues} barClass={barClass} />
          </div>
        );
      })}
    </div>
  );
}

export type { Stat };

function Noop() { return null; }

export const defaultStats = {
  totalEmployees: (count: number): Stat => ({
    label: "Total Employees",
    value: count,
    icon: Noop,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  }),
  present: (count: number, total: number): Stat => ({
    label: "Present Today",
    value: count,
    icon: Noop,
    color: "text-green-600",
    bgColor: "bg-green-50",
    change: total > 0 ? `${Math.round((count / total) * 100)}% attendance` : undefined,
  }),
  late: (count: number): Stat => ({
    label: "Late Today",
    value: count,
    icon: Noop,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  }),
  absent: (count: number): Stat => ({
    label: "Absent Today",
    value: count,
    icon: Noop,
    color: "text-red-600",
    bgColor: "bg-red-50",
  }),
};
