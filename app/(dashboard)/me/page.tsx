"use client";

import { useState, useMemo, type ElementType } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Calendar as CalendarIcon,
  DollarSign,
  FileText,
  Inbox,
  Loader2,
  Megaphone,
  MessageSquareWarning,
  Palmtree,
  Receipt,
  Settings,
  UserCircle,
  Eye,
  EyeOff,
  Search,
  RotateCcw,
  Building2,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FinancialCard } from "@/components/dashboard/financial-card";
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import { PayslipPdfButton } from "@/components/payroll/payslip-pdf-button";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAttendanceVisibility } from "@/hooks/use-attendance-visibility";

const advanceSchema = z.object({
  amount: z.number().min(1, "Kiasi lazima kiwe angalau TZS 1"),
  description: z.string().min(3, "Tafadhali eleza sababu"),
});
type AdvanceForm = z.infer<typeof advanceSchema>;

interface Payslip {
  id: string;
  month: number;
  year: number;
  days_worked: number;
  gross_amount: number;
  net_amount: number;
  total_deductions: number;
  generated_at: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

interface AdvanceRequest {
  id: string;
  amount: number;
  description: string | null;
  status: "pending" | "approved" | "denied";
  requested_at: string;
  reviewed_at?: string | null;
  review_note?: string | null;
}

interface AdvanceSchedule {
  id: string;
  total_debt: number;
  monthly_deduction: number;
  remaining_debt: number;
  status: "active" | "cleared";
  created_at: string;
  notes: string | null;
}

interface Announcement {
  id: string;
  subject: string;
  message: string;
  created_at: string;
}

interface Complaint {
  id: string;
  subject: string;
  response: string | null;
  status: string;
  responded_at: string | null;
}

interface AccountData {
  user: {
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  employee: {
    name: string;
    phone: string | null;
    department: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  } | null;
}

interface LeaveRequest {
  id: string;
  status: "pending_supervisor" | "pending_hr" | "approved" | "denied" | "pending";
  days: number;
  submitted_at: string;
  reviewed_at: string | null;
}

interface PayrollSummary {
  attendance: {
    present: number;
    late: number;
    absent: number;
    effective_days: number;
  };
  financial: {
    base_gross: number;
    total_overtime: number;
    gross_amount: number;
    net_amount: number;
    salary_advances?: number;
    food_advance_amount: number;
    total_advances: number;
  };
}

const monthNames = [
  "Januari", "Februari", "Machi", "Aprili", "Mei", "Juni",
  "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba",
];

type DashboardPanel = "attendance" | "financial" | "payslips" | "leave" | "salary" | "messages";

export default function MePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<DashboardPanel>("attendance");

  const userId = session?.user?.id;
  const now = new Date();
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = previousMonthDate.getMonth() + 1;
  const previousYear = previousMonthDate.getFullYear();
  const previousMonthLabel = `${monthNames[previousMonth - 1]} ${previousYear}`;

  const { data: selfEmployee } = useQuery({
    queryKey: ["me", "employee"],
    queryFn: async () => {
      const res = await fetch("/api/me/employee");
      if (!res.ok) return null;
      return (await res.json()) as { id: string } | null;
    },
    enabled: !!userId,
  });
  const employeeId = selfEmployee?.id ?? null;

  const { data: summaryData } = useQuery({
    queryKey: ["payroll", "current", employeeId, now.getFullYear(), now.getMonth() + 1],
    queryFn: async () => {
      const res = await fetch(
        `/api/payroll/current?employee_id=${employeeId}&year=${now.getFullYear()}&month=${now.getMonth() + 1}`
      );
      if (!res.ok) return null;
      return res.json() as Promise<PayrollSummary>;
    },
    enabled: !!employeeId,
    staleTime: 60000,
  });

  const { data: previousMonthSummary, isLoading: previousMonthLoading } = useQuery({
    queryKey: ["payroll", "previous", employeeId, previousYear, previousMonth],
    queryFn: async () => {
      const res = await fetch(
        `/api/payroll/current?employee_id=${employeeId}&year=${previousYear}&month=${previousMonth}`
      );
      if (!res.ok) return null;
      return res.json() as Promise<PayrollSummary>;
    },
    enabled: !!employeeId,
    staleTime: 60000,
  });

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ["transactions", employeeId],
    queryFn: async () => {
      const res = await fetch(`/api/transactions/advance?employee_id=${employeeId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ transactions: Transaction[]; balance: number }>;
    },
    enabled: !!employeeId,
  });

  const { data: advanceRequests } = useQuery({
    queryKey: ["advance-requests", "mine"],
    queryFn: async () => {
      const res = await fetch("/api/advance-requests");
      if (!res.ok) return [];
      return (await res.json()) as AdvanceRequest[];
    },
    enabled: !!employeeId,
  });

  const { data: advanceSchedules } = useQuery({
    queryKey: ["advance-schedules", "mine"],
    queryFn: async () => {
      const res = await fetch("/api/advances/schedule");
      if (!res.ok) return [];
      return (await res.json()) as AdvanceSchedule[];
    },
    enabled: !!employeeId,
  });

  const { data: myPayslips, isLoading: payslipsLoading } = useQuery({
    queryKey: ["my-payslips"],
    queryFn: async () => {
      const res = await fetch("/api/payslips/mine");
      if (!res.ok) return [];
      return (await res.json()) as Payslip[];
    },
    enabled: !!employeeId,
  });

  const { data: leaveData } = useQuery({
    queryKey: ["leave"],
    queryFn: async () => {
      const res = await fetch("/api/leave");
      if (!res.ok) return null;
      return (await res.json()) as {
        requests: LeaveRequest[];
        balance: { allowed_days: number; used_days: number; carryover_days?: number | null } | null;
      };
    },
    enabled: !!employeeId,
  });

  const { data: inbox } = useQuery({
    queryKey: ["me-inbox"],
    queryFn: async () => {
      const [annRes, compRes] = await Promise.all([
        fetch("/api/announcements?unread=1"),
        fetch("/api/complaints?mine=1"),
      ]);
      const announcements = annRes.ok ? ((await annRes.json()) as Announcement[]) : [];
      const complaints = compRes.ok ? ((await compRes.json()) as Complaint[]) : [];
      return { announcements, complaints };
    },
    enabled: !!userId,
  });

  const { data: accountData } = useQuery({
    queryKey: ["me", "account"],
    queryFn: async () => {
      const res = await fetch("/api/me/account");
      if (!res.ok) return null;
      return (await res.json()) as AccountData;
    },
    enabled: !!userId,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdvanceForm>({ resolver: zodResolver(advanceSchema) });

  const accountForm = useForm({
    defaultValues: {
      email: "",
      phone: "",
      emergency_contact_name: "",
      emergency_contact_phone: "",
      current_password: "",
      new_password: "",
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async (data: AdvanceForm) => {
      const res = await fetch("/api/advance-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Math.round(data.amount), description: data.description }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-requests"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["payroll", "current"] });
      setAdvanceOpen(false);
      reset();
      toast({ title: "Ombi limetumwa", description: "Ombi lako la mkopo limetumwa kwa HR." });
    },
    onError: (e: Error) => {
      toast({ title: "Hitilafu", description: e.message || "Imeshindikana kutuma ombi", variant: "destructive" });
    },
  });

  const markAnnouncementRead = useMutation({
    mutationFn: async (announcementId: string) => {
      const res = await fetch(`/api/announcements/${announcementId}/read`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me-inbox"] }),
  });

  const accountMutation = useMutation({
    mutationFn: async (data: {
      email: string; phone: string; emergency_contact_name: string;
      emergency_contact_phone: string; current_password: string; new_password: string;
    }) => {
      const res = await fetch("/api/me/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          phone: data.phone,
          emergency_contact_name: data.emergency_contact_name,
          emergency_contact_phone: data.emergency_contact_phone,
          current_password: data.current_password || undefined,
          new_password: data.new_password || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Imeshindikana kuhifadhi");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me", "account"] });
      queryClient.invalidateQueries({ queryKey: ["me", "employee"] });
      setSettingsOpen(false);
      toast({ title: "Taarifa zimehifadhiwa" });
    },
    onError: (err: Error) =>
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" }),
  });

  const role = (session?.user as { role?: string })?.role;
  const isAdmin = role === "admin";

  // Admin-only: visibility controls
  const { hidden, toggleEmployee, toggleSection, reset: resetVisibility } = useAttendanceVisibility();
  const [visEmpSearch, setVisEmpSearch] = useState("");

  const { data: allEmployees } = useQuery<{ id: string; name: string; department: string; section_id: string | null }[]>({
    queryKey: ["employees-vis"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin,
  });

  const { data: allSections } = useQuery<{ id: string; name: string; company_id: string }[]>({
    queryKey: ["sections-vis"],
    queryFn: async () => {
      const res = await fetch("/api/sections");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin,
  });

  const { data: allCompanies } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["companies-vis"],
    queryFn: async () => {
      const res = await fetch("/api/companies");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isAdmin,
  });

  const companyMap = useMemo(
    () => new Map((allCompanies ?? []).map((c) => [c.id, c.name])),
    [allCompanies]
  );

  const sectionsByCompany = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const sec of allSections ?? []) {
      if (!map.has(sec.company_id)) map.set(sec.company_id, []);
      map.get(sec.company_id)!.push(sec);
    }
    return map;
  }, [allSections]);

  const filteredVisEmployees = useMemo(
    () =>
      (allEmployees ?? []).filter(
        (e) =>
          e.name.toLowerCase().includes(visEmpSearch.toLowerCase()) ||
          e.department?.toLowerCase().includes(visEmpSearch.toLowerCase())
      ),
    [allEmployees, visEmpSearch]
  );

  const hiddenCount = hidden.employees.length + hidden.sections.length;
  const announcements = inbox?.announcements ?? [];
  const complaintResponses =
    inbox?.complaints.filter((c) => ["closed", "resolved"].includes(c.status) && c.response) ?? [];
  const unreadCount = announcements.length + complaintResponses.length;
  const presentToday = (summaryData?.attendance.present ?? 0) > 0;
  const leaveRemaining = leaveData?.balance
    ? leaveData.balance.allowed_days + (leaveData.balance.carryover_days ?? 0) - leaveData.balance.used_days
    : null;
  const latestLeave = leaveData?.requests?.[0];
  const latestAdvanceRequest = advanceRequests?.[0];
  const activeAdvanceSchedules = advanceSchedules?.filter((s) => s.status === "active") ?? [];
  const advanceRemaining = activeAdvanceSchedules.reduce((sum, s) => sum + s.remaining_debt, 0);

  const tabs: { id: DashboardPanel; label: string; icon: ElementType; badge?: number }[] = isAdmin
    ? [
        { id: "messages", label: "Ujumbe", icon: Inbox, badge: unreadCount },
      ]
    : [
        { id: "attendance", label: "Mahudhurio", icon: CalendarIcon },
        { id: "financial",  label: "Fedha",       icon: Receipt },
        { id: "payslips",   label: "Payslips",    icon: FileText },
        { id: "leave",      label: "Likizo",      icon: Palmtree },
        { id: "salary",     label: "Advance",     icon: DollarSign },
        { id: "messages",   label: "Ujumbe",      icon: Inbox, badge: unreadCount },
      ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <UserCircle className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{session?.user?.name}</h1>
            <p className="text-sm text-muted-foreground capitalize">
              {role} · {session?.user?.email}
            </p>
          </div>
        </div>
        {!isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                accountForm.reset({
                  email: accountData?.user?.email ?? "",
                  phone: accountData?.user?.phone ?? accountData?.employee?.phone ?? "",
                  emergency_contact_name: accountData?.employee?.emergency_contact_name ?? "",
                  emergency_contact_phone: accountData?.employee?.emergency_contact_phone ?? "",
                  current_password: "",
                  new_password: "",
                });
                setSettingsOpen(true);
              }}
            >
              <Settings className="h-4 w-4 mr-2" />
              Akaunti
            </Button>
            <Button
              size="sm"
              onClick={() => setActivePanel(presentToday ? "leave" : "attendance")}
            >
              {presentToday ? "Omba Likizo" : "Omba Marekebisho"}
            </Button>
          </div>
        )}
      </div>

      {/* ── Tab navigation ─────────────────────────────────────────────────── */}
      <div className="flex overflow-x-auto border-b">
        {tabs.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setActivePanel(id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activePanel === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {badge ? (
              <span className="ml-0.5 rounded-full bg-destructive px-1.5 py-0.5 text-xs leading-none text-destructive-foreground">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── Attendance panel ────────────────────────────────────────────────── */}
      {activePanel === "attendance" && (
        <section>
          {selfEmployee ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Mahudhurio ya Mwezi
                </CardTitle>
                <CardDescription>Rekodi yako ya mahudhurio kwa mwezi huu</CardDescription>
              </CardHeader>
              <CardContent>
                <AttendanceCalendar employeeId={selfEmployee.id} allowCorrection />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Hakuna rekodi za mahudhurio.
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {/* ── Financial panel ─────────────────────────────────────────────────── */}
      {activePanel === "financial" && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Fedha Zangu</h2>
            <p className="text-sm text-muted-foreground">
              Muhtasari wa mapato, overtime, makato, na salary advance
            </p>
          </div>

          {selfEmployee ? (
            <FinancialCard
              employeeId={selfEmployee.id}
              onRequestAdvance={() => setActivePanel("salary")}
            />
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Akaunti yako haijaunganishwa na rekodi ya mfanyakazi.</p>
                <p className="text-xs mt-1">Wasiliana na HR ili kuunganisha taarifa zako.</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Fedha Halisi ya Mwezi Uliopita
              </CardTitle>
              <CardDescription>
                Kiasi halisi kinachohitajika kwa {previousMonthLabel}, kimekokotolewa kutoka mahudhurio na makato
              </CardDescription>
            </CardHeader>
            <CardContent>
              {previousMonthLoading ? (
                <div className="grid gap-3 sm:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : !previousMonthSummary ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Hakuna taarifa za mwezi uliopita bado.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border p-3 sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Fedha Inayohitajika</p>
                    <p className="text-2xl font-bold text-green-700">
                      {formatCurrency(previousMonthSummary.financial.net_amount)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Net pay ya {previousMonthLabel}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Gross</p>
                    <p className="text-lg font-bold">
                      {formatCurrency(previousMonthSummary.financial.gross_amount)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {previousMonthSummary.attendance.effective_days} siku
                    </p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Makato</p>
                    <p className="text-lg font-bold text-red-700">
                      {formatCurrency(previousMonthSummary.financial.total_advances)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Salary/Food advances
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Historia ya Miamala
              </CardTitle>
              <CardDescription>Mikopo na malipo</CardDescription>
            </CardHeader>
            <CardContent>
              {txLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !txData?.transactions?.length ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Hakuna miamala bado.
                </p>
              ) : (
                <div className="space-y-2">
                  {txData.transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium capitalize">{tx.type.replace(/_/g, " ")}</p>
                        {tx.description && (
                          <p className="text-xs text-muted-foreground">{tx.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                      </div>
                      <Badge variant={tx.amount >= 0 ? "success" : "destructive"}>
                        {tx.amount >= 0 ? "+" : ""}{formatCurrency(tx.amount)}
                      </Badge>
                    </div>
                  ))}
                  <div className="border-t pt-3 flex justify-between font-semibold text-sm">
                    <span>Bakaa Halisi</span>
                    <span className={txData.balance >= 0 ? "text-green-700" : "text-red-700"}>
                      {formatCurrency(txData.balance)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Payslips panel ──────────────────────────────────────────────────── */}
      {activePanel === "payslips" && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Payslips Zangu
              </CardTitle>
              <CardDescription>Pakia PDF za mishahara iliyofungwa</CardDescription>
            </CardHeader>
            <CardContent>
              {payslipsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : !myPayslips?.length ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Hakuna payslip iliyofungwa bado.
                </p>
              ) : (
                <div className="space-y-2">
                  {myPayslips.map((ps) => (
                    <div
                      key={ps.id}
                      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {monthNames[ps.month - 1]} {ps.year}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ps.days_worked} siku · Gross {formatCurrency(ps.gross_amount)} ·
                          Makato {formatCurrency(ps.total_deductions ?? 0)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Imetengenezwa: {formatDate(ps.generated_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="success" className="text-xs whitespace-nowrap">
                          Net {formatCurrency(ps.net_amount)}
                        </Badge>
                        <PayslipPdfButton payslipId={ps.id} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Leave panel ─────────────────────────────────────────────────────── */}
      {activePanel === "leave" && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Palmtree className="h-4 w-4" />
                Likizo na Maombi
              </CardTitle>
              <CardDescription>Bakaa yako na hali ya maombi ya likizo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info">Zilizobaki: {leaveRemaining ?? "-"} siku</Badge>
                {latestLeave && (
                  <Badge
                    variant={
                      latestLeave.status === "approved" ? "success"
                      : latestLeave.status === "denied" ? "destructive"
                      : latestLeave.status === "pending_hr" ? "info"
                      : "warning"
                    }
                  >
                    Ombi la mwisho: {latestLeave.status}
                  </Badge>
                )}
              </div>
              <Button onClick={() => (window.location.href = "/leave")}>
                Fungua Maombi ya Likizo
              </Button>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Salary advance panel ────────────────────────────────────────────── */}
      {activePanel === "salary" && (
        <section>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Salary Advance
              </CardTitle>
              <CardDescription>Angalia maombi, deni lililobaki, na makato ya kila mwezi</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Deni lililobaki</p>
                  <p className="text-lg font-bold text-red-700">{formatCurrency(advanceRemaining)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Makato ya mwezi</p>
                  <p className="text-lg font-bold">
                    {formatCurrency(activeAdvanceSchedules.reduce((sum, s) => sum + s.monthly_deduction, 0))}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Ombi la mwisho</p>
                  <p className="text-sm font-semibold capitalize">
                    {latestAdvanceRequest?.status ?? "Hakuna"}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setAdvanceOpen(true)}>Omba Salary Advance</Button>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Maombi</h3>
                {!advanceRequests?.length ? (
                  <p className="text-sm text-muted-foreground rounded-lg border p-3">
                    Hakuna maombi ya salary advance bado.
                  </p>
                ) : (
                  advanceRequests.slice(0, 5).map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{formatCurrency(request.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(request.requested_at)}
                          {request.description ? ` · ${request.description}` : ""}
                        </p>
                      </div>
                      <Badge
                        variant={
                          request.status === "approved" ? "success"
                          : request.status === "denied" ? "destructive"
                          : "warning"
                        }
                      >
                        {request.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Ratiba za Makato</h3>
                {!activeAdvanceSchedules.length ? (
                  <p className="text-sm text-muted-foreground rounded-lg border p-3">
                    Hakuna ratiba ya makato inayoendelea.
                  </p>
                ) : (
                  activeAdvanceSchedules.map((schedule) => {
                    const monthsLeft = Math.ceil(schedule.remaining_debt / schedule.monthly_deduction);
                    return (
                      <div key={schedule.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">
                              {formatCurrency(schedule.remaining_debt)} imebaki
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(schedule.monthly_deduction)} kila mwezi · takriban miezi {monthsLeft}
                            </p>
                          </div>
                          <Badge variant="info">Active</Badge>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Messages panel ──────────────────────────────────────────────────── */}
      {activePanel === "messages" && (
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                Matangazo
              </CardTitle>
              <CardDescription>Ujumbe mpya kutoka kwa HR/Admin</CardDescription>
            </CardHeader>
            <CardContent>
              {!announcements.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Hakuna matangazo mapya.
                </p>
              ) : (
                <div className="space-y-3">
                  {announcements.map((a) => (
                    <div key={a.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold">{a.subject}</p>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(a.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                        {a.message}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => markAnnouncementRead.mutate(a.id)}
                        disabled={markAnnouncementRead.isPending}
                      >
                        Weka kama imesomwa
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4" />
                Majibu ya Malalamiko
              </CardTitle>
              <CardDescription>Majibu kutoka HR kuhusu malalamiko yako</CardDescription>
            </CardHeader>
            <CardContent>
              {!complaintResponses.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Hakuna malalamiko yaliyojibiwa.
                </p>
              ) : (
                <div className="space-y-3">
                  {complaintResponses.map((c) => (
                    <div key={c.id} className="rounded-lg border p-3">
                      <p className="text-sm font-semibold">{c.subject}</p>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                        {c.response}
                      </p>
                      {c.responded_at && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {formatDate(c.responded_at)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Salary advance dialog ───────────────────────────────────────────── */}
      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Omba Salary Advance</DialogTitle>
            <DialogDescription>
              Tuma ombi la salary advance kwa HR. Ombi likiidhinishwa, HR ataweka makato ya kila mwezi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((data) => advanceMutation.mutate(data))} className="space-y-4">
            <div className="space-y-2">
              <Label>Kiasi (TZS)</Label>
              <Input
                type="number"
                step="1"
                min="1"
                placeholder="50000"
                {...register("amount", { valueAsNumber: true })}
              />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Sababu</Label>
              <Input placeholder="Hospitali, kodi ya nyumba, n.k." {...register("description")} />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdvanceOpen(false)}>
                Ghairi
              </Button>
              <Button type="submit" disabled={advanceMutation.isPending}>
                {advanceMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inatuma...</>
                ) : "Tuma Ombi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Admin: Visibility settings ─────────────────────────────────────── */}
      {isAdmin && (
        <section className="space-y-4">
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {hiddenCount > 0 ? (
                  <EyeOff className="h-4 w-4 text-amber-500" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
                <h2 className="font-semibold text-sm">Mipangilio ya Mfumo — Ficha kutoka Mahudhurio</h2>
              </div>
              {hiddenCount > 0 && (
                <Button variant="ghost" size="sm" onClick={resetVisibility} className="h-7 text-xs">
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Rudisha Yote
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {hiddenCount > 0
                ? `${hiddenCount} ${hiddenCount === 1 ? "kipengele kimefichwa" : "vipengele vimefichwa"} kutoka kwenye ukurasa wa mahudhurio na orodha ya wafanyakazi.`
                : "Wafanyakazi na sehemu zilizochaguliwa hapa hazitaonekana kwenye mahudhurio na orodha ya wafanyakazi."}
            </p>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Sections */}
              {(allSections ?? []).length > 0 && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Sehemu</p>
                  </div>
                  <div className="space-y-3">
                    {Array.from(sectionsByCompany.entries()).map(([companyId, secs]) => (
                      <div key={companyId}>
                        {companyMap.get(companyId) && (
                          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1.5">
                            {companyMap.get(companyId)}
                          </p>
                        )}
                        <div className="space-y-1.5 pl-1">
                          {secs.map((sec) => (
                            <label key={sec.id} className="flex items-center gap-2.5 cursor-pointer p-1.5 rounded hover:bg-muted/50">
                              <Checkbox
                                checked={hidden.sections.includes(sec.id)}
                                onCheckedChange={() => toggleSection(sec.id)}
                              />
                              <span className="text-sm">{sec.name}</span>
                              {hidden.sections.includes(sec.id) && (
                                <EyeOff className="h-3 w-3 text-amber-500 ml-auto" />
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Employees */}
              {(allEmployees ?? []).length > 0 && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Wafanyakazi</p>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Tafuta..."
                      value={visEmpSearch}
                      onChange={(e) => setVisEmpSearch(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                    {filteredVisEmployees.map((emp) => (
                      <label key={emp.id} className="flex items-center gap-2.5 cursor-pointer p-1.5 rounded hover:bg-muted/50">
                        <Checkbox
                          checked={hidden.employees.includes(emp.id)}
                          onCheckedChange={() => toggleEmployee(emp.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{emp.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{emp.department ?? "—"}</p>
                        </div>
                        {hidden.employees.includes(emp.id) && (
                          <EyeOff className="h-3 w-3 text-amber-500 shrink-0" />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Account settings dialog ─────────────────────────────────────────── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Akaunti na Taarifa Binafsi</DialogTitle>
            <DialogDescription>
              Sasisha mawasiliano, taarifa za dharura, au badilisha PIN yako.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={accountForm.handleSubmit((data) => accountMutation.mutate(data))}
            className="space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Barua pepe</Label>
                <Input type="email" {...accountForm.register("email")} />
              </div>
              <div className="space-y-2">
                <Label>Simu</Label>
                <Input placeholder="+255..." {...accountForm.register("phone")} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Jina la dharura</Label>
                <Input {...accountForm.register("emergency_contact_name")} />
              </div>
              <div className="space-y-2">
                <Label>Simu ya dharura</Label>
                <Input placeholder="+255..." {...accountForm.register("emergency_contact_phone")} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>PIN ya sasa</Label>
                <Input type="password" {...accountForm.register("current_password")} />
              </div>
              <div className="space-y-2">
                <Label>PIN mpya</Label>
                <Input type="password" {...accountForm.register("new_password")} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
                Ghairi
              </Button>
              <Button type="submit" disabled={accountMutation.isPending}>
                {accountMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inahifadhi...</>
                ) : "Hifadhi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
