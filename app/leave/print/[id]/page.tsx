import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import type { Metadata } from "next";
import { PrintButton } from "./print-button";

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
}

interface Section {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await db.execute({
      sql: `SELECT e.name FROM leave_requests l
            LEFT JOIN employees e ON e.id = l.employee_id
            WHERE l.id = ?`,
      args: [id],
    });
    const row = res.rows[0] as unknown as { name?: string } | undefined;
    return { title: `Fomu ya Likizo — ${row?.name ?? id}` };
  } catch {
    return { title: "Fomu ya Likizo" };
  }
}

export default async function LeavePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;

  const leaveResult = await db.execute({
    sql: "SELECT * FROM leave_requests WHERE id = ?",
    args: [id],
  });

  if (leaveResult.rows.length === 0) {
    notFound();
  }

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

  let reviewer: User | null = null;
  if (leave.reviewed_by) {
    const reviewerResult = await db.execute({
      sql: "SELECT id, name FROM users WHERE id = ?",
      args: [leave.reviewed_by],
    });
    reviewer = (reviewerResult.rows[0] as unknown as User) ?? null;
  }

  const role = (session.user as { role?: string }).role;
  if (role !== "admin" && role !== "hr" && role !== "supervisor") {
    const userRes = await db.execute({
      sql: "SELECT employee_id FROM users WHERE id = ?",
      args: [session.user.id!],
    });
    const linkedEmployeeId =
      (userRes.rows[0] as unknown as { employee_id: string | null } | undefined)
        ?.employee_id ?? null;
    if (leave.employee_id !== linkedEmployeeId) {
      redirect("/leave");
    }
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
    <div className="leave-print-root">
      <style>{`
        html, body { background: #fff !important; }
        .leave-print-root * { box-sizing: border-box; margin: 0; padding: 0; }
        .leave-print-root {
          font-family: 'Segoe UI', Arial, sans-serif;
          font-size: 11pt;
          color: #111;
          background: #fff;
          padding: 15mm 20mm;
          max-width: 210mm;
          margin: 0 auto;
          min-height: 100vh;
        }
        .leave-print-root .letterhead {
          text-align: center;
          border-bottom: 2px solid #111;
          padding-bottom: 14px;
          margin-bottom: 20px;
        }
        .leave-print-root .letterhead .logo-placeholder {
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
        .leave-print-root .letterhead h1 { font-size: 17pt; font-weight: bold; letter-spacing: 1px; }
        .leave-print-root .letterhead p { font-size: 9pt; color: #555; }
        .leave-print-root .doc-title {
          text-align: center;
          font-size: 14pt;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 18px;
          padding: 9px;
          border: 1.5px solid #333;
        }
        .leave-print-root .section-title {
          font-size: 10pt;
          font-weight: bold;
          margin: 16px 0 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid #999;
          padding-bottom: 3px;
        }
        .leave-print-root .info-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        .leave-print-root .info-table th, .leave-print-root .info-table td {
          border: 1px solid #ccc;
          padding: 7px 11px;
          text-align: left;
          vertical-align: top;
        }
        .leave-print-root .info-table th {
          background: #f3f4f6;
          font-weight: 600;
          width: 30%;
          font-size: 9.5pt;
          color: #444;
        }
        .leave-print-root .info-table td { font-size: 10.5pt; }
        .leave-print-root .leave-types {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 20px;
          margin: 6px 0 14px;
        }
        .leave-print-root .leave-type-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 10pt;
        }
        .leave-print-root .checkbox {
          width: 14px; height: 14px;
          border: 1.5px solid #333;
          border-radius: 2px;
          display: inline-block;
          flex-shrink: 0;
          background: #fff;
          position: relative;
        }
        .leave-print-root .checkbox.checked::after {
          content: '✓';
          position: absolute;
          top: -2px; left: 1px;
          font-size: 12pt;
          color: #1d4ed8;
          font-weight: bold;
        }
        .leave-print-root .status-badge {
          display: inline-block;
          padding: 3px 11px;
          border-radius: 9999px;
          font-size: 10.5pt;
          font-weight: bold;
          color: #fff;
          background: ${statusColor};
        }
        .leave-print-root .notes-box {
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 9px 11px;
          min-height: 44px;
          font-size: 10.5pt;
          color: #333;
          background: #fafafa;
        }
        .leave-print-root .sig-section { margin-top: 28px; }
        .leave-print-root .sig-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
        }
        .leave-print-root .sig-box {
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 10px 12px;
        }
        .leave-print-root .sig-box .sig-role {
          font-size: 9.5pt;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #333;
          margin-bottom: 6px;
          border-bottom: 1px solid #eee;
          padding-bottom: 4px;
        }
        .leave-print-root .sig-agree-row {
          display: flex;
          gap: 16px;
          margin: 8px 0;
          font-size: 10pt;
        }
        .leave-print-root .sig-agree-item { display: flex; align-items: center; gap: 4px; }
        .leave-print-root .sig-line-label { font-size: 9pt; color: #666; margin-top: 4px; }
        .leave-print-root .sig-line { border-bottom: 1px solid #999; min-height: 32px; margin: 6px 0 2px; }
        .leave-print-root .sig-name { font-size: 10pt; font-weight: 600; }
        .leave-print-root .sig-date { font-size: 9pt; color: #666; }
        .leave-print-root .print-btn {
          position: fixed; bottom: 24px; right: 24px;
          background: #1d4ed8; color: #fff;
          border: none; border-radius: 8px;
          padding: 10px 20px; font-size: 13pt;
          cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .leave-print-root .print-btn:hover { background: #1e40af; }
        @media print {
          .leave-print-root .no-print { display: none !important; }
          .leave-print-root { padding: 10mm 15mm; }
        }
      `}</style>

      <div className="letterhead">
        <div className="logo-placeholder">LOGO</div>
        <h1>TrustTrack</h1>
        <p>Mfumo wa Mahudhurio na Mishahara</p>
      </div>

      <div className="doc-title">Fomu ya Maombi ya Likizo</div>

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

      <div className="section-title">Aina ya Likizo</div>
      <div className="leave-types">
        {ALL_LEAVE_TYPES.map((lt) => (
          <div key={lt.value} className="leave-type-item">
            <span className={`checkbox ${leave.leave_type === lt.value ? "checked" : ""}`} />
            <span>{lt.label}</span>
          </div>
        ))}
      </div>

      <div className="section-title">Maelezo ya Likizo</div>
      <table className="info-table">
        <tbody>
          <tr>
            <th>Aina Iliyochaguliwa</th>
            <td>{leaveTypeLabel}</td>
          </tr>
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
              <span className="status-badge">{statusLabel}</span>
            </td>
          </tr>
        </tbody>
      </table>

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

      <div className="sig-section">
        <div className="section-title">Sahihi za Wahusika</div>
        <div className="sig-grid">
          <div className="sig-box">
            <div className="sig-role">Mfanyakazi (Anayeomba)</div>
            <p className="sig-name">{employee?.name ?? "—"}</p>
            <p className="sig-date">Simu: {phoneDisplay}</p>
            <div className="sig-line" />
            <p className="sig-line-label">Sahihi / Tarehe</p>
          </div>

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
    </div>
  );
}
