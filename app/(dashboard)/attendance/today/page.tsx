"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { CalendarDays, RefreshCw, Lock, Eye, EyeOff, ChevronDown, ChevronUp, Search, RotateCcw } from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AttendanceTable } from "@/components/attendance/attendance-table";
import { LockDayDialog } from "@/components/attendance/lock-day-dialog";
import { UnlockDayDialog } from "@/components/attendance/unlock-day-dialog";
import { useTodayAttendance } from "@/hooks/use-attendance";
import { useAttendanceVisibility } from "@/hooks/use-attendance-visibility";
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
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const { hidden, toggleEmployee, toggleSection, reset: resetVisibility } = useAttendanceVisibility();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const companies = useMemo(() => {
    if (!records) return [];
    const map = new Map<string, string>();
    for (const r of records) {
      if (r.company_id && r.company_name) map.set(r.company_id, r.company_name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [records]);

  const sections = useMemo(() => {
    if (!records) return [];
    const map = new Map<string, { id: string; name: string; company_id: string }>();
    for (const r of records) {
      if (r.section_id && r.section_name) {
        map.set(r.section_id, { id: r.section_id, name: r.section_name, company_id: r.company_id ?? "" });
      }
    }
    return Array.from(map.values());
  }, [records]);

  const visibleRecords = useMemo(() => {
    if (!records) return [];
    return records
      .filter((r) => !selectedCompany || r.company_id === selectedCompany)
      .filter((r) => !r.section_id || !hidden.sections.includes(r.section_id))
      .filter((r) => !hidden.employees.includes(r.employee_id));
  }, [records, selectedCompany, hidden]);

  const unmarkedCount = visibleRecords.filter((r) => !r.status).length;
  const isAnyLocked = records?.some((r) => r.is_locked) ?? false;

  const formattedDate = format(new Date(today + "T12:00:00"), "EEEE, MMMM d, yyyy");

  const filteredEmployeesForPanel = useMemo(() => {
    if (!records) return [];
    const seen = new Set<string>();
    return records.filter((r) => {
      if (seen.has(r.employee_id)) return false;
      seen.add(r.employee_id);
      return r.employee_name.toLowerCase().includes(empSearch.toLowerCase());
    });
  }, [records, empSearch]);

  const hiddenCount = hidden.employees.length + hidden.sections.length;

  return (
    <div className="space-y-4">
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

      {/* Company filter */}
      {companies.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCompany(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              !selectedCompany
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            }`}
          >
            All Companies
          </button>
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCompany(selectedCompany === c.id ? null : c.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                selectedCompany === c.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Visibility panel */}
      <div className="rounded-lg border bg-card">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
          onClick={() => setVisibilityOpen((v) => !v)}
        >
          <span className="flex items-center gap-2">
            {hiddenCount > 0 ? (
              <EyeOff className="h-4 w-4 text-amber-500" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
            Hide from view
            {hiddenCount > 0 && (
              <Badge variant="warning" className="text-xs">{hiddenCount} hidden</Badge>
            )}
          </span>
          {visibilityOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {visibilityOpen && (
          <div className="border-t px-4 py-4 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Hidden employees and sections are excluded from the table below. Changes persist across page refreshes.
              </p>
              {hiddenCount > 0 && (
                <Button variant="ghost" size="sm" onClick={resetVisibility} className="text-xs h-7">
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset all
                </Button>
              )}
            </div>

            {sections.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Sections</p>
                <div className="flex flex-wrap gap-3">
                  {sections.map((sec) => (
                    <label key={sec.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={hidden.sections.includes(sec.id)}
                        onCheckedChange={() => toggleSection(sec.id)}
                      />
                      <span className="text-sm">{sec.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Employees</p>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search employees..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                {filteredEmployeesForPanel.map((r) => (
                  <label key={r.employee_id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={hidden.employees.includes(r.employee_id)}
                      onCheckedChange={() => toggleEmployee(r.employee_id)}
                    />
                    <div className="min-w-0">
                      <p className="text-sm truncate">{r.employee_name}</p>
                      {r.section_name && (
                        <p className="text-xs text-muted-foreground truncate">{r.section_name}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
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
          records={visibleRecords}
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
