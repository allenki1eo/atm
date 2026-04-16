"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, Search, Users, Pencil, Trash2, Upload, Download,
  FileText, CheckCircle2, XCircle, Loader2, KeyRound, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  phone: string;
  type: "casual" | "fulltime";
  department: string;
  supervisor_id: string;
  company_id: string | null;
  daily_rate: number;
  monthly_salary: number;
  overtime_rule: string;
  active: number;
}

interface Company {
  id: string;
  name: string;
}

interface SupervisorUser {
  id: string;
  name: string;
  role: string;
}

interface ImportResult {
  row: number;
  name: string;
  phone: string;
  status: "success" | "error";
  error?: string;
  smsSent?: boolean;
}

interface ImportSummary {
  total: number;
  succeeded: number;
  failed: number;
  smsSent: number;
}

const nanToZero = (v: unknown) => (typeof v === "number" && isNaN(v) ? 0 : v);

const employeeSchema = z.object({
  name: z.string().min(2, "Name required"),
  phone: z.string().min(7, "Valid phone required"),
  type: z.enum(["casual", "fulltime"]),
  department: z.string().optional(),
  supervisor_id: z.string().optional(),
  company_id: z.string().optional(),
  daily_rate: z.preprocess(nanToZero, z.number().min(0).optional()),
  monthly_salary: z.preprocess(nanToZero, z.number().min(0).optional()),
  overtime_rule: z.enum(["all_days", "holidays_only", "none"]).optional(),
});

type EmployeeForm = z.infer<typeof employeeSchema>;

const CSV_TEMPLATE =
  "name,phone,type,department,daily_rate,monthly_salary,overtime_rule\n" +
  "Juma Salim,+255712345001,casual,Uendeshaji,15000,,none\n" +
  "Fatuma Hassan,+255712345002,casual,Uendeshaji,15000,,none\n" +
  "Robert Mwangi,+255712345003,fulltime,Fedha,,800000,all_days\n";

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "trusttrack_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSVPreview(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const record: Record<string, string> = {};
    headers.forEach((h, i) => { record[h] = values[i] ?? ""; });
    return record;
  });
}

export default function EmployeesPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [newCredentials, setNewCredentials] = useState<{ name: string; phone: string; pin: string } | null>(null);

  // CSV import state
  const [importOpen, setImportOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const role = (session?.user as { role?: string })?.role;
  const isAdmin = role === "admin";
  const canManage = role === "admin" || role === "hr";

  const { data: employees, isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Employee[]>;
    },
  });

  const { data: allUsers } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json() as Promise<SupervisorUser[]>;
    },
    enabled: canManage,
  });

  const supervisors = (allUsers ?? []).filter(
    (u) => u.role === "supervisor" || u.role === "admin" || u.role === "hr"
  );

  const { data: companies } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies");
      if (!res.ok) return [];
      return res.json() as Promise<Company[]>;
    },
    enabled: canManage,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<EmployeeForm>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { type: "casual", overtime_rule: "none" },
  });

  const type = watch("type");

  const createMutation = useMutation({
    mutationFn: async (data: EmployeeForm) => {
      const res = await fetch("/api/employees", {
        method: editingEmployee ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingEmployee ? { ...data, id: editingEmployee.id } : data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setDialogOpen(false);
      setEditingEmployee(null);
      reset();

      if (!editingEmployee && data.pin) {
        // Show credentials dialog for new employee
        setNewCredentials({ name: data.name, phone: data.phone, pin: data.pin });
        toast({
          title: "Mfanyakazi ameongezwa",
          description: data.smsSent
            ? "Akaunti imeundwa. SMS imetumwa kwa mfanyakazi."
            : "Akaunti imeundwa. SMS itumwe baadaye (hakuna muunganiko).",
        });
      } else {
        toast({ title: editingEmployee ? "Employee updated" : "Employee created" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/employees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setDeleteTarget(null);
      toast({ title: "Employee removed", description: "Record deactivated. History preserved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    reset({
      name: emp.name,
      phone: emp.phone,
      type: emp.type,
      department: emp.department,
      supervisor_id: emp.supervisor_id ?? "",
      company_id: emp.company_id ?? "",
      daily_rate: emp.daily_rate,
      monthly_salary: emp.monthly_salary,
      overtime_rule: emp.overtime_rule as "all_days" | "holidays_only" | "none",
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingEmployee(null);
    reset({ type: "casual", overtime_rule: "none" });
    setDialogOpen(true);
  };

  const filtered = (employees ?? []).filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase()) ||
      e.phone.includes(search)
  );

  const onSubmit = (data: EmployeeForm) => {
    const payload = {
      ...data,
      supervisor_id: data.supervisor_id || undefined,
      daily_rate: data.type === "casual" ? Math.round(data.daily_rate ?? 0) : 0,
      monthly_salary: data.type === "fulltime" ? Math.round(data.monthly_salary ?? 0) : 0,
    };
    createMutation.mutate(payload);
  };

  // CSV import handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    setImportResults(null);
    setImportSummary(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvPreview(parseCSVPreview(text));
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvFile) return;
    setImporting(true);
    setImportResults(null);
    setImportSummary(null);
    const formData = new FormData();
    formData.append("file", csvFile);
    try {
      const res = await fetch("/api/employees/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Import failed", description: data.error, variant: "destructive" });
        return;
      }
      setImportResults(data.results);
      setImportSummary(data.summary);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({
        title: `Import done: ${data.summary.succeeded}/${data.summary.total} succeeded`,
        description: data.summary.smsSent > 0
          ? `SMS imetumwa kwa wafanyakazi ${data.summary.smsSent}`
          : "SMS hazikutumwa — angalia muunganiko wa Africa's Talking",
      });
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setCsvFile(null);
    setCsvPreview([]);
    setImportResults(null);
    setImportSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const supervisorName = (id: string) =>
    supervisors.find((s) => s.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Wafanyakazi</h1>
          </div>
          <p className="text-muted-foreground mt-1">Dhibiti wafanyakazi wako</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && (
            <Button variant="outline" onClick={() => { resetImport(); setImportOpen(true); }}>
              <Upload className="h-4 w-4 mr-2" />
              Ingiza CSV
            </Button>
          )}
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Ongeza Mfanyakazi
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tafuta wafanyakazi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold">{employees?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground">Jumla</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-blue-600">
            {employees?.filter((e) => e.type === "casual").length ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">Mkataba</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-2xl font-bold text-green-600">
            {employees?.filter((e) => e.type === "fulltime").length ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">Kudumu</p>
        </CardContent></Card>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Jina</TableHead>
              <TableHead>Aina</TableHead>
              <TableHead className="hidden sm:table-cell">Idara</TableHead>
              <TableHead className="hidden md:table-cell">Simu</TableHead>
              <TableHead className="hidden lg:table-cell">Msimamizi</TableHead>
              <TableHead>Kiwango</TableHead>
              {canManage && <TableHead className="w-20"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Inapakia...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Hakuna wafanyakazi
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.name}</TableCell>
                  <TableCell>
                    <Badge variant={emp.type === "casual" ? "info" : "success"} className="capitalize">
                      {emp.type === "casual" ? "Mkataba" : "Kudumu"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground">
                    {emp.department ?? "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                    {emp.phone}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                    {emp.supervisor_id ? supervisorName(emp.supervisor_id) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {emp.type === "casual"
                      ? `${formatCurrency(emp.daily_rate)}/siku`
                      : `${formatCurrency(emp.monthly_salary)}/mwezi`}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(emp)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(emp)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingEmployee(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? "Hariri Mfanyakazi" : "Ongeza Mfanyakazi Mpya"}</DialogTitle>
            <DialogDescription>
              {editingEmployee
                ? "Sasisha taarifa za mfanyakazi"
                : "Akaunti ya kuingia itaundwa na PIN itatumwa kwa SMS"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Jina Kamili</Label>
              <Input placeholder="Juma Salim" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Nambari ya Simu</Label>
              <Input placeholder="+255712345678" {...register("phone")} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Aina ya Mfanyakazi</Label>
                <Select
                  value={type}
                  onValueChange={(v) => setValue("type", v as "casual" | "fulltime")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="casual">Mkataba (Casual)</SelectItem>
                    <SelectItem value="fulltime">Kudumu (Full-time)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Idara</Label>
                <Input placeholder="Uendeshaji" {...register("department")} />
              </div>
            </div>

            {/* Supervisor assignment */}
            <div className="space-y-2">
              <Label>Msimamizi</Label>
              <Select
                value={watch("supervisor_id") ?? ""}
                onValueChange={(v) => setValue("supervisor_id", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chagua msimamizi..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Hakuna msimamizi —</SelectItem>
                  {supervisors.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Company assignment */}
            <div className="space-y-2">
              <Label>Kampuni</Label>
              <Select
                value={watch("company_id") ?? ""}
                onValueChange={(v) => setValue("company_id", v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chagua kampuni..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Hakuna kampuni —</SelectItem>
                  {(companies ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {type === "casual" ? (
              <div className="space-y-2">
                <Label>Kiwango cha Siku (TZS)</Label>
                <Input
                  type="number"
                  step="1"
                  placeholder="15000"
                  {...register("daily_rate", { valueAsNumber: true })}
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Mshahara wa Mwezi (TZS)</Label>
                  <Input
                    type="number"
                    step="1"
                    placeholder="800000"
                    {...register("monthly_salary", { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sheria ya Overtime</Label>
                  <Select
                    value={watch("overtime_rule") ?? "none"}
                    onValueChange={(v) =>
                      setValue("overtime_rule", v as "all_days" | "holidays_only" | "none")
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Hakuna Overtime</SelectItem>
                      <SelectItem value="all_days">Siku Zote</SelectItem>
                      <SelectItem value="holidays_only">Likizo tu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Ghairi
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inahifadhi...</>
                ) : editingEmployee ? "Hifadhi Mabadiliko" : "Ongeza Mfanyakazi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Futa Mfanyakazi</DialogTitle>
            <DialogDescription>
              Una uhakika unataka kuondoa <strong>{deleteTarget?.name}</strong>? Historia ya mahudhurio na malipo itahifadhiwa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Ghairi</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inafuta...</>
              ) : "Ndio, Futa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New employee credentials dialog */}
      <Dialog open={!!newCredentials} onOpenChange={(open) => { if (!open) setNewCredentials(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-green-600" />
              Akaunti Imeundwa
            </DialogTitle>
            <DialogDescription>
              Hifadhi maelezo haya. PIN itaonekana mara moja tu hapa.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Jina</span>
              <span className="font-medium">{newCredentials?.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Simu (jina la mtumiaji)</span>
              <span className="font-medium font-mono">{newCredentials?.phone}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">PIN ya Siri</span>
              <span className="font-bold font-mono text-lg tracking-widest text-primary">
                {newCredentials?.pin}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            PIN pia imetumwa kwa SMS kwa nambari ya mfanyakazi (kama muunganiko ulipatikana).
          </p>
          <DialogFooter>
            <Button onClick={() => setNewCredentials(null)}>Imeeleweka</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) resetImport(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Ingiza Wafanyakazi kwa CSV
            </DialogTitle>
            <DialogDescription>
              Pakia faili ya CSV. Kila mfanyakazi atapewa PIN ya siri kupitia SMS.
            </DialogDescription>
          </DialogHeader>

          {importResults ? (
            <div className="space-y-4">
              {importSummary && (
                <div className="grid grid-cols-3 gap-3">
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{importSummary.succeeded}</p>
                    <p className="text-xs text-muted-foreground">Wamefanikiwa</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{importSummary.failed}</p>
                    <p className="text-xs text-muted-foreground">Wameshindwa</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{importSummary.smsSent}</p>
                    <p className="text-xs text-muted-foreground">SMS Zimetumwa</p>
                  </CardContent></Card>
                </div>
              )}
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Row</TableHead>
                      <TableHead>Jina</TableHead>
                      <TableHead>Simu</TableHead>
                      <TableHead>Hali</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importResults.map((r) => (
                      <TableRow key={r.row}>
                        <TableCell className="text-muted-foreground text-xs">{r.row}</TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.phone}</TableCell>
                        <TableCell>
                          {r.status === "success" ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="text-xs">{r.smsSent ? "OK + SMS" : "OK (SMS pending)"}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-600">
                              <XCircle className="h-4 w-4" />
                              <span className="text-xs">{r.error}</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetImport}>Ingiza Zaidi</Button>
                <Button onClick={() => setImportOpen(false)}>Maliza</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="border-dashed">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Pakua kiolezo cha CSV</p>
                      <p className="text-xs text-muted-foreground">
                        Safu: name, phone, type, department, daily_rate, monthly_salary, overtime_rule
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadTemplate}>
                    <Download className="h-4 w-4 mr-2" />Kiolezo
                  </Button>
                </CardContent>
              </Card>
              <div className="space-y-2">
                <Label>Chagua Faili ya CSV</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="cursor-pointer"
                />
              </div>
              {csvPreview.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Hakiki ({csvPreview.length} safu)</p>
                    <Badge variant="secondary">{csvPreview.length} wafanyakazi</Badge>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Jina</TableHead>
                          <TableHead>Simu</TableHead>
                          <TableHead>Aina</TableHead>
                          <TableHead>Kiwango</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvPreview.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{row.name || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.phone}</TableCell>
                            <TableCell>
                              {row.type ? (
                                <Badge variant={row.type === "casual" ? "info" : "success"} className="text-xs capitalize">
                                  {row.type}
                                </Badge>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {row.type === "casual"
                                ? (row.daily_rate ? `${row.daily_rate}/siku` : "—")
                                : (row.monthly_salary ? `${row.monthly_salary}/mwezi` : "—")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportOpen(false)}>Ghairi</Button>
                <Button onClick={handleImport} disabled={!csvFile || csvPreview.length === 0 || importing}>
                  {importing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inaingiza...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" />Ingiza {csvPreview.length > 0 ? `(${csvPreview.length})` : ""}</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
