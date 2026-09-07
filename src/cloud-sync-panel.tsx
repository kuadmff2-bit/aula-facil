import { useEffect, useState } from "react";
import {
  getCloudSyncRole,
  getCloudSyncStatus,
  reconcileCloud,
  replaceCloudWithLocal,
  safePullFromCloud,
  type CloudSyncRole,
  type CloudSyncStatus,
} from "./cloud-safe-sync";
import type { SchoolDatabase } from "./model";
import { createEncryptedBackup, validateBackupPassword } from "./portable-backup";
import "./cloud-sync-panel.css";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";

type Props = {
  database: SchoolDatabase;
  onReplaceDatabase: (database: SchoolDatabase) => void;
};

type Message = { tone: "success" | "warning" | "danger"; text: string } | null;

const copy: Record<CloudSyncStatus, { title: string; text: string }> = {
  not_linked: { title: "Primeira sincronização necessária", text: "Este computador ainda precisa escolher uma base segura para esta instituição." },
  synced: { title: "Computador e nuvem estão iguais", text: "Na última verificação, as duas cópias estavam atualizadas." },
  local_changed: { title: "Há mudanças para enviar", text: "Elas já estão salvas neste computador. Sincronize para atualizar também a nuvem." },
  cloud_changed: { title: "Há novidades para baixar", text: "A nuvem mudou em outro dispositivo ou automação. Sincronize para receber as alterações." },
  conflict: { title: "Mudanças nos dois lados", text: "Nada foi apagado. Escolha com cuidado qual cópia deve prevalecer." },
};

const statusLabel: Record<CloudSyncStatus, string> = {
  not_linked: "primeira sincronização",
  synced: "sincronizado",
  local_changed: "alterações locais",
  cloud_changed: "novidades na nuvem",
  conflict: "atenção necessária",
};

const roleCopy: Record<CloudSyncRole, { label: string; scope: string }> = {
  owner: { label: "Proprietário", scope: "dados da escola, ajustes, alunos, turmas e mensalidades" },
  admin: { label: "Administrador", scope: "dados da escola, ajustes, alunos, turmas e mensalidades" },
  finance: { label: "Financeiro", scope: "mensalidades, cobranças e pagamentos" },
  teacher: { label: "Professor", scope: "turmas, alunos, chamadas e notas" },
  staff: { label: "Equipe", scope: "turmas, alunos, chamadas e avisos" },
};

function downloadEncryptedBackup(content: string) {
  const blob = new Blob([content], { type: "application/x-aulafacil-backup" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aulafacil-pre-sync-${new Date().toISOString().replace(/[:.]/g, "-")}.afbackup`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function CloudSyncPanel({ database, onReplaceDatabase }: Props) {
  const [schoolId, setSchoolId] = useState(() => localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "");
  const [status, setStatus] = useState<CloudSyncStatus>("not_linked");
  const [role, setRole] = useState<CloudSyncRole | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryConfirmation, setRecoveryConfirmation] = useState("");
  const [recoveryArmed, setRecoveryArmed] = useState(false);
  const [localWinsArmed, setLocalWinsArmed] = useState(false);

  const refresh = async (targetSchoolId = schoolId) => {
    if (!targetSchoolId) {
      setStatus("not_linked");
      setRole(null);
      return;
    }
    const [nextStatus, nextRole] = await Promise.all([
      getCloudSyncStatus(targetSchoolId, database),
      getCloudSyncRole(targetSchoolId),
    ]);
    setStatus(nextStatus);
    setRole(nextRole);
  };

  useEffect(() => {
    let active = true;
    const check = () => {
      const nextSchoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
      if (!active) return;
      setSchoolId(nextSchoolId);
      if (!nextSchoolId) {
        setRole(null);
        return;
      }
      if (!navigator.onLine) return;
      void Promise.all([
        getCloudSyncStatus(nextSchoolId, database),
        getCloudSyncRole(nextSchoolId),
      ])
        .then(([nextStatus, nextRole]) => {
          if (!active) return;
          setStatus(nextStatus);
          setRole(nextRole);
        })
        .catch(() => undefined);
    };
    check();
    const interval = window.setInterval(check, 60_000);
    window.addEventListener("online", check);
    window.addEventListener("storage", check);
    window.addEventListener("aulafacil:cloud-school-change", check);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", check);
      window.removeEventListener("storage", check);
      window.removeEventListener("aulafacil:cloud-school-change", check);
    };
  }, [database.updatedAt]);

  useEffect(() => {
    if (status !== "conflict" && status !== "not_linked") {
      setRecoveryArmed(false);
      setRecoveryPassword("");
      setRecoveryConfirmation("");
      setLocalWinsArmed(false);
    }
  }, [status]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await operation();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível sincronizar." });
    } finally {
      setBusy(false);
    }
  };

  const syncNow = () => void run(async () => {
    if (!schoolId) throw new Error("Selecione uma escola em Nuvem e salvamento.");
    if (!navigator.onLine) throw new Error("Sem internet. Você pode continuar trabalhando e sincronizar quando a conexão voltar.");
    const result = await reconcileCloud(schoolId, database);
    if (result.database.updatedAt !== database.updatedAt || result.database !== database) {
      onReplaceDatabase(result.database);
    }
    setRole(await getCloudSyncRole(schoolId));
    setStatus("synced");
    setMessage({ tone: "success", text: "Sincronização concluída. Alterações feitas em outros dispositivos foram respeitadas." });
  });

  const recoverCloud = () => void run(async () => {
    if (!schoolId) throw new Error("Selecione uma escola em Nuvem e salvamento.");
    if (recoveryPassword !== recoveryConfirmation) throw new Error("As duas senhas do backup precisam ser iguais.");
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
    setMessage({ tone: "success", text: "Os dados da nuvem foram carregados. A cópia anterior deste computador foi salva em um backup protegido." });
  });

  const resolveWithLocal = () => void run(async () => {
    if (!schoolId) throw new Error("Selecione uma escola em Nuvem e salvamento.");
    const uploaded = await replaceCloudWithLocal(schoolId, database);
    onReplaceDatabase(uploaded);
    setRole(await getCloudSyncRole(schoolId));
    setStatus("synced");
    setLocalWinsArmed(false);
    setMessage({ tone: "success", text: "Pronto. Suas alterações foram aplicadas e a cópia final foi conferida com a nuvem." });
  });

  const state = schoolId
    ? copy[status]
    : { title: "Escolha a escola para sincronizar", text: "Sua conta pode estar conectada, mas este computador ainda não sabe qual escola deve sincronizar." };
  const needsRecovery = (status === "conflict" || status === "not_linked") && schoolId;

  return (
    <section className="card cloud-sync-card">
      <div className="cloud-sync-heading">
        <div>
          <span className="cloud-sync-eyebrow">SINCRONIZAÇÃO COM A NUVEM</span>
          <h2>{state.title}</h2>
          <p>{state.text}</p>
        </div>
        <div className={`cloud-sync-badge ${schoolId ? status : "not_linked"}`}>{!navigator.onLine ? "sem internet" : schoolId ? statusLabel[status] : "escola não selecionada"}</div>
      </div>

      <div className="cloud-sync-plain-note"><strong>No uso normal, é simples:</strong> clique apenas em “Sincronizar agora”. As opções de escolher uma cópia só aparecem quando existe algo que precisa da sua decisão.</div>

      {!schoolId && <div className="cloud-sync-warning">Escolha ou crie a escola no bloco acima. Depois clique em “Sincronizar agora”.</div>}

      <div className="cloud-sync-explainer">
        <div><strong>Proteção contra perda de alterações</strong><span>O AulaFácil verifica mudanças feitas em outros dispositivos antes de salvar, evitando apagar alterações por engano.</span></div>
        <div><strong>Funciona mesmo sem internet</strong><span>Você pode continuar trabalhando e sincronizar quando a conexão voltar.</span></div>
        <div><strong>Cada pessoa vê o que precisa</strong><span>{role ? `${roleCopy[role].label}: pode sincronizar ${roleCopy[role].scope}.` : "O acesso depende da função atribuída à conta."}</span></div>
      </div>

      {role && role !== "owner" && role !== "admin" && (
        <div className="cloud-sync-warning">Sua conta de {roleCopy[role].label.toLowerCase()} sincroniza somente as áreas permitidas para essa função.</div>
      )}

      {message && <div className={`cloud-sync-message ${message.tone}`} role="status">{message.text}</div>}

      <div className="cloud-sync-actions">
        <button className="primary-button" disabled={busy || !schoolId || status === "conflict"} onClick={syncNow}>
          {busy ? "Sincronizando..." : "Sincronizar agora"}
        </button>
        {needsRecovery && !recoveryArmed && (
          <button className="secondary-button" disabled={busy} onClick={() => setRecoveryArmed(true)}>Usar cópia da nuvem</button>
        )}
        {status === "conflict" && !localWinsArmed && (
          <button className="secondary-button" disabled={busy} onClick={() => setLocalWinsArmed(true)}>Manter minhas alterações</button>
        )}
        <button className="secondary-button" disabled={busy || !schoolId} onClick={() => void refresh()}>Verificar novamente</button>
      </div>

      {needsRecovery && recoveryArmed && (
        <div className="cloud-sync-recovery">
          <strong>Antes de usar a nuvem, vamos proteger a cópia deste computador</strong>
          <span>Crie uma senha com pelo menos 12 caracteres. O AulaFácil salva um backup protegido e só depois carrega os dados da nuvem.</span>
          <div className="cloud-sync-passwords">
            <input type="password" autoComplete="new-password" minLength={12} maxLength={256} placeholder="Senha do backup" value={recoveryPassword} onChange={(event) => setRecoveryPassword(event.target.value)} />
            <input type="password" autoComplete="new-password" minLength={12} maxLength={256} placeholder="Confirmar senha" value={recoveryConfirmation} onChange={(event) => setRecoveryConfirmation(event.target.value)} />
          </div>
          <div className="cloud-sync-recovery-actions">
            <button className="secondary-button" disabled={busy} onClick={() => { setRecoveryArmed(false); setRecoveryPassword(""); setRecoveryConfirmation(""); }}>Cancelar</button>
            <button className="danger-button" disabled={busy || recoveryPassword.length < 12 || recoveryPassword !== recoveryConfirmation} onClick={recoverCloud}>Salvar backup e usar a nuvem</button>
          </div>
        </div>
      )}

      {status === "conflict" && localWinsArmed && (
        <div className="cloud-sync-recovery">
          <strong>Aplicar as alterações deste computador?</strong>
          <span>O AulaFácil vai aplicar as alterações deste computador sem apagar registros que existam somente na nuvem. Exclusões que você confirmou serão respeitadas.</span>
          <div className="cloud-sync-recovery-actions">
            <button className="secondary-button" disabled={busy} onClick={() => setLocalWinsArmed(false)}>Cancelar</button>
            <button className="danger-button" disabled={busy} onClick={resolveWithLocal}>Aplicar minhas alterações</button>
          </div>
        </div>
      )}

      {status === "conflict" && (
        <div className="cloud-sync-warning">O AulaFácil não escolhe sozinho para evitar perda de dados. Escolha se quer manter a versão da nuvem ou a versão deste computador.</div>
      )}
    </section>
  );
}