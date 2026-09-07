import { useEffect, useState } from "react";
import { CheckCircle2, Cloud, DatabaseBackup, HardDrive, RefreshCw, WifiOff } from "lucide-react";
import { getCloudSyncMetadata, getCloudSyncStatus, type CloudSyncStatus } from "./cloud-safe-sync";
import type { SchoolDatabase } from "./model";
import { getLocalStorageState, type LocalStorageState } from "./storage";
import "./data-safety-panel.css";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";
type CloudState = CloudSyncStatus | "not_configured" | "offline" | "unavailable" | "checking";

const cloudCopy: Record<CloudState, { title: string; text: string; tone: string }> = {
  checking: { title: "Conferindo a nuvem...", text: "Só um instante.", tone: "neutral" },
  not_configured: { title: "Nuvem ainda não configurada", text: "O salvamento neste computador continua funcionando normalmente.", tone: "neutral" },
  offline: { title: "Sem internet agora", text: "Você pode continuar trabalhando. Os dados ficam salvos neste computador.", tone: "warning" },
  unavailable: { title: "Não foi possível conferir agora", text: "Isso não impede o salvamento local. Tente verificar novamente quando quiser.", tone: "warning" },
  not_linked: { title: "Primeira sincronização pendente", text: "Escolha a instituição e faça a primeira sincronização no bloco abaixo.", tone: "warning" },
  synced: { title: "Computador e nuvem sincronizados", text: "As duas cópias estavam iguais na última verificação.", tone: "success" },
  local_changed: { title: "Há mudanças para enviar", text: "Seus dados já estão salvos neste computador; falta apenas atualizar a nuvem.", tone: "warning" },
  cloud_changed: { title: "Há novidades para baixar", text: "A nuvem mudou em outro dispositivo. Sincronize para receber as alterações.", tone: "warning" },
  conflict: { title: "Mudanças nos dois lados", text: "Nada foi sobrescrito. O bloco abaixo vai pedir qual cópia você quer manter.", tone: "danger" },
};

function moment(value?: string) {
  if (!value) return "Ainda não sincronizado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Última sincronização registrada";
  return `Última sincronização: ${date.toLocaleDateString("pt-BR")} às ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function DataSafetyPanel({ database, onOpenBackup }: { database: SchoolDatabase; onOpenBackup: () => void }) {
  const [localState, setLocalState] = useState<LocalStorageState>(() => getLocalStorageState());
  const [cloudState, setCloudState] = useState<CloudState>("checking");
  const [syncedAt, setSyncedAt] = useState<string | undefined>();

  useEffect(() => {
    const onStorage = (event: Event) => setLocalState((event as CustomEvent<LocalStorageState>).detail);
    window.addEventListener("aulafacil:storage-state", onStorage);
    return () => window.removeEventListener("aulafacil:storage-state", onStorage);
  }, []);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
      if (!schoolId) { if (active) { setCloudState("not_configured"); setSyncedAt(undefined); } return; }
      if (!navigator.onLine) { if (active) { setCloudState("offline"); setSyncedAt(getCloudSyncMetadata(schoolId)?.syncedAt); } return; }
      try {
        const status = await getCloudSyncStatus(schoolId, database);
        if (!active) return;
        setCloudState(status);
        setSyncedAt(getCloudSyncMetadata(schoolId)?.syncedAt);
      } catch {
        if (active) { setCloudState("unavailable"); setSyncedAt(getCloudSyncMetadata(schoolId)?.syncedAt); }
      }
    };
    void check();
    const interval = window.setInterval(() => void check(), 60_000);
    const refresh = () => void check();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("aulafacil:cloud-school-change", refresh);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("online", refresh); window.removeEventListener("offline", refresh); window.removeEventListener("aulafacil:cloud-school-change", refresh); };
  }, [database.updatedAt]);

  const localTitle = localState.status === "saving" ? "Salvando agora..." : localState.status === "error" ? "Falha ao salvar" : "Salvamento automático ativo";
  const localText = localState.status === "error"
    ? (localState.message || "Confira o armazenamento antes de fechar o aplicativo.")
    : localState.mode === "protected"
      ? "Cada alteração é gravada automaticamente e criptografada pelo Windows."
      : "Cada alteração é salva automaticamente neste navegador.";
  const cloud = cloudCopy[cloudState];

  return (
    <section className="card data-safety-card">
      <div className="data-safety-heading"><div><span>SEUS DADOS</span><h2>Salvamento sem mistério</h2><p><strong>Você não precisa clicar em “Salvar”.</strong> O AulaFácil salva neste computador automaticamente. A nuvem é uma segunda camada para sincronizar e recuperar dados.</p></div><CheckCircle2 className="data-safety-heading-icon" /></div>
      <div className="data-safety-grid">
        <article className={`data-safety-item ${localState.status === "error" ? "danger" : localState.status === "saving" ? "working" : "success"}`}><div className="data-safety-icon"><HardDrive /></div><div><small>1 · NESTE COMPUTADOR</small><strong>{localTitle}</strong><span>{localText}</span>{localState.savedAt && localState.status === "saved" && <em>Salvo às {new Date(localState.savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</em>}</div></article>
        <article className={`data-safety-item ${cloud.tone}`}><div className="data-safety-icon">{cloudState === "offline" ? <WifiOff /> : cloudState === "checking" ? <RefreshCw className="spin" /> : <Cloud />}</div><div><small>2 · AULAFÁCIL CLOUD</small><strong>{cloud.title}</strong><span>{cloud.text}</span><em>{moment(syncedAt)}</em></div></article>
        <article className="data-safety-item neutral"><div className="data-safety-icon"><DatabaseBackup /></div><div><small>3 · BACKUP PORTÁTIL</small><strong>Uma cópia que fica com você</strong><span>Use quando quiser guardar um arquivo protegido por senha fora do aplicativo.</span><button type="button" className="secondary-button" onClick={onOpenBackup}>Abrir Backup e segurança</button></div></article>
      </div>
      <div className="data-safety-footer">No dia a dia: <strong>trabalhe normalmente</strong> → o computador salva sozinho → quando houver mudanças, clique em <strong>Sincronizar agora</strong>.</div>
    </section>
  );
}
