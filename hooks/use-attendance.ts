"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  status: "present" | "absent" | "late" | "half_day" | null;
  marked_by: string;
  marked_at: string;
  notes: string;
  is_locked: boolean;
  phone: string;
  type: string;
  department: string;
}

export interface AttendanceMarkPayload {
  employee_id: string;
  date: string;
  status: "present" | "absent" | "late" | "half_day";
  notes?: string;
}

export function useTodayAttendance(supervisorId?: string) {
  return useQuery({
    queryKey: ["attendance", "today", supervisorId],
    queryFn: async () => {
      const res = await fetch("/api/attendance/today");
      if (!res.ok) throw new Error("Failed to fetch attendance");
      return res.json() as Promise<AttendanceRecord[]>;
    },
    staleTime: 30000,
  });
}

export function useMarkAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AttendanceMarkPayload) => {
      const res = await fetch("/api/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to mark attendance");
      }
      return res.json();
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["attendance", "today"] });
      const prev = queryClient.getQueryData<AttendanceRecord[]>(["attendance", "today"]);

      queryClient.setQueryData<AttendanceRecord[]>(["attendance", "today"], (old) => {
        if (!old) return old;
        return old.map((r) =>
          r.employee_id === payload.employee_id
            ? { ...r, status: payload.status, notes: payload.notes ?? r.notes }
            : r
        );
      });

      return { prev };
    },
    onError: (_err, _payload, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["attendance", "today"], context.prev);
      }
      toast({ title: "Error", description: "Failed to save attendance", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

export function useLockDay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (date: string) => {
      const res = await fetch("/api/attendance/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) throw new Error("Failed to lock day");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast({ title: "Day locked", description: "Attendance records are now locked.", variant: "success" as never });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to lock day", variant: "destructive" });
    },
  });
}

export function useUnlockDay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (date: string) => {
      const res = await fetch("/api/attendance/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to unlock day");
      }
      return res.json() as Promise<{ unlocked_count: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast({ title: "Day unlocked", description: "Attendance records can be edited again.", variant: "success" as never });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useAttendanceCalendar(employeeId: string, year: number, month: number) {
  return useQuery({
    queryKey: ["attendance", "calendar", employeeId, year, month],
    queryFn: async () => {
      const res = await fetch(
        `/api/attendance/calendar?employee_id=${employeeId}&year=${year}&month=${month}`
      );
      if (!res.ok) throw new Error("Failed to fetch calendar");
      return res.json();
    },
    enabled: !!employeeId,
  });
}
