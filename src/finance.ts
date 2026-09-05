import type { Invoice, SchoolSettings } from "./model";

const DAY_MS = 86_400_000;

function cents(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function daysLate(dueDate: string, today = new Date()) {
  const due = new Date(`${dueDate.slice(0, 10)}T12:00:00`);
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return Math.max(0, Math.floor((current.getTime() - due.getTime()) / DAY_MS));
}

export function invoiceBalance(invoice: Invoice, settings: SchoolSettings, today = new Date()) {
  if (invoice.status === "paid") return invoice.paidAmount ?? invoice.amount;
  if (invoice.status === "negotiated") return 0;

  const lateDays = daysLate(invoice.dueDate, today);
  if (lateDays === 0) return invoice.amount;

  const fee = invoice.amount * (settings.lateFeePercent / 100);
  const interest = invoice.amount * (settings.monthlyInterestPercent / 100) * (lateDays / 30);
  return cents(invoice.amount + fee + interest);
}

export function invoiceCharges(invoice: Invoice, settings: SchoolSettings, today = new Date()) {
  const lateDays = daysLate(invoice.dueDate, today);
  if (!lateDays || invoice.status === "paid" || invoice.status === "negotiated") {
    return { lateDays: 0, fee: 0, interest: 0, total: invoice.paidAmount ?? invoice.amount };
  }
  const fee = cents(invoice.amount * (settings.lateFeePercent / 100));
  const interest = cents(invoice.amount * (settings.monthlyInterestPercent / 100) * (lateDays / 30));
  return { lateDays, fee, interest, total: cents(invoice.amount + fee + interest) };
}

export function dueDateForDay(baseDate: string, dueDay: number | null | undefined) {
  if (!dueDay) return baseDate;
  const [year, month] = baseDate.slice(0, 10).split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(Math.max(1, dueDay), lastDay);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addMonthsClamped(date: string, months: number) {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const target = new Date(year, month - 1 + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const resolvedDay = Math.min(day, lastDay);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(resolvedDay).padStart(2, "0")}`;
}

export function splitIntoInstallments(total: number, count: number) {
  const safeCount = Math.max(1, Math.min(60, Math.trunc(count)));
  const totalCents = Math.round(total * 100);
  const base = Math.floor(totalCents / safeCount);
  const remainder = totalCents - base * safeCount;
  return Array.from({ length: safeCount }, (_, index) => (base + (index < remainder ? 1 : 0)) / 100);
}
