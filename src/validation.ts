export const MIN_REASONABLE_DATE = "1900-01-01";
export const MAX_REASONABLE_DATE = "2100-12-31";

export function localTodayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function birthDateError(value: string) {
  if (!value) return "Informe a data de nascimento.";
  if (!isValidIsoDate(value)) return "Informe uma data de nascimento válida.";
  if (value < MIN_REASONABLE_DATE) return "A data de nascimento informada é antiga demais. Confira o ano.";
  if (value > localTodayIso()) return "A data de nascimento não pode estar no futuro.";
  return "";
}

export function ageGroupFromBirthDate(value: string): "minor" | "adult" | null {
  if (birthDateError(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  if (currentMonth < month || (currentMonth === month && currentDay < day)) age -= 1;
  return age < 18 ? "minor" : "adult";
}

export function phoneDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

export function phoneError(value: string, required = false) {
  const trimmed = value.trim();
  if (!trimmed) return required ? "Informe o telefone com DDD." : "";
  const digits = phoneDigits(trimmed);
  if (digits.length !== 10 && digits.length !== 11) return "Informe um telefone válido com DDD: 10 ou 11 dígitos.";
  if (/^(\d)\1+$/.test(digits)) return "Informe um telefone válido.";
  return "";
}

export function genericDateError(value: string) {
  if (!value) return "";
  if (!isValidIsoDate(value)) return "Informe uma data válida.";
  if (value < MIN_REASONABLE_DATE || value > MAX_REASONABLE_DATE) return `Informe uma data entre 1900 e 2100.`;
  return "";
}
