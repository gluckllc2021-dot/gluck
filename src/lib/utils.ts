import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function todayJST(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function timeJST(now = new Date()) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

export function parseISODate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function weekdayOf(iso: string) {
  return WEEK[parseISODate(iso).getUTCDay()] ?? "";
}

export function formatLongDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${y}/${m}/${d}（${weekdayOf(iso)}）`;
}

export function formatMobileDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${Number(m)}月${Number(d)}日（${weekdayOf(iso)}）`;
}

export function shiftDate(iso: string, days: number) {
  const dt = parseISODate(iso);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function daysInMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function norm(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}
