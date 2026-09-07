import { useRef, useState } from "react";
import { DatabaseBackup, Download, KeyRound, LockKeyhole, ShieldCheck, Trash2, Upload } from "lucide-react";
import type { SchoolDatabase } from "./model";
import {
  createEncryptedBackup,
  decryptPortableBackup,
  isEncryptedBackup,
  parseLegacyBackup,
  validateBackupPassword,
} from "./portable-backup";
import "./backup-panel.css";

type Tone = "success" | "warning" | "danger";

type BackupPanelProps = {
  database: SchoolDatabase;
  onRestoreCandidate: (database: SchoolDatabase, source: "encrypted" | "legacy") => void;
  onReset: () => void;
  onNotify: (message: string, tone?: Tone) => void;
};

function localDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function BackupPanel({ database, onRestoreCandidate, onReset, onNotify }: BackupPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exportPassword, setExportPassword] = useState("");
  const [exportConfirmation, setExportConfirmation] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [selectedContent, setSelectedContent] = useState("");
  const [selectedEncrypted, setSelectedEncrypted] = useState(false);
  const [importPassword, setImportPassword] = useState("");
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  const clearImport = () => {
    setSelectedName("");
    setSelectedContent("");
    setSelectedEncrypted(false);
    setImportPassword("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const exportEncrypted = async () => {
    if (exportPassword !== exportConfirmation) {
      onNotify("As duas senhas do backup precisam ser iguais.", "danger");
      return;
    }
    try {
      validateBackupPassword(exportPassword);
      setBusy("export");
      const content = await createEncryptedBackup(database, exportPassword);
      downloadText(content, `aulafacil-${localDate()}.afbackup`, "application/x-aulafacil-backup");
      setExportPassword("");
      setExportConfirmation("");
      onNotify("Backup criptografado criado. Guarde a senha em local seguro.");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Não foi possível criar o backup.", "danger");
    } finally {
      setBusy(null);
    }
  };

  const selectFile = async (file: File) => {
    clearImport();
    if (file.size > 96 * 1024 * 1024) {
      onNotify("O arquivo excede o limite de segurança permitido.", "danger");
      return;
    }
    try {
      const content = await file.text();
      const encrypted = isEncryptedBackup(content);
      setSelectedName(file.name);
      setSelectedContent(content);
      setSelectedEncrypted(encrypted);
      onNotify(encrypted ? "Backup criptografado selecionado. Informe a senha para validar." : "Backup antigo selecionado. Ele será validado antes da restauração.", "warning");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Não foi possível ler o arquivo.", "danger");
    }
  };

  const restore = async () => {
    if (!selectedContent) {
      onNotify("Escolha um arquivo de backup primeiro.", "warning");
      return;
    }
    try {
      setBusy("import");
      const restored = selectedEncrypted
        ? await decryptPortableBackup(selectedContent, importPassword)
        : parseLegacyBackup(selectedContent);
      onRestoreCandidate(restored, selectedEncrypted ? "encrypted" : "legacy");
      clearImport();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Não foi possível validar o backup.", "danger");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="stack backup-ultimate">
      <div className="security-hero card">
        <span><ShieldCheck size={30} /></span>
        <div>
          <h2>Backup protegido por senha</h2>
          <p>Crie uma cópia extra dos dados da escola para guardar em outro local ou recuperar em outro computador. O arquivo só pode ser aberto com a senha que você escolher.</p>
        </div>
      </div>

      <div className="backup-grid">
        <article className="card backup-card backup-secure-card">
          <span className="backup-icon blue"><LockKeyhole /></span>
          <h3>Criar backup protegido</h3>
          <p>A senha não é salva pelo AulaFácil. Sem ela, o arquivo não poderá ser recuperado.</p>
          <label className="backup-password-field">
            <span>Senha do backup</span>
            <input type="password" autoComplete="new-password" minLength={12} maxLength={256} value={exportPassword} onChange={(event) => setExportPassword(event.target.value)} placeholder="Mínimo de 12 caracteres" />
          </label>
          <label className="backup-password-field">
            <span>Confirmar senha</span>
            <input type="password" autoComplete="new-password" minLength={12} maxLength={256} value={exportConfirmation} onChange={(event) => setExportConfirmation(event.target.value)} placeholder="Digite a mesma senha" />
          </label>
          <button className="primary-button" disabled={busy !== null || exportPassword.length < 12 || exportPassword !== exportConfirmation} onClick={() => void exportEncrypted()}>
            <Download size={18} /> {busy === "export" ? "Criptografando..." : "Salvar backup protegido"}
          </button>
        </article>

        <article className="card backup-card backup-secure-card">
          <span className="backup-icon green"><Upload /></span>
          <h3>Restaurar backup</h3>
          <p>Aceita o novo .afbackup e também arquivos JSON criados pelas versões antigas do AulaFácil.</p>
          <input ref={fileRef} hidden type="file" accept=".afbackup,.json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void selectFile(file); }} />
          <button className="secondary-button" disabled={busy !== null} onClick={() => fileRef.current?.click()}><Upload size={18} /> Escolher arquivo</button>
          {selectedName && (
            <div className="backup-selected-file">
              <DatabaseBackup size={19} />
              <span><strong>{selectedName}</strong><small>{selectedEncrypted ? "Criptografado" : "Formato antigo JSON"}</small></span>
            </div>
          )}
          {selectedEncrypted && (
            <label className="backup-password-field">
              <span>Senha do arquivo</span>
              <div className="backup-key-input"><KeyRound size={17} /><input type="password" autoComplete="current-password" maxLength={256} value={importPassword} onChange={(event) => setImportPassword(event.target.value)} /></div>
            </label>
          )}
          {selectedName && <button className="primary-button" disabled={busy !== null || (selectedEncrypted && importPassword.length < 12)} onClick={() => void restore()}><Upload size={18} /> {busy === "import" ? "Validando..." : "Validar e restaurar"}</button>}
        </article>
      </div>

      <div className="card data-summary">
        <div><h3>Resumo armazenado</h3><p>Última alteração: {new Date(database.updatedAt).toLocaleString("pt-BR")}</p></div>
        <div className="summary-numbers"><span><b>{database.students.length}</b> alunos</span><span><b>{database.classes.length}</b> turmas</span><span><b>{database.invoices.length}</b> cobranças</span><span><b>{database.payments.length}</b> pagamentos</span></div>
      </div>

      <div className="backup-warning card">
        <ShieldCheck size={20} />
        <p><strong>Recomendação:</strong> use a nuvem para manter os dispositivos alinhados e guarde também um backup protegido em outro local. Assim você tem duas formas diferentes de recuperar seus dados.</p>
      </div>

      <div className="danger-zone card"><div><h3>Apagar dados deste computador</h3><p>Remove somente a cópia salva neste Windows. Os dados do AulaFácil Cloud e seus arquivos de backup não são apagados por esta ação.</p></div><button className="danger-button" onClick={onReset}><Trash2 size={18} /> Apagar deste computador</button></div>
    </section>
  );
}
