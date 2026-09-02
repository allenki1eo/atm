import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db, ensureDatabase } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";

async function _GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role: string }).role;
  if (role !== "admin" && role !== "hr") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();

  // Fetch real companies and sections
  const companiesRes = await db.execute("SELECT id, name FROM companies ORDER BY name");
  const sectionsRes  = await db.execute("SELECT id, name, company_id FROM sections ORDER BY name");

  const companies = companiesRes.rows as unknown as { id: string; name: string }[];
  const sections  = sectionsRes.rows  as unknown as { id: string; name: string; company_id: string }[];

  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  const headers = [
    "name",
    "phone",
    "type",
    "department",
    "company_name",
    "section_name",
    "daily_rate",
    "monthly_salary",
    "food_advance_amount",
    "overtime_rule",
  ].join(",");

  // Generate one example row per section so the user knows what values are valid
  const exampleRows: string[] = [];

  if (sections.length > 0) {
    sections.forEach((sec, i) => {
      const companyName = companyMap.get(sec.company_id) ?? "";
      const phone = `+255712${String(100000 + i).padStart(6, "0")}`;
      exampleRows.push(
        [
          `Mfanyakazi ${i + 1}`,
          phone,
          "casual",
          "Uendeshaji",
          companyName,
          sec.name,
          "15000",
          "",
          "0",
          "none",
        ].join(",")
      );
    });
  } else {
    // Fallback if no sections exist yet
    exampleRows.push(
      "Juma Salim,+255712345001,casual,Uendeshaji,Kampuni A,Sehemu 1,15000,,0,none",
      "Fatuma Hassan,+255712345002,fulltime,Fedha,Kampuni A,Sehemu 2,,800000,30000,all_days"
    );
  }

  const csv = [headers, ...exampleRows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="trusttrack_employees_template.csv"`,
    },
  });
}

export const GET = apiHandler(_GET);
