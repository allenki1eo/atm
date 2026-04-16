"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DollarSign, Plus, Search, TrendingDown, TrendingUp, Loader2, History } from "lucide-react";
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

const txSchema = z.object({
  employee_id: z.string().min(1, "Chagua mfanyakazi"),
  type: z.enum(["advance_given", "advance_deducted", "salary_paid"]),
  amount: z.number().min(1, "Kiasi lazima kiwe angalau 1"),
  description: z.string().optional(),
});
type TxForm = z.infer<typeof txSchema>;

const TX_LABELS: Record<string, string> = {
  advance_given: "Mkopo Uliotolewa",
  advance_deducted: "Mkopo Uliokatwa",
  salary_paid: "Mshahara Ulioplwa",
};

export default function AdvancesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
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
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Usimamizi wa Mikopo</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Fuatilia mikopo na malipo ya wafanyakazi
          </p>
        </div>
        <Button onClick={() => { reset({ type: "advance_given" }); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Muamala Mpya
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
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

      <Tabs defaultValue="balances">
        <TabsList>
          <TabsTrigger value="balances">Bakaa za Wafanyakazi</TabsTrigger>
          <TabsTrigger value="history">Historia ya Miamala</TabsTrigger>
        </TabsList>

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

          <Card>
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
          </Card>
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
              <SelectTrigger className="w-48">
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

          <Card>
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
          </Card>
        </TabsContent>
      </Tabs>

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
