"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserCircle, DollarSign, Calendar as CalendarIcon, Loader2, FileText, Inbox, Megaphone, MessageSquareWarning, Receipt } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function MePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [advanceOpen, setAdvanceOpen] = useState(false);

  const userId = session?.user?.id;

  // Fetch employee profile (if user is also an employee)
  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!userId,
  });

  // Fetch transactions
  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ["transactions", userId],
    queryFn: async () => {
      const res = await fetch(`/api/transactions/advance?employee_id=${userId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
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
        title: "Error",
        description: e.message || "Failed to submit request",
        variant: "destructive",
      });
    },
  });

  // My payslips
  const { data: myPayslips, isLoading: payslipsLoading } = useQuery({
    queryKey: ["my-payslips"],
    queryFn: async () => {
      const res = await fetch("/api/payslips/mine");
      if (!res.ok) return [];
      return (await res.json()) as {
        id: string;
        month: number;
        year: number;
        start_date: string;
        end_date: string;
        days_worked: number;
        gross_amount: number;
        net_amount: number;
        total_deductions: number;
        generated_at: string;
      }[];
    },
    enabled: !!userId,
  });

  // Inbox: announcements + complaint responses
  const { data: inbox } = useQuery({
    queryKey: ["me-inbox"],
    queryFn: async () => {
      const [annRes, compRes] = await Promise.all([
        fetch("/api/announcements?unread=1"),
        fetch("/api/complaints?mine=1"),
      ]);
      const announcements = annRes.ok ? await annRes.json() : [];
      const complaints = compRes.ok ? await compRes.json() : [];
      return { announcements, complaints };
    },
    enabled: !!userId,
  });

  const unreadCount =
    (inbox?.announcements?.length ?? 0) +
    (Array.isArray(inbox?.complaints)
      ? inbox.complaints.filter(
          (c: { status: string; response: string | null }) =>
            c.status === "resolved" && c.response
        ).length
      : 0);

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

  const role = (session?.user as { role?: string })?.role;

  // Find this user as an employee (for self-service view)
  const selfEmployee = Array.isArray(employees)
    ? employees.find((e: { id: string }) => e.id === userId) ?? employees[0]
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <UserCircle className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{session?.user?.name}</h1>
          <p className="text-muted-foreground capitalize">{role} · {session?.user?.email}</p>
        </div>
      </div>

      <Tabs defaultValue={unreadCount > 0 ? "inbox" : "financial"}>
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payslips">Mishahara</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="inbox" className="relative">
            <Inbox className="h-3.5 w-3.5 mr-1" />
            Sanduku
            {unreadCount > 0 && (
              <Badge className="ml-1.5 h-5 px-1.5 text-xs" variant="destructive">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Financial Tab */}
        <TabsContent value="financial" className="mt-4 space-y-4">
          {selfEmployee ? (
            <FinancialCard
              employeeId={selfEmployee.id}
              onRequestAdvance={() => setAdvanceOpen(true)}
            />
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>No employee record linked to your account.</p>
                <p className="text-xs mt-1">Contact HR to link your employee profile.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="mt-4">
          {selfEmployee ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Monthly Attendance
                </CardTitle>
                <CardDescription>Your attendance record for the current month</CardDescription>
              </CardHeader>
              <CardContent>
                <AttendanceCalendar employeeId={selfEmployee.id} allowCorrection />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No attendance records found.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Payslips Tab */}
        <TabsContent value="payslips" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Mishahara Yangu
              </CardTitle>
              <CardDescription>
                Vielelezo vya mshahara vya vipindi vilivyofungwa. Pakua kama PDF.
              </CardDescription>
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
                  Hakuna mshahara uliofungwa bado.
                </p>
              ) : (
                <div className="space-y-2">
                  {myPayslips.map((ps) => {
                    const monthNames = [
                      "Januari", "Februari", "Machi", "Aprili", "Mei", "Juni",
                      "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba",
                    ];
                    return (
                      <div
                        key={ps.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            {monthNames[ps.month - 1]} {ps.year}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {ps.days_worked} siku · Gross {formatCurrency(ps.gross_amount)} · Makato {formatCurrency(ps.total_deductions ?? 0)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Imehifadhiwa: {formatDate(ps.generated_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="success" className="text-xs whitespace-nowrap">
                            Net {formatCurrency(ps.net_amount)}
                          </Badge>
                          <PayslipPdfButton payslipId={ps.id} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transaction History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Transaction History
              </CardTitle>
              <CardDescription>Advances and payments</CardDescription>
            </CardHeader>
            <CardContent>
              {txLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !txData?.transactions?.length ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No transactions found
                </p>
              ) : (
                <div className="space-y-2">
                  {txData.transactions.map((tx: {
                    id: string;
                    type: string;
                    amount: number;
                    description: string;
                    created_at: string;
                  }) => (
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
                        {tx.amount >= 0 ? "+" : ""}{formatCurrency(tx.amount)}
                      </Badge>
                    </div>
                  ))}
                  <div className="border-t pt-3 flex justify-between font-semibold text-sm">
                    <span>Net Balance</span>
                    <span className={txData.balance >= 0 ? "text-green-700" : "text-red-700"}>
                      {formatCurrency(txData.balance)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inbox Tab */}
        <TabsContent value="inbox" className="mt-4 space-y-4">
          {/* Announcements */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                Matangazo Mapya
              </CardTitle>
              <CardDescription>Ujumbe kutoka kwa HR/Admin ambao haujasomwa</CardDescription>
            </CardHeader>
            <CardContent>
              {!inbox?.announcements?.length ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Hakuna matangazo mapya.
                </p>
              ) : (
                <div className="space-y-3">
                  {inbox.announcements.map(
                    (a: {
                      id: string;
                      subject: string;
                      message: string;
                      created_at: string;
                    }) => (
                      <div
                        key={a.id}
                        className="rounded-lg border p-3 hover:bg-muted/30 transition cursor-pointer"
                        onClick={() => markAnnouncementRead.mutate(a.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold">{a.subject}</p>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(a.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                          {a.message}
                        </p>
                        <p className="text-xs text-primary mt-2">
                          Gonga ili kuweka alama ya kusomwa
                        </p>
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Complaint responses */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4" />
                Majibu ya Malalamiko
              </CardTitle>
              <CardDescription>Majibu kutoka kwa HR juu ya malalamiko yako</CardDescription>
            </CardHeader>
            <CardContent>
              {!Array.isArray(inbox?.complaints) || inbox.complaints.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Hakuna malalamiko yaliyojibiwa.
                </p>
              ) : (
                <div className="space-y-3">
                  {inbox.complaints
                    .filter(
                      (c: { status: string; response: string | null }) =>
                        c.status === "resolved" && c.response
                    )
                    .map(
                      (c: {
                        id: string;
                        subject: string;
                        response: string;
                        responded_at: string;
                      }) => (
                        <div key={c.id} className="rounded-lg border p-3">
                          <p className="text-sm font-semibold">{c.subject}</p>
                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                            {c.response}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {formatDate(c.responded_at)}
                          </p>
                        </div>
                      )
                    )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Request Advance Dialog */}
      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Omba Mkopo</DialogTitle>
            <DialogDescription>
              Tuma ombi la mkopo kwa HR. Mikopo iliyoidhinishwa itakatwa kwenye mshahara wako.
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
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
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
    </div>
  );
}
