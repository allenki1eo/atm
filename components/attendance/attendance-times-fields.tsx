"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  combineEatDateTime,
  formatEatHourMinute,
  isLateByRule,
  type WorkHoursSettings,
} from "@/lib/attendance-times";

interface AttendanceTimesFieldsProps {
  employeeName: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  timesUpdatedByName?: string | null;
  timesUpdatedAt?: string | null;
  disabled?: boolean;
  settings?: WorkHoursSettings | null;
  onSave: (times: { check_in_at: string | null; check_out_at: string | null }) => void | Promise<void>;
  className?: string;
}

function formatUpdatedAt(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.includes("T") || value.includes("+") || /Z$/.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(dt);
}

export function AttendanceTimesFields({
  employeeName,
  checkInAt,
  checkOutAt,
  timesUpdatedByName,
  timesUpdatedAt,
  disabled = false,
  settings,
  onSave,
  className,
}: AttendanceTimesFieldsProps) {
  const storedIn = formatEatHourMinute(checkInAt) ?? "";
  const storedOut = formatEatHourMinute(checkOutAt) ?? "";
  const [checkIn, setCheckIn] = useState(storedIn);
  const [checkOut, setCheckOut] = useState(storedOut);

  useEffect(() => {
    setCheckIn(storedIn);
  }, [storedIn]);
  useEffect(() => {
    setCheckOut(storedOut);
  }, [storedOut]);

  const dirty = checkIn !== storedIn || checkOut !== storedOut;

  let lateByRule = false;
  if (checkIn && settings?.work_start_time) {
    try {
      lateByRule = isLateByRule(combineEatDateTime("2000-01-01", checkIn), {
        work_start_time: settings.work_start_time,
        grace_minutes: settings.grace_minutes,
      });
    } catch {
      lateByRule = false;
    }
  }

  const commit = () => {
    if (disabled || !dirty) return;
    void onSave({
      check_in_at: checkIn || null,
      check_out_at: checkOut || null,
    });
  };

  const inputClass = "h-10 min-h-10 w-[7.25rem] text-base sm:text-sm";
  const updated = formatUpdatedAt(timesUpdatedAt);
  const fieldId = employeeName.replace(/\s+/g, "-").toLowerCase();

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={`check-in-${fieldId}`} className="text-[11px] text-muted-foreground">
            Ingia
          </Label>
          <Input
            id={`check-in-${fieldId}`}
            type="time"
            step={60}
            value={checkIn}
            disabled={disabled}
            onChange={(e) => setCheckIn(e.target.value)}
            onBlur={commit}
            aria-label={`Check-in time for ${employeeName}`}
            className={inputClass}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`check-out-${fieldId}`} className="text-[11px] text-muted-foreground">
            Toka
          </Label>
          <Input
            id={`check-out-${fieldId}`}
            type="time"
            step={60}
            value={checkOut}
            disabled={disabled}
            onChange={(e) => setCheckOut(e.target.value)}
            onBlur={commit}
            aria-label={`Check-out time for ${employeeName}`}
            className={inputClass}
          />
        </div>
      </div>
      {lateByRule && (
        <p className="text-[11px] text-amber-700">
          Baada ya muda wa kuanza kazi — hali itakuwa Late isipokuwa ubadilishe.
        </p>
      )}
      {(timesUpdatedByName || updated) && (
        <p className="text-[11px] text-muted-foreground">
          {timesUpdatedByName ? `Saa ziliwekwa na ${timesUpdatedByName}` : "Saa zilirekebishwa"}
          {updated ? ` · ${updated} EAT` : ""}
        </p>
      )}
    </div>
  );
}
