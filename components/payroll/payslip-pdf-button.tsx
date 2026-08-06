"use client";

import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { addDays, formatDays } from "@/lib/overtime";

const MONTHS = [
  "Januari", "Februari", "Machi", "Aprili", "Mei", "Juni",
  "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba",
];

interface Payslip {
  id: string;
  employee_id: string;
  period_id: string;
  days_worked: number;
  overtime_days: number | null;
  gross_amount: number;
  total_advances: number;
  net_amount: number;
  nssf_amount: number;
  cotwu_amount: number;
  fadhila_amount: number;
  heslb_amount: number;
  total_deductions: number;
  generated_at: string;
}

interface Employee {
  id: string;
  name: string;
  phone: string;
  type: "casual" | "fulltime";
  department: string | null;
  section_id: string | null;
  daily_rate: number;
  monthly_salary: number;
  deduct_nssf: number;
  deduct_cotwu: number;
  deduct_fadhila: number;
  heslb_amount: number;
}

interface Section {
  id: string;
  name: string;
}

interface Period {
  id: string;
  month: number;
  year: number;
  start_date: string;
  end_date: string;
}

interface PayslipDetail {
  payslip: Payslip;
  employee: Employee | null;
  section: Section | null;
  period: Period | null;
}

interface Props {
  payslipId: string;
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function PayslipPdfButton({ payslipId, label = "Pakua PDF", variant = "outline", size = "sm" }: Props) {
  const [loading, setLoading] = useState(false);
  const renderRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<PayslipDetail | null>(null);

  const download = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payslips/${payslipId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Imeshindwa kupakua");
      }
      const data = (await res.json()) as PayslipDetail;
      setDetail(data);

      // Wait for the DOM to render
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 50));

      const node = renderRef.current;
      if (!node) throw new Error("Element not ready");

      const [{ default: html2canvas }, jsPdfModule] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const JsPDF = jsPdfModule.jsPDF ?? jsPdfModule.default;

      const canvas = await html2canvas(node, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new JsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pdfHeight) {
        pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      } else {
        // Multi-page
        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
          heightLeft -= pdfHeight;
        }
      }

      const empName = (data.employee?.name ?? "payslip").replace(/\s+/g, "-");
      const periodLabel = data.period
        ? `${MONTHS[data.period.month - 1]}-${data.period.year}`
        : "";
      pdf.save(`Mshahara-${empName}-${periodLabel}.pdf`);

      toast({ title: "Imepakuliwa", description: "Kielelezo cha mshahara kimepakuliwa." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Imeshindwa";
      toast({ title: "Hitilafu", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
      setDetail(null);
    }
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={download} disabled={loading}>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5 mr-1.5" />
        )}
        {label}
      </Button>

      {/* Off-screen renderer for html2canvas */}
      {detail && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            left: "-10000px",
            top: 0,
            width: "794px",
            background: "#fff",
            zIndex: -1,
          }}
        >
          <div ref={renderRef}>
            <PayslipContent detail={detail} />
          </div>
        </div>
      )}
    </>
  );
}

function PayslipContent({ detail }: { detail: PayslipDetail }) {
  const { payslip, employee, section, period } = detail;
  const isFulltime = employee?.type === "fulltime";

  const nssfAmt = payslip.nssf_amount ?? 0;
  const cotwuAmt = payslip.cotwu_amount ?? 0;
  const fadhilaAmt = payslip.fadhila_amount ?? (employee?.deduct_fadhila ? 10000 : 0);
  const heslbAmt = payslip.heslb_amount ?? 0;
  const totalAdvances = payslip.total_advances ?? 0;

  const computedTotalDeductions =
    payslip.total_deductions && payslip.total_deductions > 0
      ? payslip.total_deductions
      : nssfAmt + cotwuAmt + fadhilaAmt + heslbAmt + totalAdvances;

  // days_worked holds attendance days (the base-pay multiplier); overtime days
  // (9h = 1 day) are counted on top, and whatever gross exceeds base is the
  // overtime payment.
  const attendanceDays = payslip.days_worked ?? 0;
  const overtimeDays = payslip.overtime_days ?? 0;
  const totalDaysWorked = addDays(attendanceDays, overtimeDays);
  const baseGross = Math.round(attendanceDays * (employee?.daily_rate ?? 0));
  const overtimeAmount = Math.max(0, payslip.gross_amount - baseGross);

  const periodLabel = period ? `${MONTHS[period.month - 1]} ${period.year}` : "—";

  const styles: { [k: string]: React.CSSProperties } = {
    root: {
      fontFamily: "'Segoe UI', Arial, sans-serif",
      fontSize: "11pt",
      color: "#111",
      background: "#fff",
      padding: "20mm",
      boxSizing: "border-box",
    },
    letterhead: {
      display: "flex",
      alignItems: "center",
      gap: 16,
      borderBottom: "2px solid #111",
      paddingBottom: 14,
      marginBottom: 20,
    },
    logo: {
      width: 70,
      height: 70,
      border: "2px dashed #ccc",
      borderRadius: 8,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#aaa",
      fontSize: "9pt",
      flexShrink: 0,
    },
    h1: { fontSize: "17pt", fontWeight: "bold" as const, margin: 0 },
    brandP: { fontSize: "9pt", color: "#555", margin: 0 },
    docTitle: {
      textAlign: "center" as const,
      fontSize: "14pt",
      fontWeight: "bold" as const,
      textTransform: "uppercase" as const,
      letterSpacing: "2px",
      marginBottom: 18,
      padding: 8,
      border: "1px solid #333",
    },
    sectionTitle: {
      fontSize: "10pt",
      fontWeight: "bold" as const,
      textTransform: "uppercase" as const,
      letterSpacing: "0.5px",
      margin: "16px 0 6px",
      borderBottom: "1px solid #999",
      paddingBottom: 3,
    },
    infoGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "4px 20px",
      marginBottom: 8,
    },
    infoItem: { display: "flex", gap: 6, fontSize: "10.5pt" },
    lbl: { color: "#666", minWidth: 80 },
    val: { fontWeight: 500 },
    table: { width: "100%", borderCollapse: "collapse" as const, marginBottom: 4 },
    th: {
      background: "#f3f4f6",
      fontWeight: 600,
      fontSize: "10pt",
      padding: "6px 10px",
      textAlign: "left" as const,
      border: "1px solid #ddd",
    },
    thRight: {
      background: "#f3f4f6",
      fontWeight: 600,
      fontSize: "10pt",
      padding: "6px 10px",
      textAlign: "right" as const,
      border: "1px solid #ddd",
    },
    td: { padding: "6px 10px", border: "1px solid #ddd", fontSize: "10.5pt" },
    tdRight: {
      padding: "6px 10px",
      border: "1px solid #ddd",
      fontSize: "10.5pt",
      textAlign: "right" as const,
    },
    subtotalTd: {
      padding: "6px 10px",
      border: "1px solid #ddd",
      fontSize: "10.5pt",
      fontWeight: 600,
      background: "#fafafa",
    },
    subtotalTdRight: {
      padding: "6px 10px",
      border: "1px solid #ddd",
      fontSize: "10.5pt",
      fontWeight: 600,
      background: "#fafafa",
      textAlign: "right" as const,
    },
    netTable: { width: "100%", borderCollapse: "collapse" as const, marginTop: 8 },
    netLabel: {
      padding: 10,
      border: "2px solid #333",
      fontSize: "12pt",
      fontWeight: "bold" as const,
      textTransform: "uppercase" as const,
    },
    netAmount: {
      padding: 10,
      border: "2px solid #333",
      fontSize: "18pt",
      fontWeight: "bold" as const,
      color: "#15803d",
      textAlign: "right" as const,
    },
    signatures: {
      marginTop: 40,
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 30,
    },
    sigBox: { borderTop: "1px solid #333", paddingTop: 8 },
    sigText: { fontSize: "10pt", color: "#555", margin: 0 },
    sigLine: { minHeight: 36, borderBottom: "1px solid #999", margin: "8px 0" },
    footer: {
      marginTop: 24,
      fontSize: "9pt",
      color: "#888",
      textAlign: "center" as const,
      borderTop: "1px solid #eee",
      paddingTop: 8,
    },
  };

  return (
    <div style={styles.root}>
      <div style={styles.letterhead}>
        <div style={styles.logo}>LOGO</div>
        <div>
          <h1 style={styles.h1}>TrustTrack</h1>
          <p style={styles.brandP}>Mfumo wa Mahudhurio na Mishahara</p>
        </div>
      </div>

      <div style={styles.docTitle}>Kielelezo cha Mshahara</div>

      <div style={styles.sectionTitle}>Taarifa za Mfanyakazi</div>
      <div style={styles.infoGrid}>
        <div style={styles.infoItem}>
          <span style={styles.lbl}>Jina:</span>
          <span style={styles.val}>{employee?.name ?? "—"}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.lbl}>Kipindi:</span>
          <span style={styles.val}>{periodLabel}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.lbl}>Nambari ID:</span>
          <span style={styles.val}>{payslip.employee_id}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.lbl}>Simu:</span>
          <span style={styles.val}>{employee?.phone ?? "—"}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.lbl}>Sehemu:</span>
          <span style={styles.val}>{section?.name ?? "—"}</span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.lbl}>Aina:</span>
          <span style={styles.val}>
            {isFulltime ? "Kudumu (Full-time)" : "Mkataba (Casual)"}
          </span>
        </div>
        <div style={styles.infoItem}>
          <span style={styles.lbl}>Idara:</span>
          <span style={styles.val}>{employee?.department ?? "—"}</span>
        </div>
        {period && (
          <div style={styles.infoItem}>
            <span style={styles.lbl}>Tarehe:</span>
            <span style={styles.val}>
              {formatDate(period.start_date)} — {formatDate(period.end_date)}
            </span>
          </div>
        )}
      </div>

      <div style={styles.sectionTitle}>Mapato</div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Maelezo</th>
            <th style={styles.thRight}>Kiasi</th>
          </tr>
        </thead>
        <tbody>
          {isFulltime ? (
            <tr>
              <td style={styles.td}>Mshahara wa Mwezi</td>
              <td style={styles.tdRight}>
                {formatCurrency(employee?.monthly_salary ?? payslip.gross_amount)}
              </td>
            </tr>
          ) : (
            <>
              <tr>
                <td style={styles.td}>
                  Siku Zilizofanywa Kazi
                  {overtimeDays > 0 &&
                    ` (kawaida ${formatDays(attendanceDays)} + OT ${formatDays(overtimeDays)})`}
                </td>
                <td style={styles.tdRight}>{formatDays(totalDaysWorked)}</td>
              </tr>
              <tr>
                <td style={styles.td}>Kiwango cha Siku</td>
                <td style={styles.tdRight}>
                  {formatCurrency(employee?.daily_rate ?? 0)}
                </td>
              </tr>
              <tr>
                <td style={styles.td}>
                  Jumla ({formatDays(attendanceDays)} × {formatCurrency(employee?.daily_rate ?? 0)})
                </td>
                <td style={styles.tdRight}>{formatCurrency(baseGross)}</td>
              </tr>
              {overtimeAmount > 0 && (
                <tr>
                  <td style={styles.td}>Overtime</td>
                  <td style={styles.tdRight}>{formatCurrency(overtimeAmount)}</td>
                </tr>
              )}
            </>
          )}
          <tr>
            <td style={styles.subtotalTd}>Jumla ya Mapato (Gross)</td>
            <td style={styles.subtotalTdRight}>{formatCurrency(payslip.gross_amount)}</td>
          </tr>
        </tbody>
      </table>

      {(isFulltime || computedTotalDeductions > 0) && (
        <>
          <div style={styles.sectionTitle}>Makato</div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Maelezo</th>
                <th style={styles.thRight}>Kiasi</th>
              </tr>
            </thead>
            <tbody>
              {nssfAmt > 0 && (
                <tr>
                  <td style={styles.td}>NSSF</td>
                  <td style={styles.tdRight}>{formatCurrency(nssfAmt)}</td>
                </tr>
              )}
              {cotwuAmt > 0 && (
                <tr>
                  <td style={styles.td}>COTWU</td>
                  <td style={styles.tdRight}>{formatCurrency(cotwuAmt)}</td>
                </tr>
              )}
              {fadhilaAmt > 0 && (
                <tr>
                  <td style={styles.td}>Fadhila</td>
                  <td style={styles.tdRight}>{formatCurrency(fadhilaAmt)}</td>
                </tr>
              )}
              {heslbAmt > 0 && (
                <tr>
                  <td style={styles.td}>HESLB</td>
                  <td style={styles.tdRight}>{formatCurrency(heslbAmt)}</td>
                </tr>
              )}
              {totalAdvances > 0 && (
                <tr>
                  <td style={styles.td}>Mikopo (Advances)</td>
                  <td style={styles.tdRight}>{formatCurrency(totalAdvances)}</td>
                </tr>
              )}
              {nssfAmt === 0 &&
                cotwuAmt === 0 &&
                fadhilaAmt === 0 &&
                heslbAmt === 0 &&
                totalAdvances === 0 && (
                  <tr>
                    <td style={styles.td} colSpan={2}>
                      Hakuna makato
                    </td>
                  </tr>
                )}
              <tr>
                <td style={styles.subtotalTd}>Jumla ya Makato</td>
                <td style={styles.subtotalTdRight}>
                  {formatCurrency(computedTotalDeductions)}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <table style={styles.netTable}>
        <tbody>
          <tr>
            <td style={styles.netLabel}>Mshahara Halisi (Net Pay)</td>
            <td style={styles.netAmount}>{formatCurrency(payslip.net_amount)}</td>
          </tr>
        </tbody>
      </table>

      <div style={styles.signatures}>
        <div style={styles.sigBox}>
          <p style={styles.sigText}>Sahihi ya HR / Msimamizi</p>
          <div style={styles.sigLine} />
          <p style={styles.sigText}>Jina: ________________________</p>
          <p style={{ ...styles.sigText, marginTop: 6 }}>Tarehe: ____________________</p>
        </div>
        <div style={styles.sigBox}>
          <p style={styles.sigText}>Tarehe ya Malipo</p>
          <div style={styles.sigLine} />
          <p style={styles.sigText}>{periodLabel}</p>
        </div>
      </div>

      <p style={styles.footer}>
        Kielelezo hiki kizalishwa na TrustTrack Attendance System —{" "}
        {new Date().toLocaleDateString("sw-TZ")}
      </p>
    </div>
  );
}
