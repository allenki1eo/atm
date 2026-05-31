"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings, Eye, EyeOff, RotateCcw, Search, Building2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAttendanceVisibility } from "@/hooks/use-attendance-visibility";

interface Employee {
  id: string;
  name: string;
  department: string;
  section_id: string | null;
  company_id: string | null;
}

interface Section {
  id: string;
  name: string;
  company_id: string;
}

interface Company {
  id: string;
  name: string;
}

export default function AdminSettingsPage() {
  const { hidden, toggleEmployee, toggleSection, reset: resetVisibility } = useAttendanceVisibility();
  const [empSearch, setEmpSearch] = useState("");

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Failed");
      return res.json();
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

  const { data: companies } = useQuery<Company[]>({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const companyMap = useMemo(
    () => new Map((companies ?? []).map((c) => [c.id, c.name])),
    [companies]
  );

  const filteredEmployees = useMemo(
    () =>
      (employees ?? []).filter(
        (e) =>
          e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
          e.department?.toLowerCase().includes(empSearch.toLowerCase())
      ),
    [employees, empSearch]
  );

  const sectionsByCompany = useMemo(() => {
    const map = new Map<string, Section[]>();
    for (const sec of sections ?? []) {
      if (!map.has(sec.company_id)) map.set(sec.company_id, []);
      map.get(sec.company_id)!.push(sec);
    }
    return map;
  }, [sections]);

  const hiddenCount = hidden.employees.length + hidden.sections.length;

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Mipangilio ya Mfumo</h1>
          <p className="text-sm text-muted-foreground">Mipangilio ya Admin — inaathiri jinsi mfumo unavyoonekana na kufanya kazi</p>
        </div>
      </div>

      {/* Attendance Visibility Section */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {hiddenCount > 0 ? (
                <EyeOff className="h-5 w-5 text-amber-500 shrink-0" />
              ) : (
                <Eye className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <div>
                <CardTitle className="text-base">
                  Ficha kutoka kwenye Mahudhurio na Orodha ya Wafanyakazi
                </CardTitle>
                <CardDescription>
                  {hiddenCount > 0
                    ? `${hiddenCount} ${hiddenCount === 1 ? "kipengele kimefichwa" : "vipengele vimefichwa"} kutoka kwenye mahudhurio na orodha ya wafanyakazi.`
                    : "Wafanyakazi na sehemu zilizochaguliwa hapa hazitaonekana kwenye mahudhurio na orodha ya wafanyakazi. Mipangilio huhifadhiwa kwenye kivinjari hiki."}
                </CardDescription>
              </div>
            </div>
            {hiddenCount > 0 && (
              <Button variant="outline" size="sm" onClick={resetVisibility} className="shrink-0">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Rudisha Yote
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Sections grouped by company */}
          {(sections ?? []).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Sehemu</p>
              </div>
              <div className="space-y-4">
                {Array.from(sectionsByCompany.entries()).map(([companyId, secs]) => (
                  <div key={companyId}>
                    {companyMap.get(companyId) && (
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
                        {companyMap.get(companyId)}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2">
                      {secs.map((sec) => (
                        <label key={sec.id} className="flex items-center gap-2.5 cursor-pointer p-2 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors">
                          <Checkbox
                            checked={hidden.sections.includes(sec.id)}
                            onCheckedChange={() => toggleSection(sec.id)}
                          />
                          <span className="text-sm">{sec.name}</span>
                          {hidden.sections.includes(sec.id) && (
                            <EyeOff className="h-3.5 w-3.5 text-amber-500 ml-auto shrink-0" />
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(sections ?? []).length > 0 && (employees ?? []).length > 0 && (
            <Separator />
          )}

          {/* Employees */}
          {(employees ?? []).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Wafanyakazi Binafsi</p>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Tafuta mfanyakazi..."
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pr-1">
                {filteredEmployees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-2.5 cursor-pointer p-2 rounded-md hover:bg-muted/50 border border-transparent hover:border-border transition-colors">
                    <Checkbox
                      checked={hidden.employees.includes(emp.id)}
                      onCheckedChange={() => toggleEmployee(emp.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{emp.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{emp.department ?? "—"}</p>
                    </div>
                    {hidden.employees.includes(emp.id) && (
                      <EyeOff className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
