"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import { Calendar, Building2, ArrowLeft, Users } from "lucide-react";
import { useVisibleEmployees } from "@/hooks/use-attendance-visibility";

interface Company { id: string; name: string; }
interface EmployeeSummary {
  employee_id: string;
  employee_name: string;
  department: string;
  company_id: string | null;
  company_name: string | null;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  total: number;
}

const MONTHS = [
  "Januari","Februari","Machi","Aprili","Mei","Juni",
  "Julai","Agosti","Septemba","Oktoba","Novemba","Desemba",
];

export default function AttendanceHistoryPage() {
  const now = new Date();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
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

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  // ── drill-down view ──────────────────────────────────────────────────────
  if (selectedEmployee) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedEmployee(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Rudi
          </Button>
          <div>
            <h1 className="text-xl font-bold">{selectedEmployee.employee_name}</h1>
            <p className="text-sm text-muted-foreground">
              {selectedEmployee.department}
              {selectedEmployee.company_name && ` · ${selectedEmployee.company_name}`}
            </p>
          </div>
        </div>
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
          <Select value={selectedCompanyId} onValueChange={(v) => { setSelectedCompanyId(v); setSelectedEmployee(null); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Kampuni Zote</SelectItem>
              {companies?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
            {isLoading ? "Inapakia..." : `${visibleSummaries.length} wafanyakazi`}
            <span className="font-normal text-muted-foreground">— {MONTHS[month - 1]} {year}</span>
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
          ) : !visibleSummaries.length ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Hakuna wafanyakazi
            </div>
          ) : (
            <div className="divide-y">
              {visibleSummaries.map((emp) => (
                <button
                  key={emp.employee_id}
                  onClick={() => setSelectedEmployee(emp)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left group"
                >
                  <div>
                    <p className="font-medium text-sm group-hover:text-primary transition-colors">
                      {emp.employee_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {emp.department}
                      {selectedCompanyId === "all" && emp.company_name && ` · ${emp.company_name}`}
                    </p>
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
                    {emp.total === 0 && (
                      <span className="text-xs text-muted-foreground italic">Hakuna rekodi</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
