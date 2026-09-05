type TauriInternals = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
};

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: TauriInternals;
};

const FALLBACK_PREFIX = "aulafacil.session.";
let writeQueue: Promise<void> = Promise.resolve();

function bridge() {
  return typeof window !== "undefined" ? (window as TauriWindow).__TAURI_INTERNALS__ : undefined;
}

async function invoke<T>(command: string, args?: Record<string, unknown>) {
  const tauri = bridge();
  if (!tauri?.invoke) throw new Error("Armazenamento protegido indisponível.");
  return tauri.invoke<T>(command, args);
}

function sanitizeMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof key === "string" && key.length <= 500 && typeof item === "string" && item.length <= 1_000_000) {
      result[key] = item;
    }
  }
  return result;
}

async function readProtectedMap() {
  const tauri = bridge();
  if (!tauri?.invoke) return null;
  const payload = await invoke<string | null>("secure_auth_load");
  if (!payload) return {};
  try {
    return sanitizeMap(JSON.parse(payload));
  } catch {
    await invoke<void>("secure_auth_clear");
    return {};
  }
}

async function mutateProtectedMap(change: (current: Record<string, string>) => void) {
  const current = await readProtectedMap() ?? {};
  change(current);
  if (Object.keys(current).length === 0) {
    await invoke<void>("secure_auth_clear");
  } else {
    await invoke<void>("secure_auth_save", { payload: JSON.stringify(current) });
  }
}

export const secureAuthStorage = {
  async getItem(key: string) {
    await writeQueue.catch(() => undefined);
    const protectedMap = await readProtectedMap();
    if (protectedMap) return protectedMap[key] ?? null;
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage.getItem(`${FALLBACK_PREFIX}${key}`);
  },

  async setItem(key: string, value: string) {
    const tauri = bridge();
    if (!tauri?.invoke) {
      if (typeof sessionStorage !== "undefined") sessionStorage.setItem(`${FALLBACK_PREFIX}${key}`, value);
      return;
    }

    writeQueue = writeQueue
      .catch(() => undefined)
      .then(() => mutateProtectedMap((current) => { current[key] = value; }));
    await writeQueue;
  },

  async removeItem(key: string) {
    const tauri = bridge();
    if (!tauri?.invoke) {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(`${FALLBACK_PREFIX}${key}`);
      return;
    }

    writeQueue = writeQueue
      .catch(() => undefined)
      .then(() => mutateProtectedMap((current) => { delete current[key]; }));
    await writeQueue;
  },
};
