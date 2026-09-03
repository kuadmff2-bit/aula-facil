export type View = "dashboard" | "students" | "classes" | "attendance" | "finance" | "notices" | "backup";

export type Student = {
  id: string;
  name: string;
  birthDate: string;
  phone: string;
  guardianName: string;
  guardianPhone: string;
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
  students: Student[];
  classes: ClassItem[];
  invoices: Invoice[];
  attendance: Attendance[];
  grades: Grade[];
  notices: Notice[];
};

export function emptyDatabase(): SchoolDatabase {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    students: [],
    classes: [],
    invoices: [],
    attendance: [],
    grades: [],
    notices: [],
  };
}

export function makeId(prefix: string) {
  const value = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}
