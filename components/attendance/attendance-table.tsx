"use client";

import { useState, useCallback } from "react";
import { Check, Clock, X, Minus, Search, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useMarkAttendance,
  type AttendanceRecord,
} from "@/hooks/use-attendance";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type AttendanceStatus = "present" | "absent" | "late" | "half_day";

interface AttendanceTableProps {
  records: AttendanceRecord[];
  isLoading: boolean;
  date: string;
  isLocked?: boolean;
}

const statusConfig = {
  present: { label: "Alikuwepo", icon: Check, color: "bg-green-100 text-green-800 border-green-200", btnColor: "bg-green-500 hover:bg-green-600 text-white" },
  absent: { label: "Hakuwepo", icon: X, color: "bg-red-100 text-red-800 border-red-200", btnColor: "bg-red-500 hover:bg-red-600 text-white" },
  late: { label: "Alichelewa", icon: Clock, color: "bg-amber-100 text-amber-800 border-amber-200", btnColor: "bg-amber-500 hover:bg-amber-600 text-white" },
  half_day: { label: "Nusu Siku", icon: Minus, color: "bg-blue-100 text-blue-800 border-blue-200", btnColor: "bg-blue-500 hover:bg-blue-600 text-white" },
};

export function AttendanceTable({ records, isLoading, date, isLocked = false }: AttendanceTableProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState("");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const markAttendance = useMarkAttendance();

  const filtered = records.filter((r) =>
    r.employee_name.toLowerCase().includes(search.toLowerCase()) ||
    r.department?.toLowerCase().includes(search.toLowerCase())
  );

  const handleMark = useCallback(
    async (employeeId: string, status: AttendanceStatus, notes?: string) => {
      if (isLocked) return;
      setSavingIds((prev) => new Set([...prev, employeeId]));
      try {
        await markAttendance.mutateAsync({ employee_id: employeeId, date, status, notes });
        toast({ title: "Saved", description: `Attendance marked as ${status}` });
      } finally {
        setSavingIds((prev) => { const next = new Set(prev); next.delete(employeeId); return next; });
      }
    },
    [markAttendance, date, isLocked]
  );

  const handleBulkMark = async (status: AttendanceStatus) => {
    if (selected.size === 0) return;
    const ids = [...selected];
    for (const id of ids) {
      await handleMark(id, status);
    }
    setSelected(new Set());
    toast({ title: "Bulk update complete", description: `${ids.length} employees marked as ${status}` });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((r) => r.employee_id)));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const allPresent = filtered.every((r) => r.status === "present");
  const summary = {
    present: records.filter((r) => r.status === "present").length,
    absent: records.filter((r) => r.status === "absent").length,
    late: records.filter((r) => r.status === "late").length,
    unmarked: records.filter((r) => !r.status).length,
  };

  return (
    <div className="space-y-4">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="success">{summary.present} Walikuwepo</Badge>
        <Badge variant="destructive">{summary.absent} Hawakuwepo</Badge>
        <Badge variant="warning">{summary.late} Walichelewa</Badge>
        <Badge variant="outline">{summary.unmarked} Hawajawekwa</Badge>
      </div>

      {/* Search and bulk actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tafuta kwa jina au idara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {!isLocked && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkMark("present")}
              disabled={selected.size === 0}
              className="text-green-700 border-green-200 hover:bg-green-50"
            >
              <CheckSquare className="h-4 w-4 mr-1" />
              Walikuwepo ({selected.size})
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkMark("absent")}
              disabled={selected.size === 0}
              className="text-red-700 border-red-200 hover:bg-red-50"
            >
              Hawakuwepo
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              {!isLocked && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              <TableHead>Mfanyakazi</TableHead>
              <TableHead className="hidden sm:table-cell">Idara</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Maelezo</TableHead>
              {!isLocked && <TableHead className="w-40">Vitendo</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No employees found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((record) => {
                const isSaving = savingIds.has(record.employee_id);
                const config = record.status ? statusConfig[record.status] : null;

                return (
                  <TableRow
                    key={record.employee_id}
                    className={cn(
                      selected.has(record.employee_id) && "bg-blue-50/50",
                      isSaving && "opacity-60"
                    )}
                  >
                    {!isLocked && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(record.employee_id)}
                          onCheckedChange={() => toggleSelect(record.employee_id)}
                          aria-label={`Select ${record.employee_name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{record.employee_name}</p>
                        <p className="text-xs text-muted-foreground">{record.type}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {record.department ?? "—"}
                    </TableCell>
                    <TableCell>
                      {config ? (
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", config.color)}>
                          <config.icon className="h-3 w-3" />
                          {config.label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Bado</span>
                      )}
                      {isSaving && <span className="ml-2 text-xs text-muted-foreground animate-pulse">saving...</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {editingNotes === record.employee_id ? (
                        <div className="flex gap-2">
                          <Textarea
                            value={notesValue}
                            onChange={(e) => setNotesValue(e.target.value)}
                            className="h-8 min-h-0 text-xs resize-none"
                            rows={1}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (record.status) {
                                handleMark(record.employee_id, record.status, notesValue);
                              }
                              setEditingNotes(null);
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground truncate max-w-[120px] text-left"
                          onClick={() => {
                            if (!isLocked) {
                              setEditingNotes(record.employee_id);
                              setNotesValue(record.notes ?? "");
                            }
                          }}
                        >
                          {record.notes ?? (isLocked ? "—" : "Ongeza maelezo...")}
                        </button>
                      )}
                    </TableCell>
                    {!isLocked && (
                      <TableCell>
                        <div className="flex gap-1">
                          {(["present", "absent", "late"] as AttendanceStatus[]).map((s) => {
                            const c = statusConfig[s];
                            return (
                              <button
                                key={s}
                                onClick={() => handleMark(record.employee_id, s)}
                                disabled={isSaving}
                                className={cn(
                                  "h-7 w-7 rounded flex items-center justify-center text-xs font-medium transition-all",
                                  record.status === s
                                    ? c.btnColor
                                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                )}
                                title={c.label}
                                aria-label={`Mark ${record.employee_name} as ${c.label}`}
                              >
                                <c.icon className="h-3.5 w-3.5" />
                              </button>
                            );
                          })}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
