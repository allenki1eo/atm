/**
 * Check-in / check-out helpers for TrustTrack attendance.
 *
 * Wall-clock times are always interpreted in Africa/Dar_es_Salaam (EAT, UTC+3,
 * no daylight saving). Stored values are ISO-8601 strings with an explicit
 * +03:00 offset, e.g. "2026-11-23T08:15:00+03:00". Existing rows are never
 * backfilled — a missing value means no time was recorded.
 */

export const ATTENDANCE_TIMEZONE = "Africa/Dar_es_Salaam";
export const EAT_OFFSET = "+03:00";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const STORED_RE = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?([+-]\d{2}:\d{2}|Z)$/;

export type AttendanceClockTime = string | null | undefined;

export interface WorkHoursSettings {
  work_start_time: string | null;
  grace_minutes: number | null;
}

export interface TimeValidationResult {
  ok: boolean;
  error?: string;
  checkInProvided: boolean;
  checkOutProvided: boolean;
  /** Set when check-in was provided. null means clear the stored value. */
  check_in_at?: string | null;
  /** Set when check-out was provided. null means clear the stored value. */
  check_out_at?: string | null;
}

export function isValidDateOnly(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidHourMinute(value: string): boolean {
  return HM_RE.test(value);
}

/** Normalize a user-entered time (HH:MM or HH:MM:SS) to HH:MM. */
export function normalizeHourMinute(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

/** Combine a calendar date and an EAT clock time into a stored ISO string. */
export function combineEatDateTime(date: string, hourMinute: string): string {
  const hm = normalizeHourMinute(hourMinute);
  if (!isValidDateOnly(date) || !hm) {
    throw new Error("Invalid date or time");
  }
  return `${date}T${hm}:00${EAT_OFFSET}`;
}

/** Extract HH:MM in EAT from a stored ISO timestamp. */
export function formatEatHourMinute(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;
  const asHm = normalizeHourMinute(trimmed);
  if (asHm) return asHm;
  const parsed = parseStoredTimestamp(trimmed);
  if (!parsed) return null;
  return parsed.hourMinute;
}

export function parseStoredTimestamp(stored: string): { date: string; hourMinute: string; epochMs: number } | null {
  const trimmed = stored.trim();
  const match = trimmed.match(STORED_RE);
  if (match) {
    const date = match[1];
    const hourMinute = `${match[2]}:${match[3]}`;
    const epochMs = Date.parse(trimmed);
    if (!Number.isFinite(epochMs)) return null;
    return { date, hourMinute, epochMs };
  }
  // Tolerate a space-separated UTC value or a date-time without offset.
  const loose = Date.parse(trimmed);
  if (!Number.isFinite(loose)) return null;
  const parts = eatParts(new Date(loose));
  return {
    date: parts.date,
    hourMinute: parts.hourMinute,
    epochMs: loose,
  };
}

export function eatParts(now: Date = new Date()): { date: string; hourMinute: string; epochMs: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: ATTENDANCE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    hourMinute: `${map.hour}:${map.minute}`,
    epochMs: now.getTime(),
  };
}

export function todayDateEat(now: Date = new Date()): string {
  return eatParts(now).date;
}

function toEpochMs(stored: string): number | null {
  return parseStoredTimestamp(stored)?.epochMs ?? null;
}

/**
 * Validate optional check-in / check-out values for an attendance date.
 * `undefined` means "field not provided" (leave unchanged) and is ignored.
 * `null` or "" means "clear the field".
 */
export function validateAttendanceTimes(opts: {
  date: string;
  checkIn?: AttendanceClockTime;
  checkOut?: AttendanceClockTime;
  now?: Date;
}): TimeValidationResult {
  const { date, now = new Date() } = opts;
  if (!isValidDateOnly(date)) {
    return { ok: false, error: "Invalid attendance date", checkInProvided: false, checkOutProvided: false };
  }

  const nowMs = now.getTime();

  const resolve = (
    value: AttendanceClockTime,
    label: string
  ): { ok: true; iso: string | null } | { ok: false; error: string } => {
    if (value === undefined) return { ok: true, iso: null };
    if (value === null || String(value).trim() === "") return { ok: true, iso: null };
    const raw = String(value).trim();
    let iso: string;
    if (normalizeHourMinute(raw)) {
      iso = combineEatDateTime(date, raw);
    } else {
      const parsed = parseStoredTimestamp(raw);
      if (!parsed) return { ok: false, error: `Invalid ${label} time` };
      // UI submits HH:MM; if a full ISO arrives, keep the EAT clock time on
      // this attendance date so overnight instants are not shifted to another day.
      iso = combineEatDateTime(date, parsed.hourMinute);
    }
    const epoch = toEpochMs(iso);
    if (epoch == null) return { ok: false, error: `Invalid ${label} time` };
    if (epoch > nowMs) {
      return { ok: false, error: `${label} cannot be in the future` };
    }
    return { ok: true, iso };
  };

  const checkInProvided = opts.checkIn !== undefined;
  const checkOutProvided = opts.checkOut !== undefined;
  const result: TimeValidationResult = {
    ok: true,
    checkInProvided,
    checkOutProvided,
  };

  if (checkInProvided) {
    const resolved = resolve(opts.checkIn, "Check-in");
    if (!resolved.ok) {
      return { ok: false, error: resolved.error, checkInProvided, checkOutProvided };
    }
    result.check_in_at = resolved.iso;
  }
  if (checkOutProvided) {
    const resolved = resolve(opts.checkOut, "Check-out");
    if (!resolved.ok) {
      return { ok: false, error: resolved.error, checkInProvided, checkOutProvided };
    }
    result.check_out_at = resolved.iso;
  }

  return result;
}

/** After both sides are known (including existing values), enforce checkout > checkin. */
export function assertCheckOutAfterCheckIn(
  checkInIso: string | null,
  checkOutIso: string | null
): string | null {
  if (!checkInIso || !checkOutIso) return null;
  const inMs = toEpochMs(checkInIso);
  const outMs = toEpochMs(checkOutIso);
  if (inMs == null || outMs == null) return "Invalid check-in or check-out time";
  if (outMs <= inMs) return "Check-out must be after check-in";
  return null;
}

function hourMinuteToMinutes(hm: string): number | null {
  const n = normalizeHourMinute(hm);
  if (!n) return null;
  const [h, m] = n.split(":").map(Number);
  return h * 60 + m;
}

/**
 * True when a check-in is after work start + grace on that calendar date.
 * Returns false when the rule is unset or the check-in is missing.
 */
export function isLateByRule(
  checkInIso: string | null | undefined,
  settings: WorkHoursSettings
): boolean {
  if (!checkInIso) return false;
  const start = normalizeHourMinute(settings.work_start_time);
  if (!start) return false;
  const grace = settings.grace_minutes;
  const graceMinutes = grace == null || Number.isNaN(Number(grace)) ? 0 : Math.max(0, Math.floor(Number(grace)));
  const checkIn = formatEatHourMinute(checkInIso);
  if (!checkIn) return false;
  const startMins = hourMinuteToMinutes(start);
  const inMins = hourMinuteToMinutes(checkIn);
  if (startMins == null || inMins == null) return false;
  return inMins > startMins + graceMinutes;
}

export type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "leave";

/**
 * Decide the status to store when a check-in may trigger the late rule.
 *
 * - If the caller sends an explicit status, that status always wins (manual override).
 * - If no explicit status is sent, and the late rule matches, we set `late`
 *   when the current status is empty or `present`.
 * - Other existing statuses (absent, leave, half_day, late) are left alone
 *   unless the caller sets them explicitly.
 */
export function resolveStatusWithLateRule(opts: {
  explicitStatus?: AttendanceStatus | null;
  currentStatus?: AttendanceStatus | null;
  checkInIso: string | null;
  settings: WorkHoursSettings;
}): { status: AttendanceStatus | null; lateByRule: boolean; autoAppliedLate: boolean } {
  const lateByRule = isLateByRule(opts.checkInIso, opts.settings);
  if (opts.explicitStatus) {
    return { status: opts.explicitStatus, lateByRule, autoAppliedLate: false };
  }
  if (lateByRule && (!opts.currentStatus || opts.currentStatus === "present")) {
    return { status: "late", lateByRule, autoAppliedLate: true };
  }
  // A recorded check-in with no status yet means the person came to work.
  if (!opts.currentStatus && opts.checkInIso) {
    return { status: "present", lateByRule, autoAppliedLate: false };
  }
  return { status: opts.currentStatus ?? null, lateByRule, autoAppliedLate: false };
}

export function parseGraceMinutes(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

export function parseWorkStartTime(value: unknown): string | null {
  if (value == null || value === "") return null;
  return normalizeHourMinute(String(value));
}
