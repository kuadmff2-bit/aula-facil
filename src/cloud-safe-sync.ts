import { cloud, downloadCloudDatabase, getCloudDataSummary, seedEmptyCloudFromLocal } from "./cloud";
import { ensureUuidDatabase, type SchoolDatabase } from "./model";

export type CloudSyncStatus = "not_linked" | "synced" | "local_changed" | "cloud_changed" | "conflict";

type SyncBaseline = {
  revision: number;
  localUpdatedAt: string;
  syncedAt: string;
};

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";
const baselineKey = (schoolId: string) => `aulafacil.cloud.sync-baseline.${schoolId}`;

function readBaseline(schoolId: string): SyncBaseline | null {
  try {
    const raw = localStorage.getItem(baselineKey(schoolId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncBaseline>;
    if (!Number.isInteger(parsed.revision) || typeof parsed.localUpdatedAt !== "string" || typeof parsed.syncedAt !== "string") return null;
    return parsed as SyncBaseline;
  } catch {
    return null;
  }
}

function writeBaseline(schoolId: string, revision: number, database: SchoolDatabase) {
  const baseline: SyncBaseline = {
    revision,
    localUpdatedAt: database.updatedAt,
    syncedAt: new Date().toISOString(),
  };
  localStorage.setItem(baselineKey(schoolId), JSON.stringify(baseline));
  return baseline;
}

export function invalidateCloudSyncBaseline(schoolId: string) {
  if (!schoolId) return;
  localStorage.removeItem(baselineKey(schoolId));
}

export function invalidateSelectedSchoolSyncBaseline() {
  const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
  invalidateCloudSyncBaseline(schoolId);
}

export async function getCloudRevision(schoolId: string) {
  const { data, error } = await cloud
    .from("school_sync_state")
    .select("revision")
    .eq("school_id", schoolId)
    .single();
  if (error) throw new Error(`Não foi possível conferir a revisão da nuvem: ${error.message}`);
  return Number(data?.revision ?? 0);
}

export async function getCloudSyncStatus(schoolId: string, database: SchoolDatabase): Promise<CloudSyncStatus> {
  const baseline = readBaseline(schoolId);
  if (!baseline) return "not_linked";
  const cloudRevision = await getCloudRevision(schoolId);
  const localChanged = database.updatedAt !== baseline.localUpdatedAt;
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
  const { error: deleteError } = await cloud
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq("school_id", schoolId)
    .in("id", remove);
  if (deleteError) throw new Error(`Não foi possível sincronizar exclusões de ${table}: ${deleteError.message}`);
}

async function pushSnapshot(schoolId: string, source: SchoolDatabase) {
  const database = ensureUuidDatabase(source);
  const institution = database.settings.institution;
  const finance = database.settings.finance;

  const { error: schoolError } = await cloud.from("schools").update({
    name: institution.name || undefined,
    legal_name: institution.legalName || null,
    document_number: institution.documentNumber || null,
    primary_color: institution.primaryColor,
    secondary_color: institution.secondaryColor,
    address: institution.address || null,
    city: institution.city || null,
    state: institution.state || null,
    phone: institution.phone || null,
    whatsapp: institution.whatsapp || null,
    email: institution.email || null,
    receipt_settings: database.settings.receipt,
  }).eq("id", schoolId);
  if (schoolError) throw new Error(`Não foi possível sincronizar a instituição: ${schoolError.message}`);

  const { error: financeError } = await cloud.from("finance_settings").upsert({
    school_id: schoolId,
    late_fee_mode: finance.lateFeeMode,
    late_fee_value: finance.lateFeeValue,
    interest_mode: finance.interestMode,
    interest_value: finance.interestValue,
    grace_days: finance.graceDays,
    boleto_due_text: finance.boletoDueText,
    boleto_footer: finance.boletoFooter,
    boleto_show_logo: finance.boletoShowLogo,
    boleto_primary_color: finance.boletoPrimaryColor,
    allowed_due_days: finance.allowedDueDays,
  }, { onConflict: "school_id" });
  if (financeError) throw new Error(`Não foi possível sincronizar as regras financeiras: ${financeError.message}`);

  const { data: templates, error: templateReadError } = await cloud
    .from("certificate_templates")
    .select("id")
    .eq("school_id", schoolId)
    .eq("is_default", true)
    .is("deleted_at", null)
    .limit(1);
  if (templateReadError) throw new Error(`Não foi possível localizar o modelo de certificado: ${templateReadError.message}`);
  if (templates?.[0]?.id) {
    const { error } = await cloud.from("certificate_templates").update({ settings: database.settings.certificate }).eq("id", templates[0].id);
    if (error) throw new Error(`Não foi possível sincronizar o certificado: ${error.message}`);
  }

  await upsertRows("student_fields", database.settings.studentFields.map((field, index) => ({
    id: field.id,
    school_id: schoolId,
    label: field.label,
    field_type: field.type,
    required: field.required,
    visibility: field.visibility,
    placeholder: field.placeholder,
    source_key: field.source ?? null,
    sort_order: (index + 1) * 10,
    active: true,
    deleted_at: null,
  })));
  await softDeleteMissing("student_fields", schoolId, database.settings.studentFields.map((item) => item.id));

  await upsertRows("classes", database.classes.map((item) => ({
    id: item.id, school_id: schoolId, name: item.name, teacher: item.teacher, schedule: item.schedule,
    room: item.room, monthly_fee: item.monthlyFee, workload_hours: item.workloadHours ?? null,
    color: item.color, active: true, created_at: item.createdAt, deleted_at: null,
  })));
  await softDeleteMissing("classes", schoolId, database.classes.map((item) => item.id));

  await upsertRows("students", database.students.map((item) => ({
    id: item.id, school_id: schoolId, class_id: item.classId || null, name: item.name,
    birth_date: item.birthDate, phone: item.phone, guardian_name: item.guardianName,
    guardian_phone: item.guardianPhone, custom_fields: item.customFields, preferred_due_day: item.dueDay ?? null,
    active: item.active, completed_at: item.completedAt ? item.completedAt.slice(0, 10) : null,
    created_at: item.createdAt, deleted_at: null,
  })));
  await softDeleteMissing("students", schoolId, database.students.map((item) => item.id));

  await upsertRows("invoices", database.invoices.map((item) => ({
    id: item.id, school_id: schoolId, student_id: item.studentId, reference: item.reference,
    due_date: item.dueDate, amount: item.amount, status: item.status, paid_at: item.paidAt,
    provider: item.provider ?? null, provider_charge_id: item.providerChargeId ?? null,
    pix_copy_paste: item.pixCopyPaste ?? null, boleto_url: item.boletoUrl ?? null,
    created_at: item.createdAt, deleted_at: null,
  })));
  await softDeleteMissing("invoices", schoolId, database.invoices.map((item) => item.id));

  // Pagamentos são registros de auditoria financeira. Nunca removemos registros remotos porque não aparecem localmente.
  await upsertRows("payments", database.payments.map((item) => ({
    id: item.id, school_id: schoolId, student_id: item.studentId,
    invoice_id: item.invoiceId ?? null, negotiation_installment_id: item.negotiationInstallmentId ?? null,
    amount_received: item.amountReceived, principal_amount: item.principalAmount,
    late_fee_amount: item.lateFeeAmount, interest_amount: item.interestAmount, discount_amount: item.discountAmount,
    payment_method: item.paymentMethod, provider: item.provider ?? null, provider_payment_id: item.providerPaymentId ?? null,
    status: item.status, paid_at: item.paidAt, receipt_number: item.receiptNumber ?? null,
    notes: item.notes ?? null, created_at: item.createdAt,
  })));

  await upsertRows("attendance", database.attendance.map((item) => ({
    id: item.id, school_id: schoolId, student_id: item.studentId, class_id: item.classId,
    attendance_date: item.date, status: item.status, deleted_at: null,
  })));
  await softDeleteMissing("attendance", schoolId, database.attendance.map((item) => item.id));

  await upsertRows("grades", database.grades.map((item) => ({
    id: item.id, school_id: schoolId, student_id: item.studentId, class_id: item.classId,
    label: item.label, term: item.term, score: item.score, created_at: item.createdAt, deleted_at: null,
  })));
  await softDeleteMissing("grades", schoolId, database.grades.map((item) => item.id));

  await upsertRows("notices", database.notices.map((item) => ({
    id: item.id, school_id: schoolId, title: item.title, message: item.message,
    audience: item.audience, published_at: item.publishedAt, deleted_at: null,
  })));
  await softDeleteMissing("notices", schoolId, database.notices.map((item) => item.id));

  return database;
}

export async function establishSyncBaseline(schoolId: string, database: SchoolDatabase) {
  const revision = await getCloudRevision(schoolId);
  return writeBaseline(schoolId, revision, database);
}

export async function safePushToCloud(schoolId: string, database: SchoolDatabase) {
  const summary = await getCloudDataSummary(schoolId);
  const baseline = readBaseline(schoolId);

  if (summary.totalOperationalRecords === 0 && !baseline) {
    const normalized = ensureUuidDatabase(database);
    await seedEmptyCloudFromLocal(schoolId, normalized);
    const revision = await getCloudRevision(schoolId);
    writeBaseline(schoolId, revision, normalized);
    return normalized;
  }

  if (!baseline) {
    throw new Error("Este computador ainda não possui uma base de sincronização. Recupere os dados da nuvem antes de enviar alterações.");
  }

  const currentRevision = await getCloudRevision(schoolId);
  if (currentRevision !== baseline.revision) {
    throw new Error("A nuvem mudou desde a última sincronização. O envio foi bloqueado para não sobrescrever dados de outro dispositivo.");
  }

  const normalized = await pushSnapshot(schoolId, database);
  const nextRevision = await getCloudRevision(schoolId);
  writeBaseline(schoolId, nextRevision, normalized);
  return normalized;
}

export async function safePullFromCloud(schoolId: string, localAppearance: SchoolDatabase["settings"]["appearance"] = "system") {
  const database = await downloadCloudDatabase(schoolId, localAppearance);
  const revision = await getCloudRevision(schoolId);
  writeBaseline(schoolId, revision, database);
  return database;
}

export async function reconcileCloud(schoolId: string, database: SchoolDatabase) {
  const status = await getCloudSyncStatus(schoolId, database);
  if (status === "synced") return { status, database } as const;
  if (status === "not_linked") {
    const summary = await getCloudDataSummary(schoolId);
    if (summary.totalOperationalRecords === 0) {
      const uploaded = await safePushToCloud(schoolId, database);
      return { status: "synced" as const, database: uploaded };
    }
    throw new Error("A instituição já possui dados na nuvem. Faça uma recuperação inicial antes de sincronizar este computador.");
  }
  if (status === "local_changed") {
    const uploaded = await safePushToCloud(schoolId, database);
    return { status: "synced" as const, database: uploaded };
  }
  if (status === "cloud_changed") {
    const downloaded = await safePullFromCloud(schoolId, database.settings.appearance);
    return { status: "synced" as const, database: downloaded };
  }
  throw new Error("Conflito de sincronização: este computador e outro dispositivo alteraram os dados. O AulaFácil não sobrescreveu nenhum dos lados.");
}
