"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, Lock, Plus, CheckCircle, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

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

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const statusConfig = {
  open: { label: "Open", variant: "info" as const, icon: Clock },
  locked: { label: "Locked", variant: "warning" as const, icon: Lock },
  paid: { label: "Paid", variant: "success" as const, icon: CheckCircle },
};

export default function PayrollPeriodsPage() {
  const queryClient = useQueryClient();
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<{ month: number; year: number } | null>(null);
  const [sendSms, setSendSms] = useState(true);
  const [lockCompanyId, setLockCompanyId] = useState<string>("__all__");

  const now = new Date();

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

  const lockMutation = useMutation({
    mutationFn: async ({ month, year }: { month: number; year: number }) => {
      const res = await fetch("/api/payroll/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          year,
          send_sms: sendSms,
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
        title: "Period locked",
        description: `Payroll locked. ${data.sms_sent} SMS notifications sent.`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to lock period", variant: "destructive" });
    },
  });

  const openLockDialog = (month: number, year: number) => {
    setSelectedPeriod({ month, year });
    setLockDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Payroll Periods</h1>
          </div>
          <p className="text-muted-foreground mt-1">Manage and lock payroll periods</p>
        </div>
        <Button
          onClick={() => openLockDialog(now.getMonth() + 1, now.getFullYear())}
        >
          <Lock className="h-4 w-4 mr-2" />
          Lock Current Month
        </Button>
      </div>

      {/* Current month quick info */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Current Period: {MONTHS[now.getMonth()]} {now.getFullYear()}
          </CardTitle>
          <CardDescription>
            {new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-US", { month: "long", day: "numeric" })} —{" "}
            {new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => openLockDialog(now.getMonth() + 1, now.getFullYear())}
            className="w-full sm:w-auto"
          >
            <Lock className="h-4 w-4 mr-2" />
            Lock & Generate Payslips
          </Button>
        </CardContent>
      </Card>

      {/* Periods table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Locked At</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : !periods?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No payroll periods yet. Lock the current month to create one.
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
                      {period.company_name ?? "Makampuni yote"}
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
                      {period.status === "open" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openLockDialog(period.month, period.year)}
                        >
                          <Lock className="h-3 w-3 mr-1" />
                          Lock
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

      {/* Lock confirmation dialog */}
      <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-500" />
              Lock Payroll Period
            </DialogTitle>
            <DialogDescription>
              This will lock{" "}
              {selectedPeriod
                ? `${MONTHS[selectedPeriod.month - 1]} ${selectedPeriod.year}`
                : "the selected period"}{" "}
              and generate payslips for all employees.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Company</label>
              <Select value={lockCompanyId} onValueChange={setLockCompanyId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All companies (global lock)</SelectItem>
                  {companies?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Locking per company keeps other companies&apos; months open.
              </p>
            </div>

            <div className="rounded-lg border p-3 bg-muted/20 text-sm space-y-1">
              <p className="font-medium">What happens when you lock:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5 text-xs">
                <li>Attendance for this scope and period is frozen</li>
                <li>Payslips are calculated for the selected employees</li>
                <li>SMS notifications sent (if enabled)</li>
                <li>No further attendance edits for this scope and period</li>
              </ul>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendSms}
                onChange={(e) => setSendSms(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Send SMS notifications to employees</span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLockDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedPeriod && lockMutation.mutate(selectedPeriod)}
              disabled={lockMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {lockMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
              ) : (
                "Lock & Generate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
