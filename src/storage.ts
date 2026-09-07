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

async function readProtectedCandidates() {
  try {
    return await invoke<string[]>("secure_storage_load_candidates");
  } catch (candidateError) {
    try {
      const single = await invoke<string | null>("secure_storage_load");
      return single ? [single] : [];
    } catch {
      throw candidateError;
    }
  }
}

export async function initializeSecureStorage() {
  if (initialized) return;

  const legacy = readLegacyDatabase();
  desktopRuntime = Boolean(internals()?.invoke);

  if (desktopRuntime) {
    const candidates = await readProtectedCandidates();
    let firstValidationError: unknown = null;

    for (let index = 0; index < candidates.length; index += 1) {
      try {
        const recovered = parseDatabaseText(candidates[index]);
        if (index > 0) {
await invoke<void>("secure_storage_quarantine_current");
        }
        cachedDatabase = recovered;
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        await invoke<void>("secure_storage_save", { payload: JSON.stringify(cachedDatabase) });
        initialized = true;
        return;
      } catch (error) {
        firstValidationError ??= error;
      }
    }

    if (candidates.length > 0) {
      throw firstValidationError instanceof Error
        ? new Error(`${firstValidationError.message} As cópias locais protegidas também foram verificadas, mas nenhuma pôde ser aberta com segurança.`)
        : new Error("Nenhuma cópia local protegida pôde ser aberta com segurança.");
    }

    if (legacy) {
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

export async function replaceProtectedDatabase(database: SchoolDatabase) {
  const normalized = normalizeDatabase(database);
  if (!normalized) throw new Error("Os dados escolhidos para recuperação não possuem uma estrutura válida.");
  const recovered = ensureUuidDatabase(normalized);
  desktopRuntime = Boolean(internals()?.invoke);

  if (desktopRuntime) {
    await invoke<void>("secure_storage_quarantine_current");
    await invoke<void>("secure_storage_save", { payload: JSON.stringify(recovered) });
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } else {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(recovered));
  }

  cachedDatabase = structuredClone(recovered);
  initialized = true;
  storageFailureShown = false;
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
  const message = "O AulaFácil não conseguiu gravar os dados no armazenamento protegido. "
    + "Não feche o aplicativo até fazer um backup e verificar o problema.";
  window.dispatchEvent(new CustomEvent("aulafacil:storage-failure", { detail: { message } }));
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
