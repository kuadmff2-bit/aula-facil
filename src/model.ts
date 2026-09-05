export type View = "dashboard" | "students" | "classes" | "attendance" | "finance" | "notices" | "backup" | "settings";

export type StudentFieldType = "text" | "tel" | "email" | "date" | "number" | "textarea";
export type StudentFieldVisibility = "always" | "minor" | "adult";
export type StudentFieldSource = "phone" | "guardianName" | "guardianPhone";
export type AppearanceMode = "system" | "light" | "dark";
export type LateFeeMode = "none" | "fixed" | "percent";
export type InterestMode = "none" | "daily_percent" | "monthly_percent" | "fixed_daily";

export type StudentFieldDefinition = {
  id: string;
  label: string;
  type: StudentFieldType;
  required: boolean;
  visibility: StudentFieldVisibility;
  placeholder: string;
  source?: StudentFieldSource;
};

export type InstitutionSettings = {
  name: string;
  legalName: string;
  documentNumber: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  whatsapp: string;
  email: string;
  primaryColor: string;
  secondaryColor: string;
  logoDataUrl: string;
};

export type FinanceSettings = {
  allowedDueDays: number[];
  lateFeeMode: LateFeeMode;
  lateFeeValue: number;
  interestMode: InterestMode;
  interestValue: number;
  graceDays: number;
  boletoDueText: string;
  boletoFooter: string;
  boletoPrimaryColor: string;
  boletoShowLogo: boolean;
};

export type ReceiptSettings = {
  title: string;
  footer: string;
  schoolSignatureLabel: string;
  payerSignatureLabel: string;
};

export type CertificateSettings = {
  title: string;
  bodyTemplate: string;
  footerText: string;
  primaryColor: string;
  secondaryColor: string;
  signatures: string[];
  defaultWorkloadHours: number;
};

export type SchoolSettings = {
  appearance: AppearanceMode;
  studentFields: StudentFieldDefinition[];
  institution: InstitutionSettings;
  finance: FinanceSettings;
  receipt: ReceiptSettings;
  certificate: CertificateSettings;
};

export type Student = {
  id: string;
  name: string;
  birthDate: string;
  phone: string;
  guardianName: string;
  guardianPhone: string;
  customFields: Record<string, string>;
  classId: string;
  dueDay?: number | null;
  active: boolean;
  completedAt?: string | null;
  createdAt: string;
};

export type ClassItem = {
  id: string;
  name: string;
  teacher: string;
  schedule: string;
  room: string;
  monthlyFee: number;
  workloadHours?: number | null;
  color: string;
  createdAt: string;
};

export type InvoiceStatus = "pending" | "paid" | "overdue" | "cancelled";

export type Invoice = {
  id: string;
  studentId: string;
  reference: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
  paidAt: string | null;
  provider?: string | null;
  providerChargeId?: string | null;
  pixCopyPaste?: string | null;
  boletoUrl?: string | null;
  createdAt: string;
};

export type Attendance = {
  id: string;
  studentId: string;
  classId: string;
  date: string;
  status: "present" | "absent";
};

export type Grade = {
  id: string;
  studentId: string;
  classId: string;
  label: string;
  term: string;
  score: number;
  createdAt: string;
};

export type Notice = {
  id: string;
  title: string;
  message: string;
  audience: string;
  publishedAt: string;
};

export type SchoolDatabase = {
  version: 1;
  updatedAt: string;
  settings: SchoolSettings;
  students: Student[];
  classes: ClassItem[];
  invoices: Invoice[];
  attendance: Attendance[];
  grades: Grade[];
  notices: Notice[];
};

const MAX_RECORDS_PER_COLLECTION = 250_000;
const FIELD_TYPES: StudentFieldType[] = ["text", "tel", "email", "date", "number", "textarea"];
const FIELD_VISIBILITIES: StudentFieldVisibility[] = ["always", "minor", "adult"];
const FIELD_SOURCES: StudentFieldSource[] = ["phone", "guardianName", "guardianPhone"];
const INVOICE_STATUSES: InvoiceStatus[] = ["pending", "paid", "overdue", "cancelled"];
const LATE_FEE_MODES: LateFeeMode[] = ["none", "fixed", "percent"];
const INTEREST_MODES: InterestMode[] = ["none", "daily_percent", "monthly_percent", "fixed_daily"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, maxLength: number, fallback = "") {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function finiteNumber(value: unknown, minimum: number, maximum: number, fallback: number | null = null) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

function validArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length <= MAX_RECORDS_PER_COLLECTION;
}

function sanitizeDueDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [5, 10, 15, 20, 25];
  const days = [...new Set(value.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 31))]
    .sort((a, b) => a - b)
    .slice(0, 31);
  return days.length ? days : [5, 10, 15, 20, 25];
}

function sanitizeCustomFields(value: unknown): Record<string, string> | null {
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 200) return null;

  const result: Record<string, string> = {};
  for (const [key, fieldValue] of entries) {
    if (key.length > 120 || typeof fieldValue !== "string" || fieldValue.length > 4_000) return null;
    result[key] = fieldValue;
  }
  return result;
}

function sanitizeStudentField(field: unknown): StudentFieldDefinition | null {
  if (!isRecord(field)) return null;
  const id = text(field.id, 120);
  const label = text(field.label, 80);
  if (!id || !label) return null;

  const type = FIELD_TYPES.includes(field.type as StudentFieldType) ? field.type as StudentFieldType : "text";
  const visibility = FIELD_VISIBILITIES.includes(field.visibility as StudentFieldVisibility)
    ? field.visibility as StudentFieldVisibility
    : "always";
  const source = FIELD_SOURCES.includes(field.source as StudentFieldSource)
    ? field.source as StudentFieldSource
    : undefined;

  return {
    id,
    label,
    type,
    required: Boolean(field.required),
    visibility,
    placeholder: text(field.placeholder, 120),
    source,
  };
}

function sanitizeStudent(student: unknown): Student | null {
  if (!isRecord(student)) return null;
  const id = text(student.id, 180);
  const name = text(student.name, 200);
  const birthDate = text(student.birthDate, 32);
  const classId = text(student.classId, 180);
  const createdAt = text(student.createdAt, 48);
  const customFields = sanitizeCustomFields(student.customFields);
  if (!id || !name || !birthDate || !classId || !createdAt || !customFields) return null;

  const rawDueDay = finiteNumber(student.dueDay, 1, 31, null);
  const dueDay = rawDueDay !== null && Number.isInteger(rawDueDay) ? rawDueDay : null;

  return {
    id,
    name,
    birthDate,
    phone: text(student.phone, 40),
    guardianName: text(student.guardianName, 200),
    guardianPhone: text(student.guardianPhone, 40),
    customFields,
    classId,
    dueDay,
    active: student.active === undefined ? true : Boolean(student.active),
    completedAt: student.completedAt === null || student.completedAt === undefined ? null : text(student.completedAt, 48) || null,
    createdAt,
  };
}

function sanitizeClass(item: unknown): ClassItem | null {
  if (!isRecord(item)) return null;
  const id = text(item.id, 180);
  const name = text(item.name, 160);
  const createdAt = text(item.createdAt, 48);
  const monthlyFee = finiteNumber(item.monthlyFee, 0, 100_000_000, null);
  if (!id || !name || !createdAt || monthlyFee === null) return null;

  return {
    id,
    name,
    teacher: text(item.teacher, 200),
    schedule: text(item.schedule, 200),
    room: text(item.room, 120),
    monthlyFee,
    workloadHours: finiteNumber(item.workloadHours, 0, 100_000, null),
    color: text(item.color, 32, "#1649b8"),
    createdAt,
  };
}

function sanitizeInvoice(item: unknown): Invoice | null {
  if (!isRecord(item)) return null;
  const id = text(item.id, 180);
  const studentId = text(item.studentId, 180);
  const reference = text(item.reference, 160);
  const dueDate = text(item.dueDate, 32);
  const createdAt = text(item.createdAt, 48);
  const amount = finiteNumber(item.amount, 0, 100_000_000, null);
  const status = INVOICE_STATUSES.includes(item.status as InvoiceStatus) ? item.status as InvoiceStatus : null;
  if (!id || !studentId || !reference || !dueDate || !createdAt || amount === null || !status) return null;

  return {
    id,
    studentId,
    reference,
    dueDate,
    amount,
    status,
    paidAt: item.paidAt === null || item.paidAt === undefined ? null : text(item.paidAt, 48) || null,
    provider: item.provider === null || item.provider === undefined ? null : text(item.provider, 40) || null,
    providerChargeId: item.providerChargeId === null || item.providerChargeId === undefined ? null : text(item.providerChargeId, 255) || null,
    pixCopyPaste: item.pixCopyPaste === null || item.pixCopyPaste === undefined ? null : text(item.pixCopyPaste, 8_000) || null,
    boletoUrl: item.boletoUrl === null || item.boletoUrl === undefined ? null : text(item.boletoUrl, 2_048) || null,
    createdAt,
  };
}

function sanitizeAttendance(item: unknown): Attendance | null {
  if (!isRecord(item)) return null;
  const status = item.status === "present" || item.status === "absent" ? item.status : null;
  const id = text(item.id, 180);
  const studentId = text(item.studentId, 180);
  const classId = text(item.classId, 180);
  const date = text(item.date, 32);
  if (!id || !studentId || !classId || !date || !status) return null;
  return { id, studentId, classId, date, status };
}

function sanitizeGrade(item: unknown): Grade | null {
  if (!isRecord(item)) return null;
  const id = text(item.id, 180);
  const studentId = text(item.studentId, 180);
  const classId = text(item.classId, 180);
  const label = text(item.label, 160);
  const term = text(item.term, 100);
  const createdAt = text(item.createdAt, 48);
  const score = finiteNumber(item.score, 0, 10, null);
  if (!id || !studentId || !classId || !label || !term || !createdAt || score === null) return null;
  return { id, studentId, classId, label, term, score, createdAt };
}

function sanitizeNotice(item: unknown): Notice | null {
  if (!isRecord(item)) return null;
  const id = text(item.id, 180);
  const title = text(item.title, 160);
  const message = text(item.message, 5_000);
  const publishedAt = text(item.publishedAt, 48);
  if (!id || !title || !message || !publishedAt) return null;
  return { id, title, message, audience: text(item.audience, 100, "Todos"), publishedAt };
}

function sanitizeCollection<T>(source: unknown[], sanitizer: (item: unknown) => T | null): T[] | null {
  const result: T[] = [];
  for (const item of source) {
    const sanitized = sanitizer(item);
    if (!sanitized) return null;
    result.push(sanitized);
  }
  return result;
}

function defaultInstitutionSettings(): InstitutionSettings {
  return {
    name: "",
    legalName: "",
    documentNumber: "",
    address: "",
    city: "",
    state: "",
    phone: "",
    whatsapp: "",
    email: "",
    primaryColor: "#1649b8",
    secondaryColor: "#0f766e",
    logoDataUrl: "",
  };
}

export function defaultFinanceSettings(): FinanceSettings {
  return {
    allowedDueDays: [5, 10, 15, 20, 25],
    lateFeeMode: "none",
    lateFeeValue: 0,
    interestMode: "none",
    interestValue: 0,
    graceDays: 0,
    boletoDueText: "Após o vencimento, consulte o valor atualizado no AulaFácil.",
    boletoFooter: "Documento de cobrança emitido pela instituição.",
    boletoPrimaryColor: "#1649b8",
    boletoShowLogo: true,
  };
}

function defaultReceiptSettings(): ReceiptSettings {
  return {
    title: "Recibo de pagamento",
    footer: "Emitido pelo AulaFácil",
    schoolSignatureLabel: "Assinatura da escola / responsável pelo recebimento",
    payerSignatureLabel: "Assinatura do pagador",
  };
}

function defaultCertificateSettings(): CertificateSettings {
  return {
    title: "Certificado",
    bodyTemplate: "Certificamos que {aluno} concluiu o curso {curso}, com carga horária de {carga_horaria} horas.",
    footerText: "Documento emitido pela instituição de ensino.",
    primaryColor: "#1649b8",
    secondaryColor: "#0f766e",
    signatures: ["Direção", "Coordenação"],
    defaultWorkloadHours: 0,
  };
}

export function defaultStudentFields(): StudentFieldDefinition[] {
  return [
    {
      id: "00000000-0000-4000-8000-000000000001",
      label: "Telefone do aluno",
      type: "tel",
      required: false,
      visibility: "always",
      placeholder: "(92) 99999-9999",
      source: "phone",
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      label: "Nome do responsável",
      type: "text",
      required: false,
      visibility: "always",
      placeholder: "Nome completo",
      source: "guardianName",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      label: "Telefone do responsável",
      type: "tel",
      required: false,
      visibility: "always",
      placeholder: "(92) 99999-9999",
      source: "guardianPhone",
    },
  ];
}

export function defaultSchoolSettings(): SchoolSettings {
  return {
    appearance: "system",
    studentFields: defaultStudentFields(),
    institution: defaultInstitutionSettings(),
    finance: defaultFinanceSettings(),
    receipt: defaultReceiptSettings(),
    certificate: defaultCertificateSettings(),
  };
}

export function emptyDatabase(): SchoolDatabase {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    settings: defaultSchoolSettings(),
    students: [],
    classes: [],
    invoices: [],
    attendance: [],
    grades: [],
    notices: [],
  };
}

function sanitizeSettings(rawSettings: Record<string, unknown>): SchoolSettings | null {
  const defaults = defaultSchoolSettings();
  const appearance: AppearanceMode = rawSettings.appearance === "light" || rawSettings.appearance === "dark" || rawSettings.appearance === "system"
    ? rawSettings.appearance
    : "system";

  const rawFields = Array.isArray(rawSettings.studentFields) && rawSettings.studentFields.length <= 100
    ? rawSettings.studentFields
    : defaultStudentFields();
  const studentFields = sanitizeCollection(rawFields, sanitizeStudentField);
  if (!studentFields) return null;

  const rawInstitution = isRecord(rawSettings.institution) ? rawSettings.institution : {};
  const rawFinance = isRecord(rawSettings.finance) ? rawSettings.finance : {};
  const rawReceipt = isRecord(rawSettings.receipt) ? rawSettings.receipt : {};
  const rawCertificate = isRecord(rawSettings.certificate) ? rawSettings.certificate : {};

  const lateFeeMode = LATE_FEE_MODES.includes(rawFinance.lateFeeMode as LateFeeMode)
    ? rawFinance.lateFeeMode as LateFeeMode
    : defaults.finance.lateFeeMode;
  const interestMode = INTEREST_MODES.includes(rawFinance.interestMode as InterestMode)
    ? rawFinance.interestMode as InterestMode
    : defaults.finance.interestMode;

  const signatures = Array.isArray(rawCertificate.signatures)
    ? rawCertificate.signatures.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 80)).filter(Boolean).slice(0, 6)
    : defaults.certificate.signatures;

  return {
    appearance,
    studentFields,
    institution: {
      name: text(rawInstitution.name, 160),
      legalName: text(rawInstitution.legalName, 200),
      documentNumber: text(rawInstitution.documentNumber, 40),
      address: text(rawInstitution.address, 300),
      city: text(rawInstitution.city, 120),
      state: text(rawInstitution.state, 80),
      phone: text(rawInstitution.phone, 40),
      whatsapp: text(rawInstitution.whatsapp, 40),
      email: text(rawInstitution.email, 200),
      primaryColor: text(rawInstitution.primaryColor, 32, defaults.institution.primaryColor),
      secondaryColor: text(rawInstitution.secondaryColor, 32, defaults.institution.secondaryColor),
      logoDataUrl: text(rawInstitution.logoDataUrl, 3_000_000),
    },
    finance: {
      allowedDueDays: sanitizeDueDays(rawFinance.allowedDueDays ?? rawSettings.allowedDueDays),
      lateFeeMode,
      lateFeeValue: finiteNumber(rawFinance.lateFeeValue, 0, 1_000_000, defaults.finance.lateFeeValue) ?? 0,
      interestMode,
      interestValue: finiteNumber(rawFinance.interestValue, 0, 1_000_000, defaults.finance.interestValue) ?? 0,
      graceDays: Math.round(finiteNumber(rawFinance.graceDays, 0, 365, defaults.finance.graceDays) ?? 0),
      boletoDueText: text(rawFinance.boletoDueText, 500, defaults.finance.boletoDueText),
      boletoFooter: text(rawFinance.boletoFooter, 500, defaults.finance.boletoFooter),
      boletoPrimaryColor: text(rawFinance.boletoPrimaryColor, 32, defaults.finance.boletoPrimaryColor),
      boletoShowLogo: rawFinance.boletoShowLogo === undefined ? defaults.finance.boletoShowLogo : Boolean(rawFinance.boletoShowLogo),
    },
    receipt: {
      title: text(rawReceipt.title, 120, defaults.receipt.title),
      footer: text(rawReceipt.footer, 300, defaults.receipt.footer),
      schoolSignatureLabel: text(rawReceipt.schoolSignatureLabel, 160, defaults.receipt.schoolSignatureLabel),
      payerSignatureLabel: text(rawReceipt.payerSignatureLabel, 160, defaults.receipt.payerSignatureLabel),
    },
    certificate: {
      title: text(rawCertificate.title, 120, defaults.certificate.title),
      bodyTemplate: text(rawCertificate.bodyTemplate, 3_000, defaults.certificate.bodyTemplate),
      footerText: text(rawCertificate.footerText, 500, defaults.certificate.footerText),
      primaryColor: text(rawCertificate.primaryColor, 32, defaults.certificate.primaryColor),
      secondaryColor: text(rawCertificate.secondaryColor, 32, defaults.certificate.secondaryColor),
      signatures: signatures.length ? signatures : defaults.certificate.signatures,
      defaultWorkloadHours: finiteNumber(rawCertificate.defaultWorkloadHours, 0, 100_000, defaults.certificate.defaultWorkloadHours) ?? 0,
    },
  };
}

export function normalizeDatabase(value: unknown): SchoolDatabase | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1
    || !validArray(value.students)
    || !validArray(value.classes)
    || !validArray(value.invoices)
    || !validArray(value.attendance)
    || !validArray(value.grades)
    || !validArray(value.notices)) return null;

  const settings = sanitizeSettings(isRecord(value.settings) ? value.settings : {});
  const students = sanitizeCollection(value.students, sanitizeStudent);
  const classes = sanitizeCollection(value.classes, sanitizeClass);
  const invoices = sanitizeCollection(value.invoices, sanitizeInvoice);
  const attendance = sanitizeCollection(value.attendance, sanitizeAttendance);
  const grades = sanitizeCollection(value.grades, sanitizeGrade);
  const notices = sanitizeCollection(value.notices, sanitizeNotice);

  if (!settings || !students || !classes || !invoices || !attendance || !grades || !notices) return null;

  return {
    version: 1,
    updatedAt: text(value.updatedAt, 48, new Date().toISOString()),
    settings,
    students,
    classes,
    invoices,
    attendance,
    grades,
    notices,
  };
}

function randomUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function makeId(_prefix?: string) {
  return randomUuid();
}

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function ensureUuidDatabase(database: SchoolDatabase): SchoolDatabase {
  const next = structuredClone(database);
  let changed = false;

  const mapIds = <T extends { id: string }>(items: T[]) => {
    const mapping = new Map<string, string>();
    for (const item of items) {
      const id = isUuid(item.id) ? item.id : randomUuid();
      if (id !== item.id) changed = true;
      mapping.set(item.id, id);
      item.id = id;
    }
    return mapping;
  };

  const fieldMap = mapIds(next.settings.studentFields);
  const classMap = mapIds(next.classes);
  const studentMap = mapIds(next.students);
  mapIds(next.invoices);
  mapIds(next.attendance);
  mapIds(next.grades);
  mapIds(next.notices);

  for (const student of next.students) {
    student.classId = classMap.get(student.classId) ?? student.classId;
    const migratedFields: Record<string, string> = {};
    for (const [fieldId, value] of Object.entries(student.customFields ?? {})) {
      migratedFields[fieldMap.get(fieldId) ?? fieldId] = value;
    }
    student.customFields = migratedFields;
  }
  for (const invoice of next.invoices) invoice.studentId = studentMap.get(invoice.studentId) ?? invoice.studentId;
  for (const item of next.attendance) {
    item.studentId = studentMap.get(item.studentId) ?? item.studentId;
    item.classId = classMap.get(item.classId) ?? item.classId;
  }
  for (const grade of next.grades) {
    grade.studentId = studentMap.get(grade.studentId) ?? grade.studentId;
    grade.classId = classMap.get(grade.classId) ?? grade.classId;
  }

  if (changed) next.updatedAt = new Date().toISOString();
  return next;
}
