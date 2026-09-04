"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import {
  Calendar,
  Building2,
  ArrowLeft,
  Users,
  Layers,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useVisibleEmployees } from "@/hooks/use-attendance-visibility";
import { addDays, formatDays } from "@/lib/overtime";

interface Company { id: string; name: string; }
interface EmployeeSummary {
  employee_id: string;
  employee_name: string;
  department: string;
  company_id: string | null;
  section_id: string | null;
  company_name: string | null;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  total: number;
  attendance_days: number;
  overtime_hours: number;
  overtime_days: number;
  days_worked: number;
}

const MONTHS = [
  "Januari","Februari","Machi","Aprili","Mei","Juni",
  "Julai","Agosti","Septemba","Oktoba","Novemba","Desemba",
];

/** Employees with a blank department are grouped under their own bucket. */
const NO_DEPARTMENT = "__none__";
const NO_DEPARTMENT_LABEL = "Bila Idara";

const departmentKey = (department: string | null | undefined) =>
  department?.trim() || NO_DEPARTMENT;

const departmentLabel = (key: string) =>
  key === NO_DEPARTMENT ? NO_DEPARTMENT_LABEL : key;

export default function AttendanceHistoryPage() {
  const now = new Date();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeSummary | null>(null);

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: async () => {
      const r = await fetch("/api/companies");
      return r.json();
    },
  });

  const { data: summaries, isLoading } = useQuery<EmployeeSummary[]>({
    queryKey: ["attendance-summary", selectedCompanyId, year, month],
    queryFn: async () => {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (selectedCompanyId !== "all") params.set("company_id", selectedCompanyId);
      const r = await fetch(`/api/attendance/summary?${params}`);
      return r.json();
    },
  });

  // summaries have employee_id not id — remap for the hook
  const summariesAsEmployees = useMemo(
    () => (summaries ?? []).map((s) => ({ ...s, id: s.employee_id })),
    [summaries]
  );
  const visibleSummaries = useVisibleEmployees(summariesAsEmployees);

  // Department options come from the employees currently in scope (company +
  // visibility), so the dropdown never offers a department with nobody in it.
  const departments = useMemo(() => {
    const keys = new Set(visibleSummaries.map((e) => departmentKey(e.department)));
    return Array.from(keys).sort((a, b) => {
      if (a === NO_DEPARTMENT) return 1;
      if (b === NO_DEPARTMENT) return -1;
      return a.localeCompare(b);
    });
  }, [visibleSummaries]);

  // A department selected before the company changed may no longer exist.
  const activeDepartment =
    selectedDepartment !== "all" && !departments.includes(selectedDepartment)
      ? "all"
      : selectedDepartment;

  const filteredSummaries = useMemo(
    () =>
      activeDepartment === "all"
        ? visibleSummaries
        : visibleSummaries.filter((e) => departmentKey(e.department) === activeDepartment),
    [visibleSummaries, activeDepartment]
  );

  const departmentGroups = useMemo(() => {
    const map = new Map<string, typeof filteredSummaries>();
    for (const emp of filteredSummaries) {
      const key = departmentKey(emp.department);
      const group = map.get(key);
      if (group) group.push(emp);
      else map.set(key, [emp]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === NO_DEPARTMENT) return 1;
      if (b === NO_DEPARTMENT) return -1;
      return a.localeCompare(b);
    });
  }, [filteredSummaries]);

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  // ── drill-down view ──────────────────────────────────────────────────────
  if (selectedEmployee) {
    const currentIndex = filteredSummaries.findIndex(
      (e) => e.employee_id === selectedEmployee.employee_id
    );
    const goToIndex = (index: number) => {
      const next = filteredSummaries[index];
      if (next) setSelectedEmployee(next);
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedEmployee(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Rudi
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">{selectedEmployee.employee_name}</h1>
            <p className="text-sm text-muted-foreground truncate">
              {selectedEmployee.department}
              {selectedEmployee.company_name && ` · ${selectedEmployee.company_name}`}
            </p>
          </div>
        </div>

        {/* Switch employee without going back to the list */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Mfanyakazi aliyetangulia"
            disabled={currentIndex <= 0}
            onClick={() => goToIndex(currentIndex - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select
            value={currentIndex >= 0 ? selectedEmployee.employee_id : ""}
            onValueChange={(id) => {
              const next = filteredSummaries.find((e) => e.employee_id === id);
              if (next) setSelectedEmployee(next);
            }}
          >
            <SelectTrigger className="flex-1 min-w-0">
              <SelectValue placeholder={selectedEmployee.employee_name} />
            </SelectTrigger>
            <SelectContent>
              {departmentGroups.map(([dept, members]) => (
                <SelectGroup key={dept}>
                  <SelectLabel>{departmentLabel(dept)}</SelectLabel>
                  {members.map((m) => (
                    <SelectItem key={m.employee_id} value={m.employee_id}>
                      {m.employee_name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Mfanyakazi anayefuata"
            disabled={currentIndex < 0 || currentIndex >= filteredSummaries.length - 1}
            onClick={() => goToIndex(currentIndex + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {currentIndex >= 0 && filteredSummaries.length > 1 && (
          <p className="text-xs text-muted-foreground text-center">
            {currentIndex + 1} / {filteredSummaries.length}
            {activeDepartment !== "all" && ` · ${departmentLabel(activeDepartment)}`}
          </p>
        )}

        <Card>
          <CardContent className="pt-4">
            <AttendanceCalendar employeeId={selectedEmployee.employee_id} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── list view ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Historia ya Mahudhurio</h1>
          <p className="text-muted-foreground text-sm">Bonyeza mfanyakazi kuona kalenda yake</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="text-xs font-medium mb-1 block flex items-center gap-1">
            <Building2 className="h-3 w-3" /> Kampuni
          </label>
          <Select
            value={selectedCompanyId}
            onValueChange={(v) => {
              setSelectedCompanyId(v);
              setSelectedDepartment("all");
              setSelectedEmployee(null);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Kampuni Zote</SelectItem>
              {companies?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="text-xs font-medium mb-1 block flex items-center gap-1">
            <Layers className="h-3 w-3" /> Idara
          </label>
          <Select
            value={activeDepartment}
            onValueChange={(v) => { setSelectedDepartment(v); setSelectedEmployee(null); }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Idara Zote</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{departmentLabel(d)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[130px]">
          <label className="text-xs font-medium mb-1 block">Mwezi</label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[100px]">
          <label className="text-xs font-medium mb-1 block">Mwaka</label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Employee list */}
      <Card className="overflow-hidden">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            {isLoading ? "Inapakia..." : `${filteredSummaries.length} wafanyakazi`}
            <span className="font-normal text-muted-foreground">
              — {MONTHS[month - 1]} {year}
              {activeDepartment !== "all" && ` · ${departmentLabel(activeDepartment)}`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : !filteredSummaries.length ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Hakuna wafanyakazi
            </div>
          ) : (
            <div className="divide-y">
              {departmentGroups.map(([dept, members]) => (
                <div key={dept}>
                  <div className="flex items-center justify-between px-4 py-2 bg-muted/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Layers className="h-3 w-3" />
                      {departmentLabel(dept)}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {members.length} wafanyakazi ·{" "}
                      {formatDays(addDays(...members.map((m) => m.days_worked)))} siku
                    </span>
                  </div>
                  <div className="divide-y">
                    {members.map((emp) => (
                      <button
                        key={emp.employee_id}
                        onClick={() => setSelectedEmployee(emp)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left group"
                      >
                        <div>
                          <p className="font-medium text-sm group-hover:text-primary transition-colors">
                            {emp.employee_name}
                          </p>
                          {selectedCompanyId === "all" && emp.company_name && (
                            <p className="text-xs text-muted-foreground">{emp.company_name}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          {emp.present > 0 && (
                            <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 text-xs">
                              ✓ {emp.present}
                            </Badge>
                          )}
                          {emp.late > 0 && (
                            <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-xs">
                              ⏱ {emp.late}
                            </Badge>
                          )}
                          {emp.absent > 0 && (
                            <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 dark:bg-red-950/20 text-xs">
                              ✗ {emp.absent}
                            </Badge>
                          )}
                          {emp.overtime_days > 0 && (
                            <Badge
                              variant="outline"
                              className="text-green-700 border-green-300 bg-green-50 dark:bg-green-950/20 text-xs"
                              title={`Overtime: saa ${formatDays(emp.overtime_hours)}`}
                            >
                              OT +{formatDays(emp.overtime_days)}
                            </Badge>
                          )}
                          {emp.days_worked > 0 && (
                            <span className="text-xs font-medium tabular-nums w-14 text-right">
                              {formatDays(emp.days_worked)} siku
                            </span>
                          )}
                          {emp.total === 0 && emp.overtime_days === 0 && (
                            <span className="text-xs text-muted-foreground italic">Hakuna rekodi</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
