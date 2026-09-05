import { useEffect, useState } from "react";
import {
  getCloudSyncStatus,
  reconcileCloud,
  safePullFromCloud,
  type CloudSyncStatus,
} from "./cloud-safe-sync";
import type { SchoolDatabase } from "./model";
import "./cloud-sync-panel.css";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";

type Props = {
  database: SchoolDatabase;
  onReplaceDatabase: (database: SchoolDatabase) => void;
};

type Message = { tone: "success" | "warning" | "danger"; text: string } | null;

const copy: Record<CloudSyncStatus, { title: string; text: string }> = {
  not_linked: { title: "Sincronização ainda não vinculada", text: "Este computador ainda não possui uma revisão-base desta instituição." },
  synced: { title: "Tudo sincronizado", text: "A cópia local e a nuvem estão na mesma revisão conhecida." },
  local_changed: { title: "Alterações neste computador", text: "Há mudanças locais prontas para serem enviadas com segurança." },
  cloud_changed: { title: "Há novidades na nuvem", text: "Outro dispositivo ou uma automação alterou os dados online." },
  conflict: { title: "Conflito detectado", text: "Este computador e a nuvem mudaram desde a última sincronização. Nada será sobrescrito automaticamente." },
};

function createBackup(database: SchoolDatabase) {
  const blob = new Blob([JSON.stringify(database, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aulafacil-pre-sync-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CloudSyncPanel({ database, onReplaceDatabase }: Props) {
  const [schoolId, setSchoolId] = useState(() => localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "");
  const [status, setStatus] = useState<CloudSyncStatus>("not_linked");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const refresh = async (targetSchoolId = schoolId) => {
    if (!targetSchoolId) {
      setStatus("not_linked");
      return;
    }
    setStatus(await getCloudSyncStatus(targetSchoolId, database));
  };

  useEffect(() => {
    let active = true;
    const check = () => {
      const nextSchoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
      if (!active) return;
      setSchoolId(nextSchoolId);
      if (!nextSchoolId || !navigator.onLine) return;
      void getCloudSyncStatus(nextSchoolId, database)
        .then((value) => active && setStatus(value))
        .catch(() => undefined);
    };
    check();
    const interval = window.setInterval(check, 60_000);
    window.addEventListener("online", check);
    window.addEventListener("storage", check);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("online", check);
      window.removeEventListener("storage", check);
    };
  }, [database.updatedAt]);

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
    if (!schoolId) throw new Error("Selecione uma instituição no AulaFácil Cloud.");
    if (!navigator.onLine) throw new Error("Sem conexão com a internet. Os dados locais continuam disponíveis e poderão ser sincronizados depois.");
    const result = await reconcileCloud(schoolId, database);
    if (result.database.updatedAt !== database.updatedAt || result.database !== database) {
      onReplaceDatabase(result.database);
    }
    setStatus("synced");
    setMessage({ tone: "success", text: "Sincronização concluída sem sobrescrever alterações desconhecidas." });
  });

  const recoverCloud = () => void run(async () => {
    if (!schoolId) throw new Error("Selecione uma instituição no AulaFácil Cloud.");
    createBackup(database);
    const downloaded = await safePullFromCloud(schoolId, database.settings.appearance);
    onReplaceDatabase(downloaded);
    setStatus("synced");
    setMessage({ tone: "success", text: "A nuvem foi recuperada neste computador. Um backup da cópia anterior foi salvo primeiro." });
  });

  const state = copy[status];

  return (
    <section className="card cloud-sync-card">
      <div className="cloud-sync-heading">
        <div>
          <span className="cloud-sync-eyebrow">SINCRONIZAÇÃO SEGURA</span>
          <h2>{state.title}</h2>
          <p>{state.text}</p>
        </div>
        <div className={`cloud-sync-badge ${status}`}>{navigator.onLine ? status.replaceAll("_", " ") : "offline"}</div>
      </div>

      <div className="cloud-sync-explainer">
        <div><strong>Sem sobrescrita cega</strong><span>O servidor usa uma revisão da escola para detectar alterações feitas em outro dispositivo.</span></div>
        <div><strong>Offline continua funcionando</strong><span>Você pode trabalhar sem internet e sincronizar quando a conexão voltar.</span></div>
        <div><strong>Histórico financeiro protegido</strong><span>Pagamentos remotos nunca são apagados só porque não aparecem na cópia local.</span></div>
      </div>

      {message && <div className={`cloud-sync-message ${message.tone}`} role="status">{message.text}</div>}

      <div className="cloud-sync-actions">
        <button className="primary-button" disabled={busy || !schoolId || status === "conflict"} onClick={syncNow}>
          {busy ? "Sincronizando..." : "Sincronizar agora"}
        </button>
        {(status === "conflict" || status === "not_linked") && schoolId && (
          <button className="secondary-button" disabled={busy} onClick={recoverCloud}>Salvar backup e recuperar nuvem</button>
        )}
        <button className="secondary-button" disabled={busy || !schoolId} onClick={() => void refresh()}>Verificar novamente</button>
      </div>

      {status === "conflict" && (
        <div className="cloud-sync-warning">Para evitar perda de dados, o AulaFácil não fará merge automático de um conflito. Salve o backup local antes de escolher recuperar a versão online.</div>
      )}
    </section>
  );
}
