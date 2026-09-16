export type Role = "owner" | "admin" | "finance" | "staff" | "teacher";
export type Row = { id: string; school_id: string; [key: string]: unknown };
export type School = {
  id: string;
  name: string;
  role: Role;
  [key: string]: unknown;
};
export type Page =
  | "dashboard"
  | "students"
  | "guardians"
  | "courses"
  | "classes"
  | "enrollments"
  | "invoices"
  | "payments"
  | "collections"
  | "debtors"
  | "reports"
  | "audit"
  | "settings";
export type ListResult = { rows: Row[]; total: number };
export type Notify = (message: string, error?: boolean) => void;
export const canWrite = (role: Role, resource: string) =>
  ["owner", "admin"].includes(role) ||
  (role === "finance" &&
    ["invoices", "payments", "enrollments", "collections"].includes(
      resource,
    )) ||
  (role === "staff" &&
    ["students", "guardians", "classes", "courses", "enrollments"].includes(
      resource,
    ));
export const canFinance = (role: Role) => role !== "teacher";
export function string(row: Record<string, unknown>, key: string): string {
  return String(row[key] ?? "");
}
