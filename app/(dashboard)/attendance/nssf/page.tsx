"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { format, parseISO } from "date-fns";
import { Check, Loader2, Palmtree, Shield, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

interface DayInfo {
  date: string;
  weekday: number;
  sunday: boolean;
  non_working: boolean;
  holiday_name: string | null;
}

interface NssfEmployee {
  id: string;
  name: string;
  deduct_nssf: boolean;
  company_id: string | null;
  company_name: string | null;
  section_name: string | null;
}

interface AttendanceRow {
  employee_id: string;
  date: string;
  status: string;
  is_locked: boolean;
}

interface LeaveRow {
  employee_id: string;
  start_date: string;
  end_date: string;
}

interface NssfResponse {
  year: number;
  month: number;
  start: string;
  end: string;
  today: string;
  days: DayInfo[];
  companies: { id: string; name: string }[];
  employees: NssfEmployee[];
  hidden_non_nssf: number;
  nssf_count: number;
  total_active: number;
  attendance: AttendanceRow[];
  leaves: LeaveRow[];
  plan_summary: {
    created: number;
    updated: number;
    skippedExisting: number;
    skippedLocked: number;
    skippedNonWorking: number;
    skippedFuture: number;
  };
}

interface ImportRow {
  source_name: string;
  source_company: string;
  decision: string;
  employee_name?: string;
  company_name?: string;
  note?: string;
  score?: number;
}

interface ImportResponse {
  dry_run: boolean;
  totals: {
    listed: number;
    set_nssf: number;
    already_nssf: number;
    to_create: number;
    unassigned: number;
    move_company: number;
    companies_to_create: number;
    fuzzy_review: number;
    ambiguous: number;
    other_company: number;
    company_missing: number;
    override_missing?: number;
  };
  set_nssf: ImportRow[];
  already_nssf: ImportRow[];
  to_create: ImportRow[];
  unassigned: ImportRow[];
  fuzzy_review: ImportRow[];
  move_company: ImportRow[];
  companies_to_create: { name: string }[];
  ambiguous: ImportRow[];
  other_company: ImportRow[];
  company_missing: ImportRow[];
  override_missing?: ImportRow[];
  flagged?: number;
  created?: number;
}

function currentYearMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dar_es_Salaam",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function statusCell(status: string | undefined, nonWorking: boolean, holidayName: string | null) {
  if (nonWorking) {
    return (
      <span
        className="block w-7 text-center text-[10px] text-muted-foreground"
        title={holidayName ?? "Sikukuu / Jumapili"}
      >
        —
      </span>
    );
  }
  const map: Record<string, { label: string; className: string }> = {
    present: { label: "P", className: "bg-green-500 text-white" },
    late: { label: "C", className: "bg-amber-500 text-white" },
    half_day: { label: "N", className: "bg-blue-500 text-white" },
    leave: { label: "L", className: "bg-purple-600 text-white" },
    absent: { label: "A", className: "bg-red-500 text-white" },
  };
  if (!status) {
    return <span className="block w-7 text-center text-[10px] text-muted-foreground/60">·</span>;
  }
  const cfg = map[status] ?? { label: status[0]?.toUpperCase() ?? "?", className: "bg-muted" };
  return (
    <span
      className={`inline-flex h-6 w-7 items-center justify-center rounded text-[11px] font-semibold ${cfg.className}`}
      title={status}
    >
      {cfg.label}
    </span>
  );
}

export default function NssfAttendancePage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "admin";
  const queryClient = useQueryClient();

  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [companyId, setCompanyId] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));

  const queryKey = ["attendance", "nssf", year, month, companyId, showAll] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        show_all: showAll ? "1" : "0",
      });
      if (companyId !== "all") params.set("company_id", companyId);
      const res = await fetch(`/api/attendance/nssf?${params}`);
      if (!res.ok) throw new Error("Imeshindikana kupakia data ya NSSF");
      return (await res.json()) as NssfResponse;
    },
  });

  const attendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const row of data?.attendance ?? []) {
      map.set(`${row.employee_id}|${row.date}`, row);
    }
    return map;
  }, [data?.attendance]);

  const leaveDays = useMemo(() => {
    const set = new Set<string>();
    for (const leave of data?.leaves ?? []) {
      for (const emp of data?.employees ?? []) {
        if (emp.id !== leave.employee_id) continue;
        for (const day of data?.days ?? []) {
          if (day.date >= leave.start_date && day.date <= leave.end_date) {
            set.add(`${emp.id}|${day.date}`);
          }
        }
      }
    }
    return set;
  }, [data]);

  const autoFill = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const res = await fetch("/api/attendance/nssf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          company_id: companyId === "all" ? null : companyId,
          dry_run: dryRun,
          overwrite,
          show_all: showAll,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Imeshindikana");
      return json as { dry_run: boolean; applied?: number; summary: NssfResponse["plan_summary"] };
    },
    onSuccess: (result) => {
      if (result.dry_run) {
        toast({
          title: "Muhtasari (hakuna kilichoandikwa)",
          description: `Itaweka ${result.summary.created} rekodi mpya, kusasisha ${result.summary.updated}. Ruksa: ${result.summary.skippedNonWorking} sikukuu/Jumapili, ${result.summary.skippedExisting} zilizopo, ${result.summary.skippedLocked} zilizofungwa, ${result.summary.skippedFuture} zijazo.`,
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast({
        title: "Mahudhurio yamejazwa",
        description: `Imeandikwa rekodi ${result.applied ?? result.summary.created + result.summary.updated}.`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Hitilafu", description: e.message, variant: "destructive" });
    },
  });

  const importQuery = useQuery({
    queryKey: ["employees", "nssf-import"],
    queryFn: async () => {
      const res = await fetch("/api/employees/nssf-import");
      if (!res.ok) throw new Error("Imeshindikana kulinganisha orodha");
      return (await res.json()) as ImportResponse;
    },
    enabled: false,
  });

  const applyImport = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/employees/nssf-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Imeshindikana");
      return json as ImportResponse;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      importQuery.refetch();
      toast({
        title: "Orodha ya NSSF imetumika",
        description: `Alama ya NSSF: ${result.flagged ?? 0}. Wameongezwa: ${result.created ?? 0}. Ambiguous na kampuni nyingine hazikuguswa.`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Hitilafu", description: e.message, variant: "destructive" });
    },
  });

  const monthLabel = data
    ? format(parseISO(`${data.start}T12:00:00`), "MMMM yyyy")
    : yearMonth;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Mahudhurio ya NSSF</h1>
          </div>
          <p className="mt-1 text-muted-foreground">
            Wafanyakazi walio kwenye NSSF huonekana hapa. Jaza otomatiki siku za kazi
            (isipokuwa Jumapili na sikukuu). Likizo iliyoidhinishwa huwekwa kama Likizo, siyo kutokuwepo.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="nssf-month">Mwezi</Label>
              <Input
                id="nssf-month"
                type="month"
                value={yearMonth}
                onChange={(e) => setYearMonth(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kampuni</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Kampuni" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Makampuni yote</SelectItem>
                  {(data?.companies ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(!!v)} />
                <span>Onyesha wasio NSSF pia</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="secondary">{data?.nssf_count ?? 0} wa NSSF</Badge>
            {!showAll && (data?.hidden_non_nssf ?? 0) > 0 && (
              <span>{data?.hidden_non_nssf} wasio NSSF wamefichwa</span>
            )}
            <span>Mwezi: {monthLabel}</span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(!!v)} />
              <span>Andika juu ya rekodi zilizopo (zisizofungwa)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => autoFill.mutate(true)}
                disabled={autoFill.isPending}
              >
                {autoFill.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Angalia kwanza
              </Button>
              <Button onClick={() => autoFill.mutate(false)} disabled={autoFill.isPending}>
                {autoFill.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Jaza otomatiki
              </Button>
            </div>
          </div>
          {data?.plan_summary && (
            <p className="text-xs text-muted-foreground">
              Tayari: kuweka {data.plan_summary.created} mpya, kusasisha {data.plan_summary.updated}
              {data.plan_summary.skippedNonWorking ? `, kuruka ${data.plan_summary.skippedNonWorking} sikukuu/Jumapili` : ""}
              {data.plan_summary.skippedFuture ? `, ${data.plan_summary.skippedFuture} siku zijazo` : ""}.
            </p>
          )}
        </CardContent>
      </Card>

      {error ? (
        <Card><CardContent className="pt-4 text-sm text-destructive">{(error as Error).message}</CardContent></Card>
      ) : isLoading || !data ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rejesta ya {monthLabel}</CardTitle>
            <CardDescription>
              P = alikuwepo, L = likizo, A = hakuwepo, — = Jumapili au sikukuu (haitajazwa).
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-background px-2 py-1 text-left font-medium">
                    Mfanyakazi
                  </th>
                  {data.days.map((day) => (
                    <th
                      key={day.date}
                      className={`px-0.5 py-1 text-center font-normal ${
                        day.non_working ? "text-muted-foreground" : ""
                      }`}
                      title={day.holiday_name ?? day.date}
                    >
                      <div>{format(parseISO(`${day.date}T12:00:00`), "dd")}</div>
                      <div className="text-[10px]">
                        {format(parseISO(`${day.date}T12:00:00`), "EEEEE")}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.employees.length === 0 ? (
                  <tr>
                    <td className="px-2 py-6 text-muted-foreground" colSpan={data.days.length + 1}>
                      Hakuna wafanyakazi wa NSSF katika chujio hili. Ingiza orodha hapa chini au washa alama ya NSSF kwenye ukurasa wa wafanyakazi.
                    </td>
                  </tr>
                ) : (
                  data.employees.map((emp) => (
                    <tr key={emp.id} className="border-t">
                      <td className="sticky left-0 z-10 bg-background px-2 py-1 whitespace-nowrap">
                        <div className="font-medium">{emp.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {emp.company_name}
                          {!emp.deduct_nssf ? " · si NSSF" : ""}
                          {data.leaves.some((l) => l.employee_id === emp.id) ? (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-purple-700">
                              <Palmtree className="h-3 w-3" /> likizo
                            </span>
                          ) : null}
                        </div>
                      </td>
                      {data.days.map((day) => {
                        const rec = attendanceMap.get(`${emp.id}|${day.date}`);
                        const plannedLeave = leaveDays.has(`${emp.id}|${day.date}`);
                        return (
                          <td key={day.date} className="px-0.5 py-1 text-center">
                            {statusCell(
                              rec?.status ?? (plannedLeave && !day.non_working ? undefined : undefined),
                              day.non_working,
                              day.holiday_name
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            Orodha ya NSSF kutoka PDF
          </CardTitle>
          <CardDescription>
            Linganisha majina 67 kutoka EASTL, GAKI na GK Packaging. Hakuna akaunti za benki wala mishahara inayohifadhiwa.
            Utumiaji wa kweli unaongeza alama ya NSSF na kuunda wasio kuwepo (namba ya simu ya muda).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => importQuery.refetch()} disabled={importQuery.isFetching}>
              {importQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Linganisha orodha (dry-run)
            </Button>
            {isAdmin && importQuery.data && (
              <Button
                variant="secondary"
                onClick={() => applyImport.mutate()}
                disabled={applyImport.isPending || ((importQuery.data.totals.set_nssf + importQuery.data.totals.to_create + importQuery.data.totals.unassigned + importQuery.data.totals.move_company + importQuery.data.totals.companies_to_create) === 0)}
              >
                {applyImport.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Tumia: alama {importQuery.data.totals.set_nssf}, husisha {importQuery.data.totals.unassigned}, hamisha {importQuery.data.totals.move_company}, ongeza {importQuery.data.totals.to_create}, kampuni {importQuery.data.totals.companies_to_create}
              </Button>
            )}
            {!isAdmin && (
              <p className="text-sm text-muted-foreground">Msimamizi tu ndiye anayeweza kutumia mabadiliko.</p>
            )}
          </div>

          {importQuery.data && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge>Tayari NSSF: {importQuery.data.totals.already_nssf}</Badge>
                <Badge variant="secondary">Watawekwa NSSF: {importQuery.data.totals.set_nssf}</Badge>
                <Badge variant="secondary">Bila kampuni: {importQuery.data.totals.unassigned}</Badge>
                <Badge variant="secondary">Hamisho: {importQuery.data.totals.move_company}</Badge>
                <Badge variant="secondary">Kampuni mpya: {importQuery.data.totals.companies_to_create}</Badge>
                <Badge variant="secondary">Wataongezwa: {importQuery.data.totals.to_create}</Badge>
                <Badge variant="destructive">Thibitisha: {importQuery.data.totals.fuzzy_review}</Badge>
                <Badge variant="destructive">Ambiguous: {importQuery.data.totals.ambiguous}</Badge>
                <Badge variant="destructive">Kampuni nyingine: {importQuery.data.totals.other_company}</Badge>
                <Badge variant="destructive">Kampuni haipo: {importQuery.data.totals.company_missing}</Badge>
              </div>
              <ImportTable
                title="Watawekwa alama ya NSSF"
                rows={importQuery.data.set_nssf}
                empty="Hakuna wa kuwekea alama — wote waliofanana tayari wana NSSF."
              />
              <ImportTable
                title="Wataongezwa kwenye AtWork"
                rows={importQuery.data.to_create}
                empty="Hakuna jina jipya la kuongeza."
              />
              <ImportTable
                title="Wapo AtWork bila kampuni — watahusishwa"
                rows={importQuery.data.unassigned}
                empty="Hakuna walio bila kampuni."
              />
              <ImportTable
                title="Watahamishwa kampuni"
                rows={importQuery.data.move_company}
                empty="Hakuna wa kuhamisha."
              />
              {(importQuery.data.companies_to_create ?? []).length > 0 && (
                <p className="text-sm">
                  Kampuni zitakazoundwa: {importQuery.data.companies_to_create.map((c) => c.name).join(", ")}
                </p>
              )}
              <ImportTable
                title="Yanahitaji uamuzi (haijaguswa)"
                rows={[
                  ...importQuery.data.fuzzy_review,
                  ...importQuery.data.ambiguous,
                  ...importQuery.data.other_company,
                  ...importQuery.data.company_missing,
                ]}
                empty="Hakuna yenye utata."
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ImportTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: ImportRow[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Jina kwenye PDF</TableHead>
              <TableHead>Kampuni</TableHead>
              <TableHead>AtWork</TableHead>
              <TableHead>Maelezo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={`${row.source_name}-${i}`}>
                <TableCell>{row.source_name}</TableCell>
                <TableCell>{row.source_company}</TableCell>
                <TableCell>{row.employee_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{row.note ?? row.decision}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
