import type { FinanceSettings, Invoice } from "./model";

export type InvoiceAmountBreakdown = {
  baseAmount: number;
  lateFee: number;
  interest: number;
  totalDue: number;
  daysOverdue: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dateOnly(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function daysBetween(startDate: string, endDate: string) {
  return Math.floor((dateOnly(endDate) - dateOnly(startDate)) / 86_400_000);
}

export function dueDateForMonth(referenceMonth: string, dueDay: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(referenceMonth);
  if (!match) throw new Error("Mês de referência inválido.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("Mês de referência inválido.");

  const normalizedDay = Math.min(31, Math.max(1, Math.trunc(dueDay)));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(normalizedDay, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function invoiceAmountDue(
  invoice: Pick<Invoice, "amount" | "dueDate" | "status">,
  settings: FinanceSettings,
  asOf = new Date().toISOString().slice(0, 10),
): InvoiceAmountBreakdown {
  const baseAmount = roundMoney(Math.max(0, invoice.amount));
  if (invoice.status === "paid" || invoice.status === "cancelled" || invoice.status === "negotiated") {
    return { baseAmount, lateFee: 0, interest: 0, totalDue: baseAmount, daysOverdue: 0 };
  }

  const elapsed = Math.max(0, daysBetween(invoice.dueDate, asOf));
  const daysOverdue = Math.max(0, elapsed - Math.max(0, Math.trunc(settings.graceDays)));
  if (daysOverdue <= 0) {
    return { baseAmount, lateFee: 0, interest: 0, totalDue: baseAmount, daysOverdue: 0 };
  }

  let lateFee = 0;
  if (settings.lateFeeMode === "fixed") lateFee = settings.lateFeeValue;
  if (settings.lateFeeMode === "percent") lateFee = baseAmount * settings.lateFeeValue / 100;
  lateFee = roundMoney(Math.max(0, lateFee));

  let interest = 0;
  if (settings.interestMode === "daily_percent") {
    interest = baseAmount * settings.interestValue / 100 * daysOverdue;
  } else if (settings.interestMode === "monthly_percent") {
    interest = baseAmount * settings.interestValue / 100 * daysOverdue / 30;
  } else if (settings.interestMode === "fixed_daily") {
    interest = settings.interestValue * daysOverdue;
  }
  interest = roundMoney(Math.max(0, interest));

  return {
    baseAmount,
    lateFee,
    interest,
    totalDue: roundMoney(baseAmount + lateFee + interest),
    daysOverdue,
  };
}

export function referenceMonthFromDate(value = new Date()) {
  const year = value.getFullYear();
  const month = value.getMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}
