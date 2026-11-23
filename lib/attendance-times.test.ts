import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCheckOutAfterCheckIn,
  combineEatDateTime,
  formatEatHourMinute,
  isLateByRule,
  normalizeHourMinute,
  resolveStatusWithLateRule,
  todayDateEat,
  validateAttendanceTimes,
} from "./attendance-times";

test("normalizes and combines EAT wall times with an explicit +03:00 offset", () => {
  assert.equal(normalizeHourMinute("8:05"), "08:05");
  assert.equal(normalizeHourMinute("08:05:00"), "08:05");
  assert.equal(normalizeHourMinute(""), null);
  assert.equal(combineEatDateTime("2026-11-23", "8:15"), "2026-11-23T08:15:00+03:00");
  assert.equal(formatEatHourMinute("2026-11-23T08:15:00+03:00"), "08:15");
  assert.equal(formatEatHourMinute(null), null);
});

test("rejects check-out that is not after check-in", () => {
  const inn = combineEatDateTime("2026-11-23", "09:00");
  const same = combineEatDateTime("2026-11-23", "09:00");
  const earlier = combineEatDateTime("2026-11-23", "08:59");
  const later = combineEatDateTime("2026-11-23", "09:01");
  assert.equal(assertCheckOutAfterCheckIn(inn, earlier), "Check-out must be after check-in");
  assert.equal(assertCheckOutAfterCheckIn(inn, same), "Check-out must be after check-in");
  assert.equal(assertCheckOutAfterCheckIn(inn, later), null);
  assert.equal(assertCheckOutAfterCheckIn(inn, null), null);
});

test("rejects times in the future and accepts times earlier today", () => {
  const now = new Date("2026-11-23T08:32:00+03:00");
  const future = validateAttendanceTimes({
    date: "2026-11-23",
    checkIn: "09:32",
    now,
  });
  assert.equal(future.ok, false);
  assert.match(future.error ?? "", /future/i);

  const ok = validateAttendanceTimes({
    date: "2026-11-23",
    checkIn: "08:15",
    checkOut: "08:30",
    now,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.check_in_at, "2026-11-23T08:15:00+03:00");
  assert.equal(ok.check_out_at, "2026-11-23T08:30:00+03:00");
});

test("does not treat omitted fields as a request to clear stored times", () => {
  const result = validateAttendanceTimes({
    date: "2026-11-23",
    now: new Date("2026-11-23T18:00:00+03:00"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.checkInProvided, false);
  assert.equal(result.checkOutProvided, false);
  assert.equal("check_in_at" in result, false);
  assert.equal("check_out_at" in result, false);

  const cleared = validateAttendanceTimes({
    date: "2026-11-23",
    checkIn: null,
    checkOut: "",
    now: new Date("2026-11-23T18:00:00+03:00"),
  });
  assert.equal(cleared.ok, true);
  assert.equal(cleared.checkInProvided, true);
  assert.equal(cleared.checkOutProvided, true);
  assert.equal(cleared.check_in_at, null);
  assert.equal(cleared.check_out_at, null);
});

test("late rule is inactive when work start is unset", () => {
  const checkIn = combineEatDateTime("2026-11-23", "11:00");
  assert.equal(isLateByRule(checkIn, { work_start_time: null, grace_minutes: 15 }), false);
  assert.equal(isLateByRule(null, { work_start_time: "08:00", grace_minutes: 15 }), false);
});

test("late rule uses start plus grace, and 08:34 is on time when start is 08:00 and grace is 34", () => {
  const settings = { work_start_time: "08:00", grace_minutes: 34 };
  assert.equal(isLateByRule(combineEatDateTime("2026-11-23", "08:00"), settings), false);
  assert.equal(isLateByRule(combineEatDateTime("2026-11-23", "08:34"), settings), false);
  assert.equal(isLateByRule(combineEatDateTime("2026-11-23", "08:35"), settings), true);
  assert.equal(isLateByRule(combineEatDateTime("2026-11-23", "09:32"), settings), true);
});

test("explicit status overrides auto-late; present is upgraded only when status is not sent", () => {
  const lateIn = combineEatDateTime("2026-11-23", "09:32");
  const settings = { work_start_time: "08:00", grace_minutes: 34 };

  const honoured = resolveStatusWithLateRule({
    explicitStatus: "present",
    currentStatus: "present",
    checkInIso: lateIn,
    settings,
  });
  assert.equal(honoured.status, "present");
  assert.equal(honoured.lateByRule, true);
  assert.equal(honoured.autoAppliedLate, false);

  const auto = resolveStatusWithLateRule({
    currentStatus: "present",
    checkInIso: lateIn,
    settings,
  });
  assert.equal(auto.status, "late");
  assert.equal(auto.autoAppliedLate, true);

  const leave = resolveStatusWithLateRule({
    currentStatus: "leave",
    checkInIso: lateIn,
    settings,
  });
  assert.equal(leave.status, "leave");
  assert.equal(leave.autoAppliedLate, false);
});

test("todayDateEat uses Africa/Dar_es_Salaam, not UTC, around midnight", () => {
  // 23 Nov 2026 01:30 EAT is still 22 Nov 22:30 UTC.
  const shortlyAfterMidnightEat = new Date("2026-11-22T22:30:00Z");
  assert.equal(todayDateEat(shortlyAfterMidnightEat), "2026-11-23");
  const stillPreviousEat = new Date("2026-11-22T20:30:00Z");
  assert.equal(todayDateEat(stillPreviousEat), "2026-11-22");
});

test("a check-in with no existing status defaults to present when the late rule does not apply", () => {
  const onTime = combineEatDateTime("2026-11-23", "08:10");
  const result = resolveStatusWithLateRule({
    checkInIso: onTime,
    settings: { work_start_time: "08:00", grace_minutes: 34 },
  });
  assert.equal(result.status, "present");
  assert.equal(result.autoAppliedLate, false);
});
