import { cloud } from "./cloud";
import type { CourseDurationType, EnrollmentStatus, SchoolDatabase, Weekday } from "./model";

const WEEKDAYS = new Set<Weekday>(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
const DURATION_TYPES = new Set<CourseDurationType>(["fixed", "open_ended"]);
const ENROLLMENT_STATUSES = new Set<EnrollmentStatus>(["active", "paused", "completed"]);

function timeValue(value: unknown) {
  if (typeof value !== "string") return "";
  return /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : "";
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function hydrateProfessionalCloudFields(schoolId: string, source: SchoolDatabase): Promise<SchoolDatabase> {
  const [classesResult, studentsResult, invoicesResult, paymentsResult] = await Promise.all([
    cloud.from("classes").select("id,group_name,meeting_days,start_time,end_time,duration_type,duration_months").eq("school_id", schoolId).is("deleted_at", null),
    cloud.from("students").select("id,document_number,enrollment_status,enrollment_start_date,paused_at,pause_reason").eq("school_id", schoolId).is("deleted_at", null),
    cloud.from("invoices").select("id,installment_number,plan_generated,cancelled_at,cancellation_reason").eq("school_id", schoolId).is("deleted_at", null),
    cloud.from("payments").select("id,reversed_at,reversal_reason").eq("school_id", schoolId),
  ]);

  const failure = classesResult.error ?? studentsResult.error ?? invoicesResult.error ?? paymentsResult.error;
  if (failure) throw new Error(`Não foi possível restaurar todos os dados profissionais da nuvem: ${failure.message}`);

  const next = structuredClone(source);
  const classes = new Map((classesResult.data ?? []).map((row: any) => [String(row.id), row]));
  const students = new Map((studentsResult.data ?? []).map((row: any) => [String(row.id), row]));
  const invoices = new Map((invoicesResult.data ?? []).map((row: any) => [String(row.id), row]));
  const payments = new Map((paymentsResult.data ?? []).map((row: any) => [String(row.id), row]));

  for (const item of next.classes) {
    const row: any = classes.get(item.id);
    if (!row) continue;
    item.groupName = text(row.group_name);
    item.meetingDays = Array.isArray(row.meeting_days)
      ? row.meeting_days.map(String).filter((day: string): day is Weekday => WEEKDAYS.has(day as Weekday))
      : [];
    item.startTime = timeValue(row.start_time);
    item.endTime = timeValue(row.end_time);
    item.durationType = DURATION_TYPES.has(row.duration_type as CourseDurationType) ? row.duration_type as CourseDurationType : "open_ended";
    const months = Number(row.duration_months);
    item.durationMonths = item.durationType === "fixed" && Number.isInteger(months) && months >= 1 && months <= 240 ? months : null;
  }

  for (const item of next.students) {
    const row: any = students.get(item.id);
    if (!row) continue;
    item.documentNumber = text(row.document_number);
    item.enrollmentStatus = ENROLLMENT_STATUSES.has(row.enrollment_status as EnrollmentStatus)
      ? row.enrollment_status as EnrollmentStatus
      : item.completedAt ? "completed" : item.active ? "active" : "paused";
    item.enrollmentStartDate = text(row.enrollment_start_date) || item.createdAt.slice(0, 10);
    item.pausedAt = row.paused_at ? String(row.paused_at) : null;
    item.pauseReason = text(row.pause_reason);
    item.active = item.enrollmentStatus === "active";
  }

  for (const item of next.invoices) {
    const row: any = invoices.get(item.id);
    if (!row) continue;
    const installment = Number(row.installment_number);
    item.installmentNumber = Number.isInteger(installment) && installment >= 1 && installment <= 240 ? installment : null;
    item.planGenerated = Boolean(row.plan_generated);
    item.cancelledAt = row.cancelled_at ? String(row.cancelled_at) : null;
    item.cancellationReason = text(row.cancellation_reason);
  }

  for (const item of next.payments) {
    const row: any = payments.get(item.id);
    if (!row) continue;
    item.reversedAt = row.reversed_at ? String(row.reversed_at) : null;
    item.reversalReason = text(row.reversal_reason);
  }

  return next;
}
