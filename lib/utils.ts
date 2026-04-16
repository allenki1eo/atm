import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format an integer amount stored in shilingi (whole units, no cents)
 * as TZS. e.g. 15000 → "TZS 15,000"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("sw-TZ", {
    style: "currency",
    currency: "TZS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Short currency without symbol, e.g. "15,000" */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat("sw-TZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("sw-TZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

export function formatDateShort(date: string | Date): string {
  return new Intl.DateTimeFormat("sw-TZ", {
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export function getMonthStart(date: Date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth(), 1)
    .toISOString()
    .split("T")[0];
}

export function getMonthEnd(date: Date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
    .toISOString()
    .split("T")[0];
}

export function getMonthDays(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// ── Swahili i18n strings ──────────────────────────────────────────────────
export const sw = {
  // Status labels
  hali: {
    present: "Alikuwepo",
    absent: "Hakuwepo",
    late: "Alichelewa",
    half_day: "Nusu Siku",
  },
  // Attendance page
  siku_ya_leo: "Mahudhurio ya Leo",
  tia_alama: "Weka Alama",
  weka_wote_walikuwepo: "Weka Wote: Walikuwepo",
  weka_walichagulika_hawakuwepo: "Weka Waliochaguliwa: Hawakuwepo",
  funga_siku: "Funga Siku",
  tafuta_mfanyakazi: "Tafuta mfanyakazi...",
  idadi_wafanyakazi: "Jumla ya Wafanyakazi",
  walikuwepo: "Walikuwepo",
  hawakuwepo: "Hawakuwepo",
  walichelewa: "Walichelewa",
  bila_alama: "Bila Alama",
  // Financial
  muhtasari_wa_fedha: "Muhtasari wa Fedha",
  siku_zilizofanywa_kazi: "Siku za Kazi",
  malipo_ya_jumla: "Malipo ya Jumla",
  mikopo_iliyochukuliwa: "Mikopo Iliyochukuliwa",
  malipo_ya_wazi: "Malipo ya Wazi",
  bakaa_ya_wazi: "Bakaa ya Wazi",
  omba_mkopo: "Omba Mkopo",
  // Payroll
  mshahara: "Mshahara",
  kipindi_cha_mshahara: "Kipindi cha Mshahara",
  funga_mshahara: "Funga Mshahara",
  // General
  jina: "Jina",
  simu: "Simu",
  idara: "Idara",
  aina: "Aina",
  kiwango: "Kiwango",
  hifadhi: "Hifadhi",
  futa: "Futa",
  badilisha: "Badilisha",
  ongeza: "Ongeza",
  taarifa: "Taarifa",
  imehifadhiwa: "Imehifadhiwa",
  hitilafu: "Hitilafu",
  inabandikwa: "Inabandikwa...",
};
