from pathlib import Path
import re

SYNC_FILE = Path("src/cloud-safe-sync.ts")
text = SYNC_FILE.read_text(encoding="utf-8")

anchor = 'const pendingDeletionKey = (schoolId: string) => `aulafacil.cloud.pending-deletions.${schoolId}`;\n'
if 'SYNC_CLIENT_KEY' not in text:
    if anchor not in text:
        raise SystemExit("sync anchor not found")
    lease_code = r'''const SYNC_CLIENT_KEY = "aulafacil.cloud.sync-client-id";

type SchoolSyncLease = {
  token: string;
  clientId: string;
  ownsRelease: boolean;
};

function getSyncClientId() {
  const existing = localStorage.getItem(SYNC_CLIENT_KEY)?.trim();
  if (existing && existing.length >= 8) return existing;
  const created = `desktop-${crypto.randomUUID()}`;
  localStorage.setItem(SYNC_CLIENT_KEY, created);
  return created;
}

async function claimSchoolSyncLease(schoolId: string): Promise<SchoolSyncLease> {
  const clientId = getSyncClientId();
  const { data, error } = await cloud.rpc("claim_school_sync_lease", {
    target_school: schoolId,
    target_client_id: clientId,
    lease_seconds: 600,
  });
  if (error) throw new Error(`Não foi possível reservar a sincronização: ${error.message}`);
  const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
  if (!result.acquired || typeof result.leaseToken !== "string") {
    const until = typeof result.busyUntil === "string"
      ? new Date(result.busyUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : "alguns instantes";
    throw new Error(`Outro dispositivo está sincronizando esta instituição. Aguarde até ${until} e tente novamente. Nenhum dado foi sobrescrito.`);
  }
  return {
    token: result.leaseToken,
    clientId,
    ownsRelease: !Boolean(result.reused),
  };
}

async function renewSchoolSyncLease(schoolId: string, lease: SchoolSyncLease) {
  const { data, error } = await cloud.rpc("renew_school_sync_lease", {
    target_school: schoolId,
    target_client_id: lease.clientId,
    target_lease_token: lease.token,
    lease_seconds: 600,
  });
  if (error) throw error;
  return data === true;
}

async function releaseSchoolSyncLease(schoolId: string, lease: SchoolSyncLease) {
  if (!lease.ownsRelease) return;
  await cloud.rpc("release_school_sync_lease", {
    target_school: schoolId,
    target_client_id: lease.clientId,
    target_lease_token: lease.token,
  }).catch(() => undefined);
}

async function withSchoolSyncLease<T>(schoolId: string, operation: () => Promise<T>): Promise<T> {
  const lease = await claimSchoolSyncLease(schoolId);
  let lost = false;
  let transientRenewFailures = 0;
  const heartbeat = lease.ownsRelease ? setInterval(() => {
    void renewSchoolSyncLease(schoolId, lease)
      .then((ok) => {
        if (!ok) lost = true;
        else transientRenewFailures = 0;
      })
      .catch(() => {
        transientRenewFailures += 1;
        if (transientRenewFailures >= 3) lost = true;
      });
  }, 120_000) : null;

  try {
    const result = await operation();
    if (lost) {
      throw new Error("A reserva de sincronização foi perdida durante a operação. O AulaFácil não assumiu que o computador está sincronizado; recupere a nuvem antes de tentar novamente.");
    }
    return result;
  } finally {
    if (heartbeat !== null) clearInterval(heartbeat);
    await releaseSchoolSyncLease(schoolId, lease);
  }
}
'''
    text = text.replace(anchor, anchor + lease_code + "\n", 1)

start_marker = 'export async function safePushToCloud(schoolId: string, database: SchoolDatabase) {'
end_marker = '\nexport async function replaceCloudWithLocal'
start = text.index(start_marker)
end = text.index(end_marker, start)
push_block = text[start:end]
if 'return withSchoolSyncLease(schoolId, async () =>' not in push_block:
    body = push_block[len(start_marker):].rstrip()
    if not body.endswith('}'):
        raise SystemExit(f"unexpected safePushToCloud shape: tail={body[-80:]!r}")
    body = body[:-1]
    old_tail = '''      const revision = await getCloudRevision(schoolId);
      writeBaseline(schoolId, revision, pushed, role);
      clearPushAttempt(schoolId);
      return pushed;'''
    new_tail = '''      // Um webhook financeiro ou outro processo do servidor pode ter alterado a nuvem durante o envio.
      // Só considera a sincronização concluída depois de reler o estado final do servidor.
      const finalDatabase = await safePullFromCloud(schoolId, pushed.settings.appearance);
      clearPushAttempt(schoolId);
      return finalDatabase;'''
    if old_tail not in body:
        raise SystemExit("safePushToCloud finalization block not found")
    body = body.replace(old_tail, new_tail, 1)
    indented = "\n".join(("  " + line if line else line) for line in body.splitlines())
    replacement = start_marker + "\n  return withSchoolSyncLease(schoolId, async () => {" + indented + "\n  });\n}"
    text = text[:start] + replacement + text[end:]

old_replace = '''export async function replaceCloudWithLocal(schoolId: string, database: SchoolDatabase) {
  const role = await getCloudSyncRole(schoolId);
  if (!isAdmin(role)) throw new Error("Somente proprietário ou administrador pode aplicar alterações deste computador durante um conflito.");
  await pushSnapshot(schoolId, database, role);
  await flushPendingCloudDeletions(schoolId);
  clearPushAttempt(schoolId);
  // Depois de aplicar as alterações locais, baixa novamente a cópia final.
  // Registros existentes apenas na nuvem são preservados; exclusões confirmadas são respeitadas.
  return safePullFromCloud(schoolId, database.settings.appearance);
}'''
new_replace = '''export async function replaceCloudWithLocal(schoolId: string, database: SchoolDatabase) {
  return withSchoolSyncLease(schoolId, async () => {
    const role = await getCloudSyncRole(schoolId);
    if (!isAdmin(role)) throw new Error("Somente proprietário ou administrador pode aplicar alterações deste computador durante um conflito.");
    await pushSnapshot(schoolId, database, role);
    await flushPendingCloudDeletions(schoolId);
    clearPushAttempt(schoolId);
    // Depois de aplicar as alterações locais, baixa novamente a cópia final.
    // Registros existentes apenas na nuvem são preservados; exclusões confirmadas são respeitadas.
    return safePullFromCloud(schoolId, database.settings.appearance);
  });
}'''
if old_replace in text:
    text = text.replace(old_replace, new_replace, 1)
elif new_replace not in text:
    raise SystemExit("replaceCloudWithLocal block not found")

old_pull = '''export async function safePullFromCloud(schoolId: string, localAppearance: SchoolDatabase["settings"]["appearance"] = "system") {
  const role = await getCloudSyncRole(schoolId);
  const base = await downloadCloudDatabase(schoolId, localAppearance);
  const database = ensureUuidDatabase(await hydrateProfessionalCloudFields(schoolId, base));
  const repaired = canWriteFinance(role) ? repairMissingEnrollmentInvoices(database) : 0;
  if (repaired) await pushSnapshot(schoolId, database, role);
  writeBaseline(schoolId, await getCloudRevision(schoolId), database, role);
  writePendingCloudDeletions(schoolId, []);
  return database;
}'''
new_pull = '''export async function safePullFromCloud(schoolId: string, localAppearance: SchoolDatabase["settings"]["appearance"] = "system") {
  return withSchoolSyncLease(schoolId, async () => {
    const role = await getCloudSyncRole(schoolId);
    const base = await downloadCloudDatabase(schoolId, localAppearance);
    const database = ensureUuidDatabase(await hydrateProfessionalCloudFields(schoolId, base));
    const repaired = canWriteFinance(role) ? repairMissingEnrollmentInvoices(database) : 0;
    if (repaired) await pushSnapshot(schoolId, database, role);
    // A revisão só é fixada depois de carregar e, se necessário, reparar o snapshot final.
    writeBaseline(schoolId, await getCloudRevision(schoolId), database, role);
    writePendingCloudDeletions(schoolId, []);
    return database;
  });
}'''
if old_pull in text:
    text = text.replace(old_pull, new_pull, 1)
elif new_pull not in text:
    raise SystemExit("safePullFromCloud block not found")

SYNC_FILE.write_text(text, encoding="utf-8")

for path, old, new in [
    ("package.json", '"version": "0.4.12"', '"version": "0.4.13"'),
    ("src-tauri/tauri.conf.json", '"version": "0.4.12"', '"version": "0.4.13"'),
    ("src-tauri/Cargo.toml", 'version = "0.4.12"', 'version = "0.4.13"'),
]:
    p = Path(path)
    value = p.read_text(encoding="utf-8")
    if new not in value:
        if old not in value:
            raise SystemExit(f"version anchor missing in {path}")
        value = value.replace(old, new, 1)
        p.write_text(value, encoding="utf-8")

lock = Path("src-tauri/Cargo.lock")
lock_text = lock.read_text(encoding="utf-8")
if 'name = "aula-facil"\nversion = "0.4.13"' not in lock_text:
    lock_text, count = re.subn(
        r'(\[\[package\]\]\nname = "aula-facil"\nversion = ")0\.4\.12(")',
        r'\g<1>0.4.13\2',
        lock_text,
        count=1,
    )
    if count != 1:
        raise SystemExit("Cargo.lock AulaFácil version anchor missing")
    lock.write_text(lock_text, encoding="utf-8")

print("AulaFácil sync hardening patch applied successfully")
