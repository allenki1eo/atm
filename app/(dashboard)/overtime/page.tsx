"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, Plus, Trash2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

const MONTHS = [
  "Januari","Februari","Machi","Aprili","Mei","Juni",
  "Julai","Agosti","Septemba","Oktoba","Novemba","Desemba",
];

interface OvertimeEntry {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_type: string;
  date: string;
  hours: number;
  amount: number;
  notes: string | null;
}

interface Employee {
  id: string;
  name: string;
  type: "casual" | "fulltime";
  department: string | null;
  daily_rate: number;
  monthly_salary: number;
  overtime_rule: string;
}

// Shift presets for casuals (morning=4.5h, afternoon=4.5h, full=9h)
const CASUAL_SHIFTS = [
  { label: "Asubuhi hadi Mchana (nusu siku)", hours: 4.5 },
  { label: "Mchana hadi Usiku (nusu siku)", hours: 4.5 },
  { label: "Siku Nzima (mchana + usiku)", hours: 9 },
];

export default function OvertimePage() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null);

  // Form state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [shiftPreset, setShiftPreset] = useState("");
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");

  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Employee[]>;
    },
  });

  const { data: entries, isLoading } = useQuery({
    queryKey: ["overtime", selectedMonth, selectedYear],
    queryFn: async () => {
      const params = new URLSearchParams({ month: selectedMonth, year: String(selectedYear) });
      const res = await fetch(`/api/overtime?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<OvertimeEntry[]>;
    },
  });

  const selectedEmployee = employees?.find((e) => e.id === selectedEmployeeId) ?? null;
  const isCasual = selectedEmployee?.type === "casual";

  // Preview amount
  const previewHours = isCasual
    ? (shiftPreset ? parseFloat(shiftPreset) : parseFloat(hours) || 0)
    : parseFloat(hours) || 0;
  const previewAmount = selectedEmployee
    ? isCasual
      ? Math.round((previewHours / 9) * selectedEmployee.daily_rate)
      : Math.round((selectedEmployee.monthly_salary / 28 / 9) * previewHours)
    : 0;

  const addMutation = useMutation({
    mutationFn: async () => {
      const h = previewHours;
      if (!selectedEmployeeId || !date || !h) throw new Error("Jaza sehemu zote");
      const res = await fetch("/api/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: selectedEmployeeId, date, hours: h, notes: notes || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Hitilafu");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Overtime imewekwa" });
      queryClient.invalidateQueries({ queryKey: ["overtime"] });
      setDialogOpen(false);
      setSelectedEmployeeId("");
      setDate(new Date().toISOString().split("T")[0]);
      setShiftPreset("");
      setHours("");
      setNotes("");
    },
    onError: (e: Error) => toast({ title: "Hitilafu", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/overtime", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Hitilafu ya kufuta");
    },
    onSuccess: () => {
      toast({ title: "Imefutwa" });
      queryClient.invalidateQueries({ queryKey: ["overtime"] });
    },
    onError: (e: Error) => toast({ title: "Hitilafu", description: e.message, variant: "destructive" }),
  });

  const filtered = (entries ?? []).filter((e) =>
    e.employee_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalAmount = filtered.reduce((s, e) => s + e.amount, 0);

  // Count entries per employee to know which names get a detail link
  const employeeEntryCount = filtered.reduce<Record<string, number>>((acc, e) => {
    acc[e.employee_id] = (acc[e.employee_id] ?? 0) + 1;
    return acc;
  }, {});

  const detailEntries = detailEmployeeId
    ? filtered.filter((e) => e.employee_id === detailEmployeeId)
    : [];
  const detailEmployee = detailEntries[0] ?? null;
  const detailTotal = detailEntries.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Overtime / Ziada ya Kazi</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Rekodi za kazi za ziada — {MONTHS[parseInt(selectedMonth) - 1]} {selectedYear}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Ongeza Overtime
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tafuta mfanyakazi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      {filtered.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-sm font-medium">Rekodi {filtered.length} — {MONTHS[parseInt(selectedMonth) - 1]} {selectedYear}</span>
            <span className="font-bold text-blue-700">{formatCurrency(totalAmount)}</span>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Hakuna rekodi za overtime {MONTHS[parseInt(selectedMonth) - 1]} {selectedYear}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mfanyakazi</TableHead>
                  <TableHead>Aina</TableHead>
                  <TableHead>Tarehe</TableHead>
                  <TableHead className="text-center">Saa</TableHead>
                  <TableHead className="text-right">Kiasi</TableHead>
                  <TableHead className="hidden sm:table-cell">Maelezo</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {employeeEntryCount[entry.employee_id] > 1 ? (
                        <button
                          className="text-blue-600 hover:underline text-left"
                          onClick={() => setDetailEmployeeId(entry.employee_id)}
                        >
                          {entry.employee_name}
                        </button>
                      ) : (
                        entry.employee_name
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.employee_type === "casual" ? "secondary" : "outline"}>
                        {entry.employee_type === "casual" ? "Mkataba" : "Kudumu"}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(entry.date)}</TableCell>
                    <TableCell className="text-center">
                      {entry.hours === 4.5 ? "4.5 (nusu siku)" : entry.hours === 9 ? "9 (siku nzima)" : entry.hours}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-blue-700">
                      {formatCurrency(entry.amount)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                      {entry.notes ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => deleteMutation.mutate(entry.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Employee Detail Dialog */}
      <Dialog open={!!detailEmployeeId} onOpenChange={(open) => { if (!open) setDetailEmployeeId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Overtime — {detailEmployee?.employee_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {detailEntries.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between rounded-lg border p-3 gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{formatDate(entry.date)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {entry.hours === 4.5
                      ? "4.5 saa (nusu siku)"
                      : entry.hours === 9
                      ? "9 saa (siku nzima)"
                      : `${entry.hours} saa`}
                    {entry.notes ? ` — ${entry.notes}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-semibold text-blue-700">{formatCurrency(entry.amount)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-500 hover:text-red-700 h-7 w-7 p-0"
                    onClick={() => deleteMutation.mutate(entry.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {detailEntries.length > 1 && (
              <div className="flex justify-between items-center border-t pt-2 font-semibold text-sm">
                <span>Jumla ({detailEntries.length} rekodi)</span>
                <span className="text-blue-700">{formatCurrency(detailTotal)}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailEmployeeId(null)}>Funga</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ongeza Overtime</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Employee */}
            <div className="space-y-1">
              <Label>Mfanyakazi</Label>
              <Select value={selectedEmployeeId} onValueChange={(v) => { setSelectedEmployeeId(v); setShiftPreset(""); setHours(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Chagua mfanyakazi..." />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? [])
                    .filter((e) => e.overtime_rule !== "none")
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} — {e.type === "casual" ? "Mkataba" : "Kudumu"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {employees && employees.filter((e) => e.overtime_rule === "none").length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Wafanyakazi wasio na ruhusa ya overtime hawaorodheshwa. Badilisha kwenye ukurasa wa Wafanyakazi.
                </p>
              )}
            </div>

            {/* Date */}
            <div className="space-y-1">
              <Label>Tarehe</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            {/* Casual shift selector OR fulltime hours input */}
            {selectedEmployee && (
              <div className="space-y-1">
                {isCasual ? (
                  <>
                    <Label>Kipindi cha Kazi</Label>
                    <Select value={shiftPreset} onValueChange={setShiftPreset}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chagua kipindi..." />
                      </SelectTrigger>
                      <SelectContent>
                        {CASUAL_SHIFTS.map((s) => (
                          <SelectItem key={s.label} value={String(s.hours)}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : (
                  <>
                    <Label>Idadi ya Saa</Label>
                    <Input
                      type="number"
                      min="0.5"
                      step="0.5"
                      placeholder="e.g. 4.5"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                    />
                  </>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1">
              <Label>Maelezo (hiari)</Label>
              <Input placeholder="e.g. Kazi ya dharura usiku" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {/* Preview */}
            {previewAmount > 0 && (
              <div className="rounded-lg bg-muted p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Malipo ya overtime ({previewHours} saa)
                </span>
                <span className="font-bold text-blue-700">{formatCurrency(previewAmount)}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Ghairi</Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !selectedEmployeeId || !date || previewAmount <= 0}
            >
              {addMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Hifadhi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
