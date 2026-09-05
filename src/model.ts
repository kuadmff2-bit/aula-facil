export type View = "dashboard" | "students" | "classes" | "attendance" | "finance" | "notices" | "backup" | "settings";

export type StudentFieldType = "text" | "tel" | "email" | "date" | "number" | "textarea";
export type StudentFieldVisibility = "always" | "minor" | "adult";
export type StudentFieldSource = "phone" | "guardianName" | "guardianPhone";
export type AppearanceMode = "system" | "light" | "dark";

export type StudentFieldDefinition = {
  id: string;
  label: string;
  type: StudentFieldType;
  required: boolean;
  visibility: StudentFieldVisibility;
  placeholder: string;
  source?: StudentFieldSource;
};

export type SchoolSettings = {
  appearance: AppearanceMode;
  studentFields: StudentFieldDefinition[];
  allowedDueDays: number[];
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
  dueDay: number | null;
  active: boolean;
  createdAt: string;
};

export type ClassItem = {
  id: string;
  name: string;
  teacher: string;
  schedule: string;
  room: string;
  monthlyFee: number;
  color: string;
  createdAt: string;
};

export type InvoiceStatus = "pending" | "paid" | "overdue";

export type Invoice = {
  id: string;
  studentId: string;
  reference: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
  paidAt: string | null;
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
const INVOICE_STATUSES: InvoiceStatus[] = ["pending", "paid", "overdue"];

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

export function defaultStudentFields(): StudentFieldDefinition[] {
  return [
    {
      id: "student-phone",
      label: "Telefone do aluno",
      type: "tel",
      required: false,
      visibility: "always",
      placeholder: "(92) 99999-9999",
      source: "phone",
    },
    {
      id: "guardian-name",
      label: "Nome do responsável",
      type: "text",
      required: false,
      visibility: "always",
      placeholder: "Nome completo",
      source: "guardianName",
    },
    {
      id: "guardian-phone",
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
    allowedDueDays: [5, 10, 15, 20, 25],
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

export function normalizeDatabase(value: unknown): SchoolDatabase | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1
    || !validArray(value.students)
    || !validArray(value.classes)
    || !validArray(value.invoices)
    || !validArray(value.attendance)
    || !validArray(value.grades)
    || !validArray(value.notices)) return null;

  const rawSettings = isRecord(value.settings) ? value.settings : {};
  const appearance: AppearanceMode = rawSettings.appearance === "light" || rawSettings.appearance === "dark" || rawSettings.appearance === "system"
    ? rawSettings.appearance
    : "system";

  const rawFields = Array.isArray(rawSettings.studentFields) && rawSettings.studentFields.length <= 100
    ? rawSettings.studentFields
    : defaultStudentFields();
  const studentFields = sanitizeCollection(rawFields, sanitizeStudentField);
  const students = sanitizeCollection(value.students, sanitizeStudent);
  const classes = sanitizeCollection(value.classes, sanitizeClass);
  const invoices = sanitizeCollection(value.invoices, sanitizeInvoice);
  const attendance = sanitizeCollection(value.attendance, sanitizeAttendance);
  const grades = sanitizeCollection(value.grades, sanitizeGrade);
  const notices = sanitizeCollection(value.notices, sanitizeNotice);

  if (!studentFields || !students || !classes || !invoices || !attendance || !grades || !notices) return null;

  return {
    version: 1,
    updatedAt: text(value.updatedAt, 48, new Date().toISOString()),
    settings: {
      appearance,
      studentFields,
      allowedDueDays: sanitizeDueDays(rawSettings.allowedDueDays),
    },
    students,
    classes,
    invoices,
    attendance,
    grades,
    notices,
  };
}

export function makeId(prefix: string) {
  const value = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}
