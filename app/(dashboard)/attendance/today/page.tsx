"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, RefreshCw, Lock } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { LockDayDialog } from "@/components/attendance/lock-day-dialog";
import { UnlockDayDialog } from "@/components/attendance/unlock-day-dialog";
import { useTodayAttendance } from "@/hooks/use-attendance";
import { getTodayDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export default function TodayAttendancePage() {
  const today = getTodayDate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const canUnlock = role === "admin";
  const { data: records, isLoading, refetch } = useTodayAttendance();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const unmarkedCount = records?.filter((r) => !r.status).length ?? 0;
  const isAnyLocked = records?.some((r) => r.is_locked) ?? false;

  const formattedDate = format(new Date(today + "T12:00:00"), "EEEE, MMMM d, yyyy");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Today&apos;s Attendance</h1>
            {isAnyLocked && (
              <Badge variant="warning" className="ml-2">
                <Lock className="h-3 w-3 mr-1" />
                Locked
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">{formattedDate}</p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {!isAnyLocked && records && records.length > 0 && (
            <LockDayDialog
              date={today}
              unmarkedCount={unmarkedCount}
              onLocked={() => queryClient.invalidateQueries({ queryKey: ["attendance", "today"] })}
            />
          )}

          {isAnyLocked && canUnlock && (
            <UnlockDayDialog
              date={today}
              onUnlocked={() => queryClient.invalidateQueries({ queryKey: ["attendance", "today"] })}
            />
          )}
        </div>
      </div>

      {/* Attendance Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <AttendanceTable
          records={records ?? []}
          isLoading={isLoading}
          date={today}
          isLocked={isAnyLocked}
        />
      )}

      {/* Instructions */}
      {!isAnyLocked && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-1">Instructions</h3>
          <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
            <li>Click P (present), A (absent), or L (late) buttons to mark attendance</li>
            <li>Use checkboxes to select multiple employees for bulk actions</li>
            <li>Click on the notes column to add notes to any record</li>
            <li>Lock the day when done to prevent further changes</li>
          </ul>
        </div>
      )}
    </div>
  );
}
