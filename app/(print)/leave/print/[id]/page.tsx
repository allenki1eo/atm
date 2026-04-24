import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { PrintButton } from "@/components/print-button";

interface LeaveRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  days: number;
  leave_type: string | null;
  employee_phone: string | null;
  reason: string | null;
  status: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

interface Employee {
  id: string;
  name: string;
  phone: string;
  department: string | null;
  section_id: string | null;
  company_id: string | null;
}

interface Section {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
}

interface Company {
  id: string;
  name: string;
  logo: string | null;
  address: string | null;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Likizo ya Mwaka",
  sick: "Likizo ya Ugonjwa",
  maternity: "Likizo ya Uzazi",
  wedding: "Ruhusa ya Harusi",
  unpaid: "Likizo bila Malipo",
  emergency: "Dharura au Ruhusa Ingine",
};

const ALL_LEAVE_TYPES = [
  { value: "annual", label: "Likizo ya Mwaka" },
  { value: "sick", label: "Likizo ya Ugonjwa" },
  { value: "maternity", label: "Likizo ya Uzazi" },
  { value: "wedding", label: "Ruhusa ya Harusi" },
  { value: "unpaid", label: "Likizo bila Malipo" },
  { value: "emergency", label: "Dharura au Ruhusa Ingine" },
];

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif !important;
    font-size: 11pt;
    color: #111;
    background: #fff !important;
    min-height: unset !important;
    padding: 15mm 20mm;
  }
  .letterhead {
    text-align: center;
    border-bottom: 2px solid #111;
    padding-bottom: 14px;
    margin-bottom: 20px;
  }
  .letterhead .logo-placeholder {
    width: 70px; height: 70px;
    border: 2px dashed #ccc;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #aaa;
    font-size: 9pt;
    margin-bottom: 6px;
  }
  .letterhead h1 { font-size: 17pt; font-weight: bold; letter-spacing: 1px; }
  .letterhead p { font-size: 9pt; color: #555; }
  .doc-title {
    text-align: center;
    font-size: 14pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 18px;
    padding: 9px;
    border: 1.5px solid #333;
  }
  .section-title {
    font-size: 10pt;
    font-weight: bold;
    margin: 16px 0 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #999;
    padding-bottom: 3px;
  }
  .info-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .info-table th, .info-table td {
    border: 1px solid #ccc;
    padding: 7px 11px;
    text-align: left;
    vertical-align: top;
  }
  .info-table th {
    background: #f3f4f6;
    font-weight: 600;
    width: 30%;
    font-size: 9.5pt;
    color: #444;
  }
  .info-table td { font-size: 10.5pt; }
  .leave-types {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
    margin: 6px 0 14px;
  }
  .leave-type-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10pt;
  }
  .checkbox {
    width: 14px; height: 14px;
    border: 1.5px solid #333;
    border-radius: 2px;
    display: inline-block;
    flex-shrink: 0;
    background: #fff;
    position: relative;
  }
  .checkbox.checked::after {
    content: '✓';
    position: absolute;
    top: -2px; left: 1px;
    font-size: 12pt;
    color: #1d4ed8;
    font-weight: bold;
  }
  .status-badge {
    display: inline-block;
    padding: 3px 11px;
    border-radius: 9999px;
    font-size: 10.5pt;
    font-weight: bold;
    color: #fff;
  }
  .notes-box {
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 9px 11px;
    min-height: 44px;
    font-size: 10.5pt;
    color: #333;
    background: #fafafa;
  }
  .sig-section { margin-top: 28px; }
  .sig-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 20px;
  }
  .sig-box {
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 10px 12px;
  }
  .sig-box .sig-role {
    font-size: 9.5pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #333;
    margin-bottom: 6px;
    border-bottom: 1px solid #eee;
    padding-bottom: 4px;
  }
  .sig-agree-row {
    display: flex;
    gap: 16px;
    margin: 8px 0;
    font-size: 10pt;
  }
  .sig-agree-item { display: flex; align-items: center; gap: 4px; }
  .sig-line-label { font-size: 9pt; color: #666; margin-top: 4px; }
  .sig-line { border-bottom: 1px solid #999; min-height: 32px; margin: 6px 0 2px; }
  .sig-name { font-size: 10pt; font-weight: 600; }
  .sig-date { font-size: 9pt; color: #666; }
  .print-btn {
    position: fixed; bottom: 24px; right: 24px;
    background: #1d4ed8; color: #fff;
    border: none; border-radius: 8px;
    padding: 10px 20px; font-size: 13pt;
    cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .print-btn:hover { background: #1e40af; }
  @media print {
    .no-print { display: none !important; }
    body { padding: 10mm 15mm; }
  }
`;

export default async function LeavePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;

  const leaveResult = await db.execute({
    sql: "SELECT * FROM leave_requests WHERE id = ?",
    args: [id],
  });

  if (leaveResult.rows.length === 0) notFound();

  const leave = leaveResult.rows[0] as unknown as LeaveRequest;

  const employeeResult = await db.execute({
    sql: "SELECT * FROM employees WHERE id = ?",
    args: [leave.employee_id],
  });
  const employee = (employeeResult.rows[0] as unknown as Employee) ?? null;

  let section: Section | null = null;
  if (employee?.section_id) {
    const sectionResult = await db.execute({
      sql: "SELECT * FROM sections WHERE id = ?",
      args: [employee.section_id],
    });
    section = (sectionResult.rows[0] as unknown as Section) ?? null;
  }

  let company: Company | null = null;
  if (employee?.company_id) {
    const companyResult = await db.execute({
      sql: "SELECT id, name, logo, address FROM companies WHERE id = ?",
      args: [employee.company_id],
    });
    company = (companyResult.rows[0] as unknown as Company) ?? null;
  }

  let reviewer: User | null = null;
  if (leave.reviewed_by) {
    const reviewerResult = await db.execute({
      sql: "SELECT id, name FROM users WHERE id = ?",
      args: [leave.reviewed_by],
    });
    reviewer = (reviewerResult.rows[0] as unknown as User) ?? null;
  }

  const statusLabel =
    leave.status === "approved"
      ? "Imeidhinishwa"
      : leave.status === "denied"
      ? "Imekataliwa"
      : "Inasubiri";

  const statusColor =
    leave.status === "approved"
      ? "#16a34a"
      : leave.status === "denied"
      ? "#dc2626"
      : "#d97706";

  const leaveTypeLabel =
    leave.leave_type ? (LEAVE_TYPE_LABELS[leave.leave_type] ?? leave.leave_type) : "—";

  const phoneDisplay = leave.employee_phone ?? employee?.phone ?? "—";

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* Letterhead */}
      <div className="letterhead">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {company?.logo
          ? <img src={company.logo} alt="Logo" style={{ width: 70, height: 70, objectFit: "contain", borderRadius: 8, flexShrink: 0 }} />
          : <div className="logo-placeholder">LOGO</div>
        }
        <div>
          <h1>{company?.name ?? "TrustTrack"}</h1>
          {company?.address ? <p>{company.address}</p> : !company && <p>Mfumo wa Mahudhurio na Mishahara</p>}
        </div>
      </div>

      {/* Document title */}
      <div className="doc-title">Fomu ya Maombi ya Likizo</div>

      {/* Employee details */}
      <div className="section-title">Taarifa za Mfanyakazi</div>
      <table className="info-table">
        <tbody>
          <tr>
            <th>Jina Kamili</th>
            <td>{employee?.name ?? "—"}</td>
          </tr>
          <tr>
            <th>Nambari ya Simu</th>
            <td>{phoneDisplay}</td>
          </tr>
          <tr>
            <th>Idara</th>
            <td>{employee?.department ?? "—"}</td>
          </tr>
          <tr>
            <th>Sehemu</th>
            <td>{section?.name ?? "—"}</td>
          </tr>
        </tbody>
      </table>

      {/* Leave type checkboxes */}
      <div className="section-title">Aina ya Likizo</div>
      <div className="leave-types">
        {ALL_LEAVE_TYPES.map((lt) => (
          <div key={lt.value} className="leave-type-item">
            <span className={`checkbox ${leave.leave_type === lt.value ? "checked" : ""}`} />
            <span>{lt.label}</span>
          </div>
        ))}
      </div>

      {/* Leave details */}
      <div className="section-title">Maelezo ya Likizo</div>
      <table className="info-table">
        <tbody>
          <tr>
            <th>Tarehe ya Kuanza</th>
            <td>{formatDate(leave.start_date)}</td>
          </tr>
          <tr>
            <th>Tarehe ya Kuisha</th>
            <td>{formatDate(leave.end_date)}</td>
          </tr>
          <tr>
            <th>Idadi ya Siku</th>
            <td>{leave.days} siku</td>
          </tr>
          <tr>
            <th>Aina ya Likizo</th>
            <td>{leaveTypeLabel}</td>
          </tr>
          <tr>
            <th>Maelezo / Sababu</th>
            <td>{leave.reason ?? "—"}</td>
          </tr>
          <tr>
            <th>Tarehe ya Kutuma</th>
            <td>{formatDate(leave.submitted_at)}</td>
          </tr>
          <tr>
            <th>Hali ya Ombi</th>
            <td>
              <span className="status-badge" style={{ background: statusColor }}>
                {statusLabel}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Review notes */}
      {(leave.review_note || leave.reviewed_by) && (
        <>
          <div className="section-title">Maelezo ya Mpitiaji</div>
          <div className="notes-box">{leave.review_note ?? "—"}</div>
          {leave.reviewed_at && (
            <p style={{ fontSize: "9pt", color: "#666", marginTop: 5 }}>
              Imekaguliwa na: {reviewer?.name ?? leave.reviewed_by ?? "—"} —{" "}
              {formatDate(leave.reviewed_at)}
            </p>
          )}
        </>
      )}

      {/* Signatures */}
      <div className="sig-section">
        <div className="section-title">Sahihi za Wahusika</div>
        <div className="sig-grid">
          {/* Employee */}
          <div className="sig-box">
            <div className="sig-role">Mfanyakazi (Anayeomba)</div>
            <p className="sig-name">{employee?.name ?? "—"}</p>
            <p className="sig-date">Simu: {phoneDisplay}</p>
            <div className="sig-line" />
            <p className="sig-line-label">Sahihi / Tarehe</p>
          </div>

          {/* Supervisor */}
          <div className="sig-box">
            <div className="sig-role">Msimamizi wa Sehemu</div>
            <div className="sig-agree-row">
              <div className="sig-agree-item">
                <span className={`checkbox ${leave.status !== "pending" && reviewer ? "checked" : ""}`} />
                <span>Nakubali</span>
              </div>
              <div className="sig-agree-item">
                <span className={`checkbox ${leave.status === "denied" ? "checked" : ""}`} />
                <span>Sijakubali</span>
              </div>
            </div>
            {leave.review_note && leave.status === "denied" && (
              <p style={{ fontSize: "9pt", color: "#666" }}>Sababu: {leave.review_note}</p>
            )}
            <div className="sig-line" />
            <p className="sig-line-label">Sahihi / Tarehe</p>
          </div>

          {/* HR */}
          <div className="sig-box">
            <div className="sig-role">Idara ya Rasilimali Watu (HR)</div>
            <div className="sig-agree-row">
              <div className="sig-agree-item">
                <span className={`checkbox ${leave.status === "approved" ? "checked" : ""}`} />
                <span>Nakubali</span>
              </div>
              <div className="sig-agree-item">
                <span className="checkbox" />
                <span>Sijakubali</span>
              </div>
            </div>
            <div className="sig-line" />
            <p className="sig-line-label">
              {reviewer?.name ?? "___________________________"} / Tarehe:{" "}
              {leave.reviewed_at ? formatDate(leave.reviewed_at) : "___________"}
            </p>
          </div>

          {/* Manager */}
          <div className="sig-box">
            <div className="sig-role">Mkurugenzi / Meneja</div>
            <div className="sig-agree-row">
              <div className="sig-agree-item">
                <span className="checkbox" />
                <span>Nakubali</span>
              </div>
              <div className="sig-agree-item">
                <span className="checkbox" />
                <span>Sijakubali</span>
              </div>
            </div>
            <div className="sig-line" />
            <p className="sig-line-label">Sahihi / Tarehe</p>
          </div>
        </div>
      </div>

      <PrintButton />
    </>
  );
}
