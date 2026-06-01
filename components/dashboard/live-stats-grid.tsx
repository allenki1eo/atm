"use client";

import { useMemo } from "react";
import { Users, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useTodayAttendance } from "@/hooks/use-attendance";
import { useAttendanceVisibility } from "@/hooks/use-attendance-visibility";
import { StatsGrid, type Stat } from "@/components/dashboard/stats-grid";

interface LiveStatsGridProps {
  /** 7-day sparkline arrays passed from the server (present/late/absent per day) */
  sparklines?: {
    all: number[];
    present: number[];
    late: number[];
    absent: number[];
  };
}

export function LiveStatsGrid({ sparklines }: LiveStatsGridProps) {
  const { data: records } = useTodayAttendance();
  const { hidden } = useAttendanceVisibility();

  const stats = useMemo<Stat[]>(() => {
    const visible = (records ?? [])
      .filter((r) => !hidden.sections.includes(r.section_id ?? ""))
      .filter((r) => !hidden.employees.includes(r.employee_id));

    const total   = visible.length;
    const present = visible.filter((r) => r.status === "present").length;
    const late    = visible.filter((r) => r.status === "late").length;
    const absent  = visible.filter((r) => r.status === "absent").length;

    return [
      {
        label: "Total Employees",
        value: total,
        icon: Users,
        color: "text-blue-600",
        bgColor: "bg-blue-50",
        sparklineData: sparklines?.all,
      },
      {
        label: "Present Today",
        value: present,
        icon: CheckCircle,
        color: "text-green-600",
        bgColor: "bg-green-50",
        change:
          total > 0
            ? `${Math.round(((present + late) / total) * 100)}% attendance rate`
            : undefined,
        changeType: "neutral",
        sparklineData: sparklines?.present,
      },
      {
        label: "Late Today",
        value: late,
        icon: Clock,
        color: "text-amber-600",
        bgColor: "bg-amber-50",
        sparklineData: sparklines?.late,
      },
      {
        label: "Absent Today",
        value: absent,
        icon: AlertCircle,
        color: "text-red-600",
        bgColor: "bg-red-50",
        sparklineData: sparklines?.absent,
      },
    ];
  }, [records, hidden, sparklines]);

  return <StatsGrid stats={stats} />;
}
