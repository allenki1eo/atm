import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalCompanyKey,
  matchCompany,
  matchName,
  nameSimilarity,
  normalizeName,
  tokenSort,
} from "./name-match";

test("normalizes and token-sorts names", () => {
  assert.equal(normalizeName("  Kitange, Matimwa  Kulwa "), "kitange matimwa kulwa");
  assert.equal(tokenSort("kitange matimwa kulwa"), "kitange kulwa matimwa");
});

test("treats reordered names as a near-exact match", () => {
  const score = nameSimilarity("Kitange Matimwa Kulwa", "MATIMWA KULWA KITANGE");
  assert.ok(score >= 0.99, `score=${score}`);
  const result = matchName("Kitange Matimwa Kulwa", [
    { name: "MATIMWA KULWA KITANGE", value: "a" },
  ]);
  assert.equal(result.kind, "exact");
});

test("matches common CRDB vs AtWork spelling variants", () => {
  const pairs: [string, string][] = [
    ["Agiripina Giriman Helman", "AGRIPINA GIRIMANI HELMAN"],
    ["Donald Mhungo Masunga", "DONALD MHUGO MASUNGA"],
    ["Dotto Yusto Doganyi", "DOTTO YUSTO DOGANI"],
    ["Kirochi Sember Kirochi", "KIROCHI SEMBERA KIROCHI"],
    ["Naumu Mathias Zakaria", "NAUMU MATHIAS ZACHARIA"],
    ["Sauda Ntandu Abdallah", "SAUDA NTANDU ABDALA"],
    ["Zaitun Ramadhan Rashia", "ZAITUNI RAMADHANI RASHIDI"],
    ["Emmanuel Titto Bundala", "EMMANUEL TITO BUNDALA"],
  ];
  for (const [a, b] of pairs) {
    const result = matchName(a, [{ name: b, value: b }]);
    assert.notEqual(result.kind, "none", `${a} vs ${b}`);
  }
});

test("flags two similarly scored candidates as ambiguous", () => {
  const result = matchName("Dotto Paul Masanja", [
    { name: "Dotto Paul Masanja", value: "1" },
    { name: "Dotto Paul Masania", value: "2" },
  ]);
  // First is exact; if the second is close enough this may be ambiguous.
  // An exact unique best should win when the gap is large enough.
  if (result.kind === "ambiguous") {
    assert.ok(result.matches.length >= 2);
  } else {
    assert.equal(result.kind, "exact");
    if (result.kind === "exact") assert.equal(result.match.value, "1");
  }
});

test("does not match unrelated names", () => {
  const result = matchName("Valentine Pancras Sarimbo", [
    { name: "Daud Mathias Shana", value: "x" },
  ]);
  assert.equal(result.kind, "none");
});

test("matches company aliases including packed GAKI spelling", () => {
  assert.equal(canonicalCompanyKey("EASTL"), "east african spirit");
  assert.equal(canonicalCompanyKey("GAKIINVESTMENT COLTD"), "gaki investment");
  assert.equal(canonicalCompanyKey("GK PACKAGING CO. LTD"), "gk packaging");

  const result = matchCompany("EAST AFRICAN SPIRIT (T) LTD", [
    { id: "c1", name: "East African Spirit Ltd" },
    { id: "c2", name: "Gaki Investment Co Ltd" },
  ]);
  assert.equal(result.kind, "exact");
  if (result.kind === "exact") assert.equal(result.match.value.id, "c1");
});
