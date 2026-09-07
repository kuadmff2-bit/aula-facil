import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createCloudSchool,
  getCloudAuthState,
  getCloudDataSummary,
  listCloudSchools,
  onCloudAuthChange,
  resendCloudSignupConfirmation,
  signInCloud,
  signOutCloud,
  signUpCloud,
  type CloudAuthState,
  type CloudDataSummary,
  type CloudSchool,
  type SchoolRole,
} from "./cloud";
import type { SchoolDatabase } from "./model";
import { LegalAcceptancePanel } from "./legal-acceptance-panel";
import { copyCurrentLegalAcceptanceToSchool } from "./legal-acceptance";
import "./cloud-account.css";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";
const CLOUD_SCHOOL_CHANGE_EVENT = "aulafacil:cloud-school-change";

type Props = { database: SchoolDatabase };
type Message = { tone: "success" | "warning" | "danger"; text: string } | null;

const roleLabel: Record<SchoolRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  finance: "Financeiro",
  teacher: "Professor",
  staff: "Equipe",
};

function localRecordCount(database: SchoolDatabase) {
  return database.classes.length + database.students.length + database.invoices.length
    + database.payments.length + database.attendance.length + database.grades.length + database.notices.length;
}

function announceSchoolChange() {
  window.dispatchEvent(new Event(CLOUD_SCHOOL_CHANGE_EVENT));
}

export function CloudAccountPanel({ database }: Props) {
  const [auth, setAuth] = useState<CloudAuthState>({ session: null, user: null });
  const [schools, setSchools] = useState<CloudSchool[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState(() => localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "");
  const [summary, setSummary] = useState<CloudDataSummary | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false);
  const [legalReady, setLegalReady] = useState(false);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState("");

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId],
  );

  const refreshSchools = async () => {
    const next = await listCloudSchools();
    setSchools(next);
    setSelectedSchoolId((current) => {
      const valid = next.some((school) => school.id === current);
      const selected = valid ? current : next[0]?.id ?? "";
      if (selected) localStorage.setItem(SELECTED_SCHOOL_KEY, selected);
      else localStorage.removeItem(SELECTED_SCHOOL_KEY);
      return selected;
    });
    setSchoolsLoaded(true);
  };

  useEffect(() => {
    let active = true;
    void getCloudAuthState()
      .then((state) => {
        if (!active) return;
        setAuth(state);
        if (state.user) return refreshSchools();
        setSchoolsLoaded(true);
      })
      .catch((error) => active && setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível verificar a conta." }));

    const unsubscribe = onCloudAuthChange((state) => {
      if (!active) return;
      setAuth(state);
      if (!state.user) {
        setSchools([]);
        setSummary(null);
        setSelectedSchoolId("");
        setSchoolsLoaded(true);
        setLegalReady(false);
        localStorage.removeItem(SELECTED_SCHOOL_KEY);
        announceSchoolChange();
        return;
      }
      setSchoolsLoaded(false);
      void refreshSchools().catch((error) => setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível atualizar as instituições." }));
    });

    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    setLegalReady(false);
    if (!selectedSchoolId || !auth.user) {
      setSummary(null);
      announceSchoolChange();
      return;
    }
    localStorage.setItem(SELECTED_SCHOOL_KEY, selectedSchoolId);
    announceSchoolChange();
    void getCloudDataSummary(selectedSchoolId)
      .then(setSummary)
      .catch((error) => setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível conferir a nuvem." }));
  }, [selectedSchoolId, auth.user]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try { await operation(); }
    catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "A operação não pôde ser concluída." }); }
    finally { setBusy(false); }
  };

  const submitAuth = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (mode === "signin") {
        await signInCloud(email, password);
        setPendingConfirmationEmail("");
        setMessage({ tone: "success", text: "Conta conectada neste computador." });
      } else {
        if (password.length < 12) throw new Error("Para novas contas, use uma senha com pelo menos 12 caracteres.");
        const normalizedEmail = email.trim().toLowerCase();
        const result = await signUpCloud(normalizedEmail, password);
        if (result.session) {
          setPendingConfirmationEmail("");
          setMessage({ tone: "success", text: "Conta criada e conectada. Agora crie ou selecione a instituição." });
        } else {
          try {
            const existing = await signInCloud(normalizedEmail, password);
            if (existing.session) {
              setPendingConfirmationEmail("");
              setMessage({ tone: "success", text: "Esse e-mail já tinha uma conta confirmada. O AulaFácil entrou normalmente." });
              setPassword("");
              return;
            }
          } catch { /* conta nova aguardando confirmação ou senha diferente */ }
          setPendingConfirmationEmail(normalizedEmail);
          setMessage({ tone: "warning", text: "Confira o e-mail de confirmação. Se essa conta já foi confirmada antes, use “Já confirmei / entrar”." });
        }
      }
      setPassword("");
    });
  };

  if (!auth.user) {
    return (
      <section className="card cloud-account-card">
        <div className="cloud-account-heading"><div><span className="cloud-eyebrow">CONTA</span><h2>{mode === "signin" ? "Entrar no AulaFácil Cloud" : "Criar conta"}</h2><p>A conta identifica quem está usando a nuvem. Seus cadastros continuam sendo salvos neste computador mesmo sem entrar.</p></div></div>
        <form className="cloud-auth-form" onSubmit={submitAuth}>
          <label><span>E-mail</span><input type="email" autoComplete="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label><span>Senha</span><input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signup" ? 12 : 8} maxLength={256} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {mode === "signup" && <small>Use pelo menos 12 caracteres e não reutilize a senha de outro serviço.</small>}
          {message && <div className={`cloud-message ${message.tone}`} role="status">{message.text}</div>}
          <button className="primary-button" disabled={busy}>{busy ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}</button>
        </form>
        {pendingConfirmationEmail && <div className="cloud-resend-box"><strong>Não recebeu o e-mail?</strong><span>Você pode reenviar a confirmação ou voltar direto para o login se a conta já estiver confirmada.</span><div className="cloud-resend-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => void run(async () => { await resendCloudSignupConfirmation(pendingConfirmationEmail); setMessage({ tone: "success", text: `Solicitamos um novo e-mail para ${pendingConfirmationEmail}.` }); })}>Reenviar confirmação</button><button className="secondary-button" type="button" disabled={busy} onClick={() => { setMode("signin"); setEmail(pendingConfirmationEmail); setPendingConfirmationEmail(""); setPassword(""); }}>Já confirmei / entrar</button></div></div>}
        <button className="cloud-mode-button" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(null); setPendingConfirmationEmail(""); setPassword(""); }}>{mode === "signin" ? "Ainda não tenho conta" : "Já tenho uma conta"}</button>
      </section>
    );
  }

  if (!schoolsLoaded) return <section className="card cloud-account-card"><div className="cloud-account-heading"><div><span className="cloud-eyebrow">CONTA</span><h2>Carregando sua conta</h2><p>Conferindo instituições e permissões...</p></div></div></section>;
  if (!legalReady) return <LegalAcceptancePanel schoolId={selectedSchoolId || null} onReady={() => setLegalReady(true)} />;

  return (
    <section className="card cloud-account-card">
      <div className="cloud-account-heading">
        <div><span className="cloud-eyebrow">CONTA E INSTITUIÇÃO</span><h2>Quem está conectado</h2><p>{auth.user.email}</p></div>
        <button className="secondary-button" disabled={busy} onClick={() => void run(async () => { await signOutCloud(); setMessage(null); })}>Sair neste computador</button>
      </div>

      <div className="cloud-account-guide"><strong>Aqui você só escolhe a conta e a instituição.</strong><span>Para enviar ou receber dados, use o bloco “Sincronização com a nuvem” logo abaixo. Assim existe um único lugar para sincronizar.</span></div>

      {schools.length === 0 ? (
        <div className="cloud-empty-school">
          <h3>Criar instituição na nuvem</h3><p>Isso cria o espaço isolado da sua escola. Depois você decide no bloco de sincronização qual cópia deve ser usada.</p>
          <div className="cloud-create-row"><input maxLength={160} value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder={database.settings.institution.name || "Nome da instituição"} /><button type="button" className="primary-button" disabled={busy} onClick={() => void run(async () => { const id = await createCloudSchool(schoolName || database.settings.institution.name); await refreshSchools(); setSelectedSchoolId(id); setSchoolName(""); try { await copyCurrentLegalAcceptanceToSchool(id); setMessage({ tone: "success", text: "Instituição criada. Agora use o bloco de sincronização abaixo." }); } catch { setMessage({ tone: "warning", text: "Instituição criada. Revise os termos antes da primeira sincronização." }); } })}>{busy ? "Criando..." : "Criar instituição"}</button></div>
          {message && <div className={`cloud-message ${message.tone} cloud-empty-school-message`} role="status">{message.text}</div>}
        </div>
      ) : (
        <>
          <div className="cloud-school-selector"><label><span>Instituição usada neste computador</span><select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>{schools.map((school) => <option key={school.id} value={school.id}>{school.name} · {roleLabel[school.role]}</option>)}</select></label>{selectedSchool && <div className="cloud-role-chip">Acesso: {roleLabel[selectedSchool.role]}</div>}</div>
          <div className="cloud-summary-grid"><div><strong>{localRecordCount(database)}</strong><span>registros neste computador</span></div><div><strong>{summary?.complete === false ? "—" : summary?.totalOperationalRecords ?? "—"}</strong><span>{summary?.complete === false ? "resumo da nuvem parcialmente indisponível" : "registros visíveis na nuvem"}</span></div><div><strong>{navigator.onLine ? "Online" : "Offline"}</strong><span>{navigator.onLine ? "nuvem disponível" : "o trabalho local continua funcionando"}</span></div></div>{summary?.complete === false && <div className="cloud-message warning" role="status">Alguns contadores da nuvem não responderam agora. Seus dados não foram apagados. O AulaFácil continua protegendo a sincronização e tentará conferir novamente.</div>}
          {message && <div className={`cloud-message ${message.tone}`} role="status">{message.text}</div>}
        </>
      )}
    </section>
  );
}
