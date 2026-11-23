import { db } from "@/lib/db";
import {
  parseGraceMinutes,
  parseWorkStartTime,
  type WorkHoursSettings,
} from "@/lib/attendance-times";

export const WORK_START_SETTING_KEY = "work_start_time";
export const GRACE_SETTING_KEY = "late_grace_minutes";

export async function getWorkHoursSettings(): Promise<WorkHoursSettings> {
  try {
    const result = await db.execute({
      sql: "SELECT key, value FROM app_settings WHERE key IN (?, ?)",
      args: [WORK_START_SETTING_KEY, GRACE_SETTING_KEY],
    });
    const map = new Map<string, string | null>();
    for (const row of result.rows as unknown as { key: string; value: string | null }[]) {
      map.set(row.key, row.value);
    }
    return {
      work_start_time: parseWorkStartTime(map.get(WORK_START_SETTING_KEY) ?? null),
      grace_minutes: parseGraceMinutes(map.get(GRACE_SETTING_KEY) ?? null),
    };
  } catch {
    // Table may not exist until migrations run.
    return { work_start_time: null, grace_minutes: null };
  }
}

export async function upsertSetting(key: string, value: string | null, updatedBy: string | null) {
  await db.execute({
    sql: `INSERT INTO app_settings (key, value, updated_by, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_by = excluded.updated_by,
            updated_at = CURRENT_TIMESTAMP`,
    args: [key, value, updatedBy],
  });
}
