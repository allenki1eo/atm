import {
  eachDateInclusive,
  holidayName,
  isNonWorkingDay,
} from "./tanzania-holidays";

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "half_day",
  "leave",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export interface ExistingAttendance {
  employee_id: string;
  date: string;
  status: AttendanceStatus;
  is_locked: boolean;
}

export interface ApprovedLeave {
  employee_id: string;
  start_date: string;
  end_date: string;
}

export interface AutofillEmployee {
  id: string;
  name: string;
  deduct_nssf: boolean;
  company_id: string | null;
}

export type AutofillAction =
  | "create"
  | "update"
  | "skip_existing"
  | "skip_locked"
  | "skip_non_working"
  | "skip_future"
  | "skip_not_nssf";

export interface AutofillPlanItem {
  employee_id: string;
  employee_name: string;
  date: string;
  status: AttendanceStatus | null;
  action: AutofillAction;
  reason: string;
}

export interface AutofillPlan {
  items: AutofillPlanItem[];
  created: number;
  updated: number;
  skippedExisting: number;
  skippedLocked: number;
  skippedNonWorking: number;
  skippedFuture: number;
}

export interface AutofillOptions {
  start: string;
  end: string;
  today: string;
  employees: AutofillEmployee[];
  existing: ExistingAttendance[];
  leaves: ApprovedLeave[];
  extraHolidayDates?: string[];
  extraHolidays?: { date: string; name: string }[];
  /** When true, overwrite unlocked existing rows (except we still prefer leave over present). */
  overwrite?: boolean;
  /** When false (default), do not write dates after `today`. */
  includeFuture?: boolean;
  /** When true, also plan rows for employees who are not on NSSF. Default false. */
  includeNonNssf?: boolean;
}

function leaveCovers(leaves: ApprovedLeave[], employeeId: string, date: string): boolean {
  return leaves.some(
    (l) => l.employee_id === employeeId && l.start_date <= date && date <= l.end_date
  );
}

export function planNssfAutofill(options: AutofillOptions): AutofillPlan {
  const extra = options.extraHolidayDates ?? options.extraHolidays?.map((h) => h.date) ?? [];
  const holidayLookup = options.extraHolidays ?? extra.map((date) => ({ date, name: "Sikukuu" }));
  const existingMap = new Map(
    options.existing.map((r) => [`${r.employee_id}|${r.date}`, r] as const)
  );
  const overwrite = options.overwrite === true;
  const includeFuture = options.includeFuture === true;
  const includeNonNssf = options.includeNonNssf === true;

  const items: AutofillPlanItem[] = [];
  const dates = eachDateInclusive(options.start, options.end);

  for (const emp of options.employees) {
    if (!emp.deduct_nssf && !includeNonNssf) {
      continue;
    }
    for (const date of dates) {
      const skipNonWorking = isNonWorkingDay(date, extra);
      if (skipNonWorking) {
        const label = isNonWorkingDay(date, []) && holidayName(date, holidayLookup)
          ? holidayName(date, holidayLookup)
          : holidayName(date, holidayLookup) ?? (date && "Jumapili");
        items.push({
          employee_id: emp.id,
          employee_name: emp.name,
          date,
          status: null,
          action: "skip_non_working",
          reason: label ? `Sikukuu / Jumapili: ${label}` : "Sikukuu au Jumapili",
        });
        continue;
      }

      if (date > options.today && !includeFuture) {
        items.push({
          employee_id: emp.id,
          employee_name: emp.name,
          date,
          status: null,
          action: "skip_future",
          reason: "Tarehe bado haijafika",
        });
        continue;
      }

      const onLeave = leaveCovers(options.leaves, emp.id, date);
      const desired: AttendanceStatus = onLeave ? "leave" : "present";
      const reason = onLeave ? "Likizo iliyoidhinishwa" : "Siku ya kazi (NSSF)";
      const existing = existingMap.get(`${emp.id}|${date}`);

      if (!existing) {
        items.push({
          employee_id: emp.id,
          employee_name: emp.name,
          date,
          status: desired,
          action: "create",
          reason,
        });
        continue;
      }

      if (existing.is_locked && !overwrite) {
        items.push({
          employee_id: emp.id,
          employee_name: emp.name,
          date,
          status: existing.status,
          action: "skip_locked",
          reason: "Rekodi imefungwa",
        });
        continue;
      }

      const shouldUpdate =
        existing.status !== desired &&
        (overwrite || (onLeave && existing.status !== "leave"));

      if (!shouldUpdate) {
        items.push({
          employee_id: emp.id,
          employee_name: emp.name,
          date,
          status: existing.status,
          action: "skip_existing",
          reason: `Tayari: ${existing.status}`,
        });
        continue;
      }

      items.push({
        employee_id: emp.id,
        employee_name: emp.name,
        date,
        status: desired,
        action: "update",
        reason,
      });
    }
  }

  return {
    items,
    created: items.filter((i) => i.action === "create").length,
    updated: items.filter((i) => i.action === "update").length,
    skippedExisting: items.filter((i) => i.action === "skip_existing").length,
    skippedLocked: items.filter((i) => i.action === "skip_locked").length,
    skippedNonWorking: items.filter((i) => i.action === "skip_non_working").length,
    skippedFuture: items.filter((i) => i.action === "skip_future").length,
  };
}

export function writesFromPlan(plan: AutofillPlan): AutofillPlanItem[] {
  return plan.items.filter((i) => i.action === "create" || i.action === "update");
}
