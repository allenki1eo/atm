"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, X, Clock, Minus, Search, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Status = "present" | "absent" | "late" | "half_day";

interface AttendanceRecord {
  employee_id: string;
  employee_name: string;
  department: string | null;
  type: string;
  status: Status | null;
  is_locked: number;
  notes: string | null;
}

const statusConfig: Record<Status, { label: string; icon: React.ElementType; btn: string; badge: string }> = {
  present: { label: "Alikuwepo", icon: Check, btn: "bg-green-500 hover:bg-green-600 text-white", badge: "bg-green-100 text-green-800 border-green-200" },
  absent:  { label: "Hakuwepo",  icon: X,     btn: "bg-red-500 hover:bg-red-600 text-white",     badge: "bg-red-100 text-red-800 border-red-200" },
  late:    { label: "Alichelewa",icon: Clock,  btn: "bg-amber-500 hover:bg-amber-600 text-white", badge: "bg-amber-100 text-amber-800 border-amber-200" },
  half_day:{ label: "Nusu Siku", icon: Minus,  btn: "bg-blue-500 hover:bg-blue-600 text-white",  badge: "bg-blue-100 text-blue-800 border-blue-200" },
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendanceEditPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayString());
  const [search, setSearch] = useState("");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: records, isLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["attendance", "edit", date],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/today?date=${date}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const markMutation = useMutation({
    mutationFn: async ({ employee_id, status }: { employee_id: string; status: Status }) => {
      const res = await fetch("/api/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id, date, status, force: true }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Imeshindwa");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance", "edit", date] });
    },
    onError: (err) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (status: Status) => {
      const res = await fetch("/api/attendance/bulk-mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_ids: Array.from(selected),
          dates: [date],
          status,
          force: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Imeshindwa");
      }
      return res.json() as Promise<{ created: number; updated: number; skipped: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["attendance", "edit", date] });
      setSelected(new Set());
      toast({
        title: "Imehifadhiwa",
        description: `Waliobadilishwa: ${data.updated + data.created}, Waliorukwa: ${data.skipped}`,
      });
    },
    onError: (err) => {
      toast({ title: "Hitilafu", description: err.message, variant: "destructive" });
    },
  });

  const handleMark = async (employee_id: string, status: Status) => {
    setSavingIds((p) => new Set([...p, employee_id]));
    try {
      await markMutation.mutateAsync({ employee_id, status });
    } finally {
      setSavingIds((p) => { const n = new Set(p); n.delete(employee_id); return n; });
    }
  };

  const filtered = (records ?? []).filter((r) =>
    r.employee_name.toLowerCase().includes(search.toLowerCase()) ||
    (r.department ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const lockedCount = filtered.filter((r) => r.is_locked).length;
  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.employee_id));
  const someSelected = filtered.some((r) => selected.has(r.employee_id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected((p) => {
        const n = new Set(p);
        filtered.forEach((r) => n.delete(r.employee_id));
        return n;
      });
    } else {
      setSelected((p) => new Set([...p, ...filtered.map((r) => r.employee_id)]));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const isBulkSaving = bulkMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Hariri Mahudhurio</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Admin anaweza kubadilisha hali ya mahudhurio kwa tarehe yoyote (malalamiko)
        </p>
      </div>

      {/* Date picker + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setSelected(new Set()); }}
          className="w-full sm:w-48"
        />
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tafuta mfanyakazi au idara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Locked warning */}
      {lockedCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>{lockedCount}</strong> rekodi zimefungwa — zinaweza kubadilishwa na admin (mabadiliko yatahifadhiwa).
          </span>
        </div>
      )}

      {/* Summary */}
      {records && records.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {(["present","late","absent","half_day"] as Status[]).map((s) => {
            const cfg = statusConfig[s];
            const count = filtered.filter((r) => r.status === s).length;
            return (
              <Card key={s}>
                <CardContent className="p-2 text-center">
                  <p className="text-lg font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground truncate">{cfg.label}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2.5">
          <span className="text-sm font-medium text-muted-foreground mr-1">
            {selected.size} wamechaguliwa:
          </span>
          {(["present","absent","late","half_day"] as Status[]).map((s) => {
            const cfg = statusConfig[s];
            return (
              <Button
                key={s}
                size="sm"
                disabled={isBulkSaving}
                onClick={() => bulkMutation.mutate(s)}
                className={cn("h-8 gap-1.5 text-xs", cfg.btn)}
              >
                <cfg.icon className="h-3.5 w-3.5" />
                {cfg.label}
              </Button>
            );
          })}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs ml-auto"
            onClick={() => setSelected(new Set())}
            disabled={isBulkSaving}
          >
            Ghairi
          </Button>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Chagua wote"
                    disabled={filtered.length === 0}
                  />
                </TableHead>
                <TableHead>Mfanyakazi</TableHead>
                <TableHead className="hidden sm:table-cell">Idara</TableHead>
                <TableHead>Hali ya Sasa</TableHead>
                <TableHead>Badilisha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Inapakia...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Hakuna wafanyakazi kwa tarehe hii
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((rec) => {
                  const cfg = rec.status ? statusConfig[rec.status] : null;
                  const saving = savingIds.has(rec.employee_id);
                  const isSelected = selected.has(rec.employee_id);
                  return (
                    <TableRow
                      key={rec.employee_id}
                      className={cn(
                        saving && "opacity-60",
                        isSelected && "bg-muted/40"
                      )}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(rec.employee_id)}
                          aria-label={`Chagua ${rec.employee_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{rec.employee_name}</p>
                          {rec.is_locked ? (
                            <span className="text-xs text-amber-600 font-medium">🔒 Imefungwa</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{rec.type}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {rec.department ?? "—"}
                      </TableCell>
                      <TableCell>
                        {cfg ? (
                          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", cfg.badge)}>
                            <cfg.icon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Bado</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {(["present","absent","late","half_day"] as Status[]).map((s) => {
                            const c = statusConfig[s];
                            const isActive = rec.status === s;
                            return (
                              <button
                                key={s}
                                onClick={() => handleMark(rec.employee_id, s)}
                                disabled={saving || isBulkSaving}
                                title={c.label}
                                className={cn(
                                  "h-7 w-7 rounded flex items-center justify-center text-xs font-medium transition-all",
                                  isActive ? c.btn : "bg-muted hover:bg-muted/70 text-muted-foreground"
                                )}
                              >
                                <c.icon className="h-3.5 w-3.5" />
                              </button>
                            );
                          })}
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
    </div>
  );
}
