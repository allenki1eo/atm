/** Fuzzy person-name matching that tolerates spelling and name-order differences. */

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSort(normalized: string): string {
  return normalized.split(" ").filter(Boolean).sort().join(" ");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const sa = tokenSort(na);
  const sb = tokenSort(nb);
  if (sa === sb) return 0.99;
  const dist = Math.min(levenshtein(na, nb), levenshtein(sa, sb));
  const maxLen = Math.max(sa.length, sb.length, na.length, nb.length);
  return maxLen === 0 ? 0 : 1 - dist / maxLen;
}

export interface NameCandidate<T> {
  name: string;
  value: T;
}

export type NameMatch<T> =
  | { kind: "exact"; score: number; match: NameCandidate<T> }
  | { kind: "fuzzy"; score: number; match: NameCandidate<T> }
  | { kind: "ambiguous"; score: number; matches: NameCandidate<T>[] }
  | { kind: "none"; score: number };

const EXACT = 0.97;
const FUZZY = 0.82;
const AMBIGUOUS_GAP = 0.04;

export function matchName<T>(
  query: string,
  candidates: NameCandidate<T>[],
  options: { fuzzyThreshold?: number } = {}
): NameMatch<T> {
  const fuzzyThreshold = options.fuzzyThreshold ?? FUZZY;
  if (!candidates.length) return { kind: "none", score: 0 };

  const scored = candidates
    .map((c) => ({ c, score: nameSimilarity(query, c.name) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best.score < fuzzyThreshold) return { kind: "none", score: best.score };

  const close = scored.filter((s) => best.score - s.score <= AMBIGUOUS_GAP && s.score >= fuzzyThreshold);
  if (close.length > 1) {
    return { kind: "ambiguous", score: best.score, matches: close.map((s) => s.c) };
  }
  if (best.score >= EXACT) return { kind: "exact", score: best.score, match: best.c };
  return { kind: "fuzzy", score: best.score, match: best.c };
}

export function normalizeCompanyName(raw: string): string {
  return normalizeName(raw)
    .replace(/\b(company|co|ltd|limited|t)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const COMPANY_ALIASES: Record<string, string[]> = {
  "east african spirit": [
    "EAST AFRICAN SPIRIT (T) LTD",
    "EAST AFRICAN SPIRIT (T) LIMITED",
    "EAST AFRICAN SPIRIT LTD",
    "EAST AFRICAN SPIRIT LIMITED",
    "EASTL",
  ],
  "gaki investment": [
    "GAKI INVESTMENT CO LTD",
    "GAKI INVESTMENT CO. LTD",
    "GAKIINVESTMENT COLTD",
    "GAKI",
  ],
  "gk packaging": [
    "GK PACKAGING CO LTD",
    "GK PACKAGING CO. LTD",
    "GK PACKAGING",
    "GK",
  ],
};

export function canonicalCompanyKey(raw: string): string | null {
  const n = normalizeCompanyName(raw);
  if (!n) return null;
  for (const [key, aliases] of Object.entries(COMPANY_ALIASES)) {
    const all = [key, ...aliases.map(normalizeCompanyName)];
    if (all.includes(n)) return key;
    if (all.some((a) => a && (n.includes(a) || a.includes(n)))) return key;
  }
  return n;
}

export function matchCompany(
  query: string,
  companies: { id: string; name: string }[]
): NameMatch<{ id: string; name: string }> {
  const qKey = canonicalCompanyKey(query);
  const exact = companies.filter((c) => canonicalCompanyKey(c.name) === qKey && qKey);
  if (exact.length === 1) {
    return { kind: "exact", score: 1, match: { name: exact[0].name, value: exact[0] } };
  }
  return matchName(
    query,
    companies.map((c) => ({ name: c.name, value: c })),
    { fuzzyThreshold: 0.7 }
  );
}
