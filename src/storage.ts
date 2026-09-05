import { emptyDatabase, ensureUuidDatabase, normalizeDatabase, type SchoolDatabase } from "./model";

const LEGACY_STORAGE_KEY = "aulafacil.desktop.database.v1";
const MAX_DATABASE_CHARS = 64 * 1024 * 1024;

type TauriInternals = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: TauriInternals;
};

let cachedDatabase: SchoolDatabase = emptyDatabase();
let initialized = false;
let desktopRuntime = false;
let writeQueue: Promise<void> = Promise.resolve();
let storageFailureShown = false;

function internals() {
  return (window as TauriWindow).__TAURI_INTERNALS__;
}

function parseDatabaseText(content: string): SchoolDatabase {
  if (content.length > MAX_DATABASE_CHARS) {
    throw new Error("O banco de dados excede o limite de segurança permitido.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("O banco de dados está corrompido e não será sobrescrito.");
  }

  const normalized = normalizeDatabase(parsed);
  if (!normalized) {
    throw new Error("O banco de dados possui uma estrutura inválida e não será sobrescrito.");
  }
  return ensureUuidDatabase(normalized);
}

function readLegacyDatabase(): SchoolDatabase | null {
  const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!stored) return null;
  try {
    return parseDatabaseText(stored);
  } catch {
    return null;
  }
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const bridge = internals();
  if (!bridge?.invoke) throw new Error("A ponte segura do AulaFácil não está disponível.");
  return bridge.invoke<T>(command, args);
}

export async function initializeSecureStorage() {
  if (initialized) return;

  const legacy = readLegacyDatabase();
  desktopRuntime = Boolean(internals()?.invoke);

  if (desktopRuntime) {
    const protectedContent = await invoke<string | null>("secure_storage_load");

    if (protectedContent) {
      cachedDatabase = parseDatabaseText(protectedContent);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      await invoke<void>("secure_storage_save", { payload: JSON.stringify(cachedDatabase) });
    } else if (legacy) {
      await invoke<void>("secure_storage_save", { payload: JSON.stringify(legacy) });
      cachedDatabase = structuredClone(legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } else {
      cachedDatabase = emptyDatabase();
    }
  } else {
    cachedDatabase = legacy ?? emptyDatabase();
  }

  initialized = true;
}

export function loadDatabase(): SchoolDatabase {
  if (!initialized) {
    return readLegacyDatabase() ?? emptyDatabase();
  }
  return structuredClone(cachedDatabase);
}

function reportStorageFailure(error: unknown) {
  console.error("Falha no armazenamento protegido do AulaFácil", error);
  if (storageFailureShown) return;
  storageFailureShown = true;
  window.alert(
    "O AulaFácil não conseguiu gravar os dados no armazenamento protegido. "
    + "Não feche o aplicativo até fazer um backup e verificar o problema.",
  );
}

export function saveDatabase(database: SchoolDatabase) {
  cachedDatabase = structuredClone(database);

  if (!desktopRuntime) {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(database));
    return;
  }

  const payload = JSON.stringify(database);
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      await invoke<void>("secure_storage_save", { payload });
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      storageFailureShown = false;
    })
    .catch((error) => {
      reportStorageFailure(error);
    });
}

export function parseBackup(content: string): SchoolDatabase {
  const parsed = parseDatabaseText(content);
  return { ...parsed, updatedAt: new Date().toISOString() };
}
