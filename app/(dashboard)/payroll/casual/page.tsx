"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Download, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

interface PayslipRow {
  employee_id: string;
  employee_name: string;
  type: string;
  days_worked: number;
  daily_rate: number;
  gross_amount: number;
  total_advances: number;
  net_amount: number;
  sent_sms: number;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export default function CasualPayrollPage() {
  const now = new Date();
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedYear] = useState(now.getFullYear());

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "casual", selectedMonth, selectedYear],
    queryFn: async () => {
      const res = await fetch(
        `/api/payroll/casual?month=${selectedMonth}&year=${selectedYear}`
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const rows: PayslipRow[] = data?.payslips ?? [];

  const filtered = rows.filter(
    (r) =>
      r.type === "casual" &&
      r.employee_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalGross = filtered.reduce((s, r) => s + r.gross_amount, 0);
  const totalNet = filtered.reduce((s, r) => s + r.net_amount, 0);
  const totalAdvances = filtered.reduce((s, r) => s + r.total_advances, 0);

  const exportCSV = () => {
    const header = "Name,Days Worked,Daily Rate,Gross,Advances,Net\n";
    const rows_csv = filtered
      .map(
        (r) =>
          `"${r.employee_name}",${r.days_worked},${formatCurrency(r.daily_rate)},${formatCurrency(r.gross_amount)},${formatCurrency(r.total_advances)},${formatCurrency(r.net_amount)}`
      )
      .join("\n");
    const blob = new Blob([header + rows_csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `casual-payroll-${MONTHS[parseInt(selectedMonth) - 1]}-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Casual Payroll</h1>
          </div>
          <p className="text-muted-foreground mt-1">View and export casual worker payroll</p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={!filtered.length}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employees..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => (
              <SelectItem key={i} value={String(i + 1)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Gross Total</p>
            <p className="text-xl font-bold text-blue-700">{formatCurrency(totalGross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Advances</p>
            <p className="text-xl font-bold text-red-600">-{formatCurrency(totalAdvances)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Net Payable</p>
            <p className="text-xl font-bold text-green-700">{formatCurrency(totalNet)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Days</TableHead>
              <TableHead>Rate/Day</TableHead>
              <TableHead>Gross</TableHead>
              <TableHead>Advances</TableHead>
              <TableHead>Net</TableHead>
              <TableHead>SMS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {data
                    ? "No casual employees found"
                    : "Lock the period first to generate payslips"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.employee_id}>
                  <TableCell className="font-medium">{row.employee_name}</TableCell>
                  <TableCell>{row.days_worked}</TableCell>
                  <TableCell>{formatCurrency(row.daily_rate)}</TableCell>
                  <TableCell className="text-blue-700">{formatCurrency(row.gross_amount)}</TableCell>
                  <TableCell className="text-red-600">
                    {row.total_advances > 0 ? `-${formatCurrency(row.total_advances)}` : "—"}
                  </TableCell>
                  <TableCell className="font-semibold text-green-700">
                    {formatCurrency(row.net_amount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.sent_sms ? "success" : "outline"}>
                      {row.sent_sms ? "Sent" : "Pending"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
