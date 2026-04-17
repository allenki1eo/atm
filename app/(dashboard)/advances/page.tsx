"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DollarSign, Plus, Search, TrendingDown, TrendingUp, Loader2, History, CalendarClock, AlertTriangle, CheckCircle2, Inbox, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Employee { id: string; name: string; phone: string; type: string; department: string }
interface Transaction {
  id: string;
  employee_id: string;
  employee_name: string;
  type: "advance_given" | "advance_deducted" | "salary_paid";
  amount: number;
  description: string;
  created_at: string;
}
interface AdvanceSchedule {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_phone: string;
  total_debt: number;
  monthly_deduction: number;
  remaining_debt: number;
  notes: string | null;
  status: "active" | "cleared";
  created_at: string;
}

interface AdvanceRequestRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_phone: string;
  amount: number;
  description: string | null;
  status: "pending" | "approved" | "denied";
  requested_at: string;
  review_note: string | null;
}

const txSchema = z.object({
  employee_id: z.string().min(1, "Chagua mfanyakazi"),
  type: z.enum(["advance_given", "advance_deducted", "salary_paid"]),
  amount: z.number().min(1, "Kiasi lazima kiwe angalau 1"),
  description: z.string().optional(),
});
type TxForm = z.infer<typeof txSchema>;

const scheduleSchema = z.object({
  employee_id: z.string().min(1, "Chagua mfanyakazi"),
  total_debt: z.number().min(1, "Deni lazima liwe zaidi ya 0"),
  monthly_deduction: z.number().min(1, "Kiasi cha kila mwezi lazima kiwe zaidi ya 0"),
  notes: z.string().optional(),
});
type ScheduleForm = z.infer<typeof scheduleSchema>;

const TX_LABELS: Record<string, string> = {
  advance_given: "Mkopo Uliotolewa",
  advance_deducted: "Mkopo Uliokatwa",
  salary_paid: "Mshahara Ulioplwa",
};

export default function AdvancesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");

  const { data: employees, isLoading: empLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Employee[]>;
    },
  });

  const { data: allTx, isLoading: txLoading } = useQuery({
    queryKey: ["transactions", "all"],
    queryFn: async () => {
      const res = await fetch("/api/transactions/advance");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ transactions: Transaction[]; balance: number }>;
    },
  });

  const { data: empTx } = useQuery({
    queryKey: ["transactions", selectedEmployee],
    queryFn: async () => {
      const res = await fetch(`/api/transactions/advance?employee_id=${selectedEmployee}`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ transactions: Transaction[]; balance: number }>;
    },
    enabled: !!selectedEmployee,
  });

  const { data: schedules, isLoading: schedLoading } = useQuery({
    queryKey: ["advance-schedules"],
    queryFn: async () => {
      const res = await fetch("/api/advances/schedule");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<AdvanceSchedule[]>;
    },
  });

  const { data: advanceRequests } = useQuery({
    queryKey: ["advance-requests", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/advance-requests?status=pending");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<AdvanceRequestRow[]>;
    },
    refetchInterval: 30_000,
  });

  const reviewRequestMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      review_note,
    }: {
      id: string;
      status: "approved" | "denied";
      review_note?: string;
    }) => {
      const res = await fetch(`/api/advance-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, review_note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["advance-requests"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast({
        title: vars.status === "approved" ? "Ombi limeidhinishwa" : "Ombi limekataliwa",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<TxForm>({
    resolver: zodResolver(txSchema),
    defaultValues: { type: "advance_given" },
  });

  const txType = watch("type");

  const {
    register: regSched,
    handleSubmit: handleSchedSubmit,
    setValue: setSchedValue,
    watch: watchSched,
    reset: resetSched,
    formState: { errors: schedErrors },
  } = useForm<ScheduleForm>({ resolver: zodResolver(scheduleSchema) });

  const watchSchedEmployee = watchSched("employee_id");
  const watchTotalDebt = watchSched("total_debt");
  const watchMonthly = watchSched("monthly_deduction");
  const monthsToRepay =
    watchTotalDebt > 0 && watchMonthly > 0
      ? Math.ceil(watchTotalDebt / watchMonthly)
      : 0;

  // Active schedules for the selected employee (for warning)
  const existingActive = (schedules ?? []).filter(
    (s) => s.employee_id === watchSchedEmployee && s.status === "active"
  );
  const existingDebt = existingActive.reduce((s, sc) => s + sc.remaining_debt, 0);

  const scheduleMutation = useMutation({
    mutationFn: async (data: ScheduleForm) => {
      const res = await fetch("/api/advances/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          total_debt: Math.round(data.total_debt),
          monthly_deduction: Math.round(data.monthly_deduction),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["advance-schedules"] });
      setScheduleDialogOpen(false);
      resetSched();
      toast({
        title: data.warning ? "Ratiba Imeundwa (Tahadhari)" : "Ratiba Imeundwa",
        description: data.warning ?? "Ratiba ya mkopo imehifadhiwa.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const clearScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/advances/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "cleared", remaining_debt: 0 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advance-schedules"] });
      toast({ title: "Imefutwa", description: "Deni limewekwa kama limelipwa." });
    },
    onError: (err: Error) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TxForm) => {
      const res = await fetch("/api/transactions/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, amount: Math.round(data.amount) }),
      });
      if (!res.ok) throw new Error("Imeshindwa");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["payroll", "current"] });
      setDialogOpen(false);
      reset();
      toast({ title: "Imehifadhiwa", description: "Muamala umehifadhiwa." });
    },
    onError: () => {
      toast({ title: "Hitilafu", variant: "destructive" });
    },
  });

  // Per-employee balances
  const employeeBalances = (employees ?? []).map((emp) => {
    const txs = (allTx?.transactions ?? []).filter((t) => t.employee_id === emp.id);
    const balance = txs.reduce((s, t) => s + t.amount, 0);
    return { ...emp, balance, txCount: txs.length };
  });

  const filteredBalances = employeeBalances.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase())
  );

  // Summary
  const totalOwedToEmployees = employeeBalances
    .filter((e) => e.balance > 0)
    .reduce((s, e) => s + e.balance, 0);
  const totalOwedByEmployees = employeeBalances
    .filter((e) => e.balance < 0)
    .reduce((s, e) => s + Math.abs(e.balance), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Usimamizi wa Mikopo</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Fuatilia mikopo na malipo ya wafanyakazi
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { resetSched(); setScheduleDialogOpen(true); }}>
            <CalendarClock className="h-4 w-4 mr-2" />
            Ratiba ya Mkopo
          </Button>
          <Button onClick={() => { reset({ type: "advance_given" }); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Muamala Mpya
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Kampuni Inadaiwa
                </p>
                <p className="text-xl font-bold text-green-700">
                  {formatCurrency(totalOwedToEmployees)}
                </p>
                <p className="text-xs text-muted-foreground">Malipo yanayostahili</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-50 p-2">
                <TrendingDown className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Wafanyakazi Inadaiwa
                </p>
                <p className="text-xl font-bold text-red-700">
                  {formatCurrency(totalOwedByEmployees)}
                </p>
                <p className="text-xs text-muted-foreground">Mikopo isiyolipwa</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={(advanceRequests?.length ?? 0) > 0 ? "requests" : "balances"}>
        <TabsList>
          <TabsTrigger value="requests" className="relative">
            <Inbox className="h-3.5 w-3.5 mr-1" />
            Maombi
            {(advanceRequests?.length ?? 0) > 0 && (
              <Badge className="ml-1.5 h-5 px-1.5 text-xs" variant="destructive">
                {advanceRequests!.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="balances">Bakaa za Wafanyakazi</TabsTrigger>
          <TabsTrigger value="schedules">Ratiba za Mikopo</TabsTrigger>
          <TabsTrigger value="history">Historia ya Miamala</TabsTrigger>
        </TabsList>

        {/* Pending advance requests */}
        <TabsContent value="requests" className="mt-4 space-y-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mfanyakazi</TableHead>
                  <TableHead>Kiasi</TableHead>
                  <TableHead>Sababu</TableHead>
                  <TableHead>Tarehe</TableHead>
                  <TableHead>Vitendo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!advanceRequests?.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Hakuna maombi yanayosubiri
                    </TableCell>
                  </TableRow>
                ) : (
                  advanceRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.employee_name}</TableCell>
                      <TableCell className="text-red-700 font-semibold">
                        {formatCurrency(r.amount)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(r.requested_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-green-700 hover:bg-green-50"
                            disabled={reviewRequestMutation.isPending}
                            onClick={() =>
                              reviewRequestMutation.mutate({ id: r.id, status: "approved" })
                            }
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Idhinisha
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-700 hover:bg-red-50"
                            disabled={reviewRequestMutation.isPending}
                            onClick={() => {
                              const note = window.prompt("Sababu ya kukataa (hiari):") ?? undefined;
                              reviewRequestMutation.mutate({
                                id: r.id,
                                status: "denied",
                                review_note: note,
                              });
                            }}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Kataa
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Balances tab */}
        <TabsContent value="balances" className="mt-4 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tafuta mfanyakazi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jina</TableHead>
                  <TableHead className="hidden sm:table-cell">Idara</TableHead>
                  <TableHead>Bakaa</TableHead>
                  <TableHead>Hali</TableHead>
                  <TableHead>Vitendo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {[1,2,3,4,5].map((j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredBalances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Hakuna wafanyakazi walioonekana
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBalances.map((emp) => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground">
                        {emp.department ?? "—"}
                      </TableCell>
                      <TableCell className={emp.balance >= 0 ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>
                        {formatCurrency(Math.abs(emp.balance))}
                      </TableCell>
                      <TableCell>
                        {emp.balance > 0 ? (
                          <Badge variant="success">Kampuni inadaiwa</Badge>
                        ) : emp.balance < 0 ? (
                          <Badge variant="destructive">Ana deni</Badge>
                        ) : (
                          <Badge variant="outline">Sawa</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedEmployee(emp.id);
                            reset({ type: "advance_given", employee_id: emp.id });
                            setDialogOpen(true);
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Muamala
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Schedules tab */}
        <TabsContent value="schedules" className="mt-4 space-y-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mfanyakazi</TableHead>
                  <TableHead>Deni la Jumla</TableHead>
                  <TableHead>Iliyobaki</TableHead>
                  <TableHead>Kila Mwezi</TableHead>
                  <TableHead>Miezi Iliyobaki</TableHead>
                  <TableHead>Hali</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {[1,2,3,4,5,6,7].map((j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (schedules ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Hakuna ratiba za mikopo. Bonyeza &ldquo;Ratiba ya Mkopo&rdquo; kuongeza.
                    </TableCell>
                  </TableRow>
                ) : (
                  (schedules ?? []).map((s) => {
                    const monthsLeft = s.remaining_debt > 0
                      ? Math.ceil(s.remaining_debt / s.monthly_deduction)
                      : 0;
                    return (
                      <TableRow key={s.id} className={s.status === "cleared" ? "opacity-50" : ""}>
                        <TableCell className="font-medium">{s.employee_name}</TableCell>
                        <TableCell>{formatCurrency(s.total_debt)}</TableCell>
                        <TableCell className={s.remaining_debt > 0 ? "text-red-700 font-semibold" : "text-green-700"}>
                          {formatCurrency(s.remaining_debt)}
                        </TableCell>
                        <TableCell>{formatCurrency(s.monthly_deduction)}</TableCell>
                        <TableCell>
                          {s.status === "cleared" ? (
                            <Badge variant="success">Imelipwa</Badge>
                          ) : (
                            <Badge variant={monthsLeft <= 2 ? "warning" : "secondary"}>
                              {monthsLeft} mwezi{monthsLeft !== 1 ? "" : ""}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.status === "active" ? "destructive" : "success"}>
                            {s.status === "active" ? "Inaendelea" : "Imelipwa"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {s.status === "active" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-green-700 hover:text-green-700 hover:bg-green-50"
                              disabled={clearScheduleMutation.isPending}
                              onClick={() => clearScheduleMutation.mutate(s.id)}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Lipa
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </Card>

          {/* Summary per employee */}
          {(schedules ?? []).filter((s) => s.status === "active").length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Muhtasari wa Madeni Yanayoendelea
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {Object.entries(
                  (schedules ?? [])
                    .filter((s) => s.status === "active")
                    .reduce<Record<string, { name: string; total: number; monthly: number; count: number }>>(
                      (acc, s) => {
                        if (!acc[s.employee_id]) {
                          acc[s.employee_id] = { name: s.employee_name, total: 0, monthly: 0, count: 0 };
                        }
                        acc[s.employee_id].total += s.remaining_debt;
                        acc[s.employee_id].monthly += s.monthly_deduction;
                        acc[s.employee_id].count += 1;
                        return acc;
                      },
                      {}
                    )
                ).map(([empId, info]) => (
                  <div key={empId} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                    <div>
                      <span className="font-medium">{info.name}</span>
                      {info.count > 1 && (
                        <Badge variant="warning" className="ml-2 text-xs">{info.count} madeni</Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-red-700 font-semibold">{formatCurrency(info.total)} iliyobaki</p>
                      <p className="text-muted-foreground text-xs">
                        {formatCurrency(info.monthly)}/mwezi · Inaisha baada ya miezi {Math.ceil(info.total / info.monthly)}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History tab */}
        <TabsContent value="history" className="mt-4 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tafuta mfanyakazi..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Wafanyakazi wote" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Wafanyakazi wote</SelectItem>
                {(employees ?? []).map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mfanyakazi</TableHead>
                  <TableHead>Aina</TableHead>
                  <TableHead>Kiasi</TableHead>
                  <TableHead className="hidden sm:table-cell">Maelezo</TableHead>
                  <TableHead>Tarehe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {[1,2,3,4,5].map((j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : (selectedEmployee ? empTx?.transactions : allTx?.transactions)?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Hakuna miamala
                    </TableCell>
                  </TableRow>
                ) : (
                  (selectedEmployee ? empTx?.transactions : allTx?.transactions ?? [])?.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-medium">{tx.employee_name}</TableCell>
                      <TableCell>
                        <Badge variant={tx.amount >= 0 ? "success" : "destructive"}>
                          {TX_LABELS[tx.type] ?? tx.type}
                        </Badge>
                      </TableCell>
                      <TableCell className={tx.amount >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>
                        {tx.amount >= 0 ? "+" : ""}{formatCurrency(tx.amount)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {tx.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(tx.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New deduction schedule dialog */}
      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              Ratiba ya Mkopo
            </DialogTitle>
            <DialogDescription>
              Weka kiasi cha deni na kiasi cha kukatwa kila mwezi
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSchedSubmit((d) => scheduleMutation.mutate(d))} className="space-y-4">
            <div className="space-y-2">
              <Label>Mfanyakazi</Label>
              <Select
                value={watchSched("employee_id") ?? ""}
                onValueChange={(v) => setSchedValue("employee_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chagua mfanyakazi..." />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {schedErrors.employee_id && (
                <p className="text-xs text-destructive">{schedErrors.employee_id.message}</p>
              )}

              {/* Warning if existing debt */}
              {existingActive.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    Mfanyakazi huyu ana deni linaloendelea la {formatCurrency(existingDebt)}.
                    Deni jipya litaongezwa juu ya lililopo.
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Jumla ya Deni (TZS)</Label>
              <Input
                type="number"
                step="1"
                min="1"
                placeholder="500000"
                {...regSched("total_debt", { valueAsNumber: true })}
              />
              {schedErrors.total_debt && (
                <p className="text-xs text-destructive">{schedErrors.total_debt.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Kiasi cha Kila Mwezi (TZS)</Label>
              <Input
                type="number"
                step="1"
                min="1"
                placeholder="50000"
                {...regSched("monthly_deduction", { valueAsNumber: true })}
              />
              {schedErrors.monthly_deduction && (
                <p className="text-xs text-destructive">{schedErrors.monthly_deduction.message}</p>
              )}
              {monthsToRepay > 0 && (
                <p className="text-xs text-muted-foreground">
                  Deni litaisha baada ya miezi{" "}
                  <span className="font-semibold text-foreground">{monthsToRepay}</span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Maelezo (hiari)</Label>
              <Input placeholder="Sababu ya mkopo..." {...regSched("notes")} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setScheduleDialogOpen(false)}>
                Ghairi
              </Button>
              <Button type="submit" disabled={scheduleMutation.isPending}>
                {scheduleMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inahifadhi...</>
                ) : "Hifadhi Ratiba"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New transaction dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Muamala Mpya
            </DialogTitle>
            <DialogDescription>
              Weka mkopo, ukataji au malipo ya mshahara
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
            <div className="space-y-2">
              <Label>Mfanyakazi</Label>
              <Select
                value={watch("employee_id") ?? ""}
                onValueChange={(v) => setValue("employee_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chagua mfanyakazi..." />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.employee_id && (
                <p className="text-xs text-destructive">{errors.employee_id.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Aina ya Muamala</Label>
              <Select
                value={txType}
                onValueChange={(v) => setValue("type", v as TxForm["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance_given">Mkopo Uliotolewa</SelectItem>
                  <SelectItem value="advance_deducted">Mkopo Uliokatwa (Marejesho)</SelectItem>
                  <SelectItem value="salary_paid">Mshahara Ulioplwa</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
              <Label>Maelezo (hiari)</Label>
              <Input placeholder="Sababu ya muamala..." {...register("description")} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Ghairi
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
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
