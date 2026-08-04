"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MessageSquareWarning, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttendanceCalendar } from "@/hooks/use-attendance";
import { cn } from "@/lib/utils";
import { CorrectionRequestDialog } from "./correction-request-dialog";

const STATUS_COLORS = {
  present: "bg-green-500",
  absent: "bg-red-500",
  late: "bg-amber-500",
  half_day: "bg-blue-400",
};

const STATUS_LABELS = {
  present: "Alikuwepo",
  absent: "Hakuwepo",
  late: "Alichelewa",
  half_day: "Nusu Siku",
};

const OVERTIME_COLOR = "bg-green-600";
const OVERTIME_LABEL = "Overtime";

interface OvertimeDay {
  date: string;
  hours: number;
  amount: number;
}

const formatHours = (hours: number) =>
  Number.isInteger(hours) ? String(hours) : hours.toFixed(1);

interface AttendanceCalendarProps {
  employeeId: string;
  /** When true, show a "Report issue" button for the selected day and
   *  surface pending/resolved correction requests from the current user. */
  allowCorrection?: boolean;
}

interface CorrectionRow {
  id: string;
  date: string;
  requested_status: string;
  status: "pending" | "approved" | "denied";
}

export function AttendanceCalendar({ employeeId, allowCorrection = false }: AttendanceCalendarProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);

  const { data, isLoading } = useAttendanceCalendar(employeeId, year, month);

  const { data: myCorrections } = useQuery({
    queryKey: ["attendance-corrections", "mine"],
    queryFn: async () => {
      const res = await fetch("/api/attendance-corrections");
      if (!res.ok) return [] as CorrectionRow[];
      return (await res.json()) as CorrectionRow[];
    },
    enabled: allowCorrection,
    refetchInterval: 60_000,
  });

  const correctionByDate = new Map(
    (myCorrections ?? []).map((c) => [c.date, c])
  );

  const monthName = new Date(year, month - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const recordMap = new Map(
    (data?.records ?? []).map((r: { date: string; status: string }) => [r.date, r])
  );

  const overtimeMap = new Map(
    ((data?.overtime ?? []) as OvertimeDay[]).map((o) => [o.date, o])
  );

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const selectedRecord = selectedDate ? recordMap.get(selectedDate) : null;
  const selectedOvertime = selectedDate ? overtimeMap.get(selectedDate) : null;

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="font-semibold">{monthName}</h3>
        <Button variant="ghost" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary */}
      {data?.summary && (
        <div
          className={cn(
            "grid gap-2 text-center",
            data.summary.overtime_days > 0 ? "grid-cols-5" : "grid-cols-4"
          )}
        >
          <div className="rounded-lg bg-green-50 p-2">
            <p className="text-lg font-bold text-green-700">{data.summary.present}</p>
            <p className="text-xs text-green-600">Present</p>
          </div>
          <div className="rounded-lg bg-red-50 p-2">
            <p className="text-lg font-bold text-red-700">{data.summary.absent}</p>
            <p className="text-xs text-red-600">Absent</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-2">
            <p className="text-lg font-bold text-amber-700">{data.summary.late}</p>
            <p className="text-xs text-amber-600">Late</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-2">
            <p className="text-lg font-bold text-blue-700">{data.summary.half_day}</p>
            <p className="text-xs text-blue-600">Half Day</p>
          </div>
          {data.summary.overtime_days > 0 && (
            <div className="rounded-lg bg-emerald-50 p-2">
              <p className="text-lg font-bold text-emerald-800">{data.summary.overtime_days}</p>
              <p className="text-xs text-emerald-700">
                OT ({formatHours(data.summary.overtime_hours)}h)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Calendar grid */}
      <div>
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells for first week */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const record = recordMap.get(dateStr) as { status: string; notes?: string } | undefined;
            const overtimeDay = overtimeMap.get(dateStr);
            const isToday = dateStr === new Date().toISOString().split("T")[0];
            const isSelected = selectedDate === dateStr;
            const isFuture = new Date(dateStr) > new Date();

            return (
              <button
                key={dateStr}
                onClick={() => !isFuture && setSelectedDate(isSelected ? null : dateStr)}
                disabled={isFuture}
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-lg p-1.5 text-sm transition-colors",
                  isToday && "ring-2 ring-primary ring-offset-1",
                  isSelected && "bg-primary/10",
                  !isFuture && !isSelected && "hover:bg-muted/50",
                  isFuture && "opacity-30 cursor-default"
                )}
                title={
                  overtimeDay
                    ? `${OVERTIME_LABEL}: saa ${formatHours(overtimeDay.hours)}`
                    : undefined
                }
              >
                <span className={cn("text-xs font-medium", isToday && "text-primary")}>
                  {day}
                </span>
                {(record || overtimeDay) && (
                  <span className="mt-0.5 flex items-center gap-0.5">
                    {record && (
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          STATUS_COLORS[record.status as keyof typeof STATUS_COLORS] ?? "bg-gray-400"
                        )}
                      />
                    )}
                    {overtimeDay && (
                      <span className={cn("h-1.5 w-1.5 rounded-full", OVERTIME_COLOR)} />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDate && (
        <div className="rounded-lg border p-3 bg-muted/20 space-y-2">
          <p className="text-sm font-medium">
            {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          {selectedRecord ? (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  STATUS_COLORS[(selectedRecord as { status: string }).status as keyof typeof STATUS_COLORS]
                )}
              />
              <span className="text-sm">
                {STATUS_LABELS[(selectedRecord as { status: string }).status as keyof typeof STATUS_LABELS]}
              </span>
              {(selectedRecord as { notes?: string }).notes && (
                <span className="text-xs text-muted-foreground">— {(selectedRecord as { notes?: string }).notes}</span>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No record for this day</p>
          )}

          {selectedOvertime && (
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", OVERTIME_COLOR)} />
              <span className="text-sm">
                {OVERTIME_LABEL}: saa {formatHours(selectedOvertime.hours)}
              </span>
            </div>
          )}

          {allowCorrection && (() => {
            const pending = correctionByDate.get(selectedDate);
            if (pending?.status === "pending") {
              return (
                <div className="flex items-center gap-2 text-xs text-amber-700">
                  <Clock className="h-3 w-3" />
                  Ombi la marekebisho linasubiri (umeomba &ldquo;
                  {STATUS_LABELS[pending.requested_status as keyof typeof STATUS_LABELS]}&rdquo;)
                </div>
              );
            }
            if (pending?.status === "denied") {
              return (
                <p className="text-xs text-red-700">Ombi lililopita lilikataliwa.</p>
              );
            }
            const isFuture = new Date(selectedDate) > new Date();
            if (isFuture) return null;
            return (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setCorrectionOpen(true)}
              >
                <MessageSquareWarning className="h-3 w-3 mr-1.5" />
                Omba Marekebisho
              </Button>
            );
          })()}
        </div>
      )}

      {allowCorrection && selectedDate && (
        <CorrectionRequestDialog
          open={correctionOpen}
          onOpenChange={setCorrectionOpen}
          date={selectedDate}
          currentStatus={
            selectedRecord ? (selectedRecord as { status: string }).status : null
          }
        />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <span key={status} className="flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", STATUS_COLORS[status as keyof typeof STATUS_COLORS])} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-full", OVERTIME_COLOR)} />
          {OVERTIME_LABEL}
        </span>
      </div>
    </div>
  );
}
