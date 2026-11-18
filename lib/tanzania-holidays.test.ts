import assert from "node:assert/strict";
import test from "node:test";
import {
  easterSunday,
  isoDate,
  isNonWorkingDay,
  isSunday,
  monthDateRange,
  tanzaniaHolidaysForYear,
  weekdayUtc,
} from "./tanzania-holidays";

test("computes Easter Sunday for known years", () => {
  assert.deepEqual(easterSunday(2025), { month: 4, day: 20 });
  assert.deepEqual(easterSunday(2026), { month: 4, day: 5 });
  assert.equal(isoDate(2025, 4, 20), "2025-04-20");
});

test("includes BoT 2025 gazetted holidays and computed Easter", () => {
  const days = tanzaniaHolidaysForYear(2025);
  const byDate = Object.fromEntries(days.map((h) => [h.date, h.name]));
  assert.equal(byDate["2025-01-01"], "New Year's Day");
  assert.equal(byDate["2025-01-12"], "Zanzibar Revolution Day");
  assert.equal(byDate["2025-03-29"], "Eid El-Fitr");
  assert.equal(byDate["2025-04-07"], "Karume Day");
  assert.equal(byDate["2025-04-18"], "Good Friday");
  assert.equal(byDate["2025-04-21"], "Easter Monday");
  assert.equal(byDate["2025-04-26"], "Union Day");
  assert.equal(byDate["2025-05-01"], "Labour Day");
  assert.equal(byDate["2025-06-06"], "Eid El-Hajj");
  assert.equal(byDate["2025-07-07"], "Saba Saba Day");
  assert.equal(byDate["2025-08-08"], "Nane Nane Day");
  assert.equal(byDate["2025-09-04"], "Maulid Day");
  assert.equal(byDate["2025-10-14"], "Nyerere Day");
  assert.equal(byDate["2025-12-09"], "Independence Day");
  assert.equal(byDate["2025-12-25"], "Christmas Day");
  assert.equal(byDate["2025-12-26"], "Boxing Day");
  assert.ok(days.every((h) => h.official));
});

test("includes published 2026 Islamic dates (two days of Eid El-Fitr)", () => {
  const days = tanzaniaHolidaysForYear(2026);
  const byDate = Object.fromEntries(days.map((h) => [h.date, h.name]));
  assert.equal(byDate["2026-03-20"], "Eid El-Fitr");
  assert.equal(byDate["2026-03-21"], "Eid El-Fitr (siku ya pili)");
  assert.equal(byDate["2026-04-03"], "Good Friday");
  assert.equal(byDate["2026-04-06"], "Easter Monday");
  assert.equal(byDate["2026-05-27"], "Eid El-Hajj");
  assert.equal(byDate["2026-08-25"], "Maulid Day");
});

test("Sunday and public holidays are non-working; Saturday is a working day", () => {
  // 2026-04-26 is Union Day and a Sunday
  assert.equal(weekdayUtc("2026-04-26"), 0);
  assert.equal(isSunday("2026-04-26"), true);
  assert.equal(isNonWorkingDay("2026-04-26"), true);
  // Saturday 8 Aug 2026 is Nane Nane (holiday)
  assert.equal(weekdayUtc("2026-08-08"), 6);
  assert.equal(isNonWorkingDay("2026-08-08"), true);
  // A plain Saturday (2026-08-01) is a working day for NSSF ticks
  assert.equal(weekdayUtc("2026-08-01"), 6);
  assert.equal(isNonWorkingDay("2026-08-01"), false);
  // Extra holiday from the app table
  assert.equal(isNonWorkingDay("2026-08-03", ["2026-08-03"]), true);
  assert.equal(isNonWorkingDay("2026-08-03"), false);
});

test("monthDateRange handles month lengths", () => {
  assert.deepEqual(monthDateRange(2026, 2), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(monthDateRange(2026, 9), { start: "2026-09-01", end: "2026-09-30" });
  assert.deepEqual(monthDateRange(2025, 12), { start: "2025-12-01", end: "2025-12-31" });
});
