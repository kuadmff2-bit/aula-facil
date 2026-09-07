import { useEffect, useState, type FormEvent } from "react";
import { CloudDownload, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { getCloudAuthState, listCloudSchools, signInCloud, type CloudSchool } from "./cloud";
import { safePullFromCloud } from "./cloud-safe-sync";
import { replaceProtectedDatabase } from "./storage";
import "./storage-recovery-screen.css";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";

export function StorageRecoveryScreen({ detail }: { detail: string }) {
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [schools, setSchools] = useState<CloudSchool[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const refreshAccount = async () => {
    setChecking(true);
    try {
      const auth = await getCloudAuthState();
      const connected = Boolean(auth.user);
      setSignedIn(connected);
      if (!connected) { setSchools([]); setSelectedSchoolId(""); return; }
      const next = await listCloudSchools();
      setSchools(next);
      const remembered = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
      const selected = next.some((school) => school.id === remembered) ? remembered : next[0]?.id ?? "";
      setSelectedSchoolId(selected);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Não foi possível verificar a conta da nuvem.");
    } finally { setChecking(false); }
  };

  useEffect(() => { void refreshAccount(); }, []);

  const login = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setFailed(false); setMessage("Entrando na sua conta...");
    void signInCloud(email, password)
      .then(async () => { setPassword(""); setMessage("Conta conectada. Escolha a instituição que deseja recuperar."); await refreshAccount(); })
      .catch((error) => { setFailed(true); setMessage(error instanceof Error ? error.message : "Não foi possível entrar na conta."); })
      .finally(() => setBusy(false));
  };

  const recoverFromCloud = async () => {
    if (!selectedSchoolId || busy) return;
    setBusy(true); setFailed(false);
    try {
      const selected = schools.find((school) => school.id === selectedSchoolId);
      localStorage.setItem(SELECTED_SCHOOL_KEY, selectedSchoolId);
      setMessage(`Baixando ${selected?.name || "a instituição"} da nuvem. O arquivo local original ainda não será alterado...`);
      const database = await safePullFromCloud(selectedSchoolId, "system");
      setMessage("Cópia da nuvem validada. Preservando os arquivos locais em quarentena...");
      await replaceProtectedDatabase(database);
      setMessage("Dados recuperados com segurança. Reiniciando o AulaFácil...");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Não foi possível recuperar os dados da nuvem.");
      setBusy(false);
    }
  };

  return (
    <main className="storage-recovery-page">
      <section className="storage-recovery-card">
        <div className="storage-recovery-title"><span><ShieldCheck /></span><div><small>RECUPERAÇÃO SEGURA</small><h1>Seus dados locais continuam preservados</h1><p>O AulaFácil tentou o banco principal, a cópia de recuperação e os backups automáticos. Nenhuma cópia válida foi sobrescrita.</p></div></div>
        <div className="storage-recovery-error"><strong>Por que o sistema não abriu?</strong><span>{detail}</span></div>
        <div className="storage-recovery-steps"><div><b>1</b><span><strong>Arquivos locais preservados</strong><small>O aplicativo parou antes de gravar um banco vazio.</small></span></div><div><b>2</b><span><strong>A nuvem só entra se você escolher</strong><small>Antes de substituir o arquivo local, ele é copiado para uma pasta de quarentena.</small></span></div></div>

        {checking ? <div className="storage-recovery-status"><RefreshCw className="spin" /> Conferindo sua conta da nuvem...</div> : !signedIn ? (
          <form className="storage-recovery-login" onSubmit={login}><div><LogIn /><span><strong>Entrar no AulaFácil Cloud</strong><small>Você pode entrar aqui mesmo; não precisa conseguir abrir o restante do aplicativo.</small></span></div><label><span>E-mail</span><input type="email" autoComplete="email" required maxLength={200} value={email} onChange={(event) => setEmail(event.target.value)} /></label><label><span>Senha</span><input type="password" autoComplete="current-password" minLength={8} maxLength={256} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="storage-recovery-primary" disabled={busy}>{busy ? "Entrando..." : "Entrar e continuar"}</button></form>
        ) : schools.length ? (
          <div className="storage-recovery-cloud"><div><CloudDownload /><span><strong>Recuperar uma instituição da nuvem</strong><small>Selecione exatamente qual escola deseja restaurar neste computador.</small></span></div><label><span>Instituição</span><select value={selectedSchoolId} onChange={(event) => setSelectedSchoolId(event.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label><button className="storage-recovery-primary" disabled={busy || !selectedSchoolId} onClick={() => void recoverFromCloud()}>{busy ? "Recuperando..." : "Recuperar esta instituição"}</button></div>
        ) : <div className="storage-recovery-status warning">Sua conta está conectada, mas não possui uma instituição disponível para recuperação.</div>}

        {message && <div className={`storage-recovery-message ${failed ? "danger" : "success"}`} role="status">{message}</div>}
        <div className="storage-recovery-footer"><button type="button" className="storage-recovery-secondary" disabled={busy} onClick={() => window.location.reload()}><RefreshCw /> Tentar cópias locais novamente</button><span>Nunca limpe a pasta de dados para resolver esta tela. Use recuperação ou um backup validado.</span></div>
      </section>
    </main>
  );
}
