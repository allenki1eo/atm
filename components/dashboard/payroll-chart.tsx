"use client";

export interface PayrollMonthData {
  month: number;
  year: number;
  label: string;
  total: number;
  projected: boolean;
}

export function PayrollChart({ data }: { data: PayrollMonthData[] }) {
  if (!data.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">No payroll data available</p>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const lockedData = data.filter((d) => !d.projected);
  const avg =
    lockedData.length > 0
      ? lockedData.reduce((s, d) => s + d.total, 0) / lockedData.length
      : 0;

  const W = 560;
  const H = 220;
  const PAD = { top: 28, right: 20, bottom: 44, left: 68 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const slotW = chartW / Math.max(data.length, 1);
  const barW = Math.min(slotW * 0.62, 48);

  const yScale = (v: number) => (v / maxVal) * chartH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  const formatK = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
    return String(Math.round(v));
  };

  const avgY = avg > 0 ? PAD.top + chartH - yScale(avg) : null;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        aria-label="Casual payroll 6-month trend chart"
      >
        {/* Y-axis grid lines + labels */}
        {yTicks.map((pct) => {
          const y = PAD.top + chartH - pct * chartH;
          return (
            <g key={pct}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth={0.8}
              />
              <text
                x={PAD.left - 6}
                y={y + 4}
                textAnchor="end"
                fontSize={9}
                fill="#9ca3af"
              >
                {formatK(pct * maxVal)}
              </text>
            </g>
          );
        })}

        {/* Average dashed line */}
        {avgY !== null && (
          <>
            <line
              x1={PAD.left}
              y1={avgY}
              x2={W - PAD.right - 4}
              y2={avgY}
              stroke="#94a3b8"
              strokeWidth={1.2}
              strokeDasharray="5 3"
            />
            <text
              x={W - PAD.right + 2}
              y={avgY + 4}
              fontSize={8}
              fill="#94a3b8"
            >
              avg
            </text>
          </>
        )}

        {/* Bars */}
        {data.map((d, i) => {
          const cx = PAD.left + i * slotW + slotW / 2;
          const x = cx - barW / 2;
          const bH = Math.max(yScale(d.total), d.total > 0 ? 2 : 0);
          const base = PAD.top + chartH;
          const isHigh = !d.projected && avg > 0 && d.total > avg * 1.1;
          const isLow = !d.projected && avg > 0 && d.total > 0 && d.total < avg * 0.9;
          const fill = d.projected
            ? "#c7d2fe"
            : isHigh
            ? "#fca5a5"
            : isLow
            ? "#86efac"
            : "#93c5fd";

          return (
            <g key={`${d.year}-${d.month}`}>
              <rect
                x={x}
                y={base - bH}
                width={barW}
                height={bH}
                fill={fill}
                rx={3}
                opacity={d.projected ? 0.8 : 1}
              />
              {/* Value label above bar */}
              {d.total > 0 && (
                <text
                  x={cx}
                  y={base - bH - (d.projected ? 16 : 4)}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#374151"
                  fontWeight="600"
                >
                  {formatK(d.total)}
                </text>
              )}
              {/* Projected label */}
              {d.projected && (
                <text
                  x={cx}
                  y={base - bH - 4}
                  textAnchor="middle"
                  fontSize={7}
                  fill="#6366f1"
                >
                  ~proj
                </text>
              )}
              {/* Month label */}
              <text
                x={cx}
                y={H - PAD.bottom + 14}
                textAnchor="middle"
                fontSize={9}
                fill="#6b7280"
              >
                {d.label.split(" ")[0]}
              </text>
              {/* Year (short) */}
              <text
                x={cx}
                y={H - PAD.bottom + 26}
                textAnchor="middle"
                fontSize={8}
                fill="#9ca3af"
              >
                {"'" + String(d.year).slice(2)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-300 inline-block" />
          Normal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-300 inline-block" />
          High spend
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-green-300 inline-block" />
          Low spend
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-indigo-200 inline-block" />
          Projected
        </span>
        {avgY !== null && (
          <span className="flex items-center gap-1.5">
            <svg width="18" height="8" className="inline-block">
              <line
                x1="0"
                y1="4"
                x2="18"
                y2="4"
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
            </svg>
            Average
          </span>
        )}
      </div>
    </div>
  );
}
