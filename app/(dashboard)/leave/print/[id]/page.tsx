import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/utils";

interface LeaveRequest {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  days: number;
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

export default async function LeavePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch leave request
  const leaveResult = await db.execute({
    sql: "SELECT * FROM leave_requests WHERE id = ?",
    args: [id],
  });

  if (leaveResult.rows.length === 0) {
    notFound();
  }

  const leave = leaveResult.rows[0] as unknown as LeaveRequest;

  // Fetch employee
  const employeeResult = await db.execute({
    sql: "SELECT * FROM employees WHERE id = ?",
    args: [leave.employee_id],
  });
  const employee = (employeeResult.rows[0] as unknown as Employee) ?? null;

  // Fetch section
  let section: Section | null = null;
  if (employee?.section_id) {
    const sectionResult = await db.execute({
      sql: "SELECT * FROM sections WHERE id = ?",
      args: [employee.section_id],
    });
    section = (sectionResult.rows[0] as unknown as Section) ?? null;
  }

  // Fetch reviewer
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

  return (
    <html lang="sw">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Fomu ya Maombi ya Likizo — {employee?.name ?? id}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            font-size: 12pt;
            color: #111;
            background: #fff;
            padding: 20mm;
          }
          .letterhead {
            text-align: center;
            border-bottom: 2px solid #111;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .letterhead .logo-placeholder {
            width: 80px;
            height: 80px;
            border: 2px dashed #ccc;
            border-radius: 8px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: #aaa;
            font-size: 10pt;
            margin-bottom: 8px;
          }
          .letterhead h1 {
            font-size: 18pt;
            font-weight: bold;
            letter-spacing: 1px;
          }
          .letterhead p {
            font-size: 10pt;
            color: #555;
          }
          .doc-title {
            text-align: center;
            font-size: 15pt;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 20px;
            padding: 10px;
            border: 1px solid #333;
          }
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .info-table th, .info-table td {
            border: 1px solid #ccc;
            padding: 8px 12px;
            text-align: left;
            vertical-align: top;
          }
          .info-table th {
            background: #f3f4f6;
            font-weight: 600;
            width: 30%;
            font-size: 10pt;
            color: #444;
          }
          .info-table td {
            font-size: 11pt;
          }
          .section-title {
            font-size: 11pt;
            font-weight: bold;
            margin: 20px 0 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 1px solid #999;
            padding-bottom: 4px;
          }
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 11pt;
            font-weight: bold;
            color: #fff;
            background: ${statusColor};
          }
          .signatures {
            margin-top: 40px;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 24px;
          }
          .sig-box {
            border-top: 1px solid #333;
            padding-top: 8px;
          }
          .sig-box p {
            font-size: 10pt;
            color: #555;
          }
          .sig-box .sig-name {
            font-size: 11pt;
            font-weight: 600;
            margin-top: 4px;
          }
          .sig-line {
            min-height: 40px;
            border-bottom: 1px solid #999;
            margin: 8px 0;
          }
          .print-btn {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #1d4ed8;
            color: #fff;
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            font-size: 13pt;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          }
          .print-btn:hover { background: #1e40af; }
          .notes-box {
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 10px 12px;
            min-height: 48px;
            font-size: 11pt;
            color: #333;
            background: #fafafa;
          }
          @media print {
            .no-print { display: none !important; }
            body { padding: 10mm; }
          }
        `}</style>
      </head>
      <body>
        {/* Letterhead */}
        <div className="letterhead">
          <div className="logo-placeholder">LOGO</div>
          <h1>TrustTrack</h1>
          <p>Mfumo wa Mahudhurio na Mishahara</p>
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
              <td>{employee?.phone ?? "—"}</td>
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
              <th>Sababu</th>
              <td>{leave.reason ?? "—"}</td>
            </tr>
            <tr>
              <th>Tarehe ya Kutuma</th>
              <td>{formatDate(leave.submitted_at)}</td>
            </tr>
            <tr>
              <th>Hali</th>
              <td>
                <span className="status-badge">{statusLabel}</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* HR Notes */}
        <div className="section-title">Maelezo ya HR</div>
        <div className="notes-box">
          {leave.review_note ?? "—"}
        </div>
        {leave.reviewed_at && (
          <p style={{ fontSize: "10pt", color: "#666", marginTop: 6 }}>
            Imekaguliwa na: {reviewer?.name ?? leave.reviewed_by ?? "—"} —{" "}
            {formatDate(leave.reviewed_at)}
          </p>
        )}

        {/* Signatures */}
        <div className="signatures">
          <div className="sig-box">
            <p>Sahihi ya Mfanyakazi</p>
            <div className="sig-line" />
            <p className="sig-name">{employee?.name ?? "—"}</p>
            <p>Tarehe: _______________</p>
          </div>
          <div className="sig-box">
            <p>Sahihi ya HR</p>
            <div className="sig-line" />
            <p className="sig-name">{reviewer?.name ?? "—"}</p>
            <p>
              Tarehe:{" "}
              {leave.reviewed_at ? formatDate(leave.reviewed_at) : "_______________"}
            </p>
          </div>
          <div className="sig-box">
            <p>Tarehe ya Kuidhinishwa</p>
            <div className="sig-line" />
            <p className="sig-name">
              {leave.status === "approved" && leave.reviewed_at
                ? formatDate(leave.reviewed_at)
                : "_______________"}
            </p>
          </div>
        </div>

        {/* Print button — hidden in print */}
        <button className="print-btn no-print" onClick={() => window.print()}>
          Chapisha
        </button>
      </body>
    </html>
  );
}
