/**
 * Tanzania public holidays (Public Holidays Act, Cap. 35, plus commonly
 * observed Karume Day and Saba Saba Day).
 *
 * Fixed dates are generated for any year. Easter is computed. Islamic
 * holidays (Eid el-Fitr, two days; Eid el-Hajj; Maulid) use gazetted
 * dates when known, otherwise an approximate Hijri conversion that HR
 * should confirm and can override in the Sikukuu table.
 *
 * Sources for gazetted / published dates:
 * - Bank of Tanzania "Public Holidays 2025"
 *   https://www.bot.go.tz/webdocs/Other/PUBLIC%20HOLIDAYS%202025.pdf
 * - Dar es Salaam Stock Exchange "Public Holidays of Tanzania - 2026"
 *   (Islamic dates marked subject to moon sighting)
 */

export interface TanzaniaHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  /** true when the date is from a published list, not an estimate */
  official: boolean;
}

/** Official or commonly published dates, keyed by YYYY-MM-DD. */
const GAZETTED: Record<string, string> = {
  // 2025 — Bank of Tanzania public holidays circular
  "2025-03-29": "Eid El-Fitr",
  "2025-06-06": "Eid El-Hajj",
  "2025-09-04": "Maulid Day",
  // 2026 — DSE circular (Islamic dates subject to moon sighting)
  "2026-03-20": "Eid El-Fitr",
  "2026-03-21": "Eid El-Fitr (siku ya pili)",
  "2026-05-27": "Eid El-Hajj",
  "2026-08-25": "Maulid Day",
};

const FIXED: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 1, day: 12, name: "Zanzibar Revolution Day" },
  { month: 4, day: 7, name: "Karume Day" },
  { month: 4, day: 26, name: "Union Day" },
  { month: 5, day: 1, name: "Labour Day" },
  { month: 7, day: 7, name: "Saba Saba Day" },
  { month: 8, day: 8, name: "Nane Nane Day" },
  { month: 10, day: 14, name: "Nyerere Day" },
  { month: 12, day: 9, name: "Independence Day" },
  { month: 12, day: 25, name: "Christmas Day" },
  { month: 12, day: 26, name: "Boxing Day" },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Sunday = 0 … Saturday = 6, computed in UTC so the calendar date is stable. */
export function weekdayUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isSunday(iso: string): boolean {
  return weekdayUtc(iso) === 0;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function eachDateInclusive(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  return out;
}

export function monthDateRange(year: number, month: number): { start: string; end: string } {
  const start = isoDate(year, month, 1);
  const end = addDaysIso(isoDate(year, month + 1, 1), -1);
  return { start, end };
}

/** Anonymous Gregorian computus. Returns [month, day] of Easter Sunday. */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/**
 * Approximate civil date for a Hijri (year, month, day) using the
 * Kuwaiti algorithm. Good enough as a fallback when no gazette exists.
 */
export function hijriToGregorian(hy: number, hm: number, hd: number): string {
  const n = hd + Math.ceil(29.50071 * (hm - 1)) + (hy - 1) * 354 + Math.floor((3 + 11 * hy) / 30);
  const jd = n + 1948439 - 38;
  let l = jd + 68569;
  const n2 = Math.floor((4 * l) / 146097);
  l = l - Math.floor((146097 * n2 + 3) / 4);
  const i = Math.floor((4000 * (l + 1)) / 1461001);
  l = l - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l) / 2447);
  const day = l - Math.floor((2447 * j) / 80);
  l = Math.floor(j / 11);
  const month = j + 2 - 12 * l;
  const year = 100 * (n2 - 49) + i + l;
  return isoDate(year, month, day);
}

function islamicYearCovering(gregorianYear: number): number[] {
  // A Gregorian year overlaps two or three Hijri years.
  const approx = gregorianYear - 579;
  return [approx - 1, approx, approx + 1, approx + 2];
}

function estimatedIslamicHolidays(year: number): TanzaniaHoliday[] {
  const out: TanzaniaHoliday[] = [];
  for (const hy of islamicYearCovering(year)) {
    const fitr = hijriToGregorian(hy, 10, 1);
    const hajj = hijriToGregorian(hy, 12, 10);
    const maulid = hijriToGregorian(hy, 3, 12);
    if (fitr.startsWith(String(year))) {
      out.push({ date: fitr, name: "Eid El-Fitr (kadiria)", official: false });
      const second = addDaysIso(fitr, 1);
      if (second.startsWith(String(year))) {
        out.push({ date: second, name: "Eid El-Fitr (siku ya pili, kadiria)", official: false });
      }
    }
    if (hajj.startsWith(String(year))) {
      out.push({ date: hajj, name: "Eid El-Hajj (kadiria)", official: false });
    }
    if (maulid.startsWith(String(year))) {
      out.push({ date: maulid, name: "Maulid Day (kadiria)", official: false });
    }
  }
  return out;
}

export function tanzaniaHolidaysForYear(year: number): TanzaniaHoliday[] {
  const byDate = new Map<string, TanzaniaHoliday>();

  const add = (h: TanzaniaHoliday) => {
    const existing = byDate.get(h.date);
    if (!existing || (h.official && !existing.official)) {
      byDate.set(h.date, h);
    }
  };

  for (const f of FIXED) {
    add({ date: isoDate(year, f.month, f.day), name: f.name, official: true });
  }

  const easter = easterSunday(year);
  const easterIso = isoDate(year, easter.month, easter.day);
  add({ date: addDaysIso(easterIso, -2), name: "Good Friday", official: true });
  add({ date: addDaysIso(easterIso, 1), name: "Easter Monday", official: true });

  const prefix = `${year}-`;
  for (const [date, name] of Object.entries(GAZETTED)) {
    if (date.startsWith(prefix)) add({ date, name, official: true });
  }

  // Only estimate Islamic dates when that year has no gazetted Islamic holiday.
  const hasOfficialIslamic = [...byDate.values()].some(
    (h) => h.official && /eid|maulid/i.test(h.name)
  );
  if (!hasOfficialIslamic) {
    for (const h of estimatedIslamicHolidays(year)) add(h);
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function tanzaniaHolidaysBetween(start: string, end: string): TanzaniaHoliday[] {
  const startYear = Number(start.slice(0, 4));
  const endYear = Number(end.slice(0, 4));
  const out: TanzaniaHoliday[] = [];
  for (let y = startYear; y <= endYear; y++) {
    for (const h of tanzaniaHolidaysForYear(y)) {
      if (h.date >= start && h.date <= end) out.push(h);
    }
  }
  return out;
}

/**
 * A date is skipped for NSSF auto-fill when it is a Sunday or a public
 * holiday. `extraHolidayDates` comes from the app's holidays table
 * (global + company-scoped).
 */
export function isNonWorkingDay(iso: string, extraHolidayDates: Iterable<string> = []): boolean {
  if (isSunday(iso)) return true;
  const extra = extraHolidayDates instanceof Set ? extraHolidayDates : new Set(extraHolidayDates);
  if (extra.has(iso)) return true;
  const year = Number(iso.slice(0, 4));
  return tanzaniaHolidaysForYear(year).some((h) => h.date === iso);
}

export function holidayName(
  iso: string,
  extraHolidays: { date: string; name: string }[] = []
): string | null {
  const extra = extraHolidays.find((h) => h.date === iso);
  if (extra) return extra.name;
  const year = Number(iso.slice(0, 4));
  return tanzaniaHolidaysForYear(year).find((h) => h.date === iso)?.name ?? null;
}
