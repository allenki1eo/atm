import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureDatabase } from "@/lib/db";
import { isAdminOrHr } from "@/lib/authorization";
import { ATTENDANCE_TIMEZONE, parseGraceMinutes, parseWorkStartTime } from "@/lib/attendance-times";
import {
  getWorkHoursSettings,
  GRACE_SETTING_KEY,
  upsertSetting,
  WORK_START_SETTING_KEY,
} from "@/lib/attendance-settings";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();
  const settings = await getWorkHoursSettings();
  return NextResponse.json({
    ...settings,
    timezone: ATTENDANCE_TIMEZONE,
  });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role: string }).role;
  if (!isAdminOrHr(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureDatabase();
  const body = await request.json().catch(() => ({}));

  const startRaw = body.work_start_time;
  const graceRaw = body.grace_minutes;

  let workStart: string | null;
  if (startRaw === undefined) {
    const current = await getWorkHoursSettings();
    workStart = current.work_start_time;
  } else if (startRaw === null || String(startRaw).trim() === "") {
    workStart = null;
  } else {
    const parsed = parseWorkStartTime(startRaw);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid work start time" }, { status: 400 });
    }
    workStart = parsed;
  }

  let grace: number | null;
  if (graceRaw === undefined) {
    const current = await getWorkHoursSettings();
    grace = current.grace_minutes;
  } else if (graceRaw === null || String(graceRaw).trim() === "") {
    grace = null;
  } else {
    const parsed = parseGraceMinutes(graceRaw);
    if (parsed == null) {
      return NextResponse.json({ error: "Grace period must be a whole number of minutes (0 or more)" }, { status: 400 });
    }
    grace = parsed;
  }

  const userId = session.user.id ?? null;
  await upsertSetting(WORK_START_SETTING_KEY, workStart, userId);
  await upsertSetting(GRACE_SETTING_KEY, grace == null ? null : String(grace), userId);

  return NextResponse.json({
    work_start_time: workStart,
    grace_minutes: grace,
    timezone: ATTENDANCE_TIMEZONE,
  });
}
