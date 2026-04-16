"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserCircle, DollarSign, Calendar as CalendarIcon, Loader2, FileText } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FinancialCard } from "@/components/dashboard/financial-card";
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

const advanceSchema = z.object({
  amount: z.number().min(1, "Amount must be at least $1"),
  description: z.string().min(3, "Please provide a reason"),
});
type AdvanceForm = z.infer<typeof advanceSchema>;

export default function MePage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [advanceOpen, setAdvanceOpen] = useState(false);

  const userId = session?.user?.id;

  // Fetch employee profile (if user is also an employee)
  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!userId,
  });

  // Fetch transactions
  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ["transactions", userId],
    queryFn: async () => {
      const res = await fetch(`/api/transactions/advance?employee_id=${userId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!userId,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdvanceForm>({
    resolver: zodResolver(advanceSchema),
  });

  const advanceMutation = useMutation({
    mutationFn: async (data: AdvanceForm) => {
      const res = await fetch("/api/transactions/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: userId,
          type: "advance_given",
          amount: Math.round(data.amount * 100),
          description: data.description,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["payroll", "current"] });
      setAdvanceOpen(false);
      reset();
      toast({ title: "Request submitted", description: "Your advance request has been submitted." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit request", variant: "destructive" });
    },
  });

  const role = (session?.user as { role?: string })?.role;

  // Find this user as an employee (for self-service view)
  const selfEmployee = Array.isArray(employees)
    ? employees.find((e: { id: string }) => e.id === userId) ?? employees[0]
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <UserCircle className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{session?.user?.name}</h1>
          <p className="text-muted-foreground capitalize">{role} · {session?.user?.email}</p>
        </div>
      </div>

      <Tabs defaultValue="financial">
        <TabsList className="grid w-full grid-cols-3 max-w-sm">
          <TabsTrigger value="financial">Financial</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Financial Tab */}
        <TabsContent value="financial" className="mt-4 space-y-4">
          {selfEmployee ? (
            <FinancialCard
              employeeId={selfEmployee.id}
              onRequestAdvance={() => setAdvanceOpen(true)}
            />
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>No employee record linked to your account.</p>
                <p className="text-xs mt-1">Contact HR to link your employee profile.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="mt-4">
          {selfEmployee ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Monthly Attendance
                </CardTitle>
                <CardDescription>Your attendance record for the current month</CardDescription>
              </CardHeader>
              <CardContent>
                <AttendanceCalendar employeeId={selfEmployee.id} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No attendance records found.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Transaction History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Transaction History
              </CardTitle>
              <CardDescription>Advances and payments</CardDescription>
            </CardHeader>
            <CardContent>
              {txLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : !txData?.transactions?.length ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No transactions found
                </p>
              ) : (
                <div className="space-y-2">
                  {txData.transactions.map((tx: {
                    id: string;
                    type: string;
                    amount: number;
                    description: string;
                    created_at: string;
                  }) => (
                    <div key={tx.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium capitalize">
                          {tx.type.replace(/_/g, " ")}
                        </p>
                        {tx.description && (
                          <p className="text-xs text-muted-foreground">{tx.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                      </div>
                      <Badge variant={tx.amount >= 0 ? "success" : "destructive"}>
                        {tx.amount >= 0 ? "+" : ""}{formatCurrency(tx.amount)}
                      </Badge>
                    </div>
                  ))}
                  <div className="border-t pt-3 flex justify-between font-semibold text-sm">
                    <span>Net Balance</span>
                    <span className={txData.balance >= 0 ? "text-green-700" : "text-red-700"}>
                      {formatCurrency(txData.balance)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Request Advance Dialog */}
      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Advance</DialogTitle>
            <DialogDescription>
              Submit an advance request to HR. Approved advances are deducted from your salary.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit((data) => advanceMutation.mutate(data))} className="space-y-4">
            <div className="space-y-2">
              <Label>Amount ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="1"
                placeholder="100.00"
                {...register("amount", { valueAsNumber: true })}
              />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input placeholder="Medical emergency, rent, etc." {...register("description")} />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdvanceOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={advanceMutation.isPending}>
                {advanceMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</>
                ) : "Submit Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
