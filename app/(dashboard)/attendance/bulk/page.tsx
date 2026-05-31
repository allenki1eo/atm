"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, eachDayOfInterval, startOfMonth, endOfMonth, parseISO, isWeekend } from "date-fns";
import { CalendarRange, Users, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { getTodayDate } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  department: string;
  type: string;
  section_id: string | null;
  section_name: string | null;
  company_id: string | null;
  company_name: string | null;
}

interface Section {
  id: string;
  name: string;
  company_id: string;
}

type AttendanceStatus = "present" | "absent" | "late" | "half_day";

const statusOptions: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: "present",  label: "Walikuwepo",  color: "bg-green-500" },
  { value: "absent",   label: "Hawakuwepo",  color: "bg-red-500" },
  { value: "late",     label: "Walichelewa", color: "bg-amber-500" },
  { value: "half_day", label: "Nusu Siku",   color: "bg-blue-500" },
];

function getDatesInRange(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  return eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).map(
    (d) => format(d, "yyyy-MM-dd")
  );
}

function getMonthDates(yearMonth: string): string[] {
  const ref = parseISO(yearMonth + "-01");
  return eachDayOfInterval({ start: startOfMonth(ref), end: endOfMonth(ref) }).map(
    (d) => format(d, "yyyy-MM-dd")
  );
}

export default function BulkAttendancePage() {
  const today = getTodayDate();
  const currentYearMonth = today.substring(0, 7);

  const [mode, setMode] = useState<"range" | "month">("range");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [yearMonth, setYearMonth] = useState(currentYearMonth);
  const [excludeWeekends, setExcludeWeekends] = useState(false);

  const [selectionMode, setSelectionMode] = useState<"employees" | "section">("employees");
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [empSearch, setEmpSearch] = useState("");

  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [forceOverride, setForceOverride] = useState(false);

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["employees-with-sections"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      // Enrich with section names via sections API
      const secRes = await fetch("/api/sections");
      const sections: Section[] = secRes.ok ? await secRes.json() : [];
      const secMap = new Map(sections.map((s) => [s.id, s.name]));
      return data.map((e: Employee & { section_id?: string }) => ({
        ...e,
        section_name: e.section_id ? secMap.get(e.section_id) ?? null : null,
      }));
    },
  });

  const { data: sections } = useQuery<Section[]>({
    queryKey: ["sections"],
    queryFn: async () => {
      const res = await fetch("/api/sections");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const sectionEmployeeMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of employees ?? []) {
      if (e.section_id) {
        if (!map.has(e.section_id)) map.set(e.section_id, []);
        map.get(e.section_id)!.push(e.id);
      }
    }
    return map;
  }, [employees]);

  const dates = useMemo(() => {
    let raw: string[] = [];
    if (mode === "range") raw = getDatesInRange(startDate, endDate);
    else raw = getMonthDates(yearMonth);
    if (excludeWeekends) raw = raw.filter((d) => !isWeekend(parseISO(d)));
    return raw;
  }, [mode, startDate, endDate, yearMonth, excludeWeekends]);

  const targetEmployeeIds = useMemo(() => {
    if (selectionMode === "section") {
      return sectionEmployeeMap.get(selectedSection) ?? [];
    }
    return Array.from(selectedEmployees);
  }, [selectionMode, selectedSection, selectedEmployees, sectionEmployeeMap]);

  const totalRecords = dates.length * targetEmployeeIds.length;

  const filteredEmployees = useMemo(
    () =>
      (employees ?? []).filter(
        (e) =>
          e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
          e.department?.toLowerCase().includes(empSearch.toLowerCase())
      ),
    [employees, empSearch]
  );

  const toggleEmployee = (id: string) => {
    setSelectedEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedEmployees.size === filteredEmployees.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(filteredEmployees.map((e) => e.id)));
    }
  };

  const bulkMark = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/attendance/bulk-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_ids: targetEmployeeIds,
          dates,
          status,
          force: forceOverride,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json as { created: number; updated: number; skipped: number };
    },
    onSuccess: (data) => {
      toast({
        title: "Imefanikiwa",
        description: `Kumeandikwa ${data.created + data.updated} rekodi. ${data.skipped > 0 ? `${data.skipped} zilipuuzwa (zimefungwa).` : ""}`,
      });
      setSelectedEmployees(new Set());
    },
    onError: (err: Error) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarRange className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Weka Mahudhurio ya Wingi</h1>
          <p className="text-sm text-muted-foreground">Weka mahudhurio kwa siku nyingi au wafanyakazi wengi mara moja</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Date selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">1. Chagua Siku</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={mode === "range" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("range")}
              >
                Anuwai ya Tarehe
              </Button>
              <Button
                variant={mode === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("month")}
              >
                Mwezi Mzima
              </Button>
            </div>

            {mode === "range" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tarehe ya Kuanza</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tarehe ya Mwisho</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Chagua Mwezi</Label>
                <Input
                  type="month"
                  value={yearMonth}
                  onChange={(e) => setYearMonth(e.target.value)}
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={excludeWeekends}
                onCheckedChange={(v) => setExcludeWeekends(!!v)}
              />
              Acha siku za wikendi (Jumamosi na Jumapili)
            </label>

            {dates.length > 0 && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-sm font-medium">{dates.length} siku zilizochaguliwa</p>
                <div className="flex flex-wrap gap-1 mt-2 max-h-24 overflow-y-auto">
                  {dates.map((d) => (
                    <span key={d} className="text-xs bg-background border rounded px-1.5 py-0.5">
                      {format(parseISO(d), "MMM d")}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">3. Chagua Hali</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-all ${
                    status === opt.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full ${opt.color}`} />
                  {opt.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={forceOverride}
                onCheckedChange={(v) => setForceOverride(!!v)}
              />
              <span>Badilisha hata zilizofungwa (admin override)</span>
            </label>
          </CardContent>
        </Card>
      </div>

      {/* Employee / Section selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">2. Chagua Wafanyakazi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={selectionMode === "employees" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectionMode("employees")}
            >
              <Users className="h-4 w-4 mr-1" />
              Wafanyakazi
            </Button>
            <Button
              variant={selectionMode === "section" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectionMode("section")}
            >
              Sehemu Nzima
            </Button>
          </div>

          {selectionMode === "employees" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Input
                    placeholder="Tafuta mfanyakazi..."
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={toggleAll} className="whitespace-nowrap">
                  {selectedEmployees.size === filteredEmployees.length && filteredEmployees.length > 0
                    ? "Ondoa Wote"
                    : "Chagua Wote"}
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1 border rounded-lg p-3">
                {filteredEmployees.map((emp) => (
                  <label key={emp.id} className="flex items-start gap-2 cursor-pointer p-1 rounded hover:bg-muted/50">
                    <Checkbox
                      checked={selectedEmployees.has(emp.id)}
                      onCheckedChange={() => toggleEmployee(emp.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{emp.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {emp.section_name ?? emp.department ?? "—"}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
              {selectedEmployees.size > 0 && (
                <p className="text-sm text-muted-foreground">{selectedEmployees.size} wafanyakazi wamechaguliwa</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Select value={selectedSection} onValueChange={setSelectedSection}>
                <SelectTrigger>
                  <SelectValue placeholder="Chagua sehemu..." />
                </SelectTrigger>
                <SelectContent>
                  {(sections ?? []).map((sec) => (
                    <SelectItem key={sec.id} value={sec.id}>
                      {sec.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({sectionEmployeeMap.get(sec.id)?.length ?? 0} wafanyakazi)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSection && (
                <p className="text-sm text-muted-foreground">
                  {sectionEmployeeMap.get(selectedSection)?.length ?? 0} wafanyakazi katika sehemu hii
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary and submit */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="font-semibold">Muhtasari</p>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span><strong className="text-foreground">{dates.length}</strong> siku</span>
                <span>×</span>
                <span><strong className="text-foreground">{targetEmployeeIds.length}</strong> wafanyakazi</span>
                <span>=</span>
                <span>
                  <strong className="text-foreground">{totalRecords}</strong> rekodi za{" "}
                  <Badge variant={status === "present" ? "success" : status === "absent" ? "destructive" : "warning"}>
                    {statusOptions.find((o) => o.value === status)?.label}
                  </Badge>
                </span>
              </div>
            </div>
            <Button
              disabled={totalRecords === 0 || bulkMark.isPending}
              onClick={() => bulkMark.mutate()}
              className="min-w-[160px]"
            >
              {bulkMark.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inaandika...</>
              ) : (
                <><Check className="h-4 w-4 mr-2" />Weka {totalRecords} Rekodi</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
