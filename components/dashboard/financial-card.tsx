"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface FinancialCardProps {
  employeeId: string;
  onRequestAdvance?: () => void;
}

export function FinancialCard({ employeeId, onRequestAdvance }: FinancialCardProps) {
  const now = new Date();

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "current", employeeId, now.getFullYear(), now.getMonth() + 1],
    queryFn: async () => {
      const res = await fetch(
        `/api/payroll/current?employee_id=${employeeId}&year=${now.getFullYear()}&month=${now.getMonth() + 1}`
      );
      if (!res.ok) throw new Error("Failed to fetch payroll data");
      return res.json();
    },
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { financial, attendance, employee, period } = data;
  const isPositive = financial.net_amount >= 0;
  const monthName = new Date(period.year, period.month - 1, 1).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <Card className={cn("border-l-4", isPositive ? "border-l-green-500" : "border-l-red-500")}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Financial Summary</CardTitle>
          <Badge variant={isPositive ? "success" : "destructive"}>
            {monthName}
          </Badge>
        </div>
        <CardDescription>Muhtasari wa mapato ya mwezi huu</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Net balance - hero number */}
        <div className={cn(
          "rounded-lg p-4 text-center",
          isPositive ? "bg-green-50" : "bg-red-50"
        )}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Bakaa ya Wazi
          </p>
          <div className="flex items-center justify-center gap-2">
            {isPositive ? (
              <TrendingUp className="h-5 w-5 text-green-600" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-600" />
            )}
            <p className={cn(
              "text-3xl font-bold",
              isPositive ? "text-green-700" : "text-red-700"
            )}>
              {formatCurrency(Math.abs(financial.net_amount))}
            </p>
          </div>
          {!isPositive && (
            <p className="text-xs text-red-600 mt-1">Deni kwa kampuni</p>
          )}
        </div>

        {/* Breakdown */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">
              {employee.type === "casual"
                ? `Siku ${attendance.effective_days} × ${formatCurrency(financial.daily_rate)}/siku`
                : "Mshahara wa mwezi"}
            </span>
            <span className="font-medium text-green-700">
              <ArrowUpRight className="h-3 w-3 inline" />
              {formatCurrency(financial.gross_amount)}
            </span>
          </div>

          {financial.total_advances > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Mikopo iliyochukuliwa</span>
              <span className="font-medium text-red-600">
                <ArrowDownRight className="h-3 w-3 inline" />
                -{formatCurrency(financial.total_advances)}
              </span>
            </div>
          )}

          <div className="border-t pt-2 flex justify-between items-center text-sm font-semibold">
            <span>Malipo ya Wazi</span>
            <span className={isPositive ? "text-green-700" : "text-red-700"}>
              {formatCurrency(financial.net_amount)}
            </span>
          </div>
        </div>

        {/* Attendance summary */}
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-3">
          <div className="text-center">
            <p className="text-lg font-bold text-green-700">{attendance.present}</p>
            <p className="text-xs text-muted-foreground">Alikuwepo</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-amber-700">{attendance.late}</p>
            <p className="text-xs text-muted-foreground">Alichelewa</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-700">{attendance.absent}</p>
            <p className="text-xs text-muted-foreground">Hakuwepo</p>
          </div>
        </div>

        {onRequestAdvance && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onRequestAdvance}
          >
            <DollarSign className="h-4 w-4 mr-2" />
            Angalia Salary Advance
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
