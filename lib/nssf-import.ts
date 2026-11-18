import { matchCompany, matchName, normalizeName, tokenSort } from "./name-match";
import {
  NSSF_COMPANIES_TO_ENSURE,
  NSSF_IMPORT_OVERRIDES,
  type NssfImportOverride,
  type NssfListPerson,
} from "./nssf-lists";

export interface ImportCompany {
  id: string;
  name: string;
}

export interface ImportEmployee {
  id: string;
  name: string;
  company_id: string | null;
  company_name: string | null;
  section_id?: string | null;
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
  | "company_missing"
  | "move_company"
  | "override_missing";

export interface ImportPlanRow {
  source_name: string;
  source_company: string;
  decision: ImportDecision;
  employee_id?: string;
  employee_name?: string;
  company_id?: string;
  company_name?: string;
  from_company_id?: string | null;
  from_company_name?: string | null;
  from_section_id?: string | null;
  previous_deduct_nssf?: boolean;
  pending_company?: boolean;
  override?: boolean;
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
  moveCompany: ImportPlanRow[];
  overrideMissing: ImportPlanRow[];
  companiesToCreate: { name: string }[];
}

export function pendingCompanyId(name: string): string {
  return `pending:${normalizeName(name)}`;
}

export function isPendingCompanyId(id: string | undefined): boolean {
  return Boolean(id && id.startsWith("pending:"));
}

export function resolveImportCompanies(existing: ImportCompany[]): {
  companies: ImportCompany[];
  companiesToCreate: { name: string }[];
} {
  const companies = [...existing];
  const companiesToCreate: { name: string }[] = [];
  for (const name of NSSF_COMPANIES_TO_ENSURE) {
    const match = matchCompany(name, companies);
    if (match.kind === "exact" || match.kind === "fuzzy") continue;
    companiesToCreate.push({ name });
    companies.push({ id: pendingCompanyId(name), name });
  }
  return { companies, companiesToCreate };
}

function sameName(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na === nb || tokenSort(na) === tokenSort(nb);
}

function findEmployeeByName(name: string, employees: ImportEmployee[]): ImportEmployee | null {
  const exact = employees.filter((e) => sameName(e.name, name));
  if (exact.length === 1) return exact[0];
  const match = matchName(
    name,
    employees.map((e) => ({ name: e.name, value: e })),
    { fuzzyThreshold: 0.9 }
  );
  if (match.kind === "exact" || match.kind === "fuzzy") return match.match.value;
  return null;
}

function findOverride(person: NssfListPerson): NssfImportOverride | undefined {
  return NSSF_IMPORT_OVERRIDES.find(
    (o) => sameName(o.sourceName, person.name) && sameName(o.sourceCompany, person.company)
  );
}

export function planNssfImport(
  people: NssfListPerson[],
  existingCompanies: ImportCompany[],
  employees: ImportEmployee[]
): ImportPlan {
  const { companies, companiesToCreate } = resolveImportCompanies(existingCompanies);
  const rows: ImportPlanRow[] = [];

  for (const person of people) {
    const companyMatch = matchCompany(person.company, companies);
    const company =
      companyMatch.kind === "exact" || companyMatch.kind === "fuzzy"
        ? companyMatch.match.value
        : undefined;
    const pendingCompany = company ? isPendingCompanyId(company.id) : false;

    const override = findOverride(person);
    if (override) {
      const emp = findEmployeeByName(override.existingName, employees);
      if (!emp) {
        rows.push({
          source_name: person.name,
          source_company: person.company,
          decision: "override_missing",
          company_id: company?.id,
          company_name: company?.name,
          override: true,
          note: `Override ilithibitishwa lakini "${override.existingName}" haijapatikana kwenye AtWork`,
        });
        continue;
      }

      if (override.kind === "move") {
        const alreadyThere = Boolean(company && emp.company_id === company.id);
        const alreadyNssf = Boolean(emp.deduct_nssf);
        if (alreadyThere && alreadyNssf) {
          rows.push({
            source_name: person.name,
            source_company: person.company,
            decision: "already_nssf",
            employee_id: emp.id,
            employee_name: emp.name,
            company_id: company?.id,
            company_name: company?.name,
            previous_deduct_nssf: true,
            override: true,
            note: override.reason,
          });
          continue;
        }
        if (alreadyThere && !alreadyNssf) {
          rows.push({
            source_name: person.name,
            source_company: person.company,
            decision: "set_nssf",
            employee_id: emp.id,
            employee_name: emp.name,
            company_id: company?.id,
            company_name: company?.name,
            previous_deduct_nssf: false,
            override: true,
            note: override.reason,
          });
          continue;
        }
        rows.push({
          source_name: person.name,
          source_company: person.company,
          decision: "move_company",
          employee_id: emp.id,
          employee_name: emp.name,
          company_id: company?.id,
          company_name: company?.name,
          from_company_id: emp.company_id,
          from_company_name: emp.company_name,
          from_section_id: emp.section_id ?? null,
          previous_deduct_nssf: Boolean(emp.deduct_nssf),
          pending_company: pendingCompany,
          override: true,
          note: `${override.reason}. Sasa: ${emp.company_name ?? "bila kampuni"}. Sehemu itafutwa endapo kampuni inabadilika.`,
        });
        continue;
      }

      // kind === "match"
      rows.push({
        source_name: person.name,
        source_company: person.company,
        decision: Boolean(emp.deduct_nssf) ? "already_nssf" : "set_nssf",
        employee_id: emp.id,
        employee_name: emp.name,
        company_id: emp.company_id ?? company?.id,
        company_name: emp.company_name ?? company?.name,
        previous_deduct_nssf: Boolean(emp.deduct_nssf),
        override: true,
        note: override.reason,
      });
      continue;
    }

    if (!company) {
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
        previous_deduct_nssf: already,
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
          from_company_id: null,
          from_company_name: null,
          previous_deduct_nssf: Boolean(emp.deduct_nssf),
          score: global.score,
          note: Boolean(emp.deduct_nssf)
            ? "Yupo AtWork bila kampuni; atahusishwa na kampuni ya orodha"
            : "Yupo AtWork bila kampuni — atawekwa kwenye Master Roll na kuhusishwa na kampuni ya orodha",
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
        from_company_id: emp.company_id,
        from_company_name: emp.company_name,
        previous_deduct_nssf: Boolean(emp.deduct_nssf),
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
      pending_company: pendingCompany,
      note: pendingCompany
        ? "Kampuni itaundwa, kisha mfanyakazi ataongezwa"
        : "Hipo kwenye orodha ya Master Roll lakini hayupo kwenye AtWork",
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
    moveCompany: pick("move_company"),
    overrideMissing: pick("override_missing"),
    companiesToCreate,
  };
}
