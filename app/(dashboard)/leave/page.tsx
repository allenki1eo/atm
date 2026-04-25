"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CalendarDays, Plus, CheckCircle2, XCircle, Clock, Loader2,
  Printer, FileText, Scissors, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  start_date: string;
  end_date: string;
  days: number;
  leave_type: string | null;
  employee_phone: string | null;
  reason: string | null;
  status: "pending" | "approved" | "denied";
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

interface LeaveBalance {
  employee_id: string;
  year: number;
  allowed_days: number;
  used_days: number;
}

interface LeaveData {
  requests: LeaveRequest[];
  balance: LeaveBalance | null;
}

interface BalanceRow {
  id: string;
  name: string;
  department: string | null;
  type: string;
  allowed_days: number;
  used_days: number;
  carryover_days: number;
}

const LEAVE_TYPES = [
  { value: "annual",           label: "Likizo ya Mwaka" },
  { value: "sick",             label: "Likizo ya Ugonjwa" },
  { value: "maternity",        label: "Likizo ya Uzazi" },
  { value: "wedding",          label: "Ruhusa ya Harusi" },
  { value: "unpaid",           label: "Likizo bila Malipo" },
  { value: "emergency",        label: "Dharura au Ruhusa Ingine" },
  { value: "manual_deduction", label: "Marekebisho ya Mkono" },
] as const;

const leaveRequestSchema = z.object({
  employee_id: z.string().min(1),
  start_date:  z.string().min(1, "Tarehe ya kuanza inahitajika"),
  end_date:    z.string().min(1, "Tarehe ya kuisha inahitajika"),
  leave_type:  z.string().min(1, "Chagua aina ya likizo"),
  employee_phone: z.string().optional(),
  reason:      z.string().optional(),
});
type LeaveRequestForm = z.infer<typeof leaveRequestSchema>;

const reviewSchema = z.object({
  review_note: z.string().optional(),
  _action: z.enum(["approved", "denied"]).optional(),
}).superRefine((val, ctx) => {
  if (val._action === "denied" && !val.review_note?.trim()) {
    ctx.addIssue({ code: "custom", path: ["review_note"], message: "Sababu ya kukataa inahitajika" });
  }
});
type ReviewForm = z.infer<typeof reviewSchema>;

const statusConfig = {
  pending:  { label: "Inasubiri",      variant: "warning"     as const, icon: Clock },
  approved: { label: "Imeidhinishwa",  variant: "success"     as const, icon: CheckCircle2 },
  denied:   { label: "Imekataliwa",    variant: "destructive" as const, icon: XCircle },
};

function StatusBadge({ status }: { status: LeaveRequest["status"] }) {
  const cfg = statusConfig[status];
  return (
    <Badge variant={cfg.variant} className="flex items-center gap-1 w-fit">
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function calcDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

export default function LeavePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const role    = (session?.user as { role?: string })?.role ?? "employee";
  const userId  = session?.user?.id;
  const isEmployee  = role === "employee";
  const isHROrAdmin = role === "hr" || role === "admin";
  const canReview   = isHROrAdmin || role === "supervisor";

  const [activeTab, setActiveTab] = useState<"requests" | "balances" | "mine">("requests");
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [reviewDialogOpen,  setReviewDialogOpen]  = useState(false);
  const [reviewTarget,  setReviewTarget]  = useState<LeaveRequest | null>(null);
  const [reviewAction,  setReviewAction]  = useState<"approved" | "denied">("approved");
  const [deductOpen,    setDeductOpen]    = useState(false);
  const [deductTarget,  setDeductTarget]  = useState<BalanceRow | null>(null);
  const [deductDays,    setDeductDays]    = useState("");
  const [deductReason,  setDeductReason]  = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ["leave"],
    queryFn: async () => {
      const res = await fetch("/api/leave");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<LeaveData>;
    },
    enabled: !!session,
  });

  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: ["leave-balances"],
    queryFn: async () => {
      const res = await fetch("/api/leave/balances");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<BalanceRow[]>;
    },
    enabled: isHROrAdmin,
  });

  const requests = (data?.requests ?? []).filter((r) => r.leave_type !== "manual_deduction");
  const balance  = data?.balance;

  // ── Forms ──────────────────────────────────────────────────────────────────

  const {
    register, handleSubmit, watch, reset, setValue,
    formState: { errors },
  } = useForm<LeaveRequestForm>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: { employee_id: userId ?? "", leave_type: "" },
  });

  const watchedStart   = watch("start_date");
  const watchedEnd     = watch("end_date");
  const daysRequested  = calcDays(watchedStart ?? "", watchedEnd ?? "");
  const remaining      = balance ? balance.allowed_days - balance.used_days : 28;

  const {
    register: registerReview, handleSubmit: handleReviewSubmit,
    reset: resetReview, formState: { errors: reviewErrors },
  } = useForm<ReviewForm>({ resolver: zodResolver(reviewSchema) });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const requestMutation = useMutation({
    mutationFn: async (data: LeaveRequestForm) => {
      const res = await fetch("/api/leave", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      setRequestDialogOpen(false);
      reset();
      toast({ title: "Ombi la likizo limetumwa" });
    },
    onError: (err: Error) => toast({ title: "Hitilafu", description: err.message, variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, review_note }: { id: string; status: "approved" | "denied"; review_note?: string }) => {
      const res = await fetch(`/api/leave/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, review_note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      setReviewDialogOpen(false);
      setReviewTarget(null);
      resetReview();
      toast({ title: vars.status === "approved" ? "Ombi limeidhinishwa" : "Ombi limekataliwa" });
    },
    onError: (err: Error) => toast({ title: "Hitilafu", description: err.message, variant: "destructive" }),
  });

  const deductMutation = useMutation({
    mutationFn: async () => {
      const days = parseInt(deductDays);
      if (!deductTarget || !days || days <= 0) throw new Error("Jaza sehemu zote");
      const res = await fetch("/api/leave/balances", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: deductTarget.id, days, reason: deductReason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Hitilafu");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      setDeductOpen(false);
      setDeductTarget(null);
      setDeductDays("");
      setDeductReason("");
      toast({ title: "Siku zimekatwa kutoka bakaa" });
    },
    onError: (err: Error) => toast({ title: "Hitilafu", description: err.message, variant: "destructive" }),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const openReview = (req: LeaveRequest, action: "approved" | "denied") => {
    setReviewTarget(req); setReviewAction(action);
    resetReview({ review_note: "", _action: action });
    setReviewDialogOpen(true);
  };

  const openRequest = () => {
    reset({ employee_id: userId ?? "", start_date: "", end_date: "", leave_type: "", employee_phone: "", reason: "" });
    setRequestDialogOpen(true);
  };

  const leaveTypeLabel = (val: string | null) =>
    LEAVE_TYPES.find((t) => t.value === val)?.label ?? val ?? "—";

  const openDeduct = (row: BalanceRow) => {
    setDeductTarget(row);
    setDeductDays("");
    setDeductReason("");
    setDeductOpen(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderRequestsTable = (rows: LeaveRequest[], showEmployee = false) => (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {showEmployee && <TableHead>Mfanyakazi</TableHead>}
              <TableHead>Aina</TableHead>
              <TableHead>Tarehe</TableHead>
              <TableHead>Siku</TableHead>
              <TableHead>Hali</TableHead>
              {canReview && <TableHead className="w-32" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Inapakia...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Hakuna maombi</TableCell></TableRow>
            ) : rows.map((req) => (
              <TableRow key={req.id}>
                {showEmployee && <TableCell className="font-medium">{req.employee_name}</TableCell>}
                <TableCell className="text-sm text-muted-foreground">{leaveTypeLabel(req.leave_type)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(req.start_date)} — {formatDate(req.end_date)}
                </TableCell>
                <TableCell><Badge variant="secondary">{req.days} siku</Badge></TableCell>
                <TableCell><StatusBadge status={req.status} /></TableCell>
                {canReview && (
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {req.status === "pending" && (
                        <>
                          <Button size="sm" variant="ghost"
                            className="h-7 text-xs text-green-700 hover:text-green-700 hover:bg-green-50"
                            onClick={() => openReview(req, "approved")}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />Idhinisha
                          </Button>
                          <Button size="sm" variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={() => openReview(req, "denied")}>
                            <XCircle className="h-3 w-3 mr-1" />Kataa
                          </Button>
                        </>
                      )}
                      {req.status === "approved" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => window.open(`/leave/print/${req.id}`, "_blank")}>
                          <Printer className="h-3 w-3 mr-1" />Chapisha
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );

  const renderBalancesTable = () => {
    const rows = balances ?? [];
    return (
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mfanyakazi</TableHead>
                <TableHead className="hidden sm:table-cell">Idara</TableHead>
                <TableHead className="text-center">Ziliruhusiwa</TableHead>
                <TableHead className="text-center">Zilizotumika</TableHead>
                <TableHead className="text-center">Zilizobaki</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {balancesLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Inapakia...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Hakuna wafanyakazi</TableCell></TableRow>
              ) : rows.map((row) => {
                const rem = row.allowed_days + row.carryover_days - row.used_days;
                const remColor = rem <= 0 ? "text-red-600" : rem <= 7 ? "text-amber-600" : "text-green-700";
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {row.department ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{row.allowed_days + row.carryover_days}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={row.used_days > 0 ? "warning" : "secondary"}>{row.used_days}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold text-base ${remColor}`}>{rem}</span>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost"
                        className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => openDeduct(row)}>
                        <Scissors className="h-3 w-3 mr-1" />Kata Siku
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    );
  };

  // ── Employee view ──────────────────────────────────────────────────────────

  if (isEmployee) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-bold">Likizo Yangu</h1>
            </div>
            <p className="text-muted-foreground mt-1">Omba na fuatilia likizo yako</p>
          </div>
          <Button onClick={openRequest} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />Omba Likizo
          </Button>
        </div>

        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />Siku za Likizo Zilizobaki
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold text-blue-700">
                {balance ? balance.allowed_days - balance.used_days : 28}
              </span>
              <span className="text-xl text-muted-foreground mb-1">/ {balance?.allowed_days ?? 28}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Siku {balance?.used_days ?? 0} zimetumika mwaka huu
            </p>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4" />Maombi Yangu
          </h2>
          {renderRequestsTable(requests, false)}
        </div>

        {renderRequestDialog()}
      </div>
    );
  }

  // ── HR / Admin / Supervisor view ───────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Usimamizi wa Likizo</h1>
          </div>
          <p className="text-muted-foreground mt-1">Kagua maombi na bakaa za likizo za wafanyakazi</p>
        </div>
        <Button onClick={openRequest} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />Omba Likizo Yangu
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3">
            <p className="text-xl font-bold text-amber-600">{requests.filter((r) => r.status === "pending").length}</p>
            <p className="text-xs text-muted-foreground">Inasubiri</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xl font-bold text-green-600">{requests.filter((r) => r.status === "approved").length}</p>
            <p className="text-xs text-muted-foreground">Imeidhinishwa</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xl font-bold text-red-600">{requests.filter((r) => r.status === "denied").length}</p>
            <p className="text-xs text-muted-foreground">Imekataliwa</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["requests", "balances", "mine"] as const).map((tab) => (
          <button key={tab}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab(tab)}>
            {tab === "requests" ? "Maombi" : tab === "balances" ? "Bakaa za Siku" : "Likizo Zangu"}
          </button>
        ))}
      </div>

      {activeTab === "requests" && renderRequestsTable(requests, true)}
      {activeTab === "balances" && renderBalancesTable()}
      {activeTab === "mine" && renderRequestsTable(
        requests.filter((r) => r.reviewed_by === userId || r.employee_id === userId), false
      )}

      {renderRequestDialog()}

      {/* Review dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={(o) => { setReviewDialogOpen(o); if (!o) { setReviewTarget(null); resetReview(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reviewAction === "approved"
                ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                : <XCircle className="h-5 w-5 text-destructive" />}
              {reviewAction === "approved" ? "Idhinisha Ombi" : "Kataa Ombi"}
            </DialogTitle>
            <DialogDescription>
              Ombi la {reviewTarget?.employee_name} — {reviewTarget?.days} siku
              ({reviewTarget && formatDate(reviewTarget.start_date)} — {reviewTarget && formatDate(reviewTarget.end_date)})
            </DialogDescription>
          </DialogHeader>

          {reviewTarget && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mfanyakazi</span>
                <span className="font-medium">{reviewTarget.employee_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Siku</span>
                <span className="font-medium">{reviewTarget.days}</span>
              </div>
              {reviewTarget.reason && (
                <div className="pt-1 border-t">
                  <span className="text-muted-foreground text-xs">Sababu:</span>
                  <p className="text-xs mt-0.5">{reviewTarget.reason}</p>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleReviewSubmit((d) => {
            if (!reviewTarget) return;
            reviewMutation.mutate({ id: reviewTarget.id, status: reviewAction, review_note: d.review_note });
          })} className="space-y-4">
            <input type="hidden" {...registerReview("_action")} value={reviewAction} />
            <div className="space-y-2">
              <Label>
                {reviewAction === "denied"
                  ? <><span>Sababu ya Kukataa</span> <span className="text-destructive">*</span></>
                  : "Maelezo (hiari)"}
              </Label>
              <Textarea
                placeholder={reviewAction === "denied" ? "Eleza sababu ya kukataa..." : "Ongeza maelezo..."}
                {...registerReview("review_note")} rows={3}
              />
              {reviewErrors.review_note && <p className="text-xs text-destructive">{reviewErrors.review_note.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReviewDialogOpen(false)}>Ghairi</Button>
              <Button type="submit" disabled={reviewMutation.isPending}
                variant={reviewAction === "denied" ? "destructive" : "default"}
                className={reviewAction === "approved" ? "bg-green-600 hover:bg-green-700" : ""}>
                {reviewMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inashughulikia...</>
                  : reviewAction === "approved" ? "Idhinisha" : "Kataa"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manual deduction dialog */}
      <Dialog open={deductOpen} onOpenChange={(o) => { setDeductOpen(o); if (!o) setDeductTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-red-500" />
              Kata Siku za Likizo
            </DialogTitle>
            <DialogDescription>
              Ongeza makato ya mkono kwa siku ambazo hazikurekodiwa kwenye mfumo (likizo za karatasi).
            </DialogDescription>
          </DialogHeader>

          {deductTarget && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mfanyakazi</span>
                  <span className="font-semibold">{deductTarget.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Siku Zilizobaki</span>
                  <span className={`font-semibold ${
                    (deductTarget.allowed_days + deductTarget.carryover_days - deductTarget.used_days) <= 0
                      ? "text-red-600" : "text-green-700"
                  }`}>
                    {deductTarget.allowed_days + deductTarget.carryover_days - deductTarget.used_days}
                  </span>
                </div>
              </div>

              {(deductTarget.allowed_days + deductTarget.carryover_days - deductTarget.used_days) <= 0 && (
                <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Mfanyakazi huyu hana siku za likizo zilizobaki. Makato yataweka bakaa kwenye hasi.</span>
                </div>
              )}

              <div className="space-y-1">
                <Label>Idadi ya Siku za Kukata <span className="text-destructive">*</span></Label>
                <Input type="number" min="1" step="1" placeholder="e.g. 5"
                  value={deductDays} onChange={(e) => setDeductDays(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>Sababu <span className="text-destructive">*</span></Label>
                <Textarea placeholder="e.g. Likizo ya mwaka 2024 iliyochukuliwa kabla ya mfumo..."
                  value={deductReason} onChange={(e) => setDeductReason(e.target.value)} rows={2} />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeductOpen(false)}>Ghairi</Button>
            <Button variant="destructive"
              disabled={deductMutation.isPending || !deductDays || parseInt(deductDays) <= 0 || !deductReason.trim()}
              onClick={() => deductMutation.mutate()}>
              {deductMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inashughulikia...</>
                : <><Scissors className="h-4 w-4 mr-2" />Kata Siku</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  function renderRequestDialog() {
    return (
      <Dialog open={requestDialogOpen} onOpenChange={(o) => { setRequestDialogOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />Omba Likizo
            </DialogTitle>
            <DialogDescription>Jaza taarifa za ombi lako la likizo</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit((d) => requestMutation.mutate({ ...d, employee_id: userId ?? "" }))} className="space-y-4">
            <div className="space-y-2">
              <Label>Aina ya Likizo <span className="text-destructive">*</span></Label>
              <div className="grid grid-cols-1 gap-1.5">
                {LEAVE_TYPES.filter((t) => t.value !== "manual_deduction").map((lt) => (
                  <label key={lt.value}
                    className="flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 text-sm hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <input type="radio" value={lt.value} {...register("leave_type")} className="accent-primary" />
                    {lt.label}
                  </label>
                ))}
              </div>
              {errors.leave_type && <p className="text-xs text-destructive">{errors.leave_type.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Nambari ya Simu</Label>
              <Input placeholder="+255712345678" {...register("employee_phone")} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tarehe ya Kuanza</Label>
                <Input type="date" {...register("start_date")} />
                {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Tarehe ya Kuisha</Label>
                <Input type="date" {...register("end_date")} />
                {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
              </div>
            </div>

            {daysRequested > 0 && (
              <div className="rounded-lg border bg-blue-50/50 p-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Siku zitakazochukuliwa:</span>
                  <Badge variant="info">{daysRequested} siku</Badge>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-muted-foreground">Bakaa iliyobaki:</span>
                  <Badge variant={daysRequested > remaining ? "destructive" : "success"}>
                    {remaining - daysRequested} / {balance?.allowed_days ?? 28}
                  </Badge>
                </div>
                {daysRequested > remaining && (
                  <p className="text-xs text-destructive mt-1">
                    Siku zilizoomba zinazidi bakaa yako ({remaining} siku zilizobaki)
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Maelezo (hiari)</Label>
              <Textarea placeholder="Eleza sababu ya likizo yako..." {...register("reason")} rows={2} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRequestDialogOpen(false)}>Ghairi</Button>
              <Button type="submit" disabled={requestMutation.isPending || daysRequested > remaining}>
                {requestMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inatuma...</>
                  : "Tuma Ombi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }
}
