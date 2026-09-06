import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createCloudSchool,
  getCloudAuthState,
  getCloudDataSummary,
  listCloudSchools,
  onCloudAuthChange,
  signInCloud,
  signOutCloud,
  signUpCloud,
  resendCloudSignupConfirmation,
  type CloudAuthState,
  type CloudDataSummary,
  type CloudSchool,
} from "./cloud";
import { safePullFromCloud, safePushToCloud } from "./cloud-safe-sync";
import type { SchoolDatabase } from "./model";
import { LegalAcceptancePanel } from "./legal-acceptance-panel";
import { copyCurrentLegalAcceptanceToSchool } from "./legal-acceptance";
import "./cloud-account.css";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";
const CLOUD_SCHOOL_CHANGE_EVENT = "aulafacil:cloud-school-change";

type Props = {
  database: SchoolDatabase;
  onReplaceDatabase: (database: SchoolDatabase) => void;
};

type Message = { tone: "success" | "warning" | "danger"; text: string } | null;

function localRecordCount(database: SchoolDatabase) {
  return database.classes.length
    + database.students.length
    + database.invoices.length
    + database.payments.length
    + database.attendance.length
    + database.grades.length
    + database.notices.length;
}

function announceSchoolChange() {
  window.dispatchEvent(new Event(CLOUD_SCHOOL_CHANGE_EVENT));
}

export function CloudAccountPanel({ database, onReplaceDatabase }: Props) {
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
  const [downloadArmed, setDownloadArmed] = useState(false);
  const [schoolsLoaded, setSchoolsLoaded] = useState(false);
  const [legalReady, setLegalReady] = useState(false);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState("");

  const selectedSchool = useMemo(
    () => schools.find((school) => school.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId],
  );
  const canSeedCloud = selectedSchool?.role === "owner" || selectedSchool?.role === "admin";

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
      })
      .catch((error) => active && setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível verificar a conta." }));

    const unsubscribe = onCloudAuthChange((state) => {
      if (!active) return;
      setAuth(state);
      if (!state.user) {
        setSchools([]);
        setSummary(null);
        setSelectedSchoolId("");
        setSchoolsLoaded(false);
        setLegalReady(false);
        localStorage.removeItem(SELECTED_SCHOOL_KEY);
        announceSchoolChange();
        return;
      }
      setSchoolsLoaded(false);
      void refreshSchools().catch((error) => setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível atualizar as instituições." }));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setDownloadArmed(false);
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
    try {
      await operation();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "A operação não pôde ser concluída." });
    } finally {
      setBusy(false);
    }
  };

  const submitAuth = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (mode === "signin") {
        await signInCloud(email, password);
        setPendingConfirmationEmail("");
        setMessage({ tone: "success", text: "Conta conectada com segurança neste dispositivo." });
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
              setMessage({ tone: "success", text: "Este e-mail já possuía uma conta confirmada. O AulaFácil conectou a conta em vez de esperar outro e-mail." });
              setPassword("");
              return;
            }
          } catch {
            // Conta nova ainda não confirmada ou conta existente com outra senha.
          }
          setPendingConfirmationEmail(normalizedEmail);
          setMessage({ tone: "warning", text: "A conta ainda não abriu uma sessão. Se este e-mail for novo, confira a confirmação em Spam, Lixo eletrônico e Promoções. Se você já confirmou esse e-mail antes, use ‘Já confirmei / entrar’ abaixo em vez de esperar outro link." });
        }
      }
      setPassword("");
    });
  };

  if (!auth.user) {
    return (
      <section className="card cloud-account-card">
        <div className="cloud-account-heading">
          <div>
            <span className="cloud-eyebrow">AULAFÁCIL CLOUD</span>
            <h2>{mode === "signin" ? "Entrar na conta" : "Criar conta"}</h2>
            <p>Use a conta para recuperar os dados da instituição em outro dispositivo autorizado. A sessão do aplicativo Windows é protegida pelo armazenamento seguro do sistema.</p>
          </div>
        </div>

        <form className="cloud-auth-form" onSubmit={submitAuth}>
          <label><span>E-mail</span><input type="email" autoComplete="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label><span>Senha</span><input type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signup" ? 12 : 8} maxLength={256} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {mode === "signup" && <small>Use pelo menos 12 caracteres e evite reutilizar a senha de outro serviço.</small>}
          {message && <div className={`cloud-message ${message.tone}`} role="status">{message.text}</div>}
          <button className="primary-button" disabled={busy}>{busy ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}</button>
        </form>
        {pendingConfirmationEmail && <div className="cloud-resend-box"><strong>Não recebeu o e-mail?</strong><span>Se a conta for realmente nova, você pode solicitar outro link. Se já confirmou esse endereço alguma vez, não precisa receber outro e-mail: entre com sua senha.</span><div className="cloud-resend-actions"><button className="secondary-button" type="button" disabled={busy} onClick={() => void run(async () => { await resendCloudSignupConfirmation(pendingConfirmationEmail); setMessage({ tone: "success", text: `Solicitamos um novo e-mail para ${pendingConfirmationEmail}. Se a conta já estiver confirmada, use o botão de entrar ao lado.` }); })}>Reenviar confirmação</button><button className="secondary-button" type="button" disabled={busy} onClick={() => { setMode("signin"); setEmail(pendingConfirmationEmail); setPendingConfirmationEmail(""); setPassword(""); setMessage({ tone: "warning", text: "Digite a senha da conta já confirmada e clique em Entrar." }); }}>Já confirmei / entrar</button></div></div>}
        <button className="cloud-mode-button" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(null); setPendingConfirmationEmail(""); setPassword(""); }}>
          {mode === "signin" ? "Ainda não tenho conta" : "Já tenho uma conta"}
        </button>
      </section>
    );
  }

  if (!schoolsLoaded) {
    return <section className="card cloud-account-card"><div className="cloud-account-heading"><div><span className="cloud-eyebrow">AULAFÁCIL CLOUD</span><h2>Carregando conta</h2><p>Conferindo instituições e permissões...</p></div></div></section>;
  }

  if (!legalReady) {
    return <LegalAcceptancePanel schoolId={selectedSchoolId || null} onReady={() => setLegalReady(true)} />;
  }

  return (
    <section className="card cloud-account-card">
      <div className="cloud-account-heading">
        <div>
          <span className="cloud-eyebrow">AULAFÁCIL CLOUD</span>
          <h2>Conta e sincronização</h2>
          <p>{auth.user.email} · a sessão fica protegida neste dispositivo.</p>
        </div>
        <button className="secondary-button" disabled={busy} onClick={() => void run(async () => { await signOutCloud(); setMessage(null); })}>Sair neste dispositivo</button>
      </div>

      {schools.length === 0 ? (
        <div className="cloud-empty-school">
          <h3>Crie a instituição online</h3>
          <p>A criação gera automaticamente o espaço isolado da escola, as regras financeiras e os modelos iniciais.</p>
          <div className="cloud-create-row">
            <input maxLength={160} value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder={database.settings.institution.name || "Nome da instituição"} />
            <button type="button" className="primary-button" disabled={busy} onClick={() => void run(async () => {
              const id = await createCloudSchool(schoolName || database.settings.institution.name);
              await refreshSchools();
              setSelectedSchoolId(id);
              setSchoolName("");
              try {
                await copyCurrentLegalAcceptanceToSchool(id);
                setMessage({ tone: "success", text: "Instituição criada. Agora você já pode sincronizar e configurar recebimentos." });
              } catch {
                setMessage({ tone: "warning", text: "Instituição criada. Revise a aceitação dos termos antes da primeira sincronização." });
              }
            })}>{busy ? "Criando..." : "Criar instituição"}</button>
          </div>
          {message && <div className={`cloud-message ${message.tone} cloud-empty-school-message`} role="status">{message.text}</div>}
        </div>
      ) : (
        <>
          <div className="cloud-school-selector">
            <label>
              <span>Instituição ativa</span>
              <select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>
                {schools.map((school) => <option key={school.id} value={school.id}>{school.name} · {school.role}</option>)}
              </select>
            </label>
            {selectedSchool && <div className="cloud-role-chip">Acesso: {selectedSchool.role}</div>}
          </div>

          <div className="cloud-summary-grid">
            <div><strong>{localRecordCount(database)}</strong><span>registros operacionais neste computador</span></div>
            <div><strong>{summary?.totalOperationalRecords ?? "—"}</strong><span>registros operacionais visíveis na nuvem</span></div>
            <div><strong>{navigator.onLine ? "Online" : "Offline"}</strong><span>estado atual da conexão</span></div>
          </div>

          {message && <div className={`cloud-message ${message.tone}`} role="status">{message.text}</div>}

          <div className="cloud-sync-actions">
            <div>
              <h3>Primeiro envio deste computador</h3>
              <p>{canSeedCloud ? "Por segurança, o primeiro envio só é aceito quando a instituição online ainda não possui registros operacionais." : "Somente proprietário ou administrador pode inicializar uma instituição vazia com os dados deste computador."}</p>
              <button className="primary-button" disabled={busy || !selectedSchoolId || !canSeedCloud || (summary?.totalOperationalRecords ?? 1) > 0} onClick={() => void run(async () => {
                const normalized = await safePushToCloud(selectedSchoolId, database);
                onReplaceDatabase(normalized);
                setSummary(await getCloudDataSummary(selectedSchoolId));
                setMessage({ tone: "success", text: "Dados iniciais enviados e este computador foi vinculado à revisão atual da nuvem." });
              })}>Enviar dados locais para a nuvem</button>
            </div>

            <div>
              <h3>Recuperar dados da nuvem</h3>
              <p>A recuperação substitui a cópia local pelos dados que sua função tem permissão para acessar. Se quiser preservar a cópia atual, crie antes um .afbackup na área Backup.</p>
              {!downloadArmed ? (
                <button className="secondary-button" disabled={busy || !selectedSchoolId || !summary} onClick={() => setDownloadArmed(true)}>Preparar recuperação</button>
              ) : (
                <div className="cloud-danger-zone">
                  <strong>Confirme a substituição local</strong>
                  <span>O AulaFácil não gera mais backup JSON sem criptografia. Use o .afbackup protegido por senha quando quiser preservar uma cópia portátil.</span>
                  <div>
                    <button className="secondary-button" onClick={() => setDownloadArmed(false)}>Cancelar</button>
                    <button className="danger-button" disabled={busy} onClick={() => void run(async () => {
                      const restored = await safePullFromCloud(selectedSchoolId, database.settings.appearance);
                      onReplaceDatabase(restored);
                      setDownloadArmed(false);
                      setMessage({ tone: "success", text: "Dados autorizados da nuvem recuperados e linha-base de sincronização atualizada." });
                    })}>Baixar e substituir</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
