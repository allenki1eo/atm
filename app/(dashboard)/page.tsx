import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTodayDate, formatCurrency } from "@/lib/utils";
import { LiveStatsGrid } from "@/components/dashboard/live-stats-grid";
import { AttendanceChart } from "@/components/dashboard/attendance-chart";
import { PayrollChart } from "@/components/dashboard/payroll-chart";
import type { PayrollMonthData } from "@/components/dashboard/payroll-chart";
import {
  ClipboardList,
  TrendingUp,
  AlertTriangle,
  Calendar,
  DollarSign,
  FileText,
  BarChart2,
  Download,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type DayData = { date: string; present: number; late: number; absent: number };
type AttRow = { date: string; status: string; count: number };
type RecentAttRow = {
  id: string;
  employee_name: string;
  section_name: string | null;
  company_name: string | null;
  status: string;
  date: string;
  marked_at: string | null;
};

function buildTrend(rows: AttRow[], startDate: Date): DayData[] {
  const map = new Map<string, DayData>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const key = d.toISOString().split("T")[0];
    map.set(key, { date: key, present: 0, late: 0, absent: 0 });
  }
  for (const row of rows) {
    const entry = map.get(row.date);
    if (entry) {
      if (row.status === "present") entry.present = row.count;
      else if (row.status === "late") entry.late = row.count;
      else if (row.status === "absent") entry.absent = row.count;
    }
  }
  return Array.from(map.values());
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    present:  { label: "Present",  className: "bg-green-100 text-green-700 border-green-200" },
    late:     { label: "Late",     className: "bg-amber-100 text-amber-700 border-amber-200" },
    absent:   { label: "Absent",   className: "bg-red-100 text-red-700 border-red-200" },
    half_day: { label: "Half Day", className: "bg-blue-100 text-blue-700 border-blue-200" },
  };
  const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = (session.user as { role: string }).role;
  const userId = session.user.id!;
  const employeeId =
    (session.user as { employeeId?: string | null }).employeeId ?? null;
  const today = getTodayDate();
  const now = new Date();

  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  const trendStart = sevenDaysAgo.toISOString().split("T")[0];

  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const datePrefix = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
  const monthNames = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec",
  ];

  const formattedDate = now.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // ── Today's attendance counts ──────────────────────────────────────────────
  let totalEmployees = 0;
  let presentToday = 0;
  let lateToday = 0;
  let absentToday = 0;

  // ── Charts ─────────────────────────────────────────────────────────────────
  let attendanceTrend: DayData[] = [];
  let payrollTrend: PayrollMonthData[] = [];

  // ── Pending action items ───────────────────────────────────────────────────
  let pendingCorrections = 0;
  let pendingLeaves = 0;
  let pendingAdvances = 0;

  // ── Recent attendance records (management view) ────────────────────────────
  let recentAttendance: RecentAttRow[] = [];

  // ── Employee personal stats (role=employee) ────────────────────────────────
  let myPresent = 0;
  let myLate = 0;
  let myAbsent = 0;
  let myEarnings = 0;
  let myDailyRate = 0;
  let myEmployeeType = "";
  let myAttendanceRate = 0;

  try {
    if (role === "supervisor") {
      // ── Supervisor: scoped to their team ────────────────────────────────
      const empResult = await db.execute({
        sql: "SELECT COUNT(*) as count FROM employees WHERE supervisor_id = ? AND active = 1",
        args: [userId],
      });
      totalEmployees = (empResult.rows[0] as unknown as { count: number }).count;

      const attResult = await db.execute({
        sql: `SELECT status, COUNT(*) as count
              FROM attendance a
              JOIN employees e ON e.id = a.employee_id
              WHERE e.supervisor_id = ? AND a.date = ?
              GROUP BY status`,
        args: [userId, today],
      });
      for (const row of attResult.rows as unknown as {
        status: string;
        count: number;
      }[]) {
        if (row.status === "present") presentToday = row.count;
        else if (row.status === "late") lateToday = row.count;
        else if (row.status === "absent") absentToday = row.count;
      }

      const trendResult = await db.execute({
        sql: `SELECT a.date, a.status, COUNT(*) as count
              FROM attendance a
              JOIN employees e ON e.id = a.employee_id
              WHERE e.supervisor_id = ? AND a.date >= ? AND a.date <= ?
              GROUP BY a.date, a.status
              ORDER BY a.date`,
        args: [userId, trendStart, today],
      });
      attendanceTrend = buildTrend(
        trendResult.rows as unknown as AttRow[],
        sevenDaysAgo
      );

      const corrResult = await db.execute({
        sql: `SELECT COUNT(*) as count
              FROM attendance_corrections ac
              JOIN employees e ON e.id = ac.employee_id
              WHERE e.supervisor_id = ? AND ac.status = 'pending'`,
        args: [userId],
      });
      pendingCorrections = (
        corrResult.rows[0] as unknown as { count: number }
      ).count;

      const leaveResult = await db.execute({
        sql: `SELECT COUNT(*) as count
              FROM leave_requests lr
              JOIN employees e ON e.id = lr.employee_id
              WHERE lr.status IN ('pending_supervisor','pending')
                AND (
                  e.supervisor_id = ?
                  OR e.section_id IN (
                    SELECT section_id FROM supervisor_sections WHERE supervisor_id = ?
                  )
                )`,
        args: [userId, userId],
      });
      pendingLeaves = (
        leaveResult.rows[0] as unknown as { count: number }
      ).count;

      const recentResult = await db.execute({
        sql: `SELECT a.id, e.name as employee_name,
                     s.name as section_name, c.name as company_name,
                     a.status, a.date, a.marked_at
              FROM attendance a
              JOIN employees e ON e.id = a.employee_id
              LEFT JOIN sections s ON s.id = e.section_id
              LEFT JOIN companies c ON c.id = e.company_id
              WHERE a.date = ? AND e.supervisor_id = ?
              ORDER BY a.marked_at DESC
              LIMIT 10`,
        args: [today, userId],
      });
      recentAttendance = recentResult.rows as unknown as RecentAttRow[];
    } else if (role === "admin" || role === "hr") {
      // ── Admin / HR: company-wide ─────────────────────────────────────────
      const empResult = await db.execute(
        "SELECT COUNT(*) as count FROM employees WHERE active = 1"
      );
      totalEmployees = (empResult.rows[0] as unknown as { count: number }).count;

      const attResult = await db.execute({
        sql: `SELECT status, COUNT(*) as count FROM attendance WHERE date = ? GROUP BY status`,
        args: [today],
      });
      for (const row of attResult.rows as unknown as {
        status: string;
        count: number;
      }[]) {
        if (row.status === "present") presentToday = row.count;
        else if (row.status === "late") lateToday = row.count;
        else if (row.status === "absent") absentToday = row.count;
      }

      const trendResult = await db.execute({
        sql: `SELECT date, status, COUNT(*) as count
              FROM attendance
              WHERE date >= ? AND date <= ?
              GROUP BY date, status
              ORDER BY date`,
        args: [trendStart, today],
      });
      attendanceTrend = buildTrend(
        trendResult.rows as unknown as AttRow[],
        sevenDaysAgo
      );

      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 5);
      const pyResult = await db.execute({
        sql: `SELECT ps.month, ps.year, COALESCE(SUM(ps.gross_amount), 0) as total
              FROM payslips ps
              JOIN employees e ON e.id = ps.employee_id
              WHERE e.type = 'casual'
                AND (ps.year > ? OR (ps.year = ? AND ps.month >= ?))
              GROUP BY ps.year, ps.month
              ORDER BY ps.year, ps.month`,
        args: [
          sixMonthsAgo.getFullYear(),
          sixMonthsAgo.getFullYear(),
          sixMonthsAgo.getMonth() + 1,
        ],
      });

      const projResult = await db.execute({
        sql: `SELECT COALESCE(SUM(att.a_days * e.daily_rate), 0) as projected
              FROM (
                SELECT employee_id,
                  SUM(
                    CASE status
                      WHEN 'present' THEN 1
                      WHEN 'late'    THEN 1
                      WHEN 'half_day' THEN 0.5
                      ELSE 0
                    END
                  ) as a_days
                FROM attendance
                WHERE date LIKE ?
                GROUP BY employee_id
              ) att
              JOIN employees e ON e.id = att.employee_id
              WHERE e.type = 'casual' AND e.active = 1`,
        args: [`${datePrefix}%`],
      });
      const projected = Math.round(
        (projResult.rows[0] as unknown as { projected: number }).projected
      );

      const payrollMap = new Map<string, PayrollMonthData>();
      for (const row of pyResult.rows as unknown as {
        month: number;
        year: number;
        total: number;
      }[]) {
        payrollMap.set(`${row.year}-${row.month}`, {
          month: row.month,
          year: row.year,
          label: `${monthNames[row.month - 1]} ${row.year}`,
          total: Math.round(row.total),
          projected: false,
        });
      }
      if (!payrollMap.has(`${currentYear}-${currentMonth}`)) {
        payrollMap.set(`${currentYear}-${currentMonth}`, {
          month: currentMonth,
          year: currentYear,
          label: `${monthNames[currentMonth - 1]} ${currentYear}`,
          total: projected,
          projected: true,
        });
      }
      payrollTrend = Array.from(payrollMap.values()).sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.month - b.month
      );

      const [corrRes, leaveRes, advRes] = await Promise.all([
        db.execute(
          "SELECT COUNT(*) as count FROM attendance_corrections WHERE status = 'pending'"
        ),
        db.execute(
          "SELECT COUNT(*) as count FROM leave_requests WHERE status = 'pending_hr'"
        ),
        db.execute(
          "SELECT COUNT(*) as count FROM advance_requests WHERE status = 'pending'"
        ),
      ]);
      pendingCorrections = (
        corrRes.rows[0] as unknown as { count: number }
      ).count;
      pendingLeaves = (leaveRes.rows[0] as unknown as { count: number }).count;
      pendingAdvances = (advRes.rows[0] as unknown as { count: number }).count;

      const recentResult = await db.execute({
        sql: `SELECT a.id, e.name as employee_name,
                     s.name as section_name, c.name as company_name,
                     a.status, a.date, a.marked_at
              FROM attendance a
              JOIN employees e ON e.id = a.employee_id
              LEFT JOIN sections s ON s.id = e.section_id
              LEFT JOIN companies c ON c.id = e.company_id
              WHERE a.date = ?
              ORDER BY a.marked_at DESC
              LIMIT 10`,
        args: [today],
      });
      recentAttendance = recentResult.rows as unknown as RecentAttRow[];
    } else if (role === "employee" && employeeId) {
      // ── Employee: personal stats for this month ──────────────────────────
      const empRow = await db.execute({
        sql: `SELECT type, daily_rate, monthly_salary FROM employees WHERE id = ?`,
        args: [employeeId],
      });
      if (empRow.rows.length > 0) {
        const emp = empRow.rows[0] as unknown as {
          type: string;
          daily_rate: number;
          monthly_salary: number;
        };
        myEmployeeType = emp.type;
        myDailyRate = emp.daily_rate;

        const myAtt = await db.execute({
          sql: `SELECT status, COUNT(*) as count
                FROM attendance
                WHERE employee_id = ? AND date LIKE ?
                GROUP BY status`,
          args: [employeeId, `${datePrefix}%`],
        });
        for (const row of myAtt.rows as unknown as {
          status: string;
          count: number;
        }[]) {
          if (row.status === "present") myPresent = row.count;
          else if (row.status === "late") myLate = row.count;
          else if (row.status === "absent") myAbsent = row.count;
        }

        const workedDays = myPresent + myLate;
        const totalMarked = myPresent + myLate + myAbsent;
        myAttendanceRate =
          totalMarked > 0 ? Math.round((workedDays / totalMarked) * 100) : 0;

        myEarnings =
          emp.type === "casual"
            ? Math.round(workedDays * emp.daily_rate)
            : emp.monthly_salary;
      }
    }
  } catch {
    // DB may not be initialised yet on first boot
  }

  const unmarked = Math.max(
    0,
    totalEmployees - presentToday - lateToday - absentToday
  );
  const totalPending = pendingCorrections + pendingLeaves + pendingAdvances;
  const isManagement =
    role === "admin" || role === "hr" || role === "supervisor";

  const sparklines = {
    all:     attendanceTrend.map((d) => d.present + d.late + d.absent),
    present: attendanceTrend.map((d) => d.present),
    late:    attendanceTrend.map((d) => d.late),
    absent:  attendanceTrend.map((d) => d.absent),
  };

  return (
    <div className="space-y-6">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {session.user.name?.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Here&apos;s what&apos;s happening with your team today.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Date pill */}
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-3 h-9 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{formattedDate}</span>
          </div>

          {/* Export / action button */}
          {isManagement && (
            <Button asChild>
              <Link href="/attendance/today">
                <Download className="h-4 w-4 mr-1.5" />
                Export Attendance
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MANAGEMENT VIEW (admin / hr / supervisor)                           */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {isManagement && (
        <>
          {/* Stats grid — counts are computed client-side after applying visibility filters */}
          <LiveStatsGrid sparklines={sparklines} />

          {/* Pending action alerts */}
          {totalPending > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {pendingCorrections > 0 && (
                <Link href="/attendance/corrections" className="block">
                  <Card className="border-amber-200 bg-amber-50 hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4 flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-amber-900">
                          {pendingCorrections} Correction
                          {pendingCorrections !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-amber-700">
                          Attendance correction requests
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )}
              {pendingLeaves > 0 && (
                <Link href="/leave" className="block">
                  <Card className="border-blue-200 bg-blue-50 hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4 flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-blue-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-blue-900">
                          {pendingLeaves} Leave Request
                          {pendingLeaves !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-blue-700">Awaiting approval</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )}
              {pendingAdvances > 0 && role !== "supervisor" && (
                <Link href="/advances" className="block">
                  <Card className="border-purple-200 bg-purple-50 hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4 flex items-center gap-3">
                      <DollarSign className="h-5 w-5 text-purple-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-purple-900">
                          {pendingAdvances} Advance Request
                          {pendingAdvances !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-purple-700">
                          Salary advances pending
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )}
            </div>
          )}

          {/* Charts row */}
          <div
            className={`grid gap-6 ${
              role === "admin" || role === "hr" ? "lg:grid-cols-[3fr_2fr]" : ""
            }`}
          >
            {/* 7-day attendance trend */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                      Attendance Trend
                    </p>
                    <CardTitle className="text-lg">
                      {presentToday + lateToday} Present / Late
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-2 rounded-sm bg-green-400 inline-block" />
                      Present
                    </span>
                    <span className="mx-1 text-muted-foreground">·</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-2 w-2 rounded-sm bg-amber-400 inline-block" />
                      Late
                    </span>
                  </div>
                </div>
                <CardDescription>
                  Daily breakdown for the past 7 days
                  {role === "supervisor" ? " — your team" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AttendanceChart data={attendanceTrend} />
              </CardContent>
            </Card>

            {/* Casual payroll trend — admin / hr only */}
            {(role === "admin" || role === "hr") && (
              <Card>
                <CardHeader className="pb-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                      Payroll Breakdown
                    </p>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-500" />
                      Casual Wages
                    </CardTitle>
                  </div>
                  <CardDescription>
                    6-month casual payroll. Current month is projected.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PayrollChart data={payrollTrend} />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Recent Attendance Table */}
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                  Recent Attendance
                </p>
                <p className="text-sm font-semibold">Today&apos;s Records</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-3 h-9 text-sm text-muted-foreground cursor-text">
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs">Search attendance...</span>
                </div>
                <Button asChild size="sm">
                  <Link href="/attendance/today">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Mark Attendance
                  </Link>
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      ID
                    </th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Employee
                    </th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">
                      Section
                    </th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">
                      Date
                    </th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">
                      Marked At
                    </th>
                    <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentAttendance.length > 0 ? (
                    recentAttendance.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          #{row.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {row.employee_name}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-sm hidden md:table-cell">
                          {row.section_name ?? row.company_name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                          {row.date}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                          {row.marked_at
                            ? new Date(row.marked_at).toLocaleTimeString(
                                "en-US",
                                { hour: "2-digit", minute: "2-digit" }
                              )
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            asChild
                          >
                            <Link href="/attendance/today">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        No attendance recorded for today yet.
                        <Link
                          href="/attendance/today"
                          className="ml-1 text-primary underline-offset-4 hover:underline"
                        >
                          Mark attendance
                        </Link>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            {recentAttendance.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
                <p className="text-xs text-muted-foreground">
                  Showing {recentAttendance.length} most recent record
                  {recentAttendance.length !== 1 ? "s" : ""} for today
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/attendance/today">View all</Link>
                </Button>
              </div>
            )}
          </div>

          {/* Quick-action cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-green-600" />
                  Today&apos;s Attendance
                </CardTitle>
                <CardDescription>
                  {unmarked > 0
                    ? `${unmarked} employee${unmarked !== 1 ? "s" : ""} not yet marked`
                    : "All employees marked for today"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="success">{presentToday} present</Badge>
                    {lateToday > 0 && (
                      <Badge variant="warning">{lateToday} late</Badge>
                    )}
                    {unmarked > 0 && (
                      <Badge variant="outline">{unmarked} pending</Badge>
                    )}
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/attendance/today">View</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {(role === "hr" || role === "admin") && (
              <Card className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-blue-600" />
                    Payroll Management
                  </CardTitle>
                  <CardDescription>
                    Manage periods and generate payslips
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href="/payroll/periods">Full-time</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/payroll/casual">Casual</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-purple-600" />
                  My Profile
                </CardTitle>
                <CardDescription>
                  View your personal attendance and earnings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm" variant="outline">
                  <Link href="/me">Open My Dashboard</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* EMPLOYEE VIEW                                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {role === "employee" && (
        <div className="space-y-5">
          {employeeId ? (
            <>
              {/* Personal stats for the current month */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                    Present
                  </p>
                  <p className="text-3xl font-bold text-green-700 mt-1">
                    {myPresent}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    days this month
                  </p>
                </div>

                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                    Late
                  </p>
                  <p className="text-3xl font-bold text-amber-600 mt-1">
                    {myLate}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    days this month
                  </p>
                </div>

                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                    Absent
                  </p>
                  <p className="text-3xl font-bold text-red-600 mt-1">
                    {myAbsent}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    days this month
                  </p>
                </div>

                <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                    {myEmployeeType === "casual" ? "Earned" : "Salary"}
                  </p>
                  <p className="text-2xl font-bold text-blue-700 mt-1 leading-tight">
                    {formatCurrency(myEarnings)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {myEmployeeType === "casual"
                      ? `${myPresent + myLate} days × ${formatCurrency(myDailyRate)}`
                      : "monthly salary"}
                  </p>
                </div>
              </div>

              {/* Attendance rate progress bar */}
              {myPresent + myLate + myAbsent > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">
                        Attendance Rate this Month
                      </p>
                      <Badge
                        variant={
                          myAttendanceRate >= 90
                            ? "success"
                            : myAttendanceRate >= 70
                            ? "warning"
                            : "destructive"
                        }
                      >
                        {myAttendanceRate}%
                      </Badge>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all ${
                          myAttendanceRate >= 90
                            ? "bg-green-500"
                            : myAttendanceRate >= 70
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${myAttendanceRate}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {myPresent + myLate} out of{" "}
                      {myPresent + myLate + myAbsent} days marked
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Quick links */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Attendance Calendar
                    </CardTitle>
                    <CardDescription>
                      View monthly record and request corrections
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/me">View Calendar</Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      My Payslips
                    </CardTitle>
                    <CardDescription>
                      Download payslips and track earnings
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/me">View Payslips</Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Salary Advance
                    </CardTitle>
                    <CardDescription>
                      Request or track advance repayments
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/me">Request Advance</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No employee record linked</p>
                <p className="text-xs mt-1">
                  Contact HR to link your employee profile.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
