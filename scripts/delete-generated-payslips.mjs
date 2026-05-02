import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const db = createClient({ url, authToken });

const countResult = await db.execute("SELECT COUNT(*) as count FROM payslips");
const deleted = Number(countResult.rows[0]?.count ?? 0);

await db.execute("DELETE FROM payslips");

console.log(`Deleted ${deleted} generated payslip${deleted === 1 ? "" : "s"} from ${url}.`);
