import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

export function formatDateShort(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
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

export function parseAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}
