"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  UserX, Search, Award, Loader2, Eye, RotateCcw, FileText, Calendar,
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

interface Employee {
  id: string;
  name: string;
  phone: string;
  type: "casual" | "fulltime";
  department: string | null;
  active: number;
  created_at: string;
  company_id: string | null;
}

interface StatusEvent {
  id: string;
  action: "created" | "deactivated" | "rejoined";
  changed_at: string;
  note: string | null;
}

interface HistoryResponse {
  status_events: StatusEvent[];
  transfers: unknown[];
}

interface Certificate {
  id: string;
  employee_id: string;
  date_employed: string | null;
  date_of_leaving: string | null;
  position_held: string | null;
  general_conduct: string;
  efficiency: string;
  additional_notes: string | null;
  issued_at: string;
}

const RATINGS = ["Excellent", "Very Good", "Good", "Satisfactory", "Poor"];

const certSchema = z.object({
  date_employed: z.string().min(1, "Required"),
  date_of_leaving: z.string().min(1, "Required"),
  position_held: z.string().min(1, "Required"),
  general_conduct: z.string().min(1, "Required"),
  efficiency: z.string().min(1, "Required"),
  additional_notes: z.string().optional(),
});

type CertForm = z.infer<typeof certSchema>;

function formatDisplayDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB");
}

export default function FormerEmployeesPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [certTarget, setCertTarget] = useState<Employee | null>(null);
  const [viewCertTarget, setViewCertTarget] = useState<Employee | null>(null);

  const role = (session?.user as { role?: string })?.role;
  const canManage = role === "admin" || role === "hr";

  const { data: employees, isLoading } = useQuery({
    queryKey: ["former-employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees?include_inactive=1");
      if (!res.ok) throw new Error("Failed");
      const all = (await res.json()) as Employee[];
      return all.filter((e) => e.active === 0);
    },
    enabled: canManage,
  });

  const { data: certData, isLoading: certLoading } = useQuery({
    queryKey: ["certificate", certTarget?.id ?? viewCertTarget?.id],
    queryFn: async () => {
      const id = certTarget?.id ?? viewCertTarget?.id;
      const res = await fetch(`/api/certificates?employee_id=${id}`);
      if (!res.ok) return null;
      return res.json() as Promise<Certificate | null>;
    },
    enabled: !!(certTarget || viewCertTarget) && canManage,
  });

  const { data: historyData } = useQuery({
    queryKey: ["emp-history-cert", certTarget?.id ?? viewCertTarget?.id],
    queryFn: async () => {
      const id = certTarget?.id ?? viewCertTarget?.id;
      const res = await fetch(`/api/employees/history?employee_id=${id}`);
      if (!res.ok) return null;
      return res.json() as Promise<HistoryResponse>;
    },
    enabled: !!(certTarget || viewCertTarget) && canManage,
  });

  const createdEvent = historyData?.status_events.find((e) => e.action === "created");
  const deactivatedEvent = historyData?.status_events
    .filter((e) => e.action === "deactivated")
    .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime())[0];

  const dateEmployedDefault = createdEvent
    ? new Date(createdEvent.changed_at).toISOString().slice(0, 10)
    : (certTarget ?? viewCertTarget)?.created_at?.slice(0, 10) ?? "";
  const dateOfLeavingDefault = deactivatedEvent
    ? new Date(deactivatedEvent.changed_at).toISOString().slice(0, 10)
    : "";

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<CertForm>({
    resolver: zodResolver(certSchema),
    defaultValues: { general_conduct: "Very Good", efficiency: "Very Good" },
  });

  const rejoinMutation = useMutation({
    mutationFn: async (employee: Employee) => {
      const res = await fetch("/api/employees", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: employee.id, active: 1 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["former-employees"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast({ title: "Mfanyakazi amerejoin", description: "Amewekwa active tena." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const certMutation = useMutation({
    mutationFn: async (data: CertForm & { employee_id: string }) => {
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      return json as Certificate;
    },
    onSuccess: (cert) => {
      queryClient.invalidateQueries({ queryKey: ["certificate"] });
      setCertTarget(null);
      reset();
      window.open(`/certificate/${cert.id}`, "_blank");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openCertDialog = (emp: Employee) => {
    setCertTarget(emp);
    reset({
      date_employed: "",
      date_of_leaving: "",
      position_held: emp.department ?? "",
      general_conduct: "Very Good",
      efficiency: "Very Good",
      additional_notes: "",
    });
  };

  // Pre-fill dates once history loads
  const watchDateEmployed = watch("date_employed");
  const watchDateLeaving = watch("date_of_leaving");
  if (certTarget && !watchDateEmployed && dateEmployedDefault) {
    setValue("date_employed", dateEmployedDefault);
  }
  if (certTarget && !watchDateLeaving && dateOfLeavingDefault) {
    setValue("date_of_leaving", dateOfLeavingDefault);
  }

  const onSubmit = (data: CertForm) => {
    if (!certTarget) return;
    certMutation.mutate({ ...data, employee_id: certTarget.id });
  };

  const filtered = (employees ?? []).filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase()) ||
      e.phone.includes(search)
  );

  if (!canManage) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        Huna ruhusa ya kuona ukurasa huu.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Wafanyakazi wa Zamani</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Wafanyakazi ambao wamesimama kufanya kazi. Unaweza kutengeneza cheti cha huduma.
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tafuta..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Card><CardContent className="p-3">
          <p className="text-xl font-bold text-amber-600">{employees?.length ?? 0}</p>
          <p className="text-xs text-muted-foreground">Wafanyakazi wa Zamani</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xl font-bold text-blue-600">
            {employees?.filter((e) => e.type === "fulltime").length ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">Kudumu (Fulltime)</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xl font-bold text-purple-600">
            {employees?.filter((e) => e.type === "casual").length ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">Mkataba (Casual)</p>
        </CardContent></Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jina</TableHead>
                <TableHead className="hidden sm:table-cell">Aina</TableHead>
                <TableHead className="hidden sm:table-cell">Idara</TableHead>
                <TableHead className="hidden md:table-cell">Simu</TableHead>
                <TableHead className="w-40">Vitendo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                    Inapakia...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Hakuna wafanyakazi wa zamani
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((emp) => (
                  <TableRow key={emp.id} className="bg-muted/20">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserX className="h-4 w-4 text-amber-500 shrink-0" />
                        <div>
                          <p className="font-medium">{emp.name}</p>
                          <p className="text-xs text-muted-foreground sm:hidden">{emp.department ?? "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={emp.type === "casual" ? "info" : "success"} className="capitalize text-xs">
                        {emp.type === "casual" ? "Mkataba" : "Kudumu"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {emp.department ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                      {emp.phone}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => openCertDialog(emp)}
                          title="Tengeneza Cheti cha Huduma"
                        >
                          <Award className="h-3 w-3 mr-1" />
                          Cheti
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Rejoin"
                          className="text-emerald-700 hover:text-emerald-700 h-8 w-8"
                          disabled={rejoinMutation.isPending}
                          onClick={() => rejoinMutation.mutate(emp)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
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

      {/* Certificate generation dialog */}
      <Dialog
        open={!!certTarget}
        onOpenChange={(open) => { if (!open) { setCertTarget(null); reset(); } }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-amber-600" />
              Cheti cha Huduma
            </DialogTitle>
            <DialogDescription>
              Jaza taarifa za cheti cha huduma kwa <strong>{certTarget?.name}</strong>.
              Cheti kitafunguliwa kwa kuchapishwa.
            </DialogDescription>
          </DialogHeader>

          {certLoading ? (
            <div className="py-6 text-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
              Inapakia...
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Tarehe ya Kuajiriwa
                  </Label>
                  <Input type="date" {...register("date_employed")} />
                  {errors.date_employed && (
                    <p className="text-xs text-destructive">{errors.date_employed.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Tarehe ya Kuacha
                  </Label>
                  <Input type="date" {...register("date_of_leaving")} />
                  {errors.date_of_leaving && (
                    <p className="text-xs text-destructive">{errors.date_of_leaving.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Wadhifa / Cheo (Position Held)</Label>
                <Input placeholder="e.g. Driver, Accountant..." {...register("position_held")} />
                {errors.position_held && (
                  <p className="text-xs text-destructive">{errors.position_held.message}</p>
                )}
              </div>

              <div className="rounded-lg border p-3 bg-muted/30 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  General Description
                </p>
                <div className="space-y-2">
                  <Label className="text-sm">General Conduct</Label>
                  <Select
                    value={watch("general_conduct")}
                    onValueChange={(v) => setValue("general_conduct", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RATINGS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Efficiency</Label>
                  <Select
                    value={watch("efficiency")}
                    onValueChange={(v) => setValue("efficiency", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RATINGS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Maelezo ya Ziada (Optional)</Label>
                <Input placeholder="Maelezo mengine..." {...register("additional_notes")} />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setCertTarget(null); reset(); }}>
                  Ghairi
                </Button>
                <Button
                  type="submit"
                  disabled={certMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {certMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inatengeneza...</>
                  ) : (
                    <><FileText className="h-4 w-4 mr-2" />Tengeneza na Chapisha</>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* View existing certificate dialog */}
      <Dialog
        open={!!viewCertTarget}
        onOpenChange={(open) => { if (!open) setViewCertTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Cheti cha {viewCertTarget?.name}
            </DialogTitle>
          </DialogHeader>
          {certData ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                <div><p className="text-xs text-muted-foreground">Tarehe ya Kuajiriwa</p>
                  <p className="font-medium">{formatDisplayDate(certData.date_employed)}</p></div>
                <div><p className="text-xs text-muted-foreground">Tarehe ya Kuacha</p>
                  <p className="font-medium">{formatDisplayDate(certData.date_of_leaving)}</p></div>
                <div><p className="text-xs text-muted-foreground">Wadhifa</p>
                  <p className="font-medium">{certData.position_held ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">General Conduct</p>
                  <p className="font-medium">{certData.general_conduct}</p></div>
                <div><p className="text-xs text-muted-foreground">Efficiency</p>
                  <p className="font-medium">{certData.efficiency}</p></div>
              </div>
              <Button
                className="w-full"
                onClick={() => window.open(`/certificate/${certData.id}`, "_blank")}
              >
                <FileText className="h-4 w-4 mr-2" />
                Fungua Cheti cha Kuchapisha
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm py-4 text-center">
              Hakuna cheti kilichotengenezwa bado.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
