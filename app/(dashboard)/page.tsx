import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTodayDate } from "@/lib/utils";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { Users, CheckCircle, Clock, AlertCircle, ClipboardList } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = (session.user as { role: string }).role;
  const today = getTodayDate();

  // Fetch stats
  let totalEmployees = 0;
  let presentToday = 0;
  let lateToday = 0;
  let absentToday = 0;

  try {
    if (role === "supervisor") {
      const empResult = await db.execute({
        sql: "SELECT COUNT(*) as count FROM employees WHERE supervisor_id = ? AND active = 1",
        args: [session.user.id!],
      });
      totalEmployees = (empResult.rows[0] as unknown as { count: number }).count;

      const attResult = await db.execute({
        sql: `SELECT status, COUNT(*) as count
              FROM attendance a
              JOIN employees e ON e.id = a.employee_id
              WHERE e.supervisor_id = ? AND a.date = ?
              GROUP BY status`,
        args: [session.user.id!, today],
      });

      for (const row of attResult.rows as unknown as { status: string; count: number }[]) {
        if (row.status === "present") presentToday = row.count;
        if (row.status === "late") lateToday = row.count;
        if (row.status === "absent") absentToday = row.count;
      }
    } else {
      const empResult = await db.execute(
        "SELECT COUNT(*) as count FROM employees WHERE active = 1"
      );
      totalEmployees = (empResult.rows[0] as unknown as { count: number }).count;

      const attResult = await db.execute({
        sql: `SELECT status, COUNT(*) as count FROM attendance WHERE date = ? GROUP BY status`,
        args: [today],
      });

      for (const row of attResult.rows as unknown as { status: string; count: number }[]) {
        if (row.status === "present") presentToday = row.count;
        if (row.status === "late") lateToday = row.count;
        if (row.status === "absent") absentToday = row.count;
      }
    }
  } catch (e) {
    // DB might not be initialized yet
  }

  const unmarked = totalEmployees - presentToday - lateToday - absentToday;

  const stats = [
    { label: "Total Employees", value: totalEmployees, icon: Users, color: "text-blue-600", bgColor: "bg-blue-50" },
    { label: "Present Today", value: presentToday, icon: CheckCircle, color: "text-green-600", bgColor: "bg-green-50", change: totalEmployees > 0 ? `${Math.round(((presentToday + lateToday) / totalEmployees) * 100)}% rate` : undefined },
    { label: "Late Today", value: lateToday, icon: Clock, color: "text-amber-600", bgColor: "bg-amber-50" },
    { label: "Absent Today", value: absentToday, icon: AlertCircle, color: "text-red-600", bgColor: "bg-red-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {session.user.name}. Today is{" "}
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.
          </p>
        </div>
        {(role === "supervisor" || role === "hr" || role === "admin") && (
          <Button asChild>
            <Link href="/attendance/today">
              <ClipboardList className="h-4 w-4 mr-2" />
              Mark Attendance
            </Link>
          </Button>
        )}
      </div>

      {/* Stats grid */}
      <StatsGrid stats={stats} />

      {/* Quick actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(role === "supervisor" || role === "hr" || role === "admin") && (
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-base">Today&apos;s Attendance</CardTitle>
              <CardDescription>
                {unmarked > 0
                  ? `${unmarked} employees not yet marked`
                  : "All employees marked for today"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Badge variant="success">{presentToday} present</Badge>
                  {lateToday > 0 && <Badge variant="warning">{lateToday} late</Badge>}
                  {unmarked > 0 && <Badge variant="outline">{unmarked} pending</Badge>}
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href="/attendance/today">View</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {(role === "hr" || role === "admin") && (
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="text-base">Payroll Management</CardTitle>
              <CardDescription>Manage periods and generate payslips</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link href="/payroll/periods">Manage Payroll</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="text-base">My Dashboard</CardTitle>
            <CardDescription>View your attendance and earnings</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <Link href="/me">View My Stats</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
