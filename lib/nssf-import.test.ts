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
    [{ name: "Emmanuel Titto Bundala", company: "GAKI INVESTMENT CO LTD" }],
    companies,
    [
      {
        id: "x",
        name: "EMMANUEL TITO BUNDALA",
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
  assert.equal(plan.fuzzyReview.length, 1);
  assert.equal(plan.setNssf.length, 0);
});

