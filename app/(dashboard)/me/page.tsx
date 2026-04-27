"use client";

import type { ElementType } from "react";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowRight,
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
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

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

interface ActivityItem {
  id: string;
  title: string;
  description: string;
  date: string;
  icon: ElementType;
  tone: "green" | "amber" | "blue" | "red" | "slate";
}

const monthNames = [
  "Januari",
  "Februari",
  "Machi",
  "Aprili",
  "Mei",
  "Juni",
  "Julai",
  "Agosti",
  "Septemba",
  "Oktoba",
  "Novemba",
  "Desemba",
];

function ActionCard({
  icon: Icon,
  title,
  metric,
  updatedAt,
  action,
  onAction,
}: {
  icon: ElementType;
  title: string;
  metric: string;
  updatedAt: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <Badge variant="secondary">{metric}</Badge>
        </div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{updatedAt}</p>
        </div>
        <Button className="w-full justify-between" variant="outline" onClick={onAction}>
          {action}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const toneClass = {
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-700",
  }[item.tone];

  return (
    <div className="flex gap-3 rounded-lg border p-3">
      <div className={`mt-0.5 rounded-full p-1.5 ${toneClass}`}>
        <item.icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">{item.title}</p>
          <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
        </div>
        <p className="text-sm text-muted-foreground">{item.description}</p>
      </div>
    </div>
  );
}

export default function MePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const userId = session?.user?.id;
  const now = new Date();

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
      return res.json() as Promise<{
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
          total_advances: number;
        };
      }>;
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
        balance: {
          allowed_days: number;
          used_days: number;
          carryover_days?: number | null;
        } | null;
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
  } = useForm<AdvanceForm>({
    resolver: zodResolver(advanceSchema),
  });
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
        body: JSON.stringify({
          amount: Math.round(data.amount),
          description: data.description,
        }),
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
      toast({
        title: "Ombi limetumwa",
        description: "Ombi lako la mkopo limetumwa kwa HR.",
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Hitilafu",
        description: e.message || "Imeshindikana kutuma ombi",
        variant: "destructive",
      });
    },
  });

  const markAnnouncementRead = useMutation({
    mutationFn: async (announcementId: string) => {
      const res = await fetch(`/api/announcements/${announcementId}/read`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me-inbox"] });
    },
  });

  const accountMutation = useMutation({
    mutationFn: async (data: {
      email: string;
      phone: string;
      emergency_contact_name: string;
      emergency_contact_phone: string;
      current_password: string;
      new_password: string;
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
  const announcements = inbox?.announcements ?? [];
  const complaintResponses =
    inbox?.complaints.filter((c) => ["closed", "resolved"].includes(c.status) && c.response) ?? [];
  const unreadCount = announcements.length + complaintResponses.length;
  const presentToday = (summaryData?.attendance.present ?? 0) > 0;
  const leaveRemaining = leaveData?.balance
    ? leaveData.balance.allowed_days +
      (leaveData.balance.carryover_days ?? 0) -
      leaveData.balance.used_days
    : null;
  const latestPayslip = myPayslips?.[0];
  const latestLeave = leaveData?.requests?.[0];
  const latestTransaction = txData?.transactions?.[0];
  const latestAdvanceRequest = advanceRequests?.[0];
  const monthlyCash = summaryData?.financial.net_amount ?? latestPayslip?.net_amount ?? 0;
  const overtimeCash = summaryData?.financial.total_overtime ?? 0;
  const activeAdvanceSchedules =
    advanceSchedules?.filter((schedule) => schedule.status === "active") ?? [];
  const advanceRemaining = activeAdvanceSchedules.reduce(
    (sum, schedule) => sum + schedule.remaining_debt,
    0
  );

  const recentActivities: ActivityItem[] = [
    ...(latestLeave
      ? [
          {
            id: `leave-${latestLeave.id}`,
            title:
              latestLeave.status === "approved"
                ? "Likizo imeidhinishwa"
                : latestLeave.status === "denied"
                ? "Likizo imekataliwa"
                : latestLeave.status === "pending_hr"
                ? "Likizo inasubiri HR"
                : "Ombi la likizo linashughulikiwa",
            description: `${latestLeave.days} siku`,
            date: latestLeave.reviewed_at ?? latestLeave.submitted_at,
            icon: Palmtree,
            tone:
              latestLeave.status === "approved"
                ? "green"
                : latestLeave.status === "denied"
                ? "red"
                : "amber",
          } satisfies ActivityItem,
        ]
      : []),
    ...(latestPayslip
      ? [
          {
            id: `payslip-${latestPayslip.id}`,
            title: "Payslip mpya ipo tayari",
            description: `Net ${formatCurrency(latestPayslip.net_amount)}`,
            date: latestPayslip.generated_at,
            icon: Receipt,
            tone: "green",
          } satisfies ActivityItem,
        ]
      : []),
    ...(announcements[0]
      ? [
          {
            id: `announcement-${announcements[0].id}`,
            title: "Tangazo jipya",
            description: announcements[0].subject,
            date: announcements[0].created_at,
            icon: Megaphone,
            tone: "blue",
          } satisfies ActivityItem,
        ]
      : []),
    ...(latestTransaction
      ? [
          {
            id: `tx-${latestTransaction.id}`,
            title: latestTransaction.type.replace(/_/g, " "),
            description: formatCurrency(latestTransaction.amount),
            date: latestTransaction.created_at,
            icon: DollarSign,
            tone: latestTransaction.amount >= 0 ? "green" : "red",
          } satisfies ActivityItem,
        ]
      : []),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const scrollToSection = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <UserCircle className="h-7 w-7 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold sm:text-2xl">
                Habari, {session?.user?.name}
              </h1>
              <p className="truncate text-sm text-muted-foreground capitalize">
                {role} · {session?.user?.email}
              </p>
            </div>
          </div>
          <Button onClick={() => scrollToSection(presentToday ? "leave" : "attendance")}>
            {presentToday ? "Omba Likizo" : "Omba Marekebisho"}
          </Button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <Badge variant={presentToday ? "success" : "warning"} className="whitespace-nowrap">
            Leo: {presentToday ? "Umehudhuria" : "Haijathibitishwa"}
          </Badge>
          <Badge variant={unreadCount > 0 ? "destructive" : "secondary"} className="whitespace-nowrap">
            Ujumbe: {unreadCount}
          </Badge>
          <Badge variant="secondary" className="whitespace-nowrap">
            Likizo: {leaveRemaining ?? "-"} siku
          </Badge>
          <Badge variant="info" className="whitespace-nowrap">
            Net: {summaryData ? formatCurrency(monthlyCash) : "-"}
          </Badge>
          <Badge variant={overtimeCash > 0 ? "success" : "secondary"} className="whitespace-nowrap">
            Overtime: {summaryData ? formatCurrency(overtimeCash) : "-"}
          </Badge>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <ActionCard
          icon={CalendarIcon}
          title="Mahudhurio Yangu"
          metric={`${summaryData?.attendance.effective_days ?? 0} siku`}
          updatedAt="Mwezi huu"
          action="Fungua"
          onAction={() => scrollToSection("attendance")}
        />
        <ActionCard
          icon={Receipt}
          title="Malipo ya Mwezi"
          metric={formatCurrency(monthlyCash)}
          updatedAt={`Overtime ${formatCurrency(overtimeCash)}`}
          action="Payslips"
          onAction={() => scrollToSection("payslips")}
        />
        <ActionCard
          icon={Palmtree}
          title="Likizo na Maombi"
          metric={leaveRemaining !== null ? `${leaveRemaining} siku` : "-"}
          updatedAt={latestLeave ? formatDate(latestLeave.submitted_at) : "Hakuna ombi"}
          action="Omba likizo"
          onAction={() => (window.location.href = "/leave")}
        />
        <ActionCard
          icon={Inbox}
          title="Ujumbe"
          metric={`${unreadCount} mpya`}
          updatedAt={unreadCount > 0 ? "Unahitaji kusoma" : "Hakuna mpya"}
          action={unreadCount > 0 ? "Soma" : "Fungua"}
          onAction={() => scrollToSection("messages")}
        />
        <ActionCard
          icon={DollarSign}
          title="Salary Advance"
          metric={advanceRemaining > 0 ? formatCurrency(advanceRemaining) : `${advanceRequests?.length ?? 0} maombi`}
          updatedAt={latestAdvanceRequest ? formatDate(latestAdvanceRequest.requested_at) : "Hakuna ombi"}
          action="Angalia"
          onAction={() => scrollToSection("salary-advance")}
        />
        <ActionCard
          icon={Settings}
          title="Akaunti"
          metric="Binafsi"
          updatedAt={accountData?.employee?.phone ?? accountData?.user?.phone ?? "Weka taarifa"}
          action="Hariri"
          onAction={() => {
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
        />
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kilichotokea Karibuni</CardTitle>
            <CardDescription>
              Muhtasari wa mabadiliko muhimu kwenye akaunti yako
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Hakuna taarifa mpya kwa sasa.
              </p>
            ) : (
              <div className="space-y-2">
                {recentActivities.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section id="financial" className="scroll-mt-28 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Fedha Zangu</h2>
          <p className="text-sm text-muted-foreground">
            Muhtasari wa mapato, overtime cash, makato, na salary advance
          </p>
        </div>
        {selfEmployee ? (
          <FinancialCard
            employeeId={selfEmployee.id}
            onRequestAdvance={() => scrollToSection("salary-advance")}
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
      </section>

      <section id="salary-advance" className="scroll-mt-28">
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
                  <div key={request.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{formatCurrency(request.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(request.requested_at)}
                        {request.description ? ` · ${request.description}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={
                        request.status === "approved"
                          ? "success"
                          : request.status === "denied"
                          ? "destructive"
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

      <section id="attendance" className="scroll-mt-28">
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

      <section id="payslips" className="scroll-mt-28">
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
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
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

      <section id="leave" className="scroll-mt-28">
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
                    latestLeave.status === "approved"
                      ? "success"
                      : latestLeave.status === "denied"
                      ? "destructive"
                      : latestLeave.status === "pending_hr"
                      ? "info"
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

      <section id="history" className="scroll-mt-28">
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
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
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
                      <p className="text-sm font-medium capitalize">
                        {tx.type.replace(/_/g, " ")}
                      </p>
                      {tx.description && (
                        <p className="text-xs text-muted-foreground">{tx.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                    </div>
                    <Badge variant={tx.amount >= 0 ? "success" : "destructive"}>
                      {tx.amount >= 0 ? "+" : ""}
                      {formatCurrency(tx.amount)}
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

      <section id="messages" className="scroll-mt-28 space-y-4">
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
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Inatuma...
                  </>
                ) : (
                  "Tuma Ombi"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Inahifadhi...
                  </>
                ) : (
                  "Hifadhi"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
