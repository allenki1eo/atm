"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, DollarSign, Lock, LockOpen, Eye, FileText, CheckCircle, Clock, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

function formatCurrency(n: number) {
  return "TZS " + Math.round(n).toLocaleString();
}

interface PayrollPeriod {
  id: string;
  month: number;
  year: number;
  start_date: string;
  end_date: string;
  status: "open" | "locked" | "paid";
  locked_at: string | null;
  locked_by: string | null;
  company_id: string | null;
  company_name: string | null;
}

interface Company {
  id: string;
  name: string;
}

interface PreviewRow {
  employee_id: string;
  employee_name: string;
  employee_type: string;
  days_worked: number;
  gross_amount: number;
  nssf_amount: number;
  cotwu_amount: number;
  fadhila_amount: number;
  heslb_amount: number;
  wcf_amount: number;
  total_advances: number;
  total_deductions: number;
  net_amount: number;
}

interface Payslip {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_type: string;
  employee_department: string | null;
  days_worked: number;
  gross_amount: number;
  total_deductions: number;
  net_amount: number;
}

interface PayrollWarning {
  id: string;
  type: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  employee_name?: string | null;
  date?: string | null;
}

interface PayrollWarningsResponse {
  summary: { total: number; high: number; medium: number; low: number };
  warnings: PayrollWarning[];
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const statusConfig = {
  open:   { label: "Open",   variant: "info"    as const, icon: Clock },
  locked: { label: "Locked", variant: "warning" as const, icon: Lock },
  paid:   { label: "Paid",   variant: "success" as const, icon: CheckCircle },
};

export default function PayrollPeriodsPage() {
  const queryClient = useQueryClient();
  const now = new Date();

  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<{ month: number; year: number } | null>(null);
  const [sendSms, setSendSms] = useState(true);
  const [lockCompanyId, setLockCompanyId] = useState<string>("__all__");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPeriod, setPreviewPeriod] = useState<{ month: number; year: number; companyId: string | null } | null>(null);

  const [payslipsOpen, setPayslipsOpen] = useState(false);
  const [payslipsPeriod, setPayslipsPeriod] = useState<PayrollPeriod | null>(null);

  const [cleanConfirmOpen, setCleanConfirmOpen] = useState(false);

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: periods, isLoading } = useQuery({
    queryKey: ["payroll", "periods"],
    queryFn: async () => {
      const res = await fetch("/api/payroll/periods");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<PayrollPeriod[]>;
    },
  });

  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Company[]>;
    },
  });

  const { data: previewData, isFetching: previewLoading } = useQuery({
    queryKey: ["payroll", "preview", previewPeriod],
    enabled: !!previewPeriod,
    queryFn: async () => {
      const p = previewPeriod!;
      const params = new URLSearchParams({ month: String(p.month), year: String(p.year) });
      if (p.companyId) params.set("company_id", p.companyId);
      const res = await fetch(`/api/payroll/preview?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ month: number; year: number; employees: PreviewRow[] }>;
    },
  });

  const { data: payslipsData, isFetching: payslipsLoading } = useQuery({
    queryKey: ["payroll", "payslips", payslipsPeriod?.id],
    enabled: !!payslipsPeriod,
    queryFn: async () => {
      const res = await fetch(`/api/payroll/payslips?period_id=${payslipsPeriod!.id}`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Payslip[]>;
    },
  });

  const { data: payrollWarnings, isFetching: warningsLoading } = useQuery({
    queryKey: ["payroll", "warnings", selectedPeriod, lockCompanyId],
    enabled: lockDialogOpen && !!selectedPeriod,
    queryFn: async () => {
      const period = selectedPeriod!;
      const params = new URLSearchParams({
        month: String(period.month),
        year: String(period.year),
      });
      if (lockCompanyId !== "__all__") params.set("company_id", lockCompanyId);
      const res = await fetch(`/api/payroll/warnings?${params.toString()}`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<PayrollWarningsResponse>;
    },
  });

  // ─── Mutations ────────────────────────────────────────────────────────────
  const lockMutation = useMutation({
    mutationFn: async ({ month, year }: { month: number; year: number }) => {
      const res = await fetch("/api/payroll/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month, year, send_sms: sendSms,
          company_id: lockCompanyId === "__all__" ? null : lockCompanyId,
        }),
      });
      if (!res.ok) throw new Error("Failed to lock period");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      setLockDialogOpen(false);
      toast({
        title: "Kipindi kimefungwa",
        description: `Malipo yamezalishwa. SMS ${data.sms_sent} zimetumwa.`,
      });
    },
    onError: () => {
      toast({ title: "Hitilafu", description: "Imeshindwa kufunga kipindi", variant: "destructive" });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: async (periodId: string) => {
      const res = await fetch("/api/payroll/lock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId }),
      });
      if (!res.ok) throw new Error("Failed to unlock");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      toast({ title: "Kipindi kimefunguliwa", description: "Unaweza kurekebisha mahudhurio tena." });
    },
    onError: () => {
      toast({ title: "Hitilafu", description: "Imeshindwa kufungua kipindi", variant: "destructive" });
    },
  });

  const cleanPayslipsMutation = useMutation({
    mutationFn: async (periodId: string) => {
      const res = await fetch(`/api/payroll/payslips?period_id=${periodId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clean payslips");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      setCleanConfirmOpen(false);
      setPayslipsOpen(false);
      toast({
        title: "Payslips zimefutwa",
        description: `Payslips ${data.deleted} zimefutwa. Unaweza kuzalisha upya kwa kufunga kipindi tena.`,
      });
    },
    onError: () => {
      toast({ title: "Hitilafu", description: "Imeshindwa kufuta payslips", variant: "destructive" });
    },
  });

  const openLockDialog = (month: number, year: number) => {
    setSelectedPeriod({ month, year });
    setLockDialogOpen(true);
  };

  const openPreview = (month: number, year: number, companyId: string | null) => {
    setPreviewPeriod({ month, year, companyId });
    setPreviewOpen(true);
  };

  const openPayslips = (period: PayrollPeriod) => {
    setPayslipsPeriod(period);
    setPayslipsOpen(true);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Vipindi vya Mishahara</h1>
          </div>
          <p className="text-muted-foreground mt-1">Angalia, funga, au fungua vipindi vya mishahara</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openPreview(now.getMonth() + 1, now.getFullYear(), null)}>
            <Eye className="h-4 w-4 mr-2" />
            Angalia Mwezi Huu
          </Button>
          <Button onClick={() => openLockDialog(now.getMonth() + 1, now.getFullYear())}>
            <Lock className="h-4 w-4 mr-2" />
            Funga Mwezi Huu
          </Button>
        </div>
      </div>

      {/* Current month quick info */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Mwezi Huu: {MONTHS[now.getMonth()]} {now.getFullYear()}
          </CardTitle>
          <CardDescription>
            {new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("sw-TZ", { month: "long", day: "numeric" })} —{" "}
            {new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString("sw-TZ", { month: "long", day: "numeric", year: "numeric" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => openPreview(now.getMonth() + 1, now.getFullYear(), null)}>
            <Eye className="h-4 w-4 mr-2" />
            Onyesha Malipo ya Sasa
          </Button>
          <Button onClick={() => openLockDialog(now.getMonth() + 1, now.getFullYear())}>
            <Lock className="h-4 w-4 mr-2" />
            Funga &amp; Zalishe Payslips
          </Button>
        </CardContent>
      </Card>

      {/* Periods table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kipindi</TableHead>
                <TableHead>Kampuni</TableHead>
                <TableHead>Tarehe</TableHead>
                <TableHead>Hali</TableHead>
                <TableHead className="hidden md:table-cell">Imefungwa</TableHead>
                <TableHead>Vitendo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Inapakia...
                  </TableCell>
                </TableRow>
              ) : !periods?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Hakuna vipindi bado. Funga mwezi wa sasa kuunda kimoja.
                  </TableCell>
                </TableRow>
              ) : (
                periods.map((period) => {
                  const cfg = statusConfig[period.status];
                  return (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">
                        {MONTHS[period.month - 1]} {period.year}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {period.company_name ?? "Kampuni zote"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(period.start_date)} — {formatDate(period.end_date)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>
                          <cfg.icon className="h-3 w-3 mr-1" />
                          {cfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {period.locked_at ? formatDate(period.locked_at) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {period.status === "open" && (
                            <>
                              <Button size="sm" variant="outline"
                                onClick={() => openPreview(period.month, period.year, period.company_id)}>
                                <Eye className="h-3 w-3 mr-1" />Angalia
                              </Button>
                              <Button size="sm" variant="outline"
                                onClick={() => openLockDialog(period.month, period.year)}>
                                <Lock className="h-3 w-3 mr-1" />Funga
                              </Button>
                            </>
                          )}
                          {period.status === "locked" && (
                            <>
                              <Button size="sm" variant="outline"
                                onClick={() => openPayslips(period)}>
                                <FileText className="h-3 w-3 mr-1" />Payslips
                              </Button>
                              <Button size="sm" variant="outline"
                                onClick={() => unlockMutation.mutate(period.id)}
                                disabled={unlockMutation.isPending}>
                                <LockOpen className="h-3 w-3 mr-1" />Fungua
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Lock confirmation dialog ── */}
      <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-500" />
              Funga Kipindi cha Mishahara
            </DialogTitle>
            <DialogDescription>
              Hii itafunga{" "}
              {selectedPeriod ? `${MONTHS[selectedPeriod.month - 1]} ${selectedPeriod.year}` : "kipindi kilichochaguliwa"}{" "}
              na kuzalisha payslips kwa wafanyakazi wote.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Kampuni</label>
              <Select value={lockCompanyId} onValueChange={setLockCompanyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Kampuni zote (kufunga kwa ujumla)</SelectItem>
                  {companies?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Kufunga kwa kampuni moja kunaacha kampuni nyingine wazi.
              </p>
            </div>

            <div className="rounded-lg border p-3 bg-muted/20 text-sm space-y-1">
              <p className="font-medium">Kinachofanyika ukifunga:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5 text-xs">
                <li>Mahudhurio ya kipindi hiki yanafungwa (hakuna mabadiliko)</li>
                <li>Payslips zinazalishwa na makato yote (NSSF, COTWU, Fadhila, HESLB, WCF)</li>
                <li>Arifa za SMS zinatumwa (kama imewashwa)</li>
              </ul>
            </div>

            <div className="rounded-lg border p-3 text-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Tahadhari kabla ya kufunga
                </div>
                {warningsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : payrollWarnings?.summary.total ? (
                  <div className="flex gap-1">
                    {payrollWarnings.summary.high > 0 && <Badge variant="destructive">{payrollWarnings.summary.high} kubwa</Badge>}
                    {payrollWarnings.summary.medium > 0 && <Badge variant="warning">{payrollWarnings.summary.medium} kati</Badge>}
                    {payrollWarnings.summary.low > 0 && <Badge variant="info">{payrollWarnings.summary.low} ndogo</Badge>}
                  </div>
                ) : (
                  <Badge variant="success">Hakuna</Badge>
                )}
              </div>

              {payrollWarnings?.warnings.length ? (
                <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                  {payrollWarnings.warnings.slice(0, 8).map((warning) => (
                    <div key={warning.id} className="rounded-md bg-muted/30 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-xs">{warning.title}</p>
                        <Badge
                          variant={
                            warning.severity === "high"
                              ? "destructive"
                              : warning.severity === "medium"
                              ? "warning"
                              : "info"
                          }
                        >
                          {warning.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{warning.description}</p>
                    </div>
                  ))}
                  {payrollWarnings.warnings.length > 8 && (
                    <p className="text-xs text-muted-foreground text-center">
                      +{payrollWarnings.warnings.length - 8} tahadhari nyingine
                    </p>
                  )}
                </div>
              ) : !warningsLoading ? (
                <p className="text-xs text-muted-foreground">
                  Hakuna marekebisho yanayosubiri, migongano ya overtime, au setup kubwa iliyogunduliwa.
                </p>
              ) : null}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} className="rounded" />
              <span className="text-sm">Tuma SMS za arifa kwa wafanyakazi</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLockDialogOpen(false)}>Ghairi</Button>
            <Button
              onClick={() => selectedPeriod && lockMutation.mutate(selectedPeriod)}
              disabled={lockMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {lockMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inafanya...</>
                : "Funga & Zalishe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payroll Preview Sheet ── */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Muhtasari wa Mishahara —{" "}
              {previewPeriod ? `${MONTHS[previewPeriod.month - 1]} ${previewPeriod.year}` : ""}
            </SheetTitle>
          </SheetHeader>

          {previewLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !previewData?.employees?.length ? (
            <p className="text-center text-muted-foreground mt-10">Hakuna wafanyakazi waliopo.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {/* Totals summary */}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Wafanyakazi</p>
                    <p className="text-2xl font-bold">{previewData.employees.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Jumla Gross</p>
                    <p className="text-lg font-bold text-blue-600">
                      {formatCurrency(previewData.employees.reduce((s, r) => s + r.gross_amount, 0))}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3">
                    <p className="text-xs text-muted-foreground">Jumla Net</p>
                    <p className="text-lg font-bold text-green-600">
                      {formatCurrency(previewData.employees.reduce((s, r) => s + r.net_amount, 0))}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jina</TableHead>
                      <TableHead>Aina</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">NSSF</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Makato</TableHead>
                      <TableHead className="text-right font-bold">Net Pay</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.employees.map((row) => (
                      <TableRow key={row.employee_id}>
                        <TableCell className="font-medium">{row.employee_name}</TableCell>
                        <TableCell>
                          <Badge variant={row.employee_type === "fulltime" ? "default" : "secondary"} className="text-xs">
                            {row.employee_type === "fulltime" ? "Kudumu" : "Mkataba"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(row.gross_amount)}</TableCell>
                        <TableCell className="text-right hidden lg:table-cell text-sm">
                          {row.nssf_amount > 0 ? formatCurrency(row.nssf_amount) : "—"}
                        </TableCell>
                        <TableCell className="text-right hidden lg:table-cell text-sm text-destructive">
                          {row.total_deductions > 0 ? formatCurrency(row.total_deductions) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-700">
                          {formatCurrency(row.net_amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>Funga</Button>
                {previewPeriod && (
                  <Button
                    onClick={() => {
                      setPreviewOpen(false);
                      setSelectedPeriod({ month: previewPeriod.month, year: previewPeriod.year });
                      setLockCompanyId(previewPeriod.companyId ?? "__all__");
                      setLockDialogOpen(true);
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Funga Sasa
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Payslips List Sheet ── */}
      <Sheet open={payslipsOpen} onOpenChange={setPayslipsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Payslips —{" "}
                {payslipsPeriod
                  ? `${MONTHS[payslipsPeriod.month - 1]} ${payslipsPeriod.year}`
                  : ""}
              </SheetTitle>
              {payslipsData && payslipsData.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => setCleanConfirmOpen(true)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Futa Payslips
                </Button>
              )}
            </div>
          </SheetHeader>

          {payslipsLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !payslipsData?.length ? (
            <p className="text-center text-muted-foreground mt-10">Hakuna payslips zilizozalishwa.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jina</TableHead>
                    <TableHead>Aina</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Makato</TableHead>
                    <TableHead className="text-right font-bold">Net Pay</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payslipsData.map((ps) => (
                    <TableRow key={ps.id}>
                      <TableCell className="font-medium">{ps.employee_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ps.employee_type === "fulltime" ? "Kudumu" : "Mkataba"}
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(ps.gross_amount)}</TableCell>
                      <TableCell className="text-right text-sm text-destructive">
                        {ps.total_deductions > 0 ? formatCurrency(ps.total_deductions) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-700">
                        {formatCurrency(ps.net_amount)}
                      </TableCell>
                      <TableCell>
                        <a href={`/payroll/payslip/${ps.id}`} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost">
                            <ExternalLink className="h-3 w-3 mr-1" />Chapisha
                          </Button>
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Clean Payslips Confirmation Dialog ── */}
      <Dialog open={cleanConfirmOpen} onOpenChange={setCleanConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Futa Payslips
            </DialogTitle>
            <DialogDescription>
              Una uhakika unataka kufuta payslips zote za{" "}
              {payslipsPeriod
                ? `${MONTHS[payslipsPeriod.month - 1]} ${payslipsPeriod.year}`
                : "kipindi hiki"}
              ? Kipindi kitarudi hali ya wazi ili uweze kuzalisha upya.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanConfirmOpen(false)}>
              Ghairi
            </Button>
            <Button
              variant="destructive"
              onClick={() => payslipsPeriod && cleanPayslipsMutation.mutate(payslipsPeriod.id)}
              disabled={cleanPayslipsMutation.isPending}
            >
              {cleanPayslipsMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inafuta...</>
                : "Futa Payslips"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
