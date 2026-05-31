import type { ElementType } from "react";
import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: string | number;
  icon: ElementType;
  color: string;
  bgColor: string;
  change?: string;
  changeType?: "up" | "down" | "neutral";
  sparklineData?: number[];
}

interface StatsGridProps {
  stats: Stat[];
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const W = 80;
  const H = 32;
  const n = values.length;
  const step = W / (n - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x},${y}`;
  });

  const colorMap: Record<string, string> = {
    purple: "stroke-primary",
    green:  "stroke-emerald-500",
    amber:  "stroke-amber-500",
    red:    "stroke-red-500",
    blue:   "stroke-blue-500",
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-20 h-8 shrink-0" aria-hidden="true">
      <polyline
        points={points.join(" ")}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={colorMap[color] ?? "stroke-primary"}
        opacity="0.7"
      />
    </svg>
  );
}

const FALLBACK_SPARKLINES = [
  [3, 5, 4, 7, 6, 8, 6, 9, 7, 10, 8, 9],
  [7, 8, 7, 9, 8, 10, 9, 10, 8, 9, 10, 9],
  [8, 7, 9, 6, 8, 7, 9, 8, 7, 9, 8, 10],
  [5, 6, 4, 7, 5, 8, 6, 7, 5, 6, 7, 8],
];

const ICON_STYLES: Record<string, { bg: string; text: string }> = {
  "text-blue-600":   { bg: "bg-blue-100",   text: "text-blue-600" },
  "text-green-600":  { bg: "bg-emerald-100", text: "text-emerald-600" },
  "text-amber-600":  { bg: "bg-amber-100",   text: "text-amber-600" },
  "text-red-600":    { bg: "bg-red-100",     text: "text-red-600" },
  "text-purple-600": { bg: "bg-purple-100",  text: "text-purple-600" },
};

const SPARK_COLOR: Record<string, string> = {
  "text-blue-600":   "blue",
  "text-green-600":  "green",
  "text-amber-600":  "amber",
  "text-red-600":    "red",
  "text-purple-600": "purple",
};

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat, idx) => {
        const sparkValues =
          stat.sparklineData && stat.sparklineData.some((v) => v > 0)
            ? stat.sparklineData
            : FALLBACK_SPARKLINES[idx % FALLBACK_SPARKLINES.length];

        const iconStyle = ICON_STYLES[stat.color] ?? { bg: "bg-muted", text: "text-muted-foreground" };
        const sparkColor = SPARK_COLOR[stat.color] ?? "purple";
        const Icon = stat.icon;

        return (
          <div
            key={stat.label}
            className="rounded-2xl bg-card border border-border/60 p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-2">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl shrink-0", iconStyle.bg)}>
                <Icon className={cn("h-5 w-5", iconStyle.text)} />
              </div>
              <MiniSparkline values={sparkValues} color={sparkColor} />
            </div>

            <div>
              <p className="text-2xl font-bold text-foreground leading-none mb-1">
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground font-medium">{stat.label}</p>
              {stat.change && (
                <p className={cn(
                  "text-xs mt-1 font-medium",
                  stat.changeType === "up" ? "text-emerald-600" :
                  stat.changeType === "down" ? "text-red-500" :
                  "text-muted-foreground"
                )}>
                  {stat.change}
                </p>
              )}
            </div>
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
    label: "Total Wafanyakazi",
    value: count,
    icon: Noop,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  }),
  present: (count: number, total: number): Stat => ({
    label: "Walikuwepo Leo",
    value: count,
    icon: Noop,
    color: "text-green-600",
    bgColor: "bg-green-50",
    change: total > 0 ? `${Math.round((count / total) * 100)}% ya wafanyakazi` : undefined,
    changeType: "neutral",
  }),
  late: (count: number): Stat => ({
    label: "Walichelewa Leo",
    value: count,
    icon: Noop,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  }),
  absent: (count: number): Stat => ({
    label: "Hawakuwepo Leo",
    value: count,
    icon: Noop,
    color: "text-red-600",
    bgColor: "bg-red-50",
  }),
};
