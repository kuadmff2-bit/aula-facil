import { cloud, downloadCloudDatabase, getCloudDataSummary, seedEmptyCloudFromLocal } from "./cloud";
import { hydrateProfessionalCloudFields } from "./cloud-professional-fields";
import { buildFixedCoursePlan, ensureContinuousInvoicesDue } from "./enrollment-plan";
import { ensureUuidDatabase, type SchoolDatabase } from "./model";

export type CloudSyncStatus = "not_linked" | "synced" | "local_changed" | "cloud_changed" | "conflict";
export type CloudSyncRole = "owner" | "admin" | "finance" | "teacher" | "staff";

type SyncBaseline = { revision: number; localUpdatedAt: string; localSignature?: string; role?: CloudSyncRole; syncedAt: string };
const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";
const baselineKey = (schoolId: string) => `aulafacil.cloud.sync-baseline.${schoolId}`;
const pushAttemptKey = (schoolId: string) => `aulafacil.cloud.push-attempt.${schoolId}`;

type SyncPushAttempt = {
  role: CloudSyncRole;
  localSignature: string;
  baselineRevision: number | null;
  lastObservedRevision: number;
  firstSync: boolean;
  startedAt: string;
};

function readPushAttempt(schoolId: string): SyncPushAttempt | null {
  try {
    const raw = localStorage.getItem(pushAttemptKey(schoolId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncPushAttempt>;
    if (!parsed.role || typeof parsed.localSignature !== "string" || !Number.isInteger(parsed.lastObservedRevision) || typeof parsed.startedAt !== "string") return null;
    return parsed as SyncPushAttempt;
  } catch { return null; }
}

function writePushAttempt(schoolId: string, attempt: SyncPushAttempt) {
  localStorage.setItem(pushAttemptKey(schoolId), JSON.stringify(attempt));
}

function clearPushAttempt(schoolId: string) {
  localStorage.removeItem(pushAttemptKey(schoolId));
}

function readBaseline(schoolId: string): SyncBaseline | null {
  try {
    const raw = localStorage.getItem(baselineKey(schoolId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncBaseline>;
    if (!Number.isInteger(parsed.revision) || typeof parsed.localUpdatedAt !== "string" || typeof parsed.syncedAt !== "string") return null;
    return parsed as SyncBaseline;
  } catch { return null; }
}

export function localSyncSignature(database: SchoolDatabase, role: CloudSyncRole) {
  if (role === "owner" || role === "admin") return JSON.stringify(database);
  if (role === "finance") return JSON.stringify({ finance: database.settings.finance, invoices: database.invoices, payments: database.payments });
  if (role === "teacher") return JSON.stringify({ classes: database.classes, students: database.students, attendance: database.attendance, grades: database.grades });
  return JSON.stringify({ classes: database.classes, students: database.students, attendance: database.attendance, notices: database.notices });
}

function writeBaseline(schoolId: string, revision: number, database: SchoolDatabase, role: CloudSyncRole) {
  const baseline: SyncBaseline = { revision, localUpdatedAt: database.updatedAt, localSignature: localSyncSignature(database, role), role, syncedAt: new Date().toISOString() };
  localStorage.setItem(baselineKey(schoolId), JSON.stringify(baseline));
  return baseline;
}

export function invalidateCloudSyncBaseline(schoolId: string) { if (schoolId) localStorage.removeItem(baselineKey(schoolId)); }
export function invalidateSelectedSchoolSyncBaseline() { invalidateCloudSyncBaseline(localStorage.getItem(SELECTED_SCHOOL_KEY) ?? ""); }

export async function getCloudSyncRole(schoolId: string): Promise<CloudSyncRole> {
  const { data, error } = await cloud.from("school_members").select("role,active").eq("school_id", schoolId).eq("active", true).single();
  if (error || !data?.role) throw new Error("Não foi possível validar sua função nesta instituição.");
  const role = String(data.role) as CloudSyncRole;
  if (!["owner", "admin", "finance", "teacher", "staff"].includes(role)) throw new Error("Sua função de acesso não é reconhecida pelo AulaFácil.");
  return role;
}

function isAdmin(role: CloudSyncRole) { return role === "owner" || role === "admin"; }
function canWriteFinance(role: CloudSyncRole) { return isAdmin(role) || role === "finance"; }
function canWriteAcademicCore(role: CloudSyncRole) { return isAdmin(role) || role === "teacher" || role === "staff"; }

function repairMissingEnrollmentInvoices(database: SchoolDatabase) {
  let created = ensureContinuousInvoicesDue(database);
  for (const student of database.students) {
    if ((student.enrollmentStatus ?? (student.active ? "active" : "paused")) !== "active" || !student.active) continue;
    const classItem = database.classes.find((item) => item.id === student.classId);
    if (!classItem || (classItem.durationType ?? "open_ended") !== "fixed") continue;
    const plan = buildFixedCoursePlan(database, student, classItem);
    if (!plan.length) continue;
    database.invoices.push(...plan);
    created += plan.length;
  }
  if (created) database.updatedAt = new Date().toISOString();
  return created;
}

export async function getCloudRevision(schoolId: string) {
  const { data, error } = await cloud.from("school_sync_state").select("revision").eq("school_id", schoolId).single();
  if (error) throw new Error(`Não foi possível conferir a revisão da nuvem: ${error.message}`);
  return Number(data?.revision ?? 0);
}

export async function getCloudSyncStatus(schoolId: string, database: SchoolDatabase): Promise<CloudSyncStatus> {
  const [cloudRevision, role] = await Promise.all([getCloudRevision(schoolId), getCloudSyncRole(schoolId)]);
  const signature = localSyncSignature(database, role);
  const attempt = readPushAttempt(schoolId);
  if (attempt
    && attempt.role === role
    && attempt.localSignature === signature
    && attempt.lastObservedRevision === cloudRevision) {
    return "local_changed";
  }

  const baseline = readBaseline(schoolId);
  if (!baseline) return "not_linked";
  if (baseline.role && baseline.role !== role) return "not_linked";
  const localChanged = baseline.localSignature ? signature !== baseline.localSignature : database.updatedAt !== baseline.localUpdatedAt;
  const cloudChanged = cloudRevision !== baseline.revision;
  if (localChanged && cloudChanged) return "conflict";
  if (localChanged) return "local_changed";
  if (cloudChanged) return "cloud_changed";
  return "synced";
}

async function upsertRows(table: string, rows: Record<string, unknown>[], onConflict = "id") {
  if (!rows.length) return;
  const { error } = await cloud.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`Não foi possível sincronizar ${table}: ${error.message}`);
}

async function softDeleteMissing(table: string, schoolId: string, keepIds: string[]) {
  const { data, error } = await cloud.from(table).select("id").eq("school_id", schoolId).is("deleted_at", null);
  if (error) throw new Error(`Não foi possível conferir exclusões de ${table}: ${error.message}`);
  const keep = new Set(keepIds);
  const remove = (data ?? []).map((row: any) => String(row.id)).filter((id) => !keep.has(id));
  if (!remove.length) return;
  const { error: deleteError } = await cloud.from(table).update({ deleted_at: new Date().toISOString() }).eq("school_id", schoolId).in("id", remove);
  if (deleteError) throw new Error(`Não foi possível sincronizar exclusões de ${table}: ${deleteError.message}`);
}

async function pushSnapshot(schoolId: string, source: SchoolDatabase, role: CloudSyncRole) {
  const database = ensureUuidDatabase(source);
  if (canWriteFinance(role)) repairMissingEnrollmentInvoices(database);
  const institution = database.settings.institution;
  const finance = database.settings.finance;

  if (isAdmin(role)) {
    const { error } = await cloud.from("schools").update({ name: institution.name || undefined, legal_name: institution.legalName || null, document_number: institution.documentNumber || null, logo_url: institution.logoDataUrl || null, primary_color: institution.primaryColor, secondary_color: institution.secondaryColor, address: institution.address || null, city: institution.city || null, state: institution.state || null, phone: institution.phone || null, whatsapp: institution.whatsapp || null, email: institution.email || null, receipt_settings: database.settings.receipt }).eq("id", schoolId);
    if (error) throw new Error(`Não foi possível sincronizar a instituição: ${error.message}`);
    const { data: templates, error: templateReadError } = await cloud.from("certificate_templates").select("id").eq("school_id", schoolId).eq("is_default", true).is("deleted_at", null).limit(1);
    if (templateReadError) throw new Error(`Não foi possível localizar o modelo de certificado: ${templateReadError.message}`);
    if (templates?.[0]?.id) {
      const { error: templateError } = await cloud.from("certificate_templates").update({ settings: database.settings.certificate }).eq("id", templates[0].id);
      if (templateError) throw new Error(`Não foi possível sincronizar o certificado: ${templateError.message}`);
    }
    await upsertRows("student_fields", database.settings.studentFields.map((field, index) => ({ id: field.id, school_id: schoolId, label: field.label, field_type: field.type, required: field.required, visibility: field.visibility, placeholder: field.placeholder, source_key: field.source ?? null, sort_order: (index + 1) * 10, active: true, deleted_at: null })));
    await softDeleteMissing("student_fields", schoolId, database.settings.studentFields.map((item) => item.id));
  }

  if (canWriteFinance(role)) {
    const { error } = await cloud.from("finance_settings").upsert({ school_id: schoolId, late_fee_mode: finance.lateFeeMode, late_fee_value: finance.lateFeeValue, interest_mode: finance.interestMode, interest_value: finance.interestValue, grace_days: finance.graceDays, boleto_due_text: finance.boletoDueText, boleto_footer: finance.boletoFooter, boleto_show_logo: finance.boletoShowLogo, boleto_primary_color: finance.boletoPrimaryColor, allowed_due_days: finance.allowedDueDays }, { onConflict: "school_id" });
    if (error) throw new Error(`Não foi possível sincronizar as regras financeiras: ${error.message}`);
  }

  if (canWriteAcademicCore(role)) {
    await upsertRows("classes", database.classes.map((item) => ({ id: item.id, school_id: schoolId, name: item.name, group_name: item.groupName ?? "", teacher: item.teacher, schedule: item.schedule, meeting_days: item.meetingDays ?? [], start_time: item.startTime || null, end_time: item.endTime || null, room: item.room, monthly_fee: item.monthlyFee, duration_type: item.durationType ?? "open_ended", duration_months: item.durationType === "fixed" ? item.durationMonths ?? null : null, workload_hours: item.workloadHours ?? null, color: item.color, active: true, created_at: item.createdAt, deleted_at: null })));
    await softDeleteMissing("classes", schoolId, database.classes.map((item) => item.id));
    await upsertRows("students", database.students.map((item) => ({ id: item.id, school_id: schoolId, class_id: item.classId || null, name: item.name, birth_date: item.birthDate, document_number: item.documentNumber?.trim() || "", phone: item.phone || "", guardian_name: item.guardianName || "", guardian_phone: item.guardianPhone || "", custom_fields: item.customFields, preferred_due_day: item.dueDay ?? null, enrollment_status: item.enrollmentStatus ?? (item.active ? "active" : "paused"), enrollment_start_date: item.enrollmentStartDate || item.createdAt.slice(0, 10), paused_at: item.pausedAt ?? null, pause_reason: item.pauseReason || "", active: item.active, completed_at: item.completedAt ? item.completedAt.slice(0, 10) : null, created_at: item.createdAt, deleted_at: null })));
    await softDeleteMissing("students", schoolId, database.students.map((item) => item.id));
    await upsertRows("attendance", database.attendance.map((item) => ({ id: item.id, school_id: schoolId, student_id: item.studentId, class_id: item.classId, attendance_date: item.date, status: item.status, deleted_at: null })));
    await softDeleteMissing("attendance", schoolId, database.attendance.map((item) => item.id));
  }

  if (isAdmin(role) || role === "teacher") {
    await upsertRows("grades", database.grades.map((item) => ({ id: item.id, school_id: schoolId, student_id: item.studentId, class_id: item.classId, label: item.label, term: item.term, score: item.score, created_at: item.createdAt, deleted_at: null })));
    await softDeleteMissing("grades", schoolId, database.grades.map((item) => item.id));
  }
  if (isAdmin(role) || role === "staff") {
    await upsertRows("notices", database.notices.map((item) => ({ id: item.id, school_id: schoolId, title: item.title, message: item.message, audience: item.audience, published_at: item.publishedAt, deleted_at: null })));
    await softDeleteMissing("notices", schoolId, database.notices.map((item) => item.id));
  }
  if (canWriteFinance(role)) {
    await upsertRows("invoices", database.invoices.map((item) => ({ id: item.id, school_id: schoolId, student_id: item.studentId, reference: item.reference, due_date: item.dueDate, amount: item.amount, status: item.status, paid_at: item.paidAt, installment_number: item.installmentNumber ?? null, plan_generated: Boolean(item.planGenerated), cancelled_at: item.cancelledAt ?? null, cancellation_reason: item.cancellationReason || null, provider: item.provider ?? null, provider_charge_id: item.providerChargeId ?? null, pix_copy_paste: item.pixCopyPaste ?? null, boleto_url: item.boletoUrl ?? null, created_at: item.createdAt, deleted_at: null })));
    await softDeleteMissing("invoices", schoolId, database.invoices.map((item) => item.id));
    await upsertRows("payments", database.payments.map((item) => ({ id: item.id, school_id: schoolId, student_id: item.studentId, invoice_id: item.invoiceId ?? null, negotiation_installment_id: item.negotiationInstallmentId ?? null, amount_received: item.amountReceived, principal_amount: item.principalAmount, late_fee_amount: item.lateFeeAmount, interest_amount: item.interestAmount, discount_amount: item.discountAmount, payment_method: item.paymentMethod, provider: item.provider ?? null, provider_payment_id: item.providerPaymentId ?? null, status: item.status, paid_at: item.paidAt, receipt_number: item.receiptNumber ?? null, notes: item.notes ?? null, reversed_at: item.reversedAt ?? null, reversal_reason: item.reversalReason || null, created_at: item.createdAt })));
  }
  return database;
}

export async function establishSyncBaseline(schoolId: string, database: SchoolDatabase) {
  const [revision, role] = await Promise.all([getCloudRevision(schoolId), getCloudSyncRole(schoolId)]);
  return writeBaseline(schoolId, revision, database, role);
}

export async function safePushToCloud(schoolId: string, database: SchoolDatabase) {
  const [summary, role, cloudRevision] = await Promise.all([
    getCloudDataSummary(schoolId),
    getCloudSyncRole(schoolId),
    getCloudRevision(schoolId),
  ]);
  const baseline = readBaseline(schoolId);
  const signature = localSyncSignature(database, role);
  const previousAttempt = readPushAttempt(schoolId);
  const resumableAttempt = previousAttempt
    && previousAttempt.role === role
    && previousAttempt.localSignature === signature
    && previousAttempt.lastObservedRevision === cloudRevision
    && (previousAttempt.baselineRevision === null || baseline?.revision === previousAttempt.baselineRevision);

  const runPush = async (firstSync: boolean, baselineRevision: number | null) => {
    const normalized = ensureUuidDatabase(database);
    const attempt: SyncPushAttempt = {
      role,
      localSignature: signature,
      baselineRevision,
      lastObservedRevision: cloudRevision,
      firstSync,
      startedAt: previousAttempt?.startedAt ?? new Date().toISOString(),
    };
    writePushAttempt(schoolId, attempt);
    try {
      if (firstSync && summary.totalOperationalRecords === 0) {
        await seedEmptyCloudFromLocal(schoolId, normalized);
      }
      const pushed = await pushSnapshot(schoolId, normalized, role);
      const revision = await getCloudRevision(schoolId);
      writeBaseline(schoolId, revision, pushed, role);
      clearPushAttempt(schoolId);
      return pushed;
    } catch (error) {
      let lastObservedRevision = cloudRevision;
      try { lastObservedRevision = await getCloudRevision(schoolId); } catch { /* mantém a última revisão conhecida */ }
      writePushAttempt(schoolId, { ...attempt, lastObservedRevision });
      throw error;
    }
  };

  if (resumableAttempt) {
    return runPush(Boolean(previousAttempt.firstSync), previousAttempt.baselineRevision);
  }

  if (summary.totalOperationalRecords === 0 && !baseline) {
    if (!isAdmin(role)) throw new Error("Somente proprietário ou administrador pode realizar o primeiro envio de dados para uma instituição vazia.");
    return runPush(true, null);
  }
  if (!baseline || (baseline.role && baseline.role !== role)) throw new Error("Este computador ainda não possui uma base de sincronização compatível com sua função atual. Recupere os dados da nuvem antes de enviar alterações.");
  if (cloudRevision !== baseline.revision) throw new Error("A nuvem mudou desde a última sincronização. O envio foi bloqueado para não sobrescrever dados de outro dispositivo.");
  return runPush(false, baseline.revision);
}

export async function replaceCloudWithLocal(schoolId: string, database: SchoolDatabase) {
  const role = await getCloudSyncRole(schoolId);
  if (!isAdmin(role)) throw new Error("Somente proprietário ou administrador pode escolher a cópia deste computador para resolver um conflito.");
  const normalized = await pushSnapshot(schoolId, database, role);
  const revision = await getCloudRevision(schoolId);
  writeBaseline(schoolId, revision, normalized, role);
  clearPushAttempt(schoolId);
  return normalized;
}

export async function safePullFromCloud(schoolId: string, localAppearance: SchoolDatabase["settings"]["appearance"] = "system") {
  const role = await getCloudSyncRole(schoolId);
  const base = await downloadCloudDatabase(schoolId, localAppearance);
  const database = ensureUuidDatabase(await hydrateProfessionalCloudFields(schoolId, base));
  const repaired = canWriteFinance(role) ? repairMissingEnrollmentInvoices(database) : 0;
  if (repaired) await pushSnapshot(schoolId, database, role);
  writeBaseline(schoolId, await getCloudRevision(schoolId), database, role);
  return database;
}

export async function reconcileCloud(schoolId: string, database: SchoolDatabase) {
  const status = await getCloudSyncStatus(schoolId, database);
  if (status === "synced") return { status, database } as const;
  if (status === "not_linked") {
    const summary = await getCloudDataSummary(schoolId);
    if (summary.totalOperationalRecords === 0) return { status: "synced" as const, database: await safePushToCloud(schoolId, database) };
    throw new Error("A instituição já possui dados na nuvem. Faça uma recuperação inicial antes de sincronizar este computador.");
  }
  if (status === "local_changed") return { status: "synced" as const, database: await safePushToCloud(schoolId, database) };
  if (status === "cloud_changed") return { status: "synced" as const, database: await safePullFromCloud(schoolId, database.settings.appearance) };
  throw new Error("Conflito de sincronização: este computador e outro dispositivo alteraram os dados. O AulaFácil não sobrescreveu nenhum dos lados.");
}
