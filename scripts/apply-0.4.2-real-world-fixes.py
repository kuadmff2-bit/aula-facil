from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 ocorrência, encontrado {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    result, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: padrão não encontrado")
    return result


# 1) Cloud: nunca mandar null para textos obrigatórios do aluno.
for path in ["src/cloud.ts", "src/cloud-safe-sync.ts"]:
    text = read(path)
    text = text.replace('document_number: item.documentNumber || null', 'document_number: item.documentNumber?.trim() || ""')
    text = text.replace('phone: item.phone,', 'phone: item.phone || "",')
    text = text.replace('guardian_name: item.guardianName,', 'guardian_name: item.guardianName || "",')
    text = text.replace('guardian_phone: item.guardianPhone,', 'guardian_phone: item.guardianPhone || "",')
    text = text.replace('pause_reason: item.pauseReason || null', 'pause_reason: item.pauseReason || ""')
    write(path, text)

# 2) Cloud: registrar tentativa interrompida e permitir retomar com segurança.
path = "src/cloud-safe-sync.ts"
text = read(path)
anchor = 'const baselineKey = (schoolId: string) => `aulafacil.cloud.sync-baseline.${schoolId}`;\n'
insert = '''const baselineKey = (schoolId: string) => `aulafacil.cloud.sync-baseline.${schoolId}`;
const pushAttemptKey = (schoolId: string) => `aulafacil.cloud.push-attempt.${schoolId}`;

type SyncPushAttempt = {
  role: CloudSyncRole;
  localSignature: string;
  baselineRevision: number | null;
  lastObservedRevision: number;
  firstSync: boolean;
  startedAt: string;
};

function readPushAttempt(schoolId: string): SyncPushAttempt | null {
  try {
    const raw = localStorage.getItem(pushAttemptKey(schoolId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncPushAttempt>;
    if (!parsed.role || typeof parsed.localSignature !== "string" || !Number.isInteger(parsed.lastObservedRevision) || typeof parsed.startedAt !== "string") return null;
    return parsed as SyncPushAttempt;
  } catch { return null; }
}

function writePushAttempt(schoolId: string, attempt: SyncPushAttempt) {
  localStorage.setItem(pushAttemptKey(schoolId), JSON.stringify(attempt));
}

function clearPushAttempt(schoolId: string) {
  localStorage.removeItem(pushAttemptKey(schoolId));
}
'''
text = replace_once(text, anchor, insert, "inserir marcador de tentativa")

status_replacement = '''export async function getCloudSyncStatus(schoolId: string, database: SchoolDatabase): Promise<CloudSyncStatus> {
  const [cloudRevision, role] = await Promise.all([getCloudRevision(schoolId), getCloudSyncRole(schoolId)]);
  const signature = localSyncSignature(database, role);
  const attempt = readPushAttempt(schoolId);
  if (attempt
    && attempt.role === role
    && attempt.localSignature === signature
    && attempt.lastObservedRevision === cloudRevision) {
    return "local_changed";
  }

  const baseline = readBaseline(schoolId);
  if (!baseline) return "not_linked";
  if (baseline.role && baseline.role !== role) return "not_linked";
  const localChanged = baseline.localSignature ? signature !== baseline.localSignature : database.updatedAt !== baseline.localUpdatedAt;
  const cloudChanged = cloudRevision !== baseline.revision;
  if (localChanged && cloudChanged) return "conflict";
  if (localChanged) return "local_changed";
  if (cloudChanged) return "cloud_changed";
  return "synced";
}

async function upsertRows'''
text = regex_once(text, r'export async function getCloudSyncStatus\(schoolId: string, database: SchoolDatabase\): Promise<CloudSyncStatus> \{.*?\n\}\n\nasync function upsertRows', status_replacement, "substituir getCloudSyncStatus")

push_replacement = '''export async function safePushToCloud(schoolId: string, database: SchoolDatabase) {
  const [summary, role, cloudRevision] = await Promise.all([
    getCloudDataSummary(schoolId),
    getCloudSyncRole(schoolId),
    getCloudRevision(schoolId),
  ]);
  const baseline = readBaseline(schoolId);
  const signature = localSyncSignature(database, role);
  const previousAttempt = readPushAttempt(schoolId);
  const resumableAttempt = previousAttempt
    && previousAttempt.role === role
    && previousAttempt.localSignature === signature
    && previousAttempt.lastObservedRevision === cloudRevision
    && (previousAttempt.baselineRevision === null || baseline?.revision === previousAttempt.baselineRevision);

  const runPush = async (firstSync: boolean, baselineRevision: number | null) => {
    const normalized = ensureUuidDatabase(database);
    const attempt: SyncPushAttempt = {
      role,
      localSignature: signature,
      baselineRevision,
      lastObservedRevision: cloudRevision,
      firstSync,
      startedAt: previousAttempt?.startedAt ?? new Date().toISOString(),
    };
    writePushAttempt(schoolId, attempt);
    try {
      if (firstSync && summary.totalOperationalRecords === 0) {
        await seedEmptyCloudFromLocal(schoolId, normalized);
      }
      const pushed = await pushSnapshot(schoolId, normalized, role);
      const revision = await getCloudRevision(schoolId);
      writeBaseline(schoolId, revision, pushed, role);
      clearPushAttempt(schoolId);
      return pushed;
    } catch (error) {
      let lastObservedRevision = cloudRevision;
      try { lastObservedRevision = await getCloudRevision(schoolId); } catch { /* mantém a última revisão conhecida */ }
      writePushAttempt(schoolId, { ...attempt, lastObservedRevision });
      throw error;
    }
  };

  if (resumableAttempt) {
    return runPush(Boolean(previousAttempt.firstSync), previousAttempt.baselineRevision);
  }

  if (summary.totalOperationalRecords === 0 && !baseline) {
    if (!isAdmin(role)) throw new Error("Somente proprietário ou administrador pode realizar o primeiro envio de dados para uma instituição vazia.");
    return runPush(true, null);
  }
  if (!baseline || (baseline.role && baseline.role !== role)) throw new Error("Este computador ainda não possui uma base de sincronização compatível com sua função atual. Recupere os dados da nuvem antes de enviar alterações.");
  if (cloudRevision !== baseline.revision) throw new Error("A nuvem mudou desde a última sincronização. O envio foi bloqueado para não sobrescrever dados de outro dispositivo.");
  return runPush(false, baseline.revision);
}

export async function replaceCloudWithLocal(schoolId: string, database: SchoolDatabase) {
  const role = await getCloudSyncRole(schoolId);
  if (!isAdmin(role)) throw new Error("Somente proprietário ou administrador pode escolher a cópia deste computador para resolver um conflito.");
  const normalized = await pushSnapshot(schoolId, database, role);
  const revision = await getCloudRevision(schoolId);
  writeBaseline(schoolId, revision, normalized, role);
  clearPushAttempt(schoolId);
  return normalized;
}

export async function safePullFromCloud'''
text = regex_once(text, r'export async function safePushToCloud\(schoolId: string, database: SchoolDatabase\) \{.*?\n\}\n\nexport async function safePullFromCloud', push_replacement, "substituir safePushToCloud")
write(path, text)

# 3) Tela de conflito: permitir decisão explícita de manter a cópia local.
path = "src/cloud-sync-panel.tsx"
text = read(path)
text = replace_once(text, '  reconcileCloud,\n  safePullFromCloud,', '  reconcileCloud,\n  replaceCloudWithLocal,\n  safePullFromCloud,', "import replaceCloudWithLocal")
text = replace_once(text, '  const [recoveryArmed, setRecoveryArmed] = useState(false);', '  const [recoveryArmed, setRecoveryArmed] = useState(false);\n  const [localWinsArmed, setLocalWinsArmed] = useState(false);', "estado localWins")
text = replace_once(text, '      setRecoveryConfirmation("");\n    }', '      setRecoveryConfirmation("");\n      setLocalWinsArmed(false);\n    }', "limpar localWins")
insert_after_recover = '''  const recoverCloud = () => void run(async () => {
    if (!schoolId) throw new Error("Selecione uma instituição no AulaFácil Cloud.");
    if (recoveryPassword !== recoveryConfirmation) throw new Error("As duas senhas do backup de segurança precisam ser iguais.");
    validateBackupPassword(recoveryPassword);
    const encryptedBackup = await createEncryptedBackup(database, recoveryPassword);
    downloadEncryptedBackup(encryptedBackup);
    const downloaded = await safePullFromCloud(schoolId, database.settings.appearance);
    onReplaceDatabase(downloaded);
    setRole(await getCloudSyncRole(schoolId));
    setStatus("synced");
    setRecoveryArmed(false);
    setRecoveryPassword("");
    setRecoveryConfirmation("");
    setMessage({ tone: "success", text: "A nuvem foi recuperada. A cópia local anterior foi salva em um .afbackup criptografado." });
  });

  const resolveWithLocal = () => void run(async () => {
    if (!schoolId) throw new Error("Selecione uma instituição no AulaFácil Cloud.");
    const uploaded = await replaceCloudWithLocal(schoolId, database);
    onReplaceDatabase(uploaded);
    setRole(await getCloudSyncRole(schoolId));
    setStatus("synced");
    setLocalWinsArmed(false);
    setMessage({ tone: "success", text: "Conflito resolvido usando os dados deste computador. A nuvem agora está alinhada com esta cópia." });
  });'''
text = regex_once(text, r'  const recoverCloud = \(\) => void run\(async \(\) => \{.*?\n  \}\);', insert_after_recover, "adicionar resolução local")
text = replace_once(text, '''        {needsRecovery && !recoveryArmed && (
          <button className="secondary-button" disabled={busy} onClick={() => setRecoveryArmed(true)}>Preparar recuperação segura</button>
        )}''', '''        {needsRecovery && !recoveryArmed && (
          <button className="secondary-button" disabled={busy} onClick={() => setRecoveryArmed(true)}>Usar dados da nuvem</button>
        )}
        {status === "conflict" && !localWinsArmed && (
          <button className="secondary-button" disabled={busy} onClick={() => setLocalWinsArmed(true)}>Usar dados deste computador</button>
        )}''', "botões de conflito")
text = replace_once(text, '''      {status === "conflict" && (
        <div className="cloud-sync-warning">Para evitar perda de dados, o AulaFácil não faz merge automático de um conflito. A recuperação exige um backup local criptografado antes de substituir a cópia deste computador.</div>
      )}''', '''      {status === "conflict" && localWinsArmed && (
        <div className="cloud-sync-recovery">
          <strong>Usar este computador como a cópia correta?</strong>
          <span>Esta opção envia os dados atuais deste computador para a nuvem e resolve o conflito. Use somente se esta for a cópia que você deseja manter.</span>
          <div className="cloud-sync-recovery-actions">
            <button className="secondary-button" disabled={busy} onClick={() => setLocalWinsArmed(false)}>Cancelar</button>
            <button className="danger-button" disabled={busy} onClick={resolveWithLocal}>Confirmar e alinhar a nuvem</button>
          </div>
        </div>
      )}

      {status === "conflict" && (
        <div className="cloud-sync-warning">O AulaFácil não escolhe um lado sozinho. Você pode manter a nuvem ou, se este computador tiver a cópia correta, alinhar a nuvem com os dados locais.</div>
      )}''', "resolver conflito UI")
write(path, text)

# 4) Contraste Cloud no modo escuro.
path = "src/cloud-account.css"
text = read(path)
text += '''\n/* CLOUD-THEME-0.4.2 */
.cloud-message.success{color:color-mix(in srgb,#34d399 78%,var(--text));border-color:color-mix(in srgb,#10b981 34%,var(--border,var(--line)));background:color-mix(in srgb,#10b981 10%,var(--surface))}
.cloud-message.warning{color:color-mix(in srgb,#fbbf24 82%,var(--text));border-color:color-mix(in srgb,#d97706 34%,var(--border,var(--line)));background:color-mix(in srgb,#d97706 10%,var(--surface))}
.cloud-message.danger{color:color-mix(in srgb,#fb7185 82%,var(--text));border-color:color-mix(in srgb,#dc2626 34%,var(--border,var(--line)));background:color-mix(in srgb,#dc2626 10%,var(--surface))}
.cloud-role-chip{background:color-mix(in srgb,var(--blue) 9%,var(--surface));border-color:color-mix(in srgb,var(--blue) 28%,var(--border,var(--line)))}
.cloud-summary-grid>div{background:var(--surface-soft,var(--canvas));border-color:var(--border,var(--line))}
.cloud-danger-zone{background:color-mix(in srgb,var(--red) 9%,var(--surface));border-color:color-mix(in srgb,var(--red) 32%,var(--border,var(--line)));color:var(--text)}
.cloud-danger-zone>span{color:var(--text-muted,var(--muted))}
'''
write(path, text)

# 5) Negociação: largura real dos campos e breakpoint compatível com janelas menores.
path = "src/debt-negotiation-panel.css"
text = read(path)
text += '''\n/* DEBT-RESPONSIVE-0.4.2 */
.debt-panel,.debt-builder,.debt-existing,.debt-form-grid,.debt-form-grid label,.debt-combo,.debt-invoices,.debt-preview{min-width:0}
.debt-form-grid input,.debt-form-grid select,.debt-list-head select{width:100%;min-width:0;max-width:100%;box-sizing:border-box}
.debt-heading>div,.debt-invoices label>div,.debt-preview>div{min-width:0}
.debt-heading h2,.debt-heading p,.debt-message span,.debt-invoices span,.debt-preview strong{overflow-wrap:anywhere}
@media(max-width:1180px){.debt-form-grid{grid-template-columns:1fr}.debt-preview{grid-template-columns:repeat(2,minmax(0,1fr))}.debt-list-head{align-items:stretch;flex-direction:column}.debt-list-head label{min-width:0}}
@media(max-width:760px){.debt-preview{grid-template-columns:1fr}}
'''
write(path, text)

# 6) Recebimentos: esconder prioridade, defaults claros, pausa com retorno visual e auto-default na primeira conexão.
path = "src/payment-connections-panel.tsx"
text = read(path)
text = text.replace('  const [priority, setPriority] = useState(50);\n', '')
text = replace_once(text, '      environment,\n      priority,\n      publicConfig:', '''      environment,
      priority: 50,
      defaultForPix: selectedProvider.capabilities.includes("pix") && !connections.some((item) => item.defaultForPix),
      defaultForBoleto: selectedProvider.capabilities.includes("boleto") && !connections.some((item) => item.defaultForBoleto),
      defaultForCard: selectedProvider.capabilities.includes("card") && !connections.some((item) => item.defaultForCard),
      publicConfig:''', "auto default pagamento")
text = text.replace('                <span>Prioridade {connection.priority}</span>\n', '')
text = replace_once(text, '''                {connection.supportsPix && <button type="button" className={connection.defaultForPix ? "active" : ""} onClick={() => makeDefault(connection, "pix")}>{connection.defaultForPix ? "Pix padrão" : "Usar para Pix"}</button>}
                {connection.supportsBoleto && <button type="button" className={connection.defaultForBoleto ? "active" : ""} onClick={() => makeDefault(connection, "boleto")}>{connection.defaultForBoleto ? "Boleto padrão" : "Usar para boleto"}</button>}
                {connection.supportsCard && <button type="button" className={connection.defaultForCard ? "active" : ""} onClick={() => makeDefault(connection, "card")}>{connection.defaultForCard ? "Cartão padrão" : "Usar para cartão"}</button>}
                {connection.providerKey !== "manual_pix" && <button type="button" onClick={() => { setCredentialConnectionId(connection.id); setCredentialValues({}); }}>{connection.credentialsConfigured ? "Trocar credenciais" : "Configurar credenciais"}</button>}
                <button type="button" onClick={() => void run(async () => { await updatePaymentConnection(connection.id, { enabled: !connection.enabled }); await refresh(); })}>{connection.enabled ? "Pausar" : "Ativar"}</button>''', '''                {connection.supportsPix && (connection.defaultForPix ? <span className="payment-default-chip">✓ Padrão para Pix</span> : <button type="button" onClick={() => makeDefault(connection, "pix")}>Usar para Pix</button>)}
                {connection.supportsBoleto && (connection.defaultForBoleto ? <span className="payment-default-chip">✓ Padrão para boleto</span> : <button type="button" onClick={() => makeDefault(connection, "boleto")}>Usar para boleto</button>)}
                {connection.supportsCard && (connection.defaultForCard ? <span className="payment-default-chip">✓ Padrão para cartão</span> : <button type="button" onClick={() => makeDefault(connection, "card")}>Usar para cartão</button>)}
                {connection.providerKey !== "manual_pix" && <button type="button" onClick={() => { setCredentialConnectionId(connection.id); setCredentialValues({}); }}>{connection.credentialsConfigured ? "Trocar credenciais" : "Configurar credenciais"}</button>}
                <button type="button" onClick={() => void run(async () => {
                  const enabled = !connection.enabled;
                  await updatePaymentConnection(connection.id, { enabled });
                  setConnections((current) => current.map((item) => item.id === connection.id ? { ...item, enabled } : item));
                  await refresh();
                  setMessage({ tone: "success", text: enabled ? `${connection.displayName} ativado.` : `${connection.displayName} pausado. Nenhuma nova cobrança usará esta conexão enquanto ela estiver pausada.` });
                })}>{connection.enabled ? "Pausar" : "Ativar"}</button>''', "ações de pagamento")
text = text.replace('          <label><span>Prioridade</span><input type="number" min={0} max={100} value={priority} onChange={(event) => setPriority(Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))))} /></label>\n', '')
text = text.replace('armazenados no Supabase Vault. Eles não entram no backup, no banco local nem no repositório.', 'armazenados de forma protegida no servidor. Eles não entram no backup, no banco local nem no repositório.')
text = text.replace('Salvar no cofre seguro', 'Salvar credenciais protegidas')
text = text.replace('o AulaFácil abre o cofre seguro para configurá-las.', 'o AulaFácil abre a área protegida para configurá-las.')
write(path, text)

path = "src/payment-connections-panel.css"
text = read(path)
text += '''\n/* PAYMENT-SIMPLE-0.4.2 */
.payment-default-chip{display:inline-flex;align-items:center;min-height:36px;padding:0 10px;border:1px solid color-mix(in srgb,#10b981 36%,var(--border));border-radius:10px;background:color-mix(in srgb,#10b981 10%,var(--surface));color:color-mix(in srgb,#10b981 72%,var(--text));font-size:.8rem;font-weight:800}
'''
write(path, text)

# 7) Mensagens: status coerente e botão Configurar leva ao formulário visível.
path = "src/message-automations-panel.tsx"
text = read(path)
text = replace_once(text, 'import { useEffect, useMemo, useState } from "react";', 'import { useEffect, useMemo, useRef, useState } from "react";', "import useRef")
text = replace_once(text, '  const [credentials, setCredentials] = useState<Record<string, string>>({});', '  const [credentials, setCredentials] = useState<Record<string, string>>({});\n  const credentialBoxRef = useRef<HTMLDivElement | null>(null);', "credential ref")
text = replace_once(text, '  const selectedTemplate = useMemo(() => templates.find((item) => item.id === automationTemplateId) ?? null, [templates, automationTemplateId]);', '''  const selectedTemplate = useMemo(() => templates.find((item) => item.id === automationTemplateId) ?? null, [templates, automationTemplateId]);
  const channelProviderAlreadyAdded = channels.some((item) => item.providerKey === channelProvider);

  useEffect(() => {
    if (!credentialChannelId) return;
    const frame = window.requestAnimationFrame(() => credentialBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => window.cancelAnimationFrame(frame);
  }, [credentialChannelId]);''', "scroll credenciais")
text = text.replace('setMessage({ tone: "warning", text: "Canal criado. Configure as credenciais no cofre seguro antes de ativar os envios." });', 'setMessage({ tone: "warning", text: channelProvider === "meta" ? "Canal criado. Agora conclua a configuração abaixo." : "Canal criado. Clique em Conectar WhatsApp para gerar o QR Code." });')
text = replace_once(text, '      setCredentials({});\n      setCredentialChannelId("");\n      await refresh();', '      await updateMessageChannel(credentialChannel.id, { enabled: true });\n      setCredentials({});\n      setCredentialChannelId("");\n      await refresh();', "ativar canal após credenciais")
old_tags = '''            <div className="message-tags"><span>{channel.enabled ? "Ativo" : "Pausado"}</span><span>{channel.credentialsConfigured ? "Credenciais prontas" : "Credenciais pendentes"}</span></div>'''
new_tags = '''            <div className="message-tags">
              {channel.providerKey === "meta" ? (
                <span>{!channel.enabled ? "Pausado" : channel.credentialsConfigured ? "Ativo" : "Aguardando configuração"}</span>
              ) : (
                <span>{!channel.enabled ? "Pausado" : String(channel.publicConfig.robotStatus ?? "disconnected") === "connected" ? "Conectado" : ["starting", "qr", "connecting"].includes(String(channel.publicConfig.robotStatus ?? "")) ? "Preparando conexão" : ["error", "auth_failure"].includes(String(channel.publicConfig.robotStatus ?? "")) ? "Erro de conexão" : "Desconectado"}</span>
              )}
            </div>'''
text = replace_once(text, old_tags, new_tags, "status canais")
text = replace_once(text, '<button type="button" className="secondary-button" disabled={busy || !schoolId} onClick={addChannel}>Adicionar canal</button>', '<button type="button" className="secondary-button" disabled={busy || !schoolId || channelProviderAlreadyAdded} onClick={addChannel}>{channelProviderAlreadyAdded ? "Canal já adicionado" : "Adicionar canal"}</button>', "evitar canal duplicado")
text = replace_once(text, '<div className="message-credential-box"><div><strong>Cofre seguro · {credentialChannel.displayName}</strong><p>Os segredos vão direto para o Supabase Vault e não entram no backup local.</p></div>', '<div ref={credentialBoxRef} className="message-credential-box"><div><strong>Credenciais protegidas · {credentialChannel.displayName}</strong><p>As credenciais são protegidas no servidor e não entram no backup local.</p></div>', "box credenciais")
text = text.replace('Salvar no cofre</button>', 'Salvar credenciais</button>')
write(path, text)

# 8) Robô: propagar erro de sessão no cliente e encerrar polling quando o servidor falhar.
path = "src/robot-client.ts"
text = read(path)
text = replace_once(text, '  phone: string | null;\n};', '  phone: string | null;\n  sessionError: string | null;\n};', "tipo robot error")
text = replace_once(text, '    phone: typeof data?.phone === "string" ? data.phone : null,', '    phone: typeof data?.phone === "string" ? data.phone : null,\n    sessionError: typeof data?.sessionError === "string" ? data.sessionError : null,', "map robot error")
write(path, text)

path = "src/robot-connect.tsx"
text = read(path)
text = replace_once(text, '    phone: typeof channel.publicConfig.phone === "string" ? String(channel.publicConfig.phone) : null,\n  };', '    phone: typeof channel.publicConfig.phone === "string" ? String(channel.publicConfig.phone) : null,\n    sessionError: typeof channel.publicConfig.lastRobotError === "string" ? String(channel.publicConfig.lastRobotError) : null,\n  };', "initial robot error")
text = replace_once(text, '''    setState(next);
    if (next.status === "connected") {
      stopPolling();
      await onChanged?.();
    }
    return next;''', '''    setState(next);
    if (next.sessionError) setError(next.sessionError);
    if (next.status === "connected") {
      setError("");
      stopPolling();
      await onChanged?.();
    } else if (next.status === "error" || next.status === "auth_failure") {
      stopPolling();
      setError(next.sessionError || (next.status === "auth_failure" ? "O WhatsApp recusou a autenticação. Tente conectar novamente." : "O servidor não conseguiu iniciar o WhatsApp. Tente novamente."));
    }
    return next;''', "refresh terminal robot")
text = replace_once(text, '''      setState(next);
      if (next.status !== "connected") beginPolling();
      else await onChanged?.();''', '''      setState(next);
      if (next.status === "connected") await onChanged?.();
      else if (next.status === "error" || next.status === "auth_failure") setError(next.sessionError || "Não foi possível iniciar o WhatsApp.");
      else beginPolling();''', "start robot")
text = replace_once(text, '''          {(state.status === "starting" || state.status === "connecting") && <span className="robot-status"><RefreshCw size={15} /> Preparando sessão...</span>}''', '''          {state.status === "starting" && <span className="robot-status"><RefreshCw size={15} /> Abrindo WhatsApp...</span>}
          {state.status === "connecting" && <span className="robot-status"><RefreshCw size={15} /> Finalizando conexão...</span>}''', "status robot ui")
write(path, text)

# 9) Railway Robot: timeouts reais do Chromium, erro visível e retry funcional.
path = "services/aulafacil-robot/server.js"
text = read(path)
text = replace_once(text, 'function publicState(state) {\n  return { status: state.status, qr: state.qr || null, phone: state.phone || null, updatedAt: state.updatedAt };\n}', 'function publicState(state) {\n  return { status: state.status, qr: state.qr || null, phone: state.phone || null, sessionError: state.error || null, updatedAt: state.updatedAt };\n}', "publicState robot")
text = replace_once(text, 'async function createSession(id) {\n  if (sessions.has(id)) return sessions.get(id);', '''async function destroySession(state) {
  if (!state?.client) return;
  await state.client.destroy().catch(() => undefined);
}

async function createSession(id, forceRestart = false) {
  const existing = sessions.get(id);
  if (existing && !forceRestart) return existing;
  if (existing && forceRestart) {
    await destroySession(existing);
    sessions.delete(id);
  }''', "retry createSession")
text = replace_once(text, '    client: null,\n  };', '    client: null,\n    error: null,\n  };', "robot state error")
text = replace_once(text, '''  const client = new Client({
    authStrategy: new LocalAuth({ clientId: id, dataPath: DATA_PATH }),
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    },
  });''', '''  const client = new Client({
    authStrategy: new LocalAuth({ clientId: id, dataPath: DATA_PATH }),
    authTimeoutMs: 120000,
    qrMaxRetries: 8,
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      protocolTimeout: 120000,
      timeout: 120000,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--metrics-recording-only",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    },
  });''', "puppeteer timeout")
text = text.replace('state.updatedAt = new Date().toISOString();\n  });\n  client.on("authenticated"', 'state.error = null;\n    state.updatedAt = new Date().toISOString();\n  });\n  client.on("authenticated"', 1)
text = text.replace('state.status = "connecting";\n    state.qr = null;', 'state.status = "connecting";\n    state.qr = null;\n    state.error = null;', 1)
text = text.replace('state.status = "connected";\n    state.qr = null;', 'state.status = "connected";\n    state.qr = null;\n    state.error = null;', 1)
text = text.replace('state.status = "auth_failure";\n    state.qr = null;', 'state.status = "auth_failure";\n    state.qr = null;\n    state.error = "Falha de autenticação do WhatsApp. Gere um novo QR Code.";', 1)
text = text.replace('state.status = "disconnected";\n    state.qr = null;', 'state.status = "disconnected";\n    state.qr = null;\n    state.error = null;', 1)
text = replace_once(text, '''  client.initialize().catch((error) => {
    state.status = "error";
    state.updatedAt = new Date().toISOString();
    console.error("Falha ao iniciar sessão", id, error?.message || error);
  });''', '''  client.initialize().catch((error) => {
    state.status = "error";
    state.error = String(error?.message || "Falha ao abrir o WhatsApp no servidor.");
    state.updatedAt = new Date().toISOString();
    console.error("Falha ao iniciar sessão", id, state.error);
  });''', "initialize error")
text = replace_once(text, '    const state = await createSession(id);\n    res.json({ ok: true, ...publicState(state) });', '''    const current = sessions.get(id);
    const restart = Boolean(current && ["error", "auth_failure", "disconnected"].includes(current.status));
    const state = await createSession(id, restart);
    res.json({ ok: true, ...publicState(state) });''', "start restart")
write(path, text)

print("Correções 0.4.2 aplicadas com sucesso.")
