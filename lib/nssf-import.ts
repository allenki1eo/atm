import { matchCompany, matchName } from "./name-match";
import type { NssfListPerson } from "./nssf-lists";

export interface ImportCompany {
  id: string;
  name: string;
}

export interface ImportEmployee {
  id: string;
  name: string;
  company_id: string | null;
  company_name: string | null;
  deduct_nssf: number | boolean;
  active: number | boolean;
}

export type ImportDecision =
  | "set_nssf"
  | "already_nssf"
  | "create"
  | "ambiguous"
  | "other_company"
  | "unassigned"
  | "fuzzy_review"
  | "company_missing";

export interface ImportPlanRow {
  source_name: string;
  source_company: string;
  decision: ImportDecision;
  employee_id?: string;
  employee_name?: string;
  company_id?: string;
  company_name?: string;
  score?: number;
  note?: string;
  alternatives?: { id: string; name: string; company_name: string | null }[];
}

export interface ImportPlan {
  rows: ImportPlanRow[];
  setNssf: ImportPlanRow[];
  alreadyNssf: ImportPlanRow[];
  toCreate: ImportPlanRow[];
  ambiguous: ImportPlanRow[];
  otherCompany: ImportPlanRow[];
  unassigned: ImportPlanRow[];
  fuzzyReview: ImportPlanRow[];
  companyMissing: ImportPlanRow[];
}

export function planNssfImport(
  people: NssfListPerson[],
  companies: ImportCompany[],
  employees: ImportEmployee[]
): ImportPlan {
  const rows: ImportPlanRow[] = [];

  for (const person of people) {
    const companyMatch = matchCompany(person.company, companies);
    if (companyMatch.kind === "none" || companyMatch.kind === "ambiguous") {
      rows.push({
        source_name: person.name,
        source_company: person.company,
        decision: "company_missing",
        note:
          companyMatch.kind === "ambiguous"
            ? "Kampuni inafanana na zaidi ya moja"
            : "Kampuni haijapatikana kwenye AtWork",
        alternatives:
          companyMatch.kind === "ambiguous"
            ? companyMatch.matches.map((m) => ({
                id: m.value.id,
                name: m.value.name,
                company_name: m.value.name,
              }))
            : undefined,
      });
      continue;
    }

    const company = companyMatch.match.value;
    const inCompany = employees.filter((e) => e.company_id === company.id);
    const local = matchName(
      person.name,
      inCompany.map((e) => ({ name: e.name, value: e }))
    );

    if (local.kind === "exact" || local.kind === "fuzzy") {
      const emp = local.match.value;
      const already = Boolean(emp.deduct_nssf);
      const fuzzyNeedsReview = local.kind === "fuzzy" && local.score < 0.9;
      const decision = fuzzyNeedsReview
        ? "fuzzy_review"
        : already
          ? "already_nssf"
          : "set_nssf";
      rows.push({
        source_name: person.name,
        source_company: person.company,
        decision,
        employee_id: emp.id,
        employee_name: emp.name,
        company_id: company.id,
        company_name: company.name,
        score: local.score,
        note: fuzzyNeedsReview
          ? `Linganisho la karibu (${Math.round(local.score * 100)}%) — thibitisha kabla ya kutumia`
          : local.kind === "fuzzy"
            ? `Imelinganishwa kwa karibu (${Math.round(local.score * 100)}%)`
            : undefined,
      });
      continue;
    }

    if (local.kind === "ambiguous") {
      rows.push({
        source_name: person.name,
        source_company: person.company,
        decision: "ambiguous",
        company_id: company.id,
        company_name: company.name,
        score: local.score,
        note: "Zaidi ya mfanyakazi mmoja anafanana na jina hili",
        alternatives: local.matches.map((m) => ({
          id: m.value.id,
          name: m.value.name,
          company_name: m.value.company_name,
        })),
      });
      continue;
    }

    const global = matchName(
      person.name,
      employees
        .filter((e) => e.company_id !== company.id)
        .map((e) => ({ name: e.name, value: e }))
    );

    if (global.kind === "exact" || global.kind === "fuzzy") {
      const emp = global.match.value;
      const unassigned = !emp.company_id;
      const fuzzyNeedsReview = global.kind === "fuzzy" && global.score < 0.9;
      if (unassigned && !fuzzyNeedsReview) {
        rows.push({
          source_name: person.name,
          source_company: person.company,
          decision: Boolean(emp.deduct_nssf) ? "already_nssf" : "unassigned",
          employee_id: emp.id,
          employee_name: emp.name,
          company_id: company.id,
          company_name: company.name,
          score: global.score,
          note: Boolean(emp.deduct_nssf)
            ? "Yupo AtWork bila kampuni; atahusishwa na kampuni ya orodha"
            : "Yupo AtWork bila kampuni — atawekwa NSSF na kuhusishwa na kampuni ya orodha",
        });
        continue;
      }
      rows.push({
        source_name: person.name,
        source_company: person.company,
        decision: fuzzyNeedsReview && unassigned ? "fuzzy_review" : "other_company",
        employee_id: emp.id,
        employee_name: emp.name,
        company_id: emp.company_id ?? undefined,
        company_name: emp.company_name ?? undefined,
        score: global.score,
        note: unassigned
          ? `Linganisho la karibu (${Math.round(global.score * 100)}%) na mfanyakazi asiye na kampuni — thibitisha`
          : `Jina linafanana na mfanyakazi katika ${emp.company_name ?? "kampuni nyingine"}`,
      });
      continue;
    }

    if (global.kind === "ambiguous") {
      rows.push({
        source_name: person.name,
        source_company: person.company,
        decision: "ambiguous",
        company_id: company.id,
        company_name: company.name,
        score: global.score,
        note: "Jina linafanana na wafanyakazi katika kampuni nyingine",
        alternatives: global.matches.map((m) => ({
          id: m.value.id,
          name: m.value.name,
          company_name: m.value.company_name,
        })),
      });
      continue;
    }

    rows.push({
      source_name: person.name,
      source_company: person.company,
      decision: "create",
      company_id: company.id,
      company_name: company.name,
      note: "Hipo kwenye orodha ya NSSF lakini hayupo kwenye AtWork",
    });
  }

  const pick = (d: ImportDecision) => rows.filter((r) => r.decision === d);
  return {
    rows,
    setNssf: pick("set_nssf"),
    alreadyNssf: pick("already_nssf"),
    toCreate: pick("create"),
    ambiguous: pick("ambiguous"),
    otherCompany: pick("other_company"),
    unassigned: pick("unassigned"),
    fuzzyReview: pick("fuzzy_review"),
    companyMissing: pick("company_missing"),
  };
}
