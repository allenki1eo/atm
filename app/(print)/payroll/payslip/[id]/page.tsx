import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PrintButton } from "@/components/print-button";

const MONTHS = [
  "Januari", "Februari", "Machi", "Aprili", "Mei", "Juni",
  "Julai", "Agosti", "Septemba", "Oktoba", "Novemba", "Desemba",
];

interface Payslip {
  id: string; employee_id: string; period_id: string;
  days_worked: number; gross_amount: number; total_advances: number; net_amount: number;
  nssf_amount: number; cotwu_amount: number; fadhila_amount: number;
  heslb_amount: number; total_deductions: number; generated_at: string;
}
interface Employee {
  id: string; name: string; phone: string; type: "casual" | "fulltime";
  department: string | null; section_id: string | null; company_id: string | null;
  daily_rate: number; monthly_salary: number;
  deduct_nssf: number; deduct_cotwu: number; deduct_fadhila: number; heslb_amount: number;
}
interface Period { id: string; month: number; year: number; start_date: string; end_date: string; }
interface Section { id: string; name: string; }
interface Company { id: string; name: string; logo: string | null; address: string | null; }

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif !important;
    font-size: 11pt; color: #111;
    background: #fff !important; min-height: unset !important;
    padding: 20mm;
  }
  .letterhead { display: flex; align-items: center; gap: 16px;
    border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 20px; }
  .logo-placeholder { width: 70px; height: 70px; border: 2px dashed #ccc;
    border-radius: 8px; display: flex; align-items: center; justify-content: center;
    color: #aaa; font-size: 9pt; flex-shrink: 0; }
  .letterhead-text h1 { font-size: 17pt; font-weight: bold; }
  .letterhead-text p { font-size: 9pt; color: #555; }
  .doc-title { text-align: center; font-size: 14pt; font-weight: bold;
    text-transform: uppercase; letter-spacing: 2px; margin-bottom: 18px;
    padding: 8px; border: 1px solid #333; }
  .section-title { font-size: 10pt; font-weight: bold; text-transform: uppercase;
    letter-spacing: 0.5px; margin: 16px 0 6px; border-bottom: 1px solid #999; padding-bottom: 3px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin-bottom: 8px; }
  .info-item { display: flex; gap: 6px; font-size: 10.5pt; }
  .info-item .lbl { color: #666; min-width: 80px; }
  .info-item .val { font-weight: 500; }
  .pay-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  .pay-table th { background: #f3f4f6; font-weight: 600; font-size: 10pt;
    padding: 6px 10px; text-align: left; border: 1px solid #ddd; }
  .pay-table td { padding: 6px 10px; border: 1px solid #ddd; font-size: 10.5pt; }
  .pay-table td:last-child, .pay-table th:last-child { text-align: right; }
  .pay-table .subtotal td { font-weight: 600; background: #fafafa; }
  .net-pay-row { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .net-pay-row td { padding: 10px; border: 2px solid #333; }
  .net-pay-label { font-size: 12pt; font-weight: bold; text-transform: uppercase; }
  .net-pay-amount { font-size: 18pt; font-weight: bold; color: #15803d; text-align: right; }
  .signatures { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
  .sig-box { border-top: 1px solid #333; padding-top: 8px; }
  .sig-box p { font-size: 10pt; color: #555; }
  .sig-line { min-height: 36px; border-bottom: 1px solid #999; margin: 8px 0; }
  .footer-note { margin-top: 24px; font-size: 9pt; color: #888; text-align: center;
    border-top: 1px solid #eee; padding-top: 8px; }
  .print-btn { position: fixed; bottom: 24px; right: 24px; background: #1d4ed8; color: #fff;
    border: none; border-radius: 8px; padding: 10px 20px; font-size: 13pt; cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
  .print-btn:hover { background: #1e40af; }
  @media print { .no-print { display: none !important; } body { padding: 10mm; } }
`;

export default async function PayslipPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;

  const payslipResult = await db.execute({ sql: "SELECT * FROM payslips WHERE id = ?", args: [id] });
  if (payslipResult.rows.length === 0) notFound();
  const payslip = payslipResult.rows[0] as unknown as Payslip;

  const [employeeResult, periodResult] = await Promise.all([
    db.execute({ sql: "SELECT * FROM employees WHERE id = ?", args: [payslip.employee_id] }),
    db.execute({ sql: "SELECT * FROM payroll_periods WHERE id = ?", args: [payslip.period_id] }),
  ]);
  const employee = (employeeResult.rows[0] as unknown as Employee) ?? null;
  const period = (periodResult.rows[0] as unknown as Period) ?? null;

  let section: Section | null = null;
  if (employee?.section_id) {
    const r = await db.execute({ sql: "SELECT * FROM sections WHERE id = ?", args: [employee.section_id] });
    section = (r.rows[0] as unknown as Section) ?? null;
  }

  let company: Company | null = null;
  if (employee?.company_id) {
    const r = await db.execute({
      sql: "SELECT id, name, logo, address FROM companies WHERE id = ?",
      args: [employee.company_id],
    });
    company = (r.rows[0] as unknown as Company) ?? null;
  }

  // Fetch overtime for this period
  let totalOvertime = 0;
  if (period) {
    const otRes = await db.execute({
      sql: `SELECT COALESCE(SUM(amount), 0) as total FROM overtime_entries WHERE employee_id = ? AND date >= ? AND date <= ?`,
      args: [payslip.employee_id, period.start_date, period.end_date],
    });
    totalOvertime = Math.round((otRes.rows[0] as unknown as { total: number }).total);
  }

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
  const baseGross = payslip.gross_amount - totalOvertime;
  const periodLabel = period ? `${MONTHS[period.month - 1]} ${period.year}` : "—";

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="letterhead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {company?.logo
          ? <img src={company.logo} alt="Logo" style={{ width: 70, height: 70, objectFit: "contain", borderRadius: 8, flexShrink: 0 }} />
          : <div className="logo-placeholder">LOGO</div>
        }
        <div className="letterhead-text">
          <h1>{company?.name ?? "TrustTrack"}</h1>
          {company?.address ? <p>{company.address}</p> : !company && <p>Mfumo wa Mahudhurio na Mishahara</p>}
        </div>
      </div>

      <div className="doc-title">Kielelezo cha Mshahara</div>

      <div className="section-title">Taarifa za Mfanyakazi</div>
      <div className="info-grid">
        <div className="info-item"><span className="lbl">Jina:</span><span className="val">{employee?.name ?? "—"}</span></div>
        <div className="info-item"><span className="lbl">Kipindi:</span><span className="val">{periodLabel}</span></div>
        <div className="info-item"><span className="lbl">Simu:</span><span className="val">{employee?.phone ?? "—"}</span></div>
        <div className="info-item"><span className="lbl">Idara:</span><span className="val">{employee?.department ?? "—"}</span></div>
        <div className="info-item"><span className="lbl">Sehemu:</span><span className="val">{section?.name ?? "—"}</span></div>
        <div className="info-item">
          <span className="lbl">Aina:</span>
          <span className="val">{isFulltime ? "Kudumu (Full-time)" : "Mkataba (Casual)"}</span>
        </div>
        {period && (
          <div className="info-item">
            <span className="lbl">Tarehe:</span>
            <span className="val">{formatDate(period.start_date)} — {formatDate(period.end_date)}</span>
          </div>
        )}
      </div>

      <div className="section-title">Mapato</div>
      <table className="pay-table">
        <thead><tr><th>Maelezo</th><th>Kiasi</th></tr></thead>
        <tbody>
          {isFulltime ? (
            <tr><td>Mshahara wa Mwezi</td><td>{formatCurrency(employee?.monthly_salary ?? 0)}</td></tr>
          ) : (
            <>
              <tr><td>Siku Zilizofanywa Kazi</td><td>{payslip.days_worked}</td></tr>
              <tr><td>Kiwango cha Siku</td><td>{formatCurrency(employee?.daily_rate ?? 0)}</td></tr>
              <tr>
                <td>Mshahara wa Msingi ({payslip.days_worked} × {formatCurrency(employee?.daily_rate ?? 0)})</td>
                <td>{formatCurrency(baseGross)}</td>
              </tr>
            </>
          )}
          {totalOvertime > 0 && (
            <tr><td>Overtime</td><td>{formatCurrency(totalOvertime)}</td></tr>
          )}
          <tr className="subtotal"><td>Jumla ya Mapato (Gross)</td><td>{formatCurrency(payslip.gross_amount)}</td></tr>
        </tbody>
      </table>

      {(isFulltime || computedTotalDeductions > 0) && (
        <>
          <div className="section-title">Makato</div>
          <table className="pay-table">
            <thead><tr><th>Maelezo</th><th>Kiasi</th></tr></thead>
            <tbody>
              {nssfAmt > 0 && <tr><td>NSSF</td><td>{formatCurrency(nssfAmt)}</td></tr>}
              {cotwuAmt > 0 && <tr><td>COTWU</td><td>{formatCurrency(cotwuAmt)}</td></tr>}
              {fadhilaAmt > 0 && <tr><td>Fadhila</td><td>{formatCurrency(fadhilaAmt)}</td></tr>}
              {heslbAmt > 0 && <tr><td>HESLB</td><td>{formatCurrency(heslbAmt)}</td></tr>}
              {totalAdvances > 0 && <tr><td>Salary Advance</td><td>{formatCurrency(totalAdvances)}</td></tr>}
              <tr className="subtotal"><td>Jumla ya Makato</td><td>{formatCurrency(computedTotalDeductions)}</td></tr>
            </tbody>
          </table>
        </>
      )}

      <table className="net-pay-row">
        <tbody>
          <tr>
            <td className="net-pay-label">Mshahara Halisi (Net Pay)</td>
            <td className="net-pay-amount">{formatCurrency(payslip.net_amount)}</td>
          </tr>
        </tbody>
      </table>

      <div className="signatures">
        <div className="sig-box">
          <p>Sahihi ya HR / Msimamizi</p>
          <div className="sig-line" />
          <p>Jina: ________________________</p>
          <p style={{ marginTop: 6 }}>Tarehe: ____________________</p>
        </div>
        <div className="sig-box">
          <p>Tarehe ya Malipo</p>
          <div className="sig-line" />
          <p>{period ? `${MONTHS[period.month - 1]} ${period.year}` : "_______________"}</p>
        </div>
      </div>

      <p className="footer-note">
        Kielelezo hiki kizalishwa na TrustTrack Attendance System —{" "}
        {new Date().toLocaleDateString("sw-TZ")}
      </p>

      <PrintButton />
    </>
  );
}
