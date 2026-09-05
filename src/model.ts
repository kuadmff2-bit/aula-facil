export type View = "dashboard" | "students" | "classes" | "attendance" | "finance" | "notices" | "backup" | "settings";

export type StudentFieldType = "text" | "tel" | "email" | "date" | "number" | "textarea";
export type StudentFieldVisibility = "always" | "minor" | "adult";
export type StudentFieldSource = "phone" | "guardianName" | "guardianPhone";

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
  studentFields: StudentFieldDefinition[];
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
  return { studentFields: defaultStudentFields() };
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
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SchoolDatabase>;
  if (item.version !== 1
    || !Array.isArray(item.students)
    || !Array.isArray(item.classes)
    || !Array.isArray(item.invoices)
    || !Array.isArray(item.attendance)
    || !Array.isArray(item.grades)
    || !Array.isArray(item.notices)) return null;

  const settings = item.settings && Array.isArray(item.settings.studentFields)
    ? item.settings
    : defaultSchoolSettings();

  return {
    version: 1,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
    settings: {
      studentFields: settings.studentFields
        .filter((field): field is StudentFieldDefinition => Boolean(field && typeof field.id === "string" && typeof field.label === "string"))
        .map((field) => ({
          id: field.id,
          label: field.label.slice(0, 80),
          type: ["text", "tel", "email", "date", "number", "textarea"].includes(field.type) ? field.type : "text",
          required: Boolean(field.required),
          visibility: ["always", "minor", "adult"].includes(field.visibility) ? field.visibility : "always",
          placeholder: typeof field.placeholder === "string" ? field.placeholder.slice(0, 120) : "",
          source: ["phone", "guardianName", "guardianPhone"].includes(field.source ?? "") ? field.source : undefined,
        })),
    },
    students: item.students.map((student) => ({
      ...student,
      phone: typeof student.phone === "string" ? student.phone : "",
      guardianName: typeof student.guardianName === "string" ? student.guardianName : "",
      guardianPhone: typeof student.guardianPhone === "string" ? student.guardianPhone : "",
      customFields: student.customFields && typeof student.customFields === "object" ? student.customFields : {},
    })),
    classes: item.classes,
    invoices: item.invoices,
    attendance: item.attendance,
    grades: item.grades,
    notices: item.notices,
  };
}

export function makeId(prefix: string) {
  const value = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}
