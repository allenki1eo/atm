"use client";

import { useState, useRef } from "react";
import { useAttendanceVisibility } from "@/hooks/use-attendance-visibility";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import {
  Plus, Search, Users, Pencil, Trash2, Upload, Download,
  FileText, CheckCircle2, XCircle, Loader2, KeyRound,
  ShieldCheck, ShieldOff, History, RotateCcw, UserCheck,
  UserX, ArrowRightLeft, ExternalLink,
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
import { formatCurrency, formatDate } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  phone: string;
  type: "casual" | "fulltime";
  department: string;
  supervisor_id: string;
  company_id: string | null;
  section_id: string | null;
  daily_rate: number;
  monthly_salary: number;
  food_advance_amount: number;
  overtime_rule: string;
  active: number;
  deduct_nssf: number;
  deduct_cotwu: number;
  deduct_fadhila: number;
  heslb_amount: number;
  wcf_amount: number;
}

interface Company {
  id: string;
  name: string;
}

interface Section {
  id: string;
  name: string;
  company_id: string;
}

interface SupervisorUser {
  id: string;
  name: string;
  role: string;
  employee_id: string | null;
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

interface EmployeeStatusEvent {
  id: string;
  action: "created" | "deactivated" | "rejoined";
  from_active: number | null;
  to_active: number;
  note: string | null;
  changed_by_name: string | null;
  changed_at: string;
}

interface EmployeeTransfer {
  id: string;
  from_company_name: string | null;
  from_section_name: string | null;
  to_company_name: string | null;
  to_section_name: string | null;
  changed_by_name: string | null;
  changed_at: string;
  note: string | null;
}

interface EmployeeHistoryResponse {
  status_events: EmployeeStatusEvent[];
  transfers: EmployeeTransfer[];
}

const nanToZero = (v: unknown) => (typeof v === "number" && isNaN(v) ? 0 : v);

const employeeSchema = z
  .object({
    name: z.string().min(2, "Name required"),
    phone: z.string().min(7, "Valid phone required"),
    type: z.enum(["casual", "fulltime"]),
    department: z.string().optional(),
    supervisor_id: z.string().optional(),
    company_id: z.string().optional(),
    section_id: z.string().optional(),
    daily_rate: z.preprocess(nanToZero, z.number().min(0).optional()),
    monthly_salary: z.preprocess(nanToZero, z.number().min(0).optional()),
    food_advance_amount: z.preprocess(nanToZero, z.number().optional()),
    overtime_rule: z.enum(["all_days", "holidays_only", "none"]).optional(),
    deduct_nssf: z.boolean().optional(),
    deduct_cotwu: z.boolean().optional(),
    deduct_fadhila: z.boolean().optional(),
    heslb_amount: z.preprocess(nanToZero, z.number().min(0).optional()),
    wcf_amount: z.preprocess(nanToZero, z.number().min(0).optional()),
  })
  .superRefine((data, ctx) => {
    if (data.type === "casual" && !(data.daily_rate && data.daily_rate > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["daily_rate"],
        message: "Weka kiwango cha siku (TZS)",
      });
    }
    if (data.type === "fulltime" && !(data.monthly_salary && data.monthly_salary > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthly_salary"],
        message: "Weka mshahara wa mwezi (TZS)",
      });
    }
  });

type EmployeeForm = {
  name: string;
  phone: string;
  type: "casual" | "fulltime";
  department?: string;
  supervisor_id?: string;
  company_id?: string;
  section_id?: string;
  daily_rate?: number;
  monthly_salary?: number;
  food_advance_amount?: number;
  overtime_rule?: "all_days" | "holidays_only" | "none";
  deduct_nssf?: boolean;
  deduct_cotwu?: boolean;
  deduct_fadhila?: boolean;
  heslb_amount?: number;
  wcf_amount?: number;
};

async function downloadTemplate() {
  const res = await fetch("/api/employees/import/template");
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "trusttrack_employees_template.csv";
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

function employeeToPayload(emp: Employee, active = emp.active) {
  return {
    id: emp.id,
    name: emp.name,
    phone: emp.phone,
    type: emp.type,
    department: emp.department ?? "",
    supervisor_id: emp.supervisor_id ?? "",
    company_id: emp.company_id ?? "",
    section_id: emp.section_id ?? "",
    daily_rate: emp.daily_rate ?? 0,
    monthly_salary: emp.monthly_salary ?? 0,
    food_advance_amount: emp.food_advance_amount ?? 0,
    overtime_rule: emp.overtime_rule ?? "none",
    active,
    deduct_nssf: !!emp.deduct_nssf,
    deduct_cotwu: !!emp.deduct_cotwu,
    deduct_fadhila: !!emp.deduct_fadhila,
    heslb_amount: emp.heslb_amount ?? 0,
    wcf_amount: emp.wcf_amount ?? 0,
  };
}

function statusLabel(action: EmployeeStatusEvent["action"]) {
  if (action === "created") return "Ameongezwa";
  if (action === "rejoined") return "Amerejoin";
  return "Amewekwa inactive";
}

function locationLabel(company?: string | null, section?: string | null) {
  if (company && section) return `${company} / ${section}`;
  if (company) return company;
  if (section) return section;
  return "Hakuna kampuni/sehemu";
}

export default function EmployeesPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [roleTarget, setRoleTarget] = useState<{ emp: Employee; action: "promote" | "demote" } | null>(null);
  const [newCredentials, setNewCredentials] = useState<{ name: string; phone: string; pin: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<Employee | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<Employee | null>(null);
  const [permDeleteTarget, setPermDeleteTarget] = useState<Employee | null>(null);
  const [permDeleteConfirm, setPermDeleteConfirm] = useState("");

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
  const { hidden } = useAttendanceVisibility();

  const { data: employees, isLoading } = useQuery({
    queryKey: ["employees", showInactive],
    queryFn: async () => {
      const qs = canManage && showInactive ? "?include_inactive=1" : "";
      const res = await fetch(`/api/employees${qs}`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Employee[]>;
    },
  });

  const { data: employeeHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["employee-history", historyTarget?.id],
    queryFn: async () => {
      const res = await fetch(`/api/employees/history?employee_id=${historyTarget?.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json as EmployeeHistoryResponse;
    },
    enabled: !!historyTarget && canManage,
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

  const { data: sections } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => {
      const res = await fetch("/api/sections");
      if (!res.ok) return [];
      return res.json() as Promise<Section[]>;
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
    resolver: zodResolver(employeeSchema) as unknown as Resolver<EmployeeForm>,
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
      queryClient.invalidateQueries({ queryKey: ["employee-history"] });
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
      queryClient.invalidateQueries({ queryKey: ["employee-history"] });
      setDeleteTarget(null);
      toast({ title: "Mfanyakazi amewekwa inactive", description: "Historia yake imehifadhiwa." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const rejoinMutation = useMutation({
    mutationFn: async (employee: Employee) => {
      const res = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employeeToPayload(employee, 1)),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employee-history"] });
      toast({ title: "Mfanyakazi amerejoin", description: "Amewekwa active tena." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const permDeleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/employees/${id}/permanent-delete`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setPermDeleteTarget(null);
      setPermDeleteConfirm("");
      toast({ title: "Mfanyakazi amefutwa kabisa", description: "Rekodi zote zimefutwa." });
    },
    onError: (err: Error) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ employeeId, action }: { employeeId: string; action: "promote" | "demote" }) => {
      const res = await fetch(`/api/employees/${employeeId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setRoleTarget(null);
      toast({
        title: variables.action === "promote" ? "Amepandishwa cheo" : "Amerejeshwa",
        description:
          variables.action === "promote"
            ? "Mfanyakazi sasa ni supervisor."
            : "Wadhifa umerudishwa kuwa mfanyakazi.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ employee_id, password }: { employee_id: string; password: string }) => {
      const res = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Imeshindwa");
      }
      return res.json();
    },
    onSuccess: () => {
      setResetTarget(null);
      setResetPassword("");
      toast({ title: "Nywila imebadilishwa", description: "Nywila mpya imehifadhiwa." });
    },
    onError: (err: Error) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const roleByEmployeeId = new Map<string, string>();
  for (const u of allUsers ?? []) {
    if (u.employee_id) roleByEmployeeId.set(u.employee_id, u.role);
  }


  const openEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    reset({
      name: emp.name,
      phone: emp.phone,
      type: emp.type,
      department: emp.department,
      supervisor_id: emp.supervisor_id ?? "",
      company_id: emp.company_id ?? "",
      section_id: emp.section_id ?? "",
      daily_rate: emp.daily_rate,
      monthly_salary: emp.monthly_salary,
      food_advance_amount: emp.food_advance_amount ?? 0,
      overtime_rule: emp.overtime_rule as "all_days" | "holidays_only" | "none",
      deduct_nssf: !!emp.deduct_nssf,
      deduct_cotwu: !!emp.deduct_cotwu,
      deduct_fadhila: !!emp.deduct_fadhila,
      heslb_amount: emp.heslb_amount ?? 0,
      wcf_amount: emp.wcf_amount ?? 0,
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingEmployee(null);
    reset({ type: "casual", overtime_rule: "none", food_advance_amount: 0 });
    setDialogOpen(true);
  };

  const filtered = (employees ?? []).filter(
    (e) =>
      !hidden.employees.includes(e.id) &&
      (!e.section_id || !hidden.sections.includes(e.section_id)) &&
      (
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.department?.toLowerCase().includes(search.toLowerCase()) ||
        e.phone.includes(search)
      )
  );
  const activeEmployees = (employees ?? []).filter((e) => e.active !== 0);
  const inactiveEmployees = (employees ?? []).filter((e) => e.active === 0);

  const onSubmit = (data: EmployeeForm) => {
    const payload = {
      ...data,
      supervisor_id: data.supervisor_id || undefined,
      company_id: data.company_id || undefined,
      section_id: data.section_id || undefined,
      daily_rate: data.type === "casual" ? Math.round(data.daily_rate ?? 0) : 0,
      monthly_salary: data.type === "fulltime" ? Math.round(data.monthly_salary ?? 0) : 0,
      food_advance_amount: Math.round(data.food_advance_amount ?? 0),
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
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tafuta wafanyakazi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {canManage && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="accent-primary"
            />
            <span>Onyesha inactive/rejoined</span>
          </label>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card><CardContent className="p-3">
          <p className="text-xl font-bold">{employees?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground">Jumla</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xl font-bold text-emerald-600">{activeEmployees.length}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </CardContent></Card>
        <Link href="/former-employees" className="block">
          <Card className="hover:border-amber-400 transition-colors cursor-pointer">
            <CardContent className="p-3">
              <p className="text-xl font-bold text-amber-600">{inactiveEmployees.length}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                Inactive <ExternalLink className="h-3 w-3" />
              </p>
            </CardContent>
          </Card>
        </Link>
        <Card><CardContent className="p-3">
          <p className="text-xl font-bold text-blue-600">
            {employees?.filter((e) => e.type === "casual").length ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">Mkataba</p>
        </CardContent></Card>
      </div>

      {/* Inactive employees callout */}
      {canManage && inactiveEmployees.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-400">
            <UserX className="h-4 w-4 shrink-0" />
            <span>
              <strong>{inactiveEmployees.length}</strong>{" "}
              {inactiveEmployees.length === 1 ? "mfanyakazi amewekwa" : "wafanyakazi wamewekwa"} inactive — wanapatikana katika sehemu ya Wafanyakazi wa Zamani.
            </span>
          </div>
          <Button variant="outline" size="sm" asChild className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400">
            <Link href="/former-employees">
              Wafanyakazi wa Zamani
              <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      )}

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
              <TableHead className="hidden sm:table-cell">Kiwango</TableHead>
              {canManage && <TableHead className="w-16"></TableHead>}
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
                <TableRow key={emp.id} className={emp.active === 0 ? "bg-muted/30 opacity-75" : undefined}>
                  <TableCell>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium leading-tight">{emp.name}</p>
                        {emp.active === 0 ? (
                          <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">
                            <UserX className="h-3 w-3 mr-1" />
                            Inactive
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-300">
                            <UserCheck className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground sm:hidden">
                        {emp.type === "casual"
                          ? `${formatCurrency(emp.daily_rate)}/siku`
                          : `${formatCurrency(emp.monthly_salary)}/mwezi`}
                      </p>
                    </div>
                  </TableCell>
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
                  <TableCell className="hidden sm:table-cell text-sm">
                    {emp.type === "casual"
                      ? `${formatCurrency(emp.daily_rate)}/siku`
                      : `${formatCurrency(emp.monthly_salary)}/mwezi`}
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Historia"
                          onClick={() => setHistoryTarget(emp)}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {emp.active === 0 ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Rejoin"
                            className="text-emerald-700 hover:text-emerald-700"
                            disabled={rejoinMutation.isPending}
                            onClick={() => rejoinMutation.mutate(emp)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(emp)} title="Hariri">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {isAdmin && roleByEmployeeId.get(emp.id) === "employee" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Pandisha kuwa supervisor"
                                className="text-emerald-700 hover:text-emerald-700"
                                onClick={() => setRoleTarget({ emp, action: "promote" })}
                              >
                                <ShieldCheck className="h-4 w-4" />
                              </Button>
                            )}
                            {isAdmin && roleByEmployeeId.get(emp.id) === "supervisor" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Rudisha kuwa mfanyakazi"
                                className="text-amber-700 hover:text-amber-700"
                                onClick={() => setRoleTarget({ emp, action: "demote" })}
                              >
                                <ShieldOff className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Badilisha Nywila"
                              onClick={() => { setResetTarget(emp); setResetPassword(""); setShowResetPw(false); }}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(emp)}
                              title="Weka inactive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => { setPermDeleteTarget(emp); setPermDeleteConfirm(""); }}
                                title="Futa kabisa"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </>
                        )}
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
                onValueChange={(v) => {
                  const next = v === "none" ? "" : v;
                  setValue("company_id", next);
                  // Clear section when company changes
                  setValue("section_id", "");
                }}
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

            {/* Section assignment (filtered by selected company) */}
            <div className="space-y-2">
              <Label>Sehemu</Label>
              <Select
                value={watch("section_id") ?? ""}
                onValueChange={(v) => setValue("section_id", v === "none" ? "" : v)}
                disabled={!watch("company_id")}
              >
                <SelectTrigger>
                  <SelectValue placeholder={watch("company_id") ? "Chagua sehemu..." : "Chagua kampuni kwanza"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Hakuna sehemu —</SelectItem>
                  {(sections ?? [])
                    .filter((s) => s.company_id === watch("company_id"))
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
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
                {errors.daily_rate && (
                  <p className="text-xs text-destructive">{errors.daily_rate.message}</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Mshahara wa Mwezi (TZS)</Label>
                <Input
                  type="number"
                  step="1"
                  placeholder="800000"
                  {...register("monthly_salary", { valueAsNumber: true })}
                />
                {errors.monthly_salary && (
                  <p className="text-xs text-destructive">{errors.monthly_salary.message}</p>
                )}
              </div>
            )}

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

            {/* Deductions section */}
            <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Makato ya Mishahara</p>
              <div className="space-y-1">
                <Label className="text-xs">Food advance ya mwezi</Label>
                <Select
                  value={String(watch("food_advance_amount") ?? 0)}
                  onValueChange={(v) => setValue("food_advance_amount", Number(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Hakuna</SelectItem>
                    <SelectItem value="20000">TZS 20,000</SelectItem>
                    <SelectItem value="25000">TZS 25,000</SelectItem>
                    <SelectItem value="30000">TZS 30,000</SelectItem>
                    <SelectItem value="35000">TZS 35,000</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" {...register("deduct_nssf")} className="accent-primary" />
                  <span>NSSF (10% ya mshahara)</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" {...register("deduct_cotwu")} className="accent-primary" />
                  <span>COTWU (kiwango cha kampuni)</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" {...register("deduct_fadhila")} className="accent-primary" />
                  <span>Fadhila (TZS 10,000/mwezi)</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="space-y-1">
                  <Label className="text-xs">HESLB (TZS/mwezi)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    {...register("heslb_amount", { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">WCF (TZS/mwezi)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="0"
                    {...register("wcf_amount", { valueAsNumber: true })}
                  />
                </div>
              </div>
            </div>

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
            <DialogTitle>Weka Mfanyakazi Inactive</DialogTitle>
            <DialogDescription>
              Una uhakika unataka kumweka <strong>{deleteTarget?.name}</strong> inactive? Historia ya mahudhurio, malipo, na status itahifadhiwa.
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
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inahifadhi...</>
              ) : "Ndio, Weka Inactive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permanent delete confirmation dialog */}
      <Dialog open={!!permDeleteTarget} onOpenChange={(open) => { if (!open) { setPermDeleteTarget(null); setPermDeleteConfirm(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Futa Kabisa Mfanyakazi</DialogTitle>
            <DialogDescription>
              Hatua hii <strong>haiwezi kurudishwa</strong>. Rekodi zote za <strong>{permDeleteTarget?.name}</strong> zitafutwa kabisa — mahudhurio, malipo, likizo, na historia yote.
              <br /><br />
              Andika jina la mfanyakazi hapa chini ili uthibitishe:
              <br />
              <span className="font-mono text-foreground font-semibold">{permDeleteTarget?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Andika jina hapa..."
            value={permDeleteConfirm}
            onChange={(e) => setPermDeleteConfirm(e.target.value)}
            className="mt-2"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPermDeleteTarget(null); setPermDeleteConfirm(""); }}>Ghairi</Button>
            <Button
              variant="destructive"
              disabled={permDeleteConfirm !== permDeleteTarget?.name || permDeleteMutation.isPending}
              onClick={() => permDeleteTarget && permDeleteMutation.mutate(permDeleteTarget.id)}
            >
              {permDeleteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inafuta...</>
              ) : "Futa Kabisa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Employee history dialog */}
      <Dialog open={!!historyTarget} onOpenChange={(open) => { if (!open) setHistoryTarget(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historia ya {historyTarget?.name}
            </DialogTitle>
            <DialogDescription>
              Angalia inactive/rejoined events na transfer kati ya kampuni au sehemu.
            </DialogDescription>
          </DialogHeader>

          {historyLoading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Inapakia historia...
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Status</h3>
                </div>
                {(employeeHistory?.status_events?.length ?? 0) === 0 ? (
                  <p className="rounded-md border p-3 text-sm text-muted-foreground">
                    Hakuna status history bado.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {employeeHistory?.status_events.map((event) => (
                      <div key={event.id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <Badge
                            variant={
                              event.action === "deactivated"
                                ? "warning"
                                : event.action === "rejoined"
                                  ? "success"
                                  : "secondary"
                            }
                          >
                            {statusLabel(event.action)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(event.changed_at)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm">{event.note ?? "Status changed"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Na: {event.changed_by_name ?? "System"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Transfers</h3>
                </div>
                {(employeeHistory?.transfers?.length ?? 0) === 0 ? (
                  <p className="rounded-md border p-3 text-sm text-muted-foreground">
                    Hakuna transfer history bado.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {employeeHistory?.transfers.map((transfer) => (
                      <div key={transfer.id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <Badge variant="info">Transfer</Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(transfer.changed_at)}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Kutoka</p>
                            <p className="font-medium">
                              {locationLabel(transfer.from_company_name, transfer.from_section_name)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Kwenda</p>
                            <p className="font-medium">
                              {locationLabel(transfer.to_company_name, transfer.to_section_name)}
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Na: {transfer.changed_by_name ?? "System"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Promote/Demote confirmation dialog */}
      <Dialog open={!!roleTarget} onOpenChange={(open) => { if (!open) setRoleTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {roleTarget?.action === "promote" ? (
                <><ShieldCheck className="h-5 w-5 text-emerald-600" />Pandisha kuwa Supervisor</>
              ) : (
                <><ShieldOff className="h-5 w-5 text-amber-600" />Rudisha kuwa Mfanyakazi</>
              )}
            </DialogTitle>
            <DialogDescription>
              {roleTarget?.action === "promote" ? (
                <>
                  <strong>{roleTarget?.emp.name}</strong> atapata ufikiaji wa dashibodi ya supervisor pamoja na dashibodi yake ya mfanyakazi. Utaweza kumpangia wafanyakazi wa kusimamia.
                </>
              ) : (
                <>
                  <strong>{roleTarget?.emp.name}</strong> hatakuwa tena supervisor. Wafanyakazi aliokuwa akisimamia wataachwa bila supervisor (unaweza kuwapangia mwingine baadaye).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleTarget(null)}>Ghairi</Button>
            <Button
              disabled={roleMutation.isPending}
              onClick={() =>
                roleTarget &&
                roleMutation.mutate({ employeeId: roleTarget.emp.id, action: roleTarget.action })
              }
              className={
                roleTarget?.action === "promote"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-amber-600 hover:bg-amber-700 text-white"
              }
            >
              {roleMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inafanya...</>
              ) : roleTarget?.action === "promote" ? "Ndio, Pandisha" : "Ndio, Rudisha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => { if (!open) { setResetTarget(null); setResetPassword(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-600" />
              Badilisha Nywila
            </DialogTitle>
            <DialogDescription>
              Weka nywila mpya kwa <strong>{resetTarget?.name}</strong>.
              Mfanyakazi ataweza kutumia nywila hii kuingia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Nywila / PIN mpya</Label>
            <div className="relative">
              <Input
                type={showResetPw ? "text" : "password"}
                placeholder="Herufi 4+ au nambari"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full w-10"
                onClick={() => setShowResetPw(!showResetPw)}
              >
                {showResetPw ? "🙈" : "👁"}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Ghairi</Button>
            <Button
              disabled={resetPassword.length < 4 || resetPasswordMutation.isPending}
              onClick={() => resetTarget && resetPasswordMutation.mutate({ employee_id: resetTarget.id, password: resetPassword })}
            >
              {resetPasswordMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inahifadhi...</>
                : "Hifadhi Nywila"}
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
                        Safu: name, phone, type, department, daily_rate, monthly_salary, food_advance_amount, overtime_rule
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
