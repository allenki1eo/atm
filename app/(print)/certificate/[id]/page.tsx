import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db, ensureDatabase } from "@/lib/db";
import { PrintButton } from "@/components/print-button";

interface Certificate {
  id: string;
  employee_id: string;
  date_employed: string | null;
  date_of_leaving: string | null;
  position_held: string | null;
  general_conduct: string;
  efficiency: string;
  additional_notes: string | null;
  issued_at: string;
}
interface Employee {
  id: string;
  name: string;
  department: string | null;
  company_id: string | null;
}
interface Company {
  id: string;
  name: string;
  logo: string | null;
  address: string | null;
}

function fmtDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB");
}

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: 'Georgia', 'Times New Roman', serif;
    background: #f5f0e8;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .cert-outer {
    width: 100%;
    max-width: 600px;
    background: #faf8f0;
    border: 10px solid #c9a227;
    padding: 4px;
    position: relative;
  }
  .cert-inner {
    border: 2px solid #c9a227;
    padding: 32px 40px 40px;
    position: relative;
    overflow: hidden;
    min-height: 800px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  /* Corner flourishes */
  .corner {
    position: absolute;
    width: 80px;
    height: 80px;
    opacity: 0.55;
  }
  .corner svg { width: 100%; height: 100%; }
  .corner-tl { top: 0; left: 0; transform: rotate(0deg); }
  .corner-tr { top: 0; right: 0; transform: rotate(90deg); }
  .corner-bl { bottom: 0; left: 0; transform: rotate(270deg); }
  .corner-br { bottom: 0; right: 0; transform: rotate(180deg); }

  .logo-wrap {
    margin-bottom: 10px;
    display: flex;
    justify-content: center;
  }
  .logo-wrap img {
    width: 90px;
    height: 90px;
    object-fit: contain;
    border-radius: 50%;
    border: 3px solid #c9a227;
    padding: 4px;
    background: #fff;
  }
  .logo-placeholder {
    width: 90px;
    height: 90px;
    border-radius: 50%;
    border: 3px solid #c9a227;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #aaa;
    font-size: 11pt;
    font-family: Arial, sans-serif;
  }

  .cert-title {
    font-family: 'Palatino Linotype', 'Book Antiqua', 'Palatino', cursive, serif;
    font-size: 34pt;
    color: #2c2c2c;
    font-style: italic;
    text-align: center;
    margin-bottom: 6px;
    line-height: 1.1;
  }
  .cert-subtitle {
    font-size: 10pt;
    font-style: italic;
    color: #555;
    text-align: center;
    margin-bottom: 18px;
    font-family: 'Georgia', serif;
  }
  .divider {
    width: 60%;
    height: 1px;
    background: linear-gradient(to right, transparent, #c9a227, transparent);
    margin: 6px auto 16px;
  }
  .employee-name {
    font-size: 18pt;
    font-weight: bold;
    text-align: center;
    letter-spacing: 1px;
    color: #1a1a1a;
    text-transform: uppercase;
    margin-bottom: 10px;
    border-bottom: 1px solid #c9a227;
    padding-bottom: 8px;
    width: 80%;
  }
  .employed-by {
    font-size: 11pt;
    text-align: center;
    color: #333;
    margin-bottom: 4px;
  }
  .employed-by strong { font-style: italic; font-weight: bold; }
  .service-line {
    font-size: 10pt;
    color: #555;
    text-align: center;
    margin-bottom: 22px;
    font-style: italic;
  }

  .details-table {
    width: 70%;
    margin: 0 auto 18px;
  }
  .details-table tr td {
    padding: 3px 0;
    font-size: 10.5pt;
    color: #222;
  }
  .details-table tr td:first-child {
    color: #555;
    padding-right: 12px;
    white-space: nowrap;
  }
  .details-table tr td:last-child {
    font-weight: 500;
  }

  .section-heading {
    font-size: 9.5pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #333;
    text-align: center;
    margin-bottom: 10px;
  }
  .conduct-table {
    width: 60%;
    margin: 0 auto 30px;
  }
  .conduct-table tr td {
    padding: 2px 0;
    font-size: 10.5pt;
    text-align: center;
    color: #222;
  }
  .conduct-table tr td:first-child {
    text-align: left;
    color: #555;
    padding-right: 16px;
  }

  .sig-area {
    margin-top: auto;
    width: 55%;
    text-align: center;
  }
  .sig-line {
    border-bottom: 1px solid #555;
    margin: 32px auto 6px;
    width: 100%;
  }
  .sig-label {
    font-size: 10pt;
    color: #444;
    font-style: italic;
  }

  .footer-note {
    font-size: 8pt;
    color: #999;
    text-align: center;
    margin-top: 18px;
    font-family: Arial, sans-serif;
  }

  @media print {
    html, body { background: #fff; padding: 0; }
    .cert-outer { max-width: 100%; border-width: 8px; }
    .no-print { display: none !important; }
  }
`;

const CornerSVG = () => (
  <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 2 Q40 2 78 40 Q78 2 2 2 Z" fill="#c9a227" opacity="0.4" />
    <path d="M8 8 Q40 8 72 40" stroke="#c9a227" strokeWidth="1.5" fill="none" />
    <path d="M14 4 Q40 4 76 40" stroke="#c9a227" strokeWidth="0.8" fill="none" />
    <circle cx="8" cy="8" r="3" fill="#c9a227" />
    <circle cx="20" cy="6" r="2" fill="#c9a227" opacity="0.6" />
    <circle cx="6" cy="20" r="2" fill="#c9a227" opacity="0.6" />
    <path d="M4 40 Q20 20 40 4" stroke="#c9a227" strokeWidth="0.5" fill="none" opacity="0.5" />
  </svg>
);

export default async function CertificatePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;

  await ensureDatabase();
  const certResult = await db.execute({
    sql: "SELECT * FROM service_certificates WHERE id = ?",
    args: [id],
  });
  if (certResult.rows.length === 0) notFound();
  const cert = certResult.rows[0] as unknown as Certificate;

  const empResult = await db.execute({
    sql: "SELECT id, name, department, company_id FROM employees WHERE id = ?",
    args: [cert.employee_id],
  });
  const employee = (empResult.rows[0] as unknown as Employee) ?? null;

  let company: Company | null = null;
  if (employee?.company_id) {
    const compResult = await db.execute({
      sql: "SELECT id, name, logo, address FROM companies WHERE id = ?",
      args: [employee.company_id],
    });
    company = (compResult.rows[0] as unknown as Company) ?? null;
  }

  const companyName = company?.name ?? "East African Spirit (T) Ltd";
  const positionHeld = cert.position_held ?? employee?.department ?? "—";

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="cert-outer">
        <div className="cert-inner">
          {/* Corner decorations */}
          <div className="corner corner-tl"><CornerSVG /></div>
          <div className="corner corner-tr"><CornerSVG /></div>
          <div className="corner corner-bl"><CornerSVG /></div>
          <div className="corner corner-br"><CornerSVG /></div>

          {/* Logo */}
          <div className="logo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {company?.logo
              ? <img src={company.logo} alt="Company Logo" />
              : <div className="logo-placeholder">LOGO</div>
            }
          </div>

          {/* Title */}
          <div className="cert-title">Certificate of Service</div>
          <div className="divider" />

          {/* Intro */}
          <div className="cert-subtitle">This is to certify that</div>

          {/* Employee Name */}
          <div className="employee-name">{employee?.name ?? "—"}</div>

          {/* Company line */}
          <div className="employed-by">
            was employed by <strong>{companyName}</strong>
          </div>
          <div className="service-line">on service as follows</div>

          {/* Details */}
          <table className="details-table">
            <tbody>
              <tr>
                <td>Date Employed:</td>
                <td>{fmtDate(cert.date_employed)}</td>
              </tr>
              <tr>
                <td>Position Held:</td>
                <td>{positionHeld}</td>
              </tr>
              <tr>
                <td>Date of Leaving:</td>
                <td>{fmtDate(cert.date_of_leaving)}</td>
              </tr>
            </tbody>
          </table>

          <div className="divider" />

          {/* General Description */}
          <div className="section-heading">General Description</div>
          <table className="conduct-table">
            <tbody>
              <tr>
                <td>General Conduct:</td>
                <td>{cert.general_conduct}</td>
              </tr>
              <tr>
                <td>Efficiency:</td>
                <td>{cert.efficiency}</td>
              </tr>
              {cert.additional_notes && (
                <tr>
                  <td>Notes:</td>
                  <td>{cert.additional_notes}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Signature */}
          <div className="sig-area">
            <div className="sig-line" />
            <div className="sig-label">Human Resource Officer</div>
          </div>

          <div className="footer-note">
            Issued by {companyName} &mdash; {new Date(cert.issued_at).toLocaleDateString("en-GB")}
          </div>
        </div>
      </div>

      <PrintButton />
    </>
  );
}
