import { createClient, type Session, type User } from "@supabase/supabase-js";
import { secureAuthStorage } from "./secure-auth-storage";
import {
  defaultSchoolSettings,
  ensureUuidDatabase,
  type AppearanceMode,
  type SchoolDatabase,
  type SchoolSettings,
} from "./model";

const SUPABASE_URL = "https://fkafrirbitwlsbjpqtcf.supabase.co";
// Chave publicável do Supabase. Ela foi criada para uso em clientes e NÃO possui privilégios administrativos.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tf34VWh3ujn6wzB3y4W83A_JyA6L_sa";

export const cloud = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: secureAuthStorage,
  },
});

export type SchoolRole = "owner" | "admin" | "finance" | "teacher" | "staff";

export type CloudSchool = {
  id: string;
  name: string;
  role: SchoolRole;
  legalName: string;
  documentNumber: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  whatsapp: string;
  email: string;
};

export type CloudDataSummary = {
  classes: number;
  students: number;
  invoices: number;
  payments: number;
  attendance: number;
  grades: number;
  notices: number;
  totalOperationalRecords: number;
};

export type CloudAuthState = {
  session: Session | null;
  user: User | null;
};

function fail(message: string, cause?: unknown): never {
  if (cause instanceof Error) throw new Error(`${message}: ${cause.message}`);
  throw new Error(message);
}

function nullableText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asDate(value: unknown) {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

export async function getCloudAuthState(): Promise<CloudAuthState> {
  const { data, error } = await cloud.auth.getSession();
  if (error) fail("Não foi possível verificar a sessão do AulaFácil", error);
  return { session: data.session, user: data.session?.user ?? null };
}

export function onCloudAuthChange(callback: (state: CloudAuthState) => void) {
  const { data } = cloud.auth.onAuthStateChange((_event, session) => {
    callback({ session, user: session?.user ?? null });
  });
  return () => data.subscription.unsubscribe();
}

export async function signInCloud(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || password.length < 8) throw new Error("Informe e-mail e senha válidos.");
  const { data, error } = await cloud.auth.signInWithPassword({ email: normalizedEmail, password });
  if (error) fail("Não foi possível entrar na conta", error);
  return data;
}

export async function signUpCloud(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || password.length < 8) throw new Error("Use um e-mail válido e uma senha com pelo menos 8 caracteres.");
  const { data, error } = await cloud.auth.signUp({ email: normalizedEmail, password });
  if (error) fail("Não foi possível criar a conta", error);
  return data;
}

export async function resendCloudSignupConfirmation(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("Informe um e-mail válido para reenviar a confirmação.");
  const { error } = await cloud.auth.resend({ type: "signup", email: normalizedEmail });
  if (error) fail("Não foi possível reenviar o e-mail de confirmação", error);
}

export async function signOutCloud() {
  const { error } = await cloud.auth.signOut({ scope: "local" });
  if (error) fail("Não foi possível sair da conta neste dispositivo", error);
}

export async function listCloudSchools(): Promise<CloudSchool[]> {
  const { data, error } = await cloud
    .from("school_members")
    .select("role, active, school:schools(id,name,legal_name,document_number,logo_url,primary_color,secondary_color,address,city,state,phone,whatsapp,email)")
    .eq("active", true);

  if (error) fail("Não foi possível carregar as instituições da conta", error);

  return (data ?? []).flatMap((row: any) => {
    const school = Array.isArray(row.school) ? row.school[0] : row.school;
    if (!school?.id) return [];
    return [{
      id: String(school.id),
      name: nullableText(school.name),
      role: row.role as SchoolRole,
      legalName: nullableText(school.legal_name),
      documentNumber: nullableText(school.document_number),
      logoUrl: nullableText(school.logo_url),
      primaryColor: nullableText(school.primary_color) || "#1649b8",
      secondaryColor: nullableText(school.secondary_color) || "#0f766e",
      address: nullableText(school.address),
      city: nullableText(school.city),
      state: nullableText(school.state),
      phone: nullableText(school.phone),
      whatsapp: nullableText(school.whatsapp),
      email: nullableText(school.email),
    }];
  });
}

export async function createCloudSchool(name: string) {
  const schoolName = name.trim();
  if (schoolName.length < 2 || schoolName.length > 160) throw new Error("Informe um nome de instituição válido.");
  const { data, error } = await cloud.rpc("create_school", { school_name: schoolName });
  if (error) fail("Não foi possível criar a instituição", error);
  if (!data) throw new Error("A instituição foi criada, mas o identificador não foi retornado.");
  return String(data);
}

async function countActive(table: string, schoolId: string) {
  const { count, error } = await cloud
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .is("deleted_at", null);
  if (error) fail(`Não foi possível contar registros de ${table}`, error);
  return count ?? 0;
}

async function countRows(table: string, schoolId: string) {
  const { count, error } = await cloud
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId);
  if (error) fail(`Não foi possível contar registros de ${table}`, error);
  return count ?? 0;
}

export async function getCloudDataSummary(schoolId: string): Promise<CloudDataSummary> {
  const [classes, students, invoices, payments, attendance, grades, notices] = await Promise.all([
    countActive("classes", schoolId),
    countActive("students", schoolId),
    countActive("invoices", schoolId),
    countRows("payments", schoolId),
    countActive("attendance", schoolId),
    countActive("grades", schoolId),
    countActive("notices", schoolId),
  ]);
  return {
    classes,
    students,
    invoices,
    payments,
    attendance,
    grades,
    notices,
    totalOperationalRecords: classes + students + invoices + payments + attendance + grades + notices,
  };
}

async function upsertRows(table: string, rows: Record<string, unknown>[], onConflict = "id") {
  if (!rows.length) return;
  const { error } = await cloud.from(table).upsert(rows, { onConflict });
  if (error) fail(`Não foi possível sincronizar ${table}`, error);
}

export async function seedEmptyCloudFromLocal(schoolId: string, database: SchoolDatabase) {
  const normalized = ensureUuidDatabase(database);
  const summary = await getCloudDataSummary(schoolId);
  if (summary.totalOperationalRecords > 0) {
    throw new Error("A instituição online já possui dados. O envio inicial foi bloqueado para evitar sobrescrever informações existentes.");
  }

  const institution = normalized.settings.institution;
  const receipt = normalized.settings.receipt;
  const certificate = normalized.settings.certificate;
  const finance = normalized.settings.finance;

  const { error: schoolError } = await cloud.from("schools").update({
    name: institution.name || undefined,
    legal_name: institution.legalName || null,
    document_number: institution.documentNumber || null,
    logo_url: institution.logoDataUrl || null,
    primary_color: institution.primaryColor,
    secondary_color: institution.secondaryColor,
    address: institution.address || null,
    city: institution.city || null,
    state: institution.state || null,
    phone: institution.phone || null,
    whatsapp: institution.whatsapp || null,
    email: institution.email || null,
    receipt_settings: receipt,
  }).eq("id", schoolId);
  if (schoolError) fail("Não foi possível sincronizar os dados da instituição", schoolError);

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
  if (financeError) fail("Não foi possível sincronizar as regras financeiras", financeError);

  const { data: templates, error: templateReadError } = await cloud
    .from("certificate_templates")
    .select("id")
    .eq("school_id", schoolId)
    .eq("is_default", true)
    .is("deleted_at", null)
    .limit(1);
  if (templateReadError) fail("Não foi possível localizar o modelo de certificado", templateReadError);
  const templateId = templates?.[0]?.id;
  if (templateId) {
    const { error: templateError } = await cloud.from("certificate_templates").update({ settings: certificate }).eq("id", templateId);
    if (templateError) fail("Não foi possível sincronizar o modelo de certificado", templateError);
  }

  const { error: existingFieldError } = await cloud.from("student_fields").update({ deleted_at: new Date().toISOString(), active: false })
    .eq("school_id", schoolId)
    .is("deleted_at", null);
  if (existingFieldError) fail("Não foi possível preparar os campos personalizados", existingFieldError);

  await upsertRows("student_fields", normalized.settings.studentFields.map((field, index) => ({
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

  await upsertRows("classes", normalized.classes.map((item) => ({
    id: item.id,
    school_id: schoolId,
    name: item.name,
    group_name: item.groupName ?? "",
    teacher: item.teacher,
    schedule: item.schedule,
    meeting_days: item.meetingDays ?? [],
    start_time: item.startTime || null,
    end_time: item.endTime || null,
    room: item.room,
    monthly_fee: item.monthlyFee,
    duration_type: item.durationType ?? "open_ended",
    duration_months: item.durationType === "fixed" ? item.durationMonths ?? null : null,
    workload_hours: item.workloadHours ?? null,
    color: item.color,
    active: true,
    created_at: item.createdAt,
    deleted_at: null,
  })));

  await upsertRows("students", normalized.students.map((item) => ({
    id: item.id,
    school_id: schoolId,
    class_id: item.classId || null,
    name: item.name,
    birth_date: item.birthDate,
    document_number: item.documentNumber || null,
    phone: item.phone,
    guardian_name: item.guardianName,
    guardian_phone: item.guardianPhone,
    custom_fields: item.customFields,
    preferred_due_day: item.dueDay ?? null,
    enrollment_status: item.enrollmentStatus ?? (item.active ? "active" : "paused"),
    enrollment_start_date: item.enrollmentStartDate || item.createdAt.slice(0, 10),
    paused_at: item.pausedAt ?? null,
    pause_reason: item.pauseReason || null,
    active: item.active,
    completed_at: item.completedAt ? item.completedAt.slice(0, 10) : null,
    created_at: item.createdAt,
    deleted_at: null,
  })));

  await upsertRows("invoices", normalized.invoices.map((item) => ({
    id: item.id,
    school_id: schoolId,
    student_id: item.studentId,
    reference: item.reference,
    due_date: item.dueDate,
    amount: item.amount,
    status: item.status,
    paid_at: item.paidAt,
    installment_number: item.installmentNumber ?? null,
    plan_generated: Boolean(item.planGenerated),
    cancelled_at: item.cancelledAt ?? null,
    cancellation_reason: item.cancellationReason || null,
    provider: item.provider ?? null,
    provider_charge_id: item.providerChargeId ?? null,
    pix_copy_paste: item.pixCopyPaste ?? null,
    boleto_url: item.boletoUrl ?? null,
    created_at: item.createdAt,
    deleted_at: null,
  })));

  await upsertRows("payments", normalized.payments.map((item) => ({
    id: item.id,
    school_id: schoolId,
    student_id: item.studentId,
    invoice_id: item.invoiceId ?? null,
    negotiation_installment_id: item.negotiationInstallmentId ?? null,
    amount_received: item.amountReceived,
    principal_amount: item.principalAmount,
    late_fee_amount: item.lateFeeAmount,
    interest_amount: item.interestAmount,
    discount_amount: item.discountAmount,
    payment_method: item.paymentMethod,
    provider: item.provider ?? null,
    provider_payment_id: item.providerPaymentId ?? null,
    status: item.status,
    paid_at: item.paidAt,
    receipt_number: item.receiptNumber ?? null,
    notes: item.notes ?? null,
    reversed_at: item.reversedAt ?? null,
    reversal_reason: item.reversalReason || null,
    created_at: item.createdAt,
  })));

  await upsertRows("attendance", normalized.attendance.map((item) => ({
    id: item.id,
    school_id: schoolId,
    student_id: item.studentId,
    class_id: item.classId,
    attendance_date: item.date,
    status: item.status,
    deleted_at: null,
  })));

  await upsertRows("grades", normalized.grades.map((item) => ({
    id: item.id,
    school_id: schoolId,
    student_id: item.studentId,
    class_id: item.classId,
    label: item.label,
    term: item.term,
    score: item.score,
    created_at: item.createdAt,
    deleted_at: null,
  })));

  await upsertRows("notices", normalized.notices.map((item) => ({
    id: item.id,
    school_id: schoolId,
    title: item.title,
    message: item.message,
    audience: item.audience,
    published_at: item.publishedAt,
    deleted_at: null,
  })));
}

async function selectActive(table: string, schoolId: string, columns = "*") {
  const { data, error } = await cloud.from(table).select(columns).eq("school_id", schoolId).is("deleted_at", null);
  if (error) fail(`Não foi possível baixar ${table}`, error);
  return data ?? [];
}

async function selectRows(table: string, schoolId: string, columns = "*") {
  const { data, error } = await cloud.from(table).select(columns).eq("school_id", schoolId);
  if (error) fail(`Não foi possível baixar ${table}`, error);
  return data ?? [];
}

export async function downloadCloudDatabase(schoolId: string, localAppearance: AppearanceMode = "system"): Promise<SchoolDatabase> {
  const [
    schoolResult,
    financeResult,
    fields,
    classes,
    students,
    invoices,
    payments,
    attendance,
    grades,
    notices,
    templates,
  ] = await Promise.all([
    cloud.from("schools").select("*").eq("id", schoolId).single(),
    cloud.from("finance_settings").select("*").eq("school_id", schoolId).single(),
    selectActive("student_fields", schoolId),
    selectActive("classes", schoolId),
    selectActive("students", schoolId),
    selectActive("invoices", schoolId),
    selectRows("payments", schoolId),
    selectActive("attendance", schoolId),
    selectActive("grades", schoolId),
    selectActive("notices", schoolId),
    selectActive("certificate_templates", schoolId),
  ]);

  if (schoolResult.error) fail("Não foi possível baixar a instituição", schoolResult.error);
  if (financeResult.error) fail("Não foi possível baixar as regras financeiras", financeResult.error);

  const school: any = schoolResult.data;
  const finance: any = financeResult.data;
  const defaultTemplate: any = (templates as any[]).find((item) => item.is_default) ?? templates[0];
  const defaults = defaultSchoolSettings();
  const receipt = school.receipt_settings && typeof school.receipt_settings === "object" ? school.receipt_settings : defaults.receipt;
  const certificate = defaultTemplate?.settings && typeof defaultTemplate.settings === "object" ? defaultTemplate.settings : defaults.certificate;

  const settings: SchoolSettings = {
    ...defaults,
    appearance: localAppearance,
    institution: {
      name: nullableText(school.name),
      legalName: nullableText(school.legal_name),
      documentNumber: nullableText(school.document_number),
      address: nullableText(school.address),
      city: nullableText(school.city),
      state: nullableText(school.state),
      phone: nullableText(school.phone),
      whatsapp: nullableText(school.whatsapp),
      email: nullableText(school.email),
      primaryColor: nullableText(school.primary_color) || defaults.institution.primaryColor,
      secondaryColor: nullableText(school.secondary_color) || defaults.institution.secondaryColor,
      logoDataUrl: nullableText(school.logo_url),
    },
    finance: {
      allowedDueDays: Array.isArray(finance.allowed_due_days) ? finance.allowed_due_days.map(Number) : defaults.finance.allowedDueDays,
      lateFeeMode: finance.late_fee_mode ?? defaults.finance.lateFeeMode,
      lateFeeValue: numeric(finance.late_fee_value),
      interestMode: finance.interest_mode ?? defaults.finance.interestMode,
      interestValue: numeric(finance.interest_value),
      graceDays: numeric(finance.grace_days),
      boletoDueText: nullableText(finance.boleto_due_text),
      boletoFooter: nullableText(finance.boleto_footer),
      boletoShowLogo: Boolean(finance.boleto_show_logo),
      boletoPrimaryColor: nullableText(finance.boleto_primary_color) || defaults.finance.boletoPrimaryColor,
    },
    receipt: { ...defaults.receipt, ...(receipt as object) },
    certificate: { ...defaults.certificate, ...(certificate as object) },
    studentFields: (fields as any[]).filter((row) => row.active).sort((a, b) => numeric(a.sort_order) - numeric(b.sort_order)).map((row) => ({
      id: String(row.id),
      label: nullableText(row.label),
      type: row.field_type,
      required: Boolean(row.required),
      visibility: row.visibility,
      placeholder: nullableText(row.placeholder),
      source: row.source_key || undefined,
    })),
  };

  return ensureUuidDatabase({
    version: 1,
    updatedAt: new Date().toISOString(),
    settings,
    classes: (classes as any[]).filter((row) => row.active).map((row) => ({
      id: String(row.id),
      name: nullableText(row.name),
      groupName: nullableText(row.group_name),
      teacher: nullableText(row.teacher),
      schedule: nullableText(row.schedule),
      meetingDays: Array.isArray(row.meeting_days) ? row.meeting_days : [],
      startTime: nullableText(row.start_time),
      endTime: nullableText(row.end_time),
      room: nullableText(row.room),
      monthlyFee: numeric(row.monthly_fee),
      durationType: row.duration_type === "fixed" ? "fixed" : "open_ended",
      durationMonths: row.duration_type === "fixed" && row.duration_months != null ? numeric(row.duration_months) : null,
      workloadHours: row.workload_hours == null ? null : numeric(row.workload_hours),
      color: nullableText(row.color) || "#1649b8",
      createdAt: nullableText(row.created_at),
    })),
    students: (students as any[]).map((row) => ({
      id: String(row.id),
      name: nullableText(row.name),
      birthDate: asDate(row.birth_date),
      documentNumber: nullableText(row.document_number),
      phone: nullableText(row.phone),
      guardianName: nullableText(row.guardian_name),
      guardianPhone: nullableText(row.guardian_phone),
      customFields: row.custom_fields && typeof row.custom_fields === "object" ? row.custom_fields : {},
      classId: nullableText(row.class_id),
      dueDay: row.preferred_due_day == null ? null : numeric(row.preferred_due_day),
      enrollmentStatus: row.enrollment_status === "completed" ? "completed" : row.enrollment_status === "paused" ? "paused" : "active",
      enrollmentStartDate: asDate(row.enrollment_start_date) || asDate(row.created_at),
      pausedAt: row.paused_at ? nullableText(row.paused_at) : null,
      pauseReason: nullableText(row.pause_reason),
      active: Boolean(row.active),
      completedAt: row.completed_at ? asDate(row.completed_at) : null,
      createdAt: nullableText(row.created_at),
    })),
    invoices: (invoices as any[]).map((row) => ({
      id: String(row.id),
      studentId: String(row.student_id),
      reference: nullableText(row.reference),
      dueDate: asDate(row.due_date),
      amount: numeric(row.amount),
      status: row.status,
      paidAt: row.paid_at ? nullableText(row.paid_at) : null,
      installmentNumber: row.installment_number == null ? null : numeric(row.installment_number),
      planGenerated: Boolean(row.plan_generated),
      cancelledAt: row.cancelled_at ? nullableText(row.cancelled_at) : null,
      cancellationReason: nullableText(row.cancellation_reason),
      provider: row.provider ?? null,
      providerChargeId: row.provider_charge_id ?? null,
      pixCopyPaste: row.pix_copy_paste ?? null,
      boletoUrl: row.boleto_url ?? null,
      createdAt: nullableText(row.created_at),
    })),
    payments: (payments as any[]).map((row) => ({
      id: String(row.id),
      studentId: String(row.student_id),
      invoiceId: row.invoice_id ? String(row.invoice_id) : null,
      negotiationInstallmentId: row.negotiation_installment_id ? String(row.negotiation_installment_id) : null,
      amountReceived: numeric(row.amount_received),
      principalAmount: numeric(row.principal_amount),
      lateFeeAmount: numeric(row.late_fee_amount),
      interestAmount: numeric(row.interest_amount),
      discountAmount: numeric(row.discount_amount),
      paymentMethod: nullableText(row.payment_method) || "manual",
      provider: row.provider ?? null,
      providerPaymentId: row.provider_payment_id ?? null,
      status: row.status,
      paidAt: row.paid_at ? nullableText(row.paid_at) : null,
      receiptNumber: row.receipt_number ?? null,
      notes: nullableText(row.notes),
      reversedAt: row.reversed_at ? nullableText(row.reversed_at) : null,
      reversalReason: nullableText(row.reversal_reason),
      createdAt: nullableText(row.created_at),
    })),
    attendance: (attendance as any[]).map((row) => ({
      id: String(row.id),
      studentId: String(row.student_id),
      classId: String(row.class_id),
      date: asDate(row.attendance_date),
      status: row.status,
    })),
    grades: (grades as any[]).map((row) => ({
      id: String(row.id),
      studentId: String(row.student_id),
      classId: String(row.class_id),
      label: nullableText(row.label),
      term: nullableText(row.term),
      score: numeric(row.score),
      createdAt: nullableText(row.created_at),
    })),
    notices: (notices as any[]).map((row) => ({
      id: String(row.id),
      title: nullableText(row.title),
      message: nullableText(row.message),
      audience: nullableText(row.audience) || "Todos",
      publishedAt: nullableText(row.published_at),
    })),
  });
}
