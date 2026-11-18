import assert from "node:assert/strict";
import test from "node:test";
import { planNssfAutofill, writesFromPlan } from "./nssf-autofill";

const employees = [
  { id: "e1", name: "Catherine Mahega Malaika", deduct_nssf: true, company_id: "c1" },
  { id: "e2", name: "Casual Worker", deduct_nssf: false, company_id: "c1" },
];

test("auto-ticks NSSF employees on working days and skips Sundays and holidays", () => {
  // September 2026: Tue 1 ... Wed 30. Sunday 6, 13, 20, 27.
  const plan = planNssfAutofill({
    start: "2026-09-01",
    end: "2026-09-07",
    today: "2026-09-30",
    employees,
    existing: [],
    leaves: [],
  });
  const writes = writesFromPlan(plan);
  const e1 = writes.filter((w) => w.employee_id === "e1");
  const dates = e1.map((w) => w.date);
  assert.deepEqual(dates, [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    // 2026-09-06 is Sunday
    "2026-09-07",
  ]);
  assert.ok(e1.every((w) => w.status === "present"));
  assert.equal(writes.some((w) => w.employee_id === "e2"), false);
  assert.ok(plan.items.some((i) => i.date === "2026-09-06" && i.action === "skip_non_working"));
});

test("marks approved leave on working days, not on Sundays", () => {
  const plan = planNssfAutofill({
    start: "2026-09-04",
    end: "2026-09-07",
    today: "2026-09-30",
    employees,
    existing: [],
    leaves: [{ employee_id: "e1", start_date: "2026-09-04", end_date: "2026-09-07" }],
  });
  const writes = writesFromPlan(plan).filter((w) => w.employee_id === "e1");
  assert.deepEqual(
    writes.map((w) => [w.date, w.status]),
    [
      ["2026-09-04", "leave"],
      ["2026-09-05", "leave"],
      ["2026-09-07", "leave"],
    ]
  );
});

test("is idempotent: existing present rows are left alone", () => {
  const first = planNssfAutofill({
    start: "2026-09-01",
    end: "2026-09-01",
    today: "2026-09-01",
    employees,
    existing: [],
    leaves: [],
  });
  assert.equal(first.created, 1);
  const second = planNssfAutofill({
    start: "2026-09-01",
    end: "2026-09-01",
    today: "2026-09-01",
    employees,
    existing: [{ employee_id: "e1", date: "2026-09-01", status: "present", is_locked: false }],
    leaves: [],
  });
  assert.equal(second.created, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.skippedExisting, 1);
});

test("upgrades an unlocked present day to leave when leave is approved", () => {
  const plan = planNssfAutofill({
    start: "2026-09-01",
    end: "2026-09-01",
    today: "2026-09-01",
    employees,
    existing: [{ employee_id: "e1", date: "2026-09-01", status: "present", is_locked: false }],
    leaves: [{ employee_id: "e1", start_date: "2026-09-01", end_date: "2026-09-01" }],
  });
  assert.equal(plan.updated, 1);
  assert.equal(writesFromPlan(plan)[0].status, "leave");
});

test("does not overwrite locked records or future dates", () => {
  const plan = planNssfAutofill({
    start: "2026-09-01",
    end: "2026-09-03",
    today: "2026-09-01",
    employees,
    existing: [{ employee_id: "e1", date: "2026-09-01", status: "absent", is_locked: true }],
    leaves: [],
  });
  assert.equal(plan.skippedLocked, 1);
  assert.equal(plan.skippedFuture, 2);
  assert.equal(plan.created, 0);
});

test("skips a company holiday stored in the holidays table", () => {
  const plan = planNssfAutofill({
    start: "2026-09-02",
    end: "2026-09-02",
    today: "2026-09-02",
    employees,
    existing: [],
    leaves: [],
    extraHolidays: [{ date: "2026-09-02", name: "Sikukuu ya kampuni" }],
  });
  assert.equal(plan.created, 0);
  assert.equal(plan.skippedNonWorking, 1);
});
