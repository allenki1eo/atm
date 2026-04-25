"use client";

interface DayData {
  date: string;
  present: number;
  late: number;
  absent: number;
}

export function AttendanceChart({ data }: { data: DayData[] }) {
  if (!data.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">No attendance data available</p>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.present + d.late + d.absent), 1);
  const W = 560;
  const H = 200;
  const PAD = { top: 24, right: 16, bottom: 40, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const slotW = chartW / data.length;
  const barW = Math.min(slotW * 0.62, 44);

  const yScale = (v: number) => (v / maxVal) * chartH;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        aria-label="7-day attendance trend chart"
      >
        {/* Y-axis grid lines */}
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
                {Math.round(pct * maxVal)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const cx = PAD.left + i * slotW + slotW / 2;
          const x = cx - barW / 2;
          const base = PAD.top + chartH;
          const aH = yScale(d.absent);
          const lH = yScale(d.late);
          const pH = yScale(d.present);
          const stackH = aH + lH + pH;
          const total = d.present + d.late + d.absent;
          const date = new Date(d.date + "T12:00:00");
          const dayLabel = dayNames[date.getDay()];
          const dateLabel = d.date.slice(5); // MM-DD

          return (
            <g key={d.date}>
              {/* absent — bottom */}
              {aH > 0 && (
                <rect x={x} y={base - aH} width={barW} height={aH} fill="#fca5a5" rx={2} />
              )}
              {/* late — middle */}
              {lH > 0 && (
                <rect
                  x={x}
                  y={base - aH - lH}
                  width={barW}
                  height={lH}
                  fill="#fcd34d"
                  rx={2}
                />
              )}
              {/* present — top */}
              {pH > 0 && (
                <rect
                  x={x}
                  y={base - stackH}
                  width={barW}
                  height={pH}
                  fill="#86efac"
                  rx={2}
                />
              )}
              {/* Total count above bar */}
              {total > 0 && (
                <text
                  x={cx}
                  y={base - stackH - 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#374151"
                  fontWeight="600"
                >
                  {total}
                </text>
              )}
              {/* Day name */}
              <text
                x={cx}
                y={H - PAD.bottom + 14}
                textAnchor="middle"
                fontSize={9}
                fill="#6b7280"
              >
                {dayLabel}
              </text>
              {/* Date */}
              <text
                x={cx}
                y={H - PAD.bottom + 26}
                textAnchor="middle"
                fontSize={8}
                fill="#9ca3af"
              >
                {dateLabel}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex gap-5 justify-center mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-green-300 inline-block" />
          Present
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-yellow-300 inline-block" />
          Late
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-300 inline-block" />
          Absent
        </span>
      </div>
    </div>
  );
}
