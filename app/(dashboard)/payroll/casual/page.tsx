"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Download, Search, Building2, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

interface EmployeeRow {
  employee_id: string;
  employee_name: string;
  daily_rate: number;
  company_id: string | null;
  company_name: string;
  section_id: string | null;
  section_name: string;
  days_worked: number;
  gross_amount: number;
  advances: number;
  net_amount: number;
}

const MONTHS = [
  "Januari","Februari","Machi","Aprili","Mei","Juni",
  "Julai","Agosti","Septemba","Oktoba","Novemba","Desemba",
];

export default function CasualPayrollPage() {
  const now = new Date();
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedYear] = useState(now.getFullYear());
  const [collapsedCompanies, setCollapsedCompanies] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "casual", selectedMonth, selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/payroll/casual?month=${selectedMonth}&year=${selectedYear}`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ employees: EmployeeRow[]; month: number; year: number }>;
    },
  });

  const allRows: EmployeeRow[] = data?.employees ?? [];

  const filtered = allRows.filter((r) =>
    r.employee_name.toLowerCase().includes(search.toLowerCase()) ||
    r.company_name.toLowerCase().includes(search.toLowerCase()) ||
    r.section_name.toLowerCase().includes(search.toLowerCase())
  );

  // Group by company → section
  const grouped = new Map<string, { company_name: string; sections: Map<string, EmployeeRow[]> }>();
  for (const row of filtered) {
    const cKey = row.company_id ?? "__none__";
    if (!grouped.has(cKey)) {
      grouped.set(cKey, { company_name: row.company_name, sections: new Map() });
    }
    const company = grouped.get(cKey)!;
    const sKey = row.section_id ?? "__none__";
    if (!company.sections.has(sKey)) {
      company.sections.set(sKey, []);
    }
    company.sections.get(sKey)!.push(row);
  }

  const totalGross = filtered.reduce((s, r) => s + r.gross_amount, 0);
  const totalNet = filtered.reduce((s, r) => s + r.net_amount, 0);
  const totalAdvances = filtered.reduce((s, r) => s + r.advances, 0);

  const toggleCompany = (key: string) => {
    setCollapsedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportCSV = () => {
    const header = "Kampuni,Sehemu,Jina,Siku,Kiwango,Jumla,Mikopo,Malipo\n";
    const rows_csv = filtered.map((r) =>
      `"${r.company_name}","${r.section_name}","${r.employee_name}",${r.days_worked},${r.daily_rate},${r.gross_amount},${r.advances},${r.net_amount}`
    ).join("\n");
    const blob = new Blob([header + rows_csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `malipo-mkataba-${MONTHS[parseInt(selectedMonth) - 1]}-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Mshahara wa Mkataba</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Mahesabu ya moja kwa moja kutoka mahudhurio — {MONTHS[parseInt(selectedMonth) - 1]} {selectedYear}
          </p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={!filtered.length} className="w-full sm:w-auto">
          <Download className="h-4 w-4 mr-2" />
          Hamisha CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tafuta mfanyakazi, kampuni au sehemu..."
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

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Jumla Gross</p>
            <p className="text-lg font-bold text-blue-700">{formatCurrency(totalGross)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Mikopo</p>
            <p className="text-lg font-bold text-red-600">-{formatCurrency(totalAdvances)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Jumla Malipo</p>
            <p className="text-lg font-bold text-green-700">{formatCurrency(totalNet)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Grouped tables */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {allRows.length === 0
              ? "Hakuna wafanyakazi wa mkataba waliowekwa kwenye mfumo"
              : "Hakuna wafanyakazi wanaolingana na utafutaji"}
          </CardContent>
        </Card>
      ) : (
        Array.from(grouped.entries()).map(([cKey, { company_name, sections }]) => {
          const companyRows = Array.from(sections.values()).flat();
          const companyGross = companyRows.reduce((s, r) => s + r.gross_amount, 0);
          const companyNet = companyRows.reduce((s, r) => s + r.net_amount, 0);
          const isCollapsed = collapsedCompanies.has(cKey);

          return (
            <Card key={cKey} className="overflow-hidden">
              {/* Company header */}
              <CardHeader
                className="py-3 px-4 bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors"
                onClick={() => toggleCompany(cKey)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isCollapsed
                      ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    }
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <CardTitle className="text-sm font-semibold truncate">{company_name}</CardTitle>
                    <span className="text-xs text-muted-foreground shrink-0">({companyRows.length})</span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Malipo</p>
                    <p className="text-sm font-bold text-green-700">{formatCurrency(companyNet)}</p>
                  </div>
                </div>
              </CardHeader>

              {!isCollapsed && (
                <div>
                  {Array.from(sections.entries()).map(([sKey, employees]) => {
                    const sectionGross = employees.reduce((s, r) => s + r.gross_amount, 0);
                    const sectionNet = employees.reduce((s, r) => s + r.net_amount, 0);
                    const sectionName = employees[0]?.section_name ?? "Sehemu Haijawekwa";

                    return (
                      <div key={sKey}>
                        {/* Section sub-header */}
                        <div className="px-4 py-2 bg-muted/20 border-t flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {sectionName} — {employees.length} wafanyakazi
                          </span>
                          <span className="text-xs font-medium text-green-700">
                            {formatCurrency(sectionNet)}
                          </span>
                        </div>

                        {/* Employees table */}
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/10">
                                <TableHead>Jina</TableHead>
                                <TableHead className="text-center">Siku</TableHead>
                                <TableHead className="hidden sm:table-cell text-right">Kiwango</TableHead>
                                <TableHead className="hidden sm:table-cell text-right">Gross</TableHead>
                                <TableHead className="hidden sm:table-cell text-right">Mikopo</TableHead>
                                <TableHead className="text-right">Malipo</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {employees.map((row) => (
                                <TableRow key={row.employee_id}>
                                  <TableCell className="font-medium text-sm">{row.employee_name}</TableCell>
                                  <TableCell className="text-center text-sm">{row.days_worked}</TableCell>
                                  <TableCell className="hidden sm:table-cell text-right text-sm text-muted-foreground">
                                    {formatCurrency(row.daily_rate)}
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell text-right text-sm text-blue-700">
                                    {formatCurrency(row.gross_amount)}
                                  </TableCell>
                                  <TableCell className="hidden sm:table-cell text-right text-sm text-red-600">
                                    {row.advances > 0 ? `-${formatCurrency(row.advances)}` : "—"}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold text-green-700">
                                    {formatCurrency(row.net_amount)}
                                  </TableCell>
                                </TableRow>
                              ))}
                              {/* Section subtotal */}
                              <TableRow className="bg-muted/20 font-medium border-t-2">
                                <TableCell colSpan={2} className="text-sm">Jumla ya Sehemu</TableCell>
                                <TableCell className="hidden sm:table-cell" />
                                <TableCell className="hidden sm:table-cell text-right text-sm text-blue-700">
                                  {formatCurrency(sectionGross)}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell" />
                                <TableCell className="text-right font-bold text-green-700">
                                  {formatCurrency(sectionNet)}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })}

                  {/* Company total */}
                  <div className="px-4 py-3 bg-muted/30 border-t flex items-center justify-between">
                    <span className="text-sm font-semibold">Jumla ya {company_name}</span>
                    <div className="text-right">
                      <span className="text-sm text-muted-foreground mr-4">
                        Gross: {formatCurrency(companyGross)}
                      </span>
                      <span className="text-sm font-bold text-green-700">
                        Malipo: {formatCurrency(companyNet)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })
      )}

      {/* Grand total */}
      {filtered.length > 0 && (
        <Card className="border-2 border-green-200 bg-green-50/50">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="font-semibold text-sm">Jumla Kuu — {MONTHS[parseInt(selectedMonth) - 1]} {selectedYear}</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>Wafanyakazi: <strong>{filtered.length}</strong></span>
                <span className="text-blue-700">Gross: <strong>{formatCurrency(totalGross)}</strong></span>
                <span className="text-red-600">Mikopo: <strong>-{formatCurrency(totalAdvances)}</strong></span>
                <span className="text-green-700">Malipo: <strong>{formatCurrency(totalNet)}</strong></span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
