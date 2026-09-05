import { dueDateForMonth } from "./finance-utils";
import { makeId, type ClassItem, type Invoice, type SchoolDatabase, type Student } from "./model";

function localDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function monthFromDate(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDate();
  return normalized.slice(0, 7);
}

function addMonths(referenceMonth: string, offset: number) {
  const [yearText, monthText] = referenceMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function referenceLabel(referenceMonth: string) {
  const [year, month] = referenceMonth.split("-");
  return `${month}/${year}`;
}

function invoiceStatusFor(dueDate: string): Invoice["status"] {
  return dueDate < localDate() ? "overdue" : "pending";
}

function dueDayFor(student: Student, database: SchoolDatabase) {
  const fallback = database.settings.finance.allowedDueDays[0] ?? 10;
  return student.dueDay && database.settings.finance.allowedDueDays.includes(student.dueDay)
    ? student.dueDay
    : fallback;
}

export function buildFixedCoursePlan(database: SchoolDatabase, student: Student, classItem: ClassItem) {
  if ((classItem.durationType ?? "open_ended") !== "fixed") return [] as Invoice[];
  const months = Math.max(1, Math.min(240, Math.trunc(classItem.durationMonths ?? 0)));
  if (!months || classItem.monthlyFee <= 0) return [] as Invoice[];

  const startMonth = monthFromDate(student.enrollmentStartDate || student.createdAt.slice(0, 10));
  const dueDay = dueDayFor(student, database);
  const now = new Date().toISOString();
  const invoices: Invoice[] = [];

  for (let index = 0; index < months; index += 1) {
    const referenceMonth = addMonths(startMonth, index);
    const duplicate = database.invoices.some((item) => item.studentId === student.id && item.installmentNumber === index + 1 && item.planGenerated);
    if (duplicate) continue;
    const dueDate = dueDateForMonth(referenceMonth, dueDay);
    invoices.push({
      id: makeId("cobranca"),
      studentId: student.id,
      reference: referenceLabel(referenceMonth),
      dueDate,
      amount: classItem.monthlyFee,
      status: invoiceStatusFor(dueDate),
      paidAt: null,
      installmentNumber: index + 1,
      planGenerated: true,
      cancelledAt: null,
      cancellationReason: "",
      createdAt: now,
    });
  }
  return invoices;
}

export function ensureOpenEndedInvoiceForMonth(database: SchoolDatabase, student: Student, classItem: ClassItem, referenceMonth: string) {
  if ((classItem.durationType ?? "open_ended") !== "open_ended") return null;
  if ((student.enrollmentStatus ?? (student.active ? "active" : "paused")) !== "active") return null;
  if (classItem.monthlyFee <= 0 || !/^\d{4}-\d{2}$/.test(referenceMonth)) return null;

  const reference = referenceLabel(referenceMonth);
  const exists = database.invoices.some((item) => item.studentId === student.id && item.reference === reference && item.status !== "cancelled");
  if (exists) return null;
  const dueDate = dueDateForMonth(referenceMonth, dueDayFor(student, database));
  return {
    id: makeId("cobranca"),
    studentId: student.id,
    reference,
    dueDate,
    amount: classItem.monthlyFee,
    status: invoiceStatusFor(dueDate),
    paidAt: null,
    installmentNumber: null,
    planGenerated: false,
    cancelledAt: null,
    cancellationReason: "",
    createdAt: new Date().toISOString(),
  } satisfies Invoice;
}

export function pauseEnrollment(database: SchoolDatabase, studentId: string, reason: string, pausedAt = new Date().toISOString()) {
  const student = database.students.find((item) => item.id === studentId);
  if (!student) return 0;
  student.enrollmentStatus = "paused";
  student.active = false;
  student.pausedAt = pausedAt;
  student.pauseReason = reason.trim().slice(0, 500);

  const cutoff = pausedAt.slice(0, 10);
  let cancelled = 0;
  for (const invoice of database.invoices) {
    if (invoice.studentId !== studentId) continue;
    if (invoice.status !== "pending" && invoice.status !== "overdue") continue;
    if (invoice.dueDate <= cutoff) continue;
    invoice.status = "cancelled";
    invoice.cancelledAt = pausedAt;
    invoice.cancellationReason = student.pauseReason || "Matrícula trancada";
    cancelled += 1;
  }
  return cancelled;
}

export function resumeEnrollment(database: SchoolDatabase, studentId: string) {
  const student = database.students.find((item) => item.id === studentId);
  if (!student) return false;
  student.enrollmentStatus = "active";
  student.active = true;
  student.pausedAt = null;
  student.pauseReason = "";
  return true;
}

export function rescheduleFutureInvoices(database: SchoolDatabase, studentId: string, newDueDay: number, fromDate = localDate()) {
  const student = database.students.find((item) => item.id === studentId);
  if (!student || !Number.isInteger(newDueDay) || newDueDay < 1 || newDueDay > 31) return 0;
  student.dueDay = newDueDay;

  let changed = 0;
  for (const invoice of database.invoices) {
    if (invoice.studentId !== studentId) continue;
    if (invoice.status !== "pending" && invoice.status !== "overdue") continue;
    if (invoice.dueDate < fromDate) continue;
    const referenceMonth = invoice.dueDate.slice(0, 7);
    const nextDate = dueDateForMonth(referenceMonth, newDueDay);
    if (nextDate === invoice.dueDate) continue;
    invoice.dueDate = nextDate;
    invoice.status = invoiceStatusFor(nextDate);
    changed += 1;
  }
  return changed;
}

export function outstandingStudentInvoices(database: SchoolDatabase, studentId: string) {
  return database.invoices
    .filter((invoice) => invoice.studentId === studentId && (invoice.status === "pending" || invoice.status === "overdue"))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
