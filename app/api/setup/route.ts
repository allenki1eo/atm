import { NextResponse } from "next/server";
import { initializeDatabase, seedDemoData } from "@/lib/db";
import { apiHandler } from "@/lib/api-handler";

// One-shot endpoint to create all tables and seed demo data.
// Safe to call multiple times — all statements use CREATE TABLE IF NOT EXISTS
// and seedDemoData() is a no-op if users already exist.
async function _GET() {
  try {
    await initializeDatabase();
    await seedDemoData();
    return NextResponse.json({ ok: true, message: "Database initialized and demo data seeded." });
  } catch (error) {
    console.error("Setup error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export const GET = apiHandler(_GET);
