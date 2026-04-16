"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import { Calendar } from "lucide-react";

interface Employee {
  id: string;
  name: string;
  type: string;
  department: string;
}

export default function AttendanceHistoryPage() {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");

  const { data: employees, isLoading: empLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Failed to fetch employees");
      return res.json() as Promise<Employee[]>;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Attendance History</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          View monthly attendance patterns for any employee
        </p>
      </div>

      {/* Employee selector */}
      <div className="max-w-xs">
        <label className="text-sm font-medium mb-2 block">Select Employee</label>
        {empLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an employee..." />
            </SelectTrigger>
            <SelectContent>
              {employees?.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.name} ({emp.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Calendar */}
      {selectedEmployeeId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {employees?.find((e) => e.id === selectedEmployeeId)?.name}
            </CardTitle>
            <CardDescription>Monthly attendance calendar</CardDescription>
          </CardHeader>
          <CardContent>
            <AttendanceCalendar employeeId={selectedEmployeeId} />
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center justify-center h-48 rounded-lg border-2 border-dashed text-muted-foreground">
          Select an employee to view their attendance history
        </div>
      )}
    </div>
  );
}
