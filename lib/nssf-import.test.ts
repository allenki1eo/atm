import assert from "node:assert/strict";
import test from "node:test";
import { flattenNssfLists } from "./nssf-lists";
import { planNssfImport } from "./nssf-import";

const companies = [
  { id: "eastl", name: "East African Spirit (T) Ltd" },
  { id: "gaki", name: "Gaki Investment Co Ltd" },
  { id: "gk", name: "GK Packaging Co. Ltd" },
];

test("matches spelling and name-order variants inside the right company", () => {
  const plan = planNssfImport(
    [
      { name: "Agiripina Giriman Helman", company: "EAST AFRICAN SPIRIT (T) LTD" },
      { name: "Kitange Matimwa Kulwa", company: "EAST AFRICAN SPIRIT (T) LTD" },
    ],
    companies,
    [
      {
        id: "1",
        name: "AGRIPINA GIRIMANI HELMAN",
        company_id: "eastl",
        company_name: "East African Spirit (T) Ltd",
        deduct_nssf: 0,
        active: 1,
      },
      {
        id: "2",
        name: "MATIMWA KULWA KITANGE",
        company_id: "eastl",
        company_name: "East African Spirit (T) Ltd",
        deduct_nssf: 1,
        active: 1,
      },
    ]
  );
  assert.equal(plan.setNssf.length, 1);
  assert.equal(plan.setNssf[0].employee_id, "1");
  assert.equal(plan.alreadyNssf.length, 1);
  assert.equal(plan.alreadyNssf[0].employee_id, "2");
  assert.equal(plan.toCreate.length, 0);
});

test("proposes creating people who are not in AtWork", () => {
  const plan = planNssfImport(
    [{ name: "Martha Isaac Lumelezi", company: "EAST AFRICAN SPIRIT (T) LTD" }],
    companies,
    []
  );
  assert.equal(plan.toCreate.length, 1);
  assert.equal(plan.toCreate[0].company_id, "eastl");
});

test("flags a same name found in a different company", () => {
  const plan = planNssfImport(
    [{ name: "Hamisi Shija Hamisi", company: "GAKI INVESTMENT CO LTD" }],
    companies,
    [
      {
        id: "x",
        name: "HAMISI SHIJA HAMISI",
        company_id: "eastl",
        company_name: "East African Spirit (T) Ltd",
        deduct_nssf: 0,
        active: 1,
      },
    ]
  );
  assert.equal(plan.otherCompany.length, 1);
  assert.equal(plan.otherCompany[0].employee_id, "x");
  assert.equal(plan.toCreate.length, 0);
});

test("built-in lists have 35 + 29 + 3 names", () => {
  const people = flattenNssfLists();
  assert.equal(people.length, 67);
  assert.equal(people.filter((p) => p.company.includes("EAST")).length, 35);
  assert.equal(people.filter((p) => p.company.includes("GAKI")).length, 29);
  assert.equal(people.filter((p) => p.company.includes("PACKAGING")).length, 3);
  assert.ok(people.some((p) => p.name === "Benardius Rutashobya Helman"));
});

test("exact names with no company are unassigned, not other-company", () => {
  const plan = planNssfImport(
    [{ name: "George Elias Makiwa", company: "GAKI INVESTMENT CO LTD" }],
    companies,
    [
      {
        id: "g1",
        name: "GEORGE ELIAS MAKIWA",
        company_id: null,
        company_name: null,
        deduct_nssf: 0,
        active: 1,
      },
    ]
  );
  assert.equal(plan.unassigned.length, 1);
  assert.equal(plan.unassigned[0].employee_id, "g1");
  assert.equal(plan.unassigned[0].company_id, "gaki");
  assert.equal(plan.otherCompany.length, 0);
});

test("low-confidence fuzzy matches need review and are not auto-applied", () => {
  const plan = planNssfImport(
    [{ name: "John Musa Malale", company: "GAKI INVESTMENT CO LTD" }],
    companies,
    [
      {
        id: "a1",
        name: "JOHN MUSSA MASELE",
        company_id: "gaki",
        company_name: "Gaki Investment Co Ltd",
        deduct_nssf: 0,
        active: 1,
      },
    ]
  );
  assert.equal(plan.fuzzyReview.length, 1);
  assert.equal(plan.setNssf.length, 0);
});

test("Allen override: Zaitun matches ZAITUNI RAMADHANI RASHIDI even below 90%", () => {
  const plan = planNssfImport(
    [{ name: "Zaitun Ramadhan Rashia", company: "EAST AFRICAN SPIRIT (T) LTD" }],
    companies,
    [
      {
        id: "z1",
        name: "ZAITUNI RAMADHANI RASHIDI",
        company_id: "eastl",
        company_name: "East African Spirit (T) Ltd",
        deduct_nssf: 0,
        active: 1,
      },
    ]
  );
  assert.equal(plan.fuzzyReview.length, 0);
  assert.equal(plan.setNssf.length, 1);
  assert.equal(plan.setNssf[0].employee_id, "z1");
  assert.equal(plan.setNssf[0].override, true);
});

test("Allen override: Ally Musa Malale matches ALLY MUSSA MASELE", () => {
  const plan = planNssfImport(
    [{ name: "Ally Musa Malale", company: "GAKI INVESTMENT CO LTD" }],
    companies,
    [
      {
        id: "a1",
        name: "ALLY MUSSA MASELE",
        company_id: "gaki",
        company_name: "Gaki Investment Co Ltd",
        deduct_nssf: 0,
        active: 1,
      },
    ]
  );
  assert.equal(plan.fuzzyReview.length, 0);
  assert.equal(plan.setNssf.length, 1);
  assert.equal(plan.setNssf[0].employee_id, "a1");
  assert.equal(plan.setNssf[0].override, true);
});

test("Allen override: Emmanuel moves from East African Spirit to GAKI and sets NSSF", () => {
  const plan = planNssfImport(
    [{ name: "Emmanuel Titto Bundala", company: "GAKI INVESTMENT CO LTD" }],
    companies,
    [
      {
        id: "x",
        name: "EMMANUEL TITO BUNDALA",
        company_id: "eastl",
        company_name: "East African Spirit (T) Ltd",
        section_id: "sec-eastl",
        deduct_nssf: 0,
        active: 1,
      },
    ]
  );
  assert.equal(plan.otherCompany.length, 0);
  assert.equal(plan.moveCompany.length, 1);
  const row = plan.moveCompany[0];
  assert.equal(row.employee_id, "x");
  assert.equal(row.company_id, "gaki");
  assert.equal(row.from_company_id, "eastl");
  assert.equal(row.from_section_id, "sec-eastl");
  assert.equal(row.override, true);
  assert.equal(row.previous_deduct_nssf, false);
});

test("creates GK Packaging when missing and plans its three people", () => {
  const plan = planNssfImport(
    flattenNssfLists().filter((p) => p.company.includes("PACKAGING")),
    companies.filter((c) => c.id !== "gk"),
    []
  );
  assert.equal(plan.companiesToCreate.length, 1);
  assert.equal(plan.companiesToCreate[0].name, "GK Packaging Co. Ltd");
  assert.equal(plan.companyMissing.length, 0);
  assert.equal(plan.toCreate.length, 3);
  assert.ok(plan.toCreate.every((r) => r.pending_company && r.company_name === "GK Packaging Co. Ltd"));
  assert.ok(plan.toCreate.some((r) => r.source_name === "Manfred Frank Mushi"));
  assert.ok(plan.toCreate.some((r) => r.source_name === "Marco Masunga Mwandu"));
  assert.ok(plan.toCreate.some((r) => r.source_name === "Maria Stephano Andrew"));
});

test("does not re-create GK Packaging when it already exists", () => {
  const plan = planNssfImport(
    [{ name: "Marco Masunga Mwandu", company: "GK PACKAGING CO LTD" }],
    companies,
    []
  );
  assert.equal(plan.companiesToCreate.length, 0);
  assert.equal(plan.toCreate.length, 1);
  assert.equal(plan.toCreate[0].company_id, "gk");
  assert.equal(plan.toCreate[0].pending_company, false);
});

