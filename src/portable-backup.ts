import type { SchoolDatabase } from "./model";
import { parseBackup } from "./storage";

const BACKUP_FORMAT = "aulafacil-encrypted-backup";
const BACKUP_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;
const MAX_BACKUP_CHARS = 96 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type EncryptedBackupEnvelope = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  cipher: "AES-256-GCM";
  salt: string;
  iv: string;
  data: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string, maxBytes: number) {
  if (!value || value.length > Math.ceil(maxBytes * 4 / 3) + 8) {
    throw new Error("O arquivo de backup excede o limite de segurança permitido.");
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("O arquivo de backup está corrompido.");
  }
  if (binary.length > maxBytes) throw new Error("O arquivo de backup excede o limite de segurança permitido.");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseEnvelope(content: string): EncryptedBackupEnvelope | null {
  if (content.length > MAX_BACKUP_CHARS) throw new Error("O arquivo de backup excede o limite de segurança permitido.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) return null;
  if (parsed.version !== BACKUP_VERSION || parsed.kdf !== "PBKDF2-SHA256" || parsed.cipher !== "AES-256-GCM") {
    throw new Error("Esta versão do backup criptografado não é compatível com o AulaFácil instalado.");
  }
  if (
    typeof parsed.createdAt !== "string"
    || typeof parsed.iterations !== "number"
    || !Number.isInteger(parsed.iterations)
    || parsed.iterations < 100_000
    || parsed.iterations > 2_000_000
    || typeof parsed.salt !== "string"
    || typeof parsed.iv !== "string"
    || typeof parsed.data !== "string"
  ) {
    throw new Error("O arquivo de backup criptografado possui uma estrutura inválida.");
  }
  return parsed as EncryptedBackupEnvelope;
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function validateBackupPassword(password: string) {
  if (password.length < 12) throw new Error("Use uma senha de backup com pelo menos 12 caracteres.");
  if (password.length > 256) throw new Error("A senha de backup é longa demais.");
}

export function isEncryptedBackup(content: string) {
  return parseEnvelope(content) !== null;
}

export async function createEncryptedBackup(database: SchoolDatabase, password: string) {
  validateBackupPassword(password);
  const plaintext = JSON.stringify(database);
  if (plaintext.length > MAX_BACKUP_CHARS) throw new Error("O banco de dados excede o limite permitido para backup.");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );

  const envelope: EncryptedBackupEnvelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    cipher: "AES-256-GCM",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  };
  return JSON.stringify(envelope);
}

export async function decryptPortableBackup(content: string, password: string): Promise<SchoolDatabase> {
  validateBackupPassword(password);
  const envelope = parseEnvelope(content);
  if (!envelope) throw new Error("Este arquivo não é um backup criptografado do AulaFácil.");

  const salt = base64ToBytes(envelope.salt, 32);
  const iv = base64ToBytes(envelope.iv, 32);
  if (salt.length !== 16 || iv.length !== 12) throw new Error("O arquivo de backup criptografado está corrompido.");
  const encrypted = base64ToBytes(envelope.data, MAX_BACKUP_CHARS);
  const key = await deriveKey(password, salt, envelope.iterations);

  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    return parseBackup(decoder.decode(decrypted));
  } catch {
    throw new Error("Senha incorreta ou arquivo de backup corrompido.");
  }
}

export function parseLegacyBackup(content: string) {
  return parseBackup(content);
}
