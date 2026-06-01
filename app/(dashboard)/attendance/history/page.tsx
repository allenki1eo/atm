"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import { Calendar, Building2 } from "lucide-react";

interface Employee {
  id: string;
  name: string;
  type: string;
  department: string;
  company_id: string | null;
}

interface Company {
  id: string;
  name: string;
}

export default function AttendanceHistoryPage() {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");

  const { data: employees, isLoading: empLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Failed to fetch employees");
      return res.json() as Promise<Employee[]>;
    },
  });

  const { data: companies, isLoading: compLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies");
      if (!res.ok) throw new Error("Failed to fetch companies");
      return res.json() as Promise<Company[]>;
    },
  });

  // Employees filtered by selected company
  const companyEmployees = useMemo(() => {
    if (!employees) return [];
    if (selectedCompanyId === "all") return employees;
    return employees.filter((e) => e.company_id === selectedCompanyId);
  }, [employees, selectedCompanyId]);

  // Reset employee selection when company changes
  const handleCompanyChange = (val: string) => {
    setSelectedCompanyId(val);
    setSelectedEmployeeId("all");
  };

  // Employees to show calendars for
  const displayEmployees = useMemo(() => {
    if (selectedEmployeeId === "all") return companyEmployees;
    return companyEmployees.filter((e) => e.id === selectedEmployeeId);
  }, [companyEmployees, selectedEmployeeId]);

  const loading = empLoading || compLoading;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Historia ya Mahudhurio</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Angalia rekodi za mahudhurio kwa kampuni au mfanyakazi mmoja mmoja
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Company selector */}
        <div className="flex-1">
          <label className="text-sm font-medium mb-2 block flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" /> Kampuni
          </label>
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={selectedCompanyId} onValueChange={handleCompanyChange}>
              <SelectTrigger>
                <SelectValue placeholder="Chagua kampuni..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Kampuni Zote</SelectItem>
                {companies?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Employee selector */}
        <div className="flex-1">
          <label className="text-sm font-medium mb-2 block">Mfanyakazi</label>
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Chagua mfanyakazi..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  Wafanyakazi Wote {selectedCompanyId !== "all" ? `(${companyEmployees.length})` : ""}
                </SelectItem>
                {companyEmployees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name} — {emp.department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)}
        </div>
      ) : displayEmployees.length === 0 ? (
        <div className="flex items-center justify-center h-48 rounded-lg border-2 border-dashed text-muted-foreground">
          Hakuna wafanyakazi wa kuonyesha
        </div>
      ) : (
        <div className="grid gap-6">
          {displayEmployees.map((emp) => (
            <Card key={emp.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{emp.name}</CardTitle>
                <CardDescription>
                  {emp.department}
                  {selectedCompanyId === "all" && emp.company_id && (
                    <> · {companies?.find((c) => c.id === emp.company_id)?.name}</>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AttendanceCalendar employeeId={emp.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
