import {
  getProtectedAuthItem,
  isProtectedAuthStorageAvailable,
  removeProtectedAuthItem,
  setProtectedAuthItem,
} from "./secure-auth-storage";

const REMEMBERED_LOGIN_KEY = "aulafacil.remembered-login.v1";

export type RememberedLogin = {
  email: string;
  password: string;
};

function validEmail(value: unknown): value is string {
  return typeof value === "string" && value.length >= 3 && value.length <= 200 && value.includes("@");
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 256;
}

export function canRememberLogin() {
  return isProtectedAuthStorageAvailable();
}

export async function loadRememberedLogin(): Promise<RememberedLogin | null> {
  if (!canRememberLogin()) return null;
  const raw = await getProtectedAuthItem(REMEMBERED_LOGIN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!validEmail(parsed.email) || !validPassword(parsed.password)) {
      await clearRememberedLogin();
      return null;
    }
    return { email: parsed.email.trim().toLowerCase(), password: parsed.password };
  } catch {
    await clearRememberedLogin();
    return null;
  }
}

export async function saveRememberedLogin(email: string, password: string) {
  if (!canRememberLogin()) throw new Error("Salvar senha só está disponível no aplicativo desktop do AulaFácil.");
  const normalizedEmail = email.trim().toLowerCase();
  if (!validEmail(normalizedEmail) || !validPassword(password)) throw new Error("E-mail ou senha inválidos para armazenamento protegido.");
  await setProtectedAuthItem(REMEMBERED_LOGIN_KEY, JSON.stringify({ email: normalizedEmail, password }));
}

export async function clearRememberedLogin() {
  await removeProtectedAuthItem(REMEMBERED_LOGIN_KEY);
}
