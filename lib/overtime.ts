/**
 * Overtime is credited against a 9-hour working day: 9 hours of overtime is
 * worth one contract day, 4.5 hours half a day. The same ratio drives the
 * overtime pay calculation in /api/overtime, so day counts and pay agree.
 */
export const OVERTIME_HOURS_PER_DAY = 9;

/** Convert overtime hours into day equivalents, rounded to 2 decimals. */
export function overtimeDaysFromHours(hours: number | null | undefined): number {
  const value = Number(hours ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round((value / OVERTIME_HOURS_PER_DAY) * 100) / 100;
}

/** Sum day counts without leaking floating point noise (0.1 + 0.2 = 0.3). */
export function addDays(...values: (number | null | undefined)[]): number {
  const total = values.reduce<number>((sum, v) => sum + Number(v ?? 0), 0);
  return Math.round(total * 100) / 100;
}

/** Render a day count without trailing zeros: 22 → "22", 22.5 → "22.5". */
export function formatDays(days: number | null | undefined): string {
  const value = Number(days ?? 0);
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
