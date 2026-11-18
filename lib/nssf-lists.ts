/**
 * NSSF employee names extracted from CRDB bulk-salary PDFs that Allen
 * shared. Names and company only — no account numbers or amounts.
 *
 *   EAST AFRICAN SPIRIT (T) LTD — EASTL SEP 26 (35 people)
 *   GAKI INVESTMENT CO LTD      — GAKI MAY 26  (29 people)
 *   GK PACKAGING CO LTD         — GK DEC 25    (3 people)
 *
 * Wrapped name in the EASTL PDF: "Benardius Rutashobya Helman".
 */

export interface NssfListPerson {
  name: string;
  company: string;
}

export const NSSF_COMPANY_EASTL = "EAST AFRICAN SPIRIT (T) LTD";
export const NSSF_COMPANY_GAKI = "GAKI INVESTMENT CO LTD";
export const NSSF_COMPANY_GK = "GK PACKAGING CO LTD";

export const NSSF_LISTS: Record<string, string[]> = {
  [NSSF_COMPANY_EASTL]: [
    "Agiripina Giriman Helman",
    "Benardius Rutashobya Helman",
    "Benedictor John Jagadi",
    "Bernatus Costantine Medard",
    "Catherine Mahega Malaika",
    "Daud Mathias Shana",
    "Donald Mhungo Masunga",
    "Dotto Jacob Nyilila",
    "Dotto Paul Masanja",
    "Dotto Yusto Doganyi",
    "Edwin Saimon Erasto",
    "Elizabeth John Makolo",
    "Frances Ernest Nganiko",
    "Fredy Masunga Makindo",
    "Helena Bunwa Abel",
    "Immaculata Melchiory Temu",
    "Janeth James Mwandu",
    "Josephina Japhet Masunga",
    "Kirochi Sember Kirochi",
    "Kulwa Paul Masanja",
    "Martha Isaac Lumelezi",
    "Masunga Charles Mhuge",
    "Kitange Matimwa Kulwa",
    "Naumu Mathias Zakaria",
    "Ndekirwa Aminieli Kaaya",
    "Filimon Lazaro Bundala",
    "Ramadhan Mohamed Ntandu",
    "Richard Mugisha Gervas",
    "Robert Kafyeka Lulyeho",
    "Sajady Mtalemwa Suddy",
    "Sauda Ntandu Abdallah",
    "Valentine Pancras Sarimbo",
    "Venance Pius Kabado",
    "Zaitun Ramadhan Rashia",
    "Tatu Ramadhani Khamisi",
  ],
  [NSSF_COMPANY_GAKI]: [
    "Abdallah Kassim Matinga",
    "Ally Musa Malale",
    "Amos Deus Nninde",
    "Ashura Abdallah Rashid",
    "Dennis Gilead Kileo",
    "Erick Hanson Kileo",
    "Fatuma Omary Ally",
    "George Elias Makiwa",
    "Grace Weston Pwele",
    "Hamisi Ramadhani Nkundi",
    "Joshua Gidion Panja",
    "Jumanne Peter Mitwango",
    "Lazaro Amosi Mkumbo",
    "Leonard Venancy Makamba",
    "Lucy Loth Kimath",
    "Mbwana Ally Ramadhani",
    "Modest Emanuel Betty",
    "Nice Kaiza Thomas",
    "Obote Kippa Gyulla",
    "Philipo Steven Shimba",
    "Prisca Elias Mpaki",
    "Raymond Willbroad Kileo",
    "Regan John Kimario",
    "Savera Andrew Mugakazi",
    "Silas Zabron Kazungu",
    "Simon Jeremia Kulwa",
    "Emmanuel Titto Bundala",
    "Tumaini Gift Nyambo",
    "Zawadi Ramadhani Mjahidina",
  ],
  [NSSF_COMPANY_GK]: [
    "Manfred Frank Mushi",
    "Marco Masunga Mwandu",
    "Maria Stephano Andrew",
  ],
};

export function flattenNssfLists(): NssfListPerson[] {
  const people: NssfListPerson[] = [];
  for (const [company, names] of Object.entries(NSSF_LISTS)) {
    for (const name of names) people.push({ name, company });
  }
  return people;
}

/** Companies the import will create if they are missing (idempotent). */
export const NSSF_COMPANIES_TO_ENSURE = ["GK Packaging Co. Ltd"] as const;

export type NssfImportOverride =
  | {
      kind: "match";
      sourceName: string;
      sourceCompany: string;
      existingName: string;
      reason: string;
    }
  | {
      kind: "move";
      sourceName: string;
      sourceCompany: string;
      existingName: string;
      reason: string;
    };

/**
 * Decisions Allen confirmed on 18 Nov 2026 for the four dry-run questions.
 * These bypass the low-confidence / other-company review gates.
 */
export const NSSF_IMPORT_OVERRIDES: NssfImportOverride[] = [
  {
    kind: "match",
    sourceName: "Zaitun Ramadhan Rashia",
    sourceCompany: NSSF_COMPANY_EASTL,
    existingName: "ZAITUNI RAMADHANI RASHIDI",
    reason: "Allen confirmed this is the same person",
  },
  {
    kind: "match",
    sourceName: "Ally Musa Malale",
    sourceCompany: NSSF_COMPANY_GAKI,
    existingName: "ALLY MUSSA MASELE",
    reason: "Allen confirmed this is the same person",
  },
  {
    kind: "move",
    sourceName: "Emmanuel Titto Bundala",
    sourceCompany: NSSF_COMPANY_GAKI,
    existingName: "EMMANUEL TITO BUNDALA",
    reason: "Allen confirmed: move the existing record to Gaki Investment Co. Ltd and set Master Roll",
  },
];

