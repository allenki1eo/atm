"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Download, CheckCircle2, XCircle, Loader2, FileText, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

interface ImportResult {
  phone: string;
  name: string | null;
  dates_processed: number;
  dates_skipped: number;
}

interface ImportSummary {
  total_employees: number;
  total_records_written: number;
  skipped_locked: number;
}

function generateTemplate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  const dates: string[] = [];
  for (let d = 1; d <= day; d++) {
    dates.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  const header = ["phone", ...dates].join(",");
  const example1 = ["+255712345001", ...dates.map(() => "P")].join(",");
  const example2 = ["+255712345002", ...dates.map((_, i) => (i % 5 === 4 ? "A" : "P"))].join(",");
  const csv = [header, example1, example2].join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance_import_${year}-${String(month).padStart(2, "0")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AttendanceImportPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const role = (session?.user as { role?: string })?.role;

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium">Ruhusa Inahitajika</p>
        <p className="text-muted-foreground text-sm mt-1">Ukurasa huu unapatikana kwa wasimamizi tu.</p>
      </div>
    );
  }

  const handleImport = async () => {
    if (!csvFile) return;
    setImporting(true);
    setResults(null);
    setSummary(null);

    const formData = new FormData();
    formData.append("file", csvFile);

    try {
      const res = await fetch("/api/attendance/bulk-import", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        toast({ title: "Import imeshindwa", description: data.error, variant: "destructive" });
        return;
      }

      setResults(data.results);
      setSummary(data.summary);
      queryClient.invalidateQueries({ queryKey: ["attendance"] });

      toast({
        title: `Import imekamilika`,
        description: `Rekodi ${data.summary.total_records_written} zimeingizwa kwa wafanyakazi ${data.summary.total_employees}.`,
      });
    } catch {
      toast({ title: "Hitilafu ya mtandao", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setCsvFile(null);
    setResults(null);
    setSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Ingiza Mahudhurio kwa CSV</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Pakia faili ya CSV kwa rekodi za mahudhurio — inafaa kwa kuongeza data za nyuma
        </p>
      </div>

      {/* Format guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Muundo wa CSV
          </CardTitle>
          <CardDescription>Safu ya kwanza ni nambari ya simu, kisha tarehe moja kwa safu</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto">
            <p>phone,2026-04-01,2026-04-02,2026-04-03,...</p>
            <p>+255712345001,P,P,A,...</p>
            <p>+255712345002,P,L,P,...</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {[
              { code: "P", label: "Present (Alikuwepo)", color: "bg-green-100 text-green-800" },
              { code: "A", label: "Absent (Hakuwepo)", color: "bg-red-100 text-red-800" },
              { code: "L", label: "Late (Alichelewa)", color: "bg-amber-100 text-amber-800" },
              { code: "H", label: "Half Day (Nusu Siku)", color: "bg-blue-100 text-blue-800" },
            ].map((s) => (
              <span key={s.code} className={`rounded px-2 py-1 font-medium ${s.color}`}>
                {s.code} = {s.label}
              </span>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={generateTemplate}>
            <Download className="h-4 w-4 mr-2" />
            Pakua Kiolezo (mwezi huu)
          </Button>
        </CardContent>
      </Card>

      {results ? (
        /* Results view */
        <div className="space-y-4">
          {summary && (
            <div className="grid grid-cols-3 gap-2">
              <Card><CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-green-600">{summary.total_records_written}</p>
                <p className="text-xs text-muted-foreground">Zilizoingizwa</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-blue-600">{summary.total_employees}</p>
                <p className="text-xs text-muted-foreground">Wafanyakazi</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-amber-600">{summary.skipped_locked}</p>
                <p className="text-xs text-muted-foreground">Zilizorukwa</p>
              </CardContent></Card>
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Simu</TableHead>
                  <TableHead>Jina</TableHead>
                  <TableHead>Tarehe Zilizoingizwa</TableHead>
                  <TableHead>Zilizorukwa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.phone}>
                    <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                    <TableCell>
                      {r.name ?? (
                        <span className="flex items-center gap-1 text-destructive text-xs">
                          <XCircle className="h-3 w-3" /> Hajapatikana
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="h-3 w-3" />
                        {r.dates_processed}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.dates_skipped}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={reset}>Ingiza Faili Nyingine</Button>
          </div>
        </div>
      ) : (
        /* Upload form */
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label>Chagua Faili ya CSV</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer"
              />
              {csvFile && (
                <p className="text-xs text-muted-foreground">
                  Faili iliyochaguliwa: <span className="font-medium">{csvFile.name}</span>{" "}
                  ({(csvFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <strong>Kumbuka:</strong> Tarehe zilizofungwa na za baadaye zitarukwa. Data iliyopo
              itabadilishwa na data mpya (isipokuwa imefungwa).
            </div>

            <Button onClick={handleImport} disabled={!csvFile || importing} className="w-full sm:w-auto">
              {importing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Inaingiza...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" />Ingiza Mahudhurio</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
