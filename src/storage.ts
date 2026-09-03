import { emptyDatabase, type SchoolDatabase } from "./model";

const STORAGE_KEY = "aulafacil.desktop.database.v1";

function isDatabase(value: unknown): value is SchoolDatabase {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SchoolDatabase>;
  return item.version === 1
    && Array.isArray(item.students)
    && Array.isArray(item.classes)
    && Array.isArray(item.invoices)
    && Array.isArray(item.attendance)
    && Array.isArray(item.grades)
    && Array.isArray(item.notices);
}

export function loadDatabase(): SchoolDatabase {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return emptyDatabase();
  try {
    const parsed: unknown = JSON.parse(stored);
    return isDatabase(parsed) ? parsed : emptyDatabase();
  } catch {
    return emptyDatabase();
  }
}

export function saveDatabase(database: SchoolDatabase) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
}

export function parseBackup(content: string): SchoolDatabase {
  const parsed: unknown = JSON.parse(content);
  if (!isDatabase(parsed)) {
    throw new Error("Este arquivo não é um backup válido do AulaFácil.");
  }
  return { ...parsed, updatedAt: new Date().toISOString() };
}
