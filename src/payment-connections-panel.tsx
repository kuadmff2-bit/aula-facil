import { useEffect, useMemo, useState } from "react";
import {
  configurePaymentCredentials,
  createPaymentConnection,
  listPaymentConnections,
  removePaymentConnection,
  updatePaymentConnection,
  type PaymentConnection,
} from "./payment-connections";
import { PAYMENT_PROVIDERS, type PaymentProviderKey } from "./payment-providers";
import { getCloudAuthState, onCloudAuthChange } from "./cloud";
import "./payment-connections-panel.css";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";
const CLOUD_SCHOOL_CHANGE_EVENT = "aulafacil:cloud-school-change";

type Message = { tone: "success" | "warning" | "danger"; text: string } | null;

function capabilityLabel(connection: PaymentConnection) {
  const items = [
    connection.supportsPix ? "Pix" : null,
    connection.supportsBoleto ? "Boleto" : null,
    connection.supportsCard ? "Cartão" : null,
  ].filter(Boolean);
  return items.join(" · ") || "Sem meio habilitado";
}

export function PaymentConnectionsPanel() {
  const [schoolId, setSchoolId] = useState(() => localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "");
  const [cloudEmail, setCloudEmail] = useState("");
  const [connections, setConnections] = useState<PaymentConnection[]>([]);
  const [providerKey, setProviderKey] = useState<PaymentProviderKey>("manual_pix");
  const [displayName, setDisplayName] = useState("Pix da escola");
  const [pixKey, setPixKey] = useState("");
  const [pixRecipient, setPixRecipient] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("production");
  const [priority, setPriority] = useState(50);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [credentialConnectionId, setCredentialConnectionId] = useState("");
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});

  const selectedProvider = useMemo(
    () => PAYMENT_PROVIDERS.find((provider) => provider.key === providerKey) ?? PAYMENT_PROVIDERS[0],
    [providerKey],
  );

  const credentialConnection = useMemo(
    () => connections.find((connection) => connection.id === credentialConnectionId) ?? null,
    [connections, credentialConnectionId],
  );

  const credentialProvider = useMemo(
    () => credentialConnection ? PAYMENT_PROVIDERS.find((provider) => provider.key === credentialConnection.providerKey) ?? null : null,
    [credentialConnection],
  );

  const refresh = async (targetSchoolId = schoolId) => {
    if (!targetSchoolId) {
      setConnections([]);
      return;
    }
    setConnections(await listPaymentConnections(targetSchoolId));
  };

  useEffect(() => {
    let active = true;
    void getCloudAuthState()
      .then((state) => { if (active) setCloudEmail(state.user?.email ?? ""); })
      .catch(() => { if (active) setCloudEmail(""); });
    const unsubscribe = onCloudAuthChange((state) => setCloudEmail(state.user?.email ?? ""));
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const syncSchool = () => {
      const next = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
      setSchoolId(next);
      setCredentialConnectionId("");
      setCredentialValues({});
      void refresh(next).catch((error) => setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível carregar os recebimentos." }));
    };
    syncSchool();
    window.addEventListener("storage", syncSchool);
    window.addEventListener(CLOUD_SCHOOL_CHANGE_EVENT, syncSchool);
    return () => {
      window.removeEventListener("storage", syncSchool);
      window.removeEventListener(CLOUD_SCHOOL_CHANGE_EVENT, syncSchool);
    };
  }, []);

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

  const addConnection = () => void run(async () => {
    if (!schoolId) throw new Error("Entre no AulaFácil Cloud e selecione a instituição antes de configurar recebimentos online.");
    if (providerKey === "manual_pix" && !pixKey.trim()) throw new Error("Informe a chave Pix da escola.");

    const created = await createPaymentConnection(schoolId, {
      providerKey,
      displayName: displayName.trim() || selectedProvider.name,
      environment,
      priority,
      publicConfig: providerKey === "manual_pix"
        ? { pixKey: pixKey.trim().slice(0, 180), recipientName: pixRecipient.trim().slice(0, 160) }
        : {},
    });
    await refresh();
    setDisplayName(selectedProvider.name);
    setPixKey("");
    setPixRecipient("");
    if (providerKey !== "manual_pix") {
      setCredentialConnectionId(created.id);
      setCredentialValues({});
    }
    setMessage({
      tone: providerKey === "manual_pix" ? "success" : "warning",
      text: providerKey === "manual_pix"
        ? "Pix manual adicionado. A escola pode usá-lo como opção de recebimento."
        : "Conexão adicionada. Configure as credenciais para habilitar cobranças automáticas.",
    });
  });

  const makeDefault = (connection: PaymentConnection, kind: "pix" | "boleto" | "card") => void run(async () => {
    const currentDefault = connections.find((item) => {
      if (kind === "pix") return item.defaultForPix;
      if (kind === "boleto") return item.defaultForBoleto;
      return item.defaultForCard;
    });
    if (currentDefault && currentDefault.id !== connection.id) {
      await updatePaymentConnection(currentDefault.id, {
        defaultForPix: kind === "pix" ? false : undefined,
        defaultForBoleto: kind === "boleto" ? false : undefined,
        defaultForCard: kind === "card" ? false : undefined,
      });
    }
    await updatePaymentConnection(connection.id, {
      defaultForPix: kind === "pix" ? true : undefined,
      defaultForBoleto: kind === "boleto" ? true : undefined,
      defaultForCard: kind === "card" ? true : undefined,
    });
    await refresh();
    setMessage({ tone: "success", text: `${connection.displayName} definido como padrão para ${kind === "pix" ? "Pix" : kind === "boleto" ? "boleto" : "cartão"}.` });
  });

  const saveCredentials = () => {
    if (!credentialConnection || !credentialProvider) return;
    void run(async () => {
      const payload: Record<string, string> = {};
      for (const field of credentialProvider.credentialFields) {
        const value = credentialValues[field.key]?.trim() ?? "";
        if (field.required && !value) throw new Error(`Preencha ${field.label}.`);
        if (value) payload[field.key] = value;
      }
      await configurePaymentCredentials(credentialConnection.id, payload);
      setCredentialValues({});
      setCredentialConnectionId("");
      await refresh();
      setMessage({ tone: "success", text: `Credenciais de ${credentialConnection.displayName} protegidas no servidor. O aplicativo não consegue lê-las de volta.` });
    });
  };

  const readyConnections = connections.filter((connection) => connection.enabled && (connection.providerKey === "manual_pix" || connection.credentialsConfigured));
  const hasDefaultOnline = connections.some((connection) => connection.enabled && connection.credentialsConfigured && (connection.defaultForPix || connection.defaultForBoleto));
  const paymentNextStep = !cloudEmail
    ? "Entre no AulaFácil Cloud."
    : !schoolId
      ? "Sua conta está conectada. Agora crie ou selecione a instituição no bloco AulaFácil Cloud acima."
      : !connections.length
        ? "Adicione uma forma de recebimento. Para começar sem API, escolha Pix da escola."
        : !readyConnections.length
          ? "Configure as credenciais da conexão bancária ou use Pix manual."
          : !hasDefaultOnline && connections.some((item) => item.providerKey !== "manual_pix")
            ? "Se usar Asaas ou outro provedor, defina qual conexão será o padrão para Pix ou boleto."
            : "Recebimentos configurados. No Financeiro, abra a mensalidade e escolha Gerar Pix/Boleto ou Registrar pagamento.";

  return (
    <section className="card payment-connections-card">
      <div className="payment-connections-heading">
        <div>
          <span className="payment-eyebrow">RECEBIMENTOS</span>
          <h2>Bancos e provedores de pagamento</h2>
          <p>Conecte mais de um serviço. O AulaFácil pode usar provedores diferentes para Pix e boleto sem prender a escola a uma única empresa.</p>
        </div>
      </div>

      <div className="payment-setup-guide" aria-label="Como funcionam as cobranças">
        <div className={schoolId ? "done" : cloudEmail ? "current" : ""}><b>1</b><span><strong>Cloud</strong><small>{schoolId ? "Instituição selecionada" : cloudEmail ? "Conta conectada; falta a instituição" : "Entrar na conta"}</small></span></div>
        <div className={connections.length ? "done" : schoolId ? "current" : ""}><b>2</b><span><strong>Recebimento</strong><small>Pix manual ou provedor como Asaas</small></span></div>
        <div className={readyConnections.length ? "done" : connections.length ? "current" : ""}><b>3</b><span><strong>Configuração</strong><small>Credenciais e meios habilitados</small></span></div>
        <div className={readyConnections.length ? "current" : ""}><b>4</b><span><strong>Cobrar</strong><small>Financeiro → mensalidade → Pix/Boleto</small></span></div>
      </div>
      <div className={schoolId ? "payment-readiness info" : "payment-readiness warning"}><strong>Próximo passo</strong><span>{paymentNextStep}</span></div>

      {!schoolId && (
        <div className="payment-message warning">{cloudEmail ? <>A conta <strong>{cloudEmail}</strong> já está conectada. Falta criar ou selecionar a instituição no AulaFácil Cloud acima.</> : <>Entre no AulaFácil Cloud e selecione a instituição para habilitar integrações bancárias.</>}</div>
      )}
      {schoolId && <div className="payment-message success">Instituição Cloud selecionada. As mensalidades continuam sendo controladas no AulaFácil; Pix e boleto online são gerados somente quando você escolher uma conexão pronta.</div>}

      {connections.length > 0 && (
        <div className="payment-connection-list">
          {connections.map((connection) => (
            <article key={connection.id} className="payment-connection-item">
              <div className="payment-connection-main">
                <div>
                  <strong>{connection.displayName}</strong>
                  <span>{PAYMENT_PROVIDERS.find((provider) => provider.key === connection.providerKey)?.name ?? connection.providerKey}</span>
                </div>
                <div className={`payment-state ${connection.enabled ? "active" : "inactive"}`}>{connection.enabled ? "Ativo" : "Pausado"}</div>
              </div>
              <div className="payment-connection-meta">
                <span>{capabilityLabel(connection)}</span>
                <span>{connection.environment === "sandbox" ? "Teste" : "Produção"}</span>
                <span>Prioridade {connection.priority}</span>
                <span>{connection.providerKey === "manual_pix" || connection.credentialsConfigured ? "Credenciais prontas" : "Credenciais pendentes"}</span>
              </div>
              <div className="payment-connection-actions">
                {connection.supportsPix && <button type="button" className={connection.defaultForPix ? "active" : ""} onClick={() => makeDefault(connection, "pix")}>{connection.defaultForPix ? "Pix padrão" : "Usar para Pix"}</button>}
                {connection.supportsBoleto && <button type="button" className={connection.defaultForBoleto ? "active" : ""} onClick={() => makeDefault(connection, "boleto")}>{connection.defaultForBoleto ? "Boleto padrão" : "Usar para boleto"}</button>}
                {connection.supportsCard && <button type="button" className={connection.defaultForCard ? "active" : ""} onClick={() => makeDefault(connection, "card")}>{connection.defaultForCard ? "Cartão padrão" : "Usar para cartão"}</button>}
                {connection.providerKey !== "manual_pix" && <button type="button" onClick={() => { setCredentialConnectionId(connection.id); setCredentialValues({}); }}>{connection.credentialsConfigured ? "Trocar credenciais" : "Configurar credenciais"}</button>}
                <button type="button" onClick={() => void run(async () => { await updatePaymentConnection(connection.id, { enabled: !connection.enabled }); await refresh(); })}>{connection.enabled ? "Pausar" : "Ativar"}</button>
                <button type="button" className="danger" onClick={() => void run(async () => { await removePaymentConnection(connection.id); if (credentialConnectionId === connection.id) setCredentialConnectionId(""); await refresh(); setMessage({ tone: "success", text: "Conexão e credenciais associadas removidas." }); })}>Remover</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {credentialConnection && credentialProvider && (
        <div className="payment-credential-box">
          <div>
            <h3>Credenciais de {credentialConnection.displayName}</h3>
            <p>Esses valores serão enviados diretamente ao backend seguro e armazenados no Supabase Vault. Eles não entram no backup, no banco local nem no repositório.</p>
          </div>
          <div className="payment-form-grid">
            {credentialProvider.credentialFields.map((field) => (
              <label key={field.key}>
                <span>{field.label}{field.required ? " *" : ""}</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={credentialValues[field.key] ?? ""}
                  onChange={(event) => setCredentialValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  placeholder={field.placeholder ?? "••••••••"}
                />
              </label>
            ))}
          </div>
          <div className="settings-inline-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={() => { setCredentialValues({}); setCredentialConnectionId(""); }}>Cancelar</button>
            <button type="button" className="primary-button" disabled={busy} onClick={saveCredentials}>{busy ? "Protegendo..." : "Salvar no cofre seguro"}</button>
          </div>
        </div>
      )}

      <div className="payment-add-box">
        <h3>Adicionar forma de recebimento</h3>
        <div className="payment-form-grid">
          <label>
            <span>Provedor</span>
            <select value={providerKey} onChange={(event) => {
              const key = event.target.value as PaymentProviderKey;
              setProviderKey(key);
              const provider = PAYMENT_PROVIDERS.find((item) => item.key === key);
              setDisplayName(provider?.name ?? "");
            }}>
              {PAYMENT_PROVIDERS.map((provider) => <option key={provider.key} value={provider.key}>{provider.name}</option>)}
            </select>
          </label>
          <label><span>Nome desta conexão</span><input maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label>
            <span>Ambiente</span>
            <select value={environment} onChange={(event) => setEnvironment(event.target.value as "sandbox" | "production")} disabled={providerKey === "manual_pix"}>
              <option value="sandbox">Teste / sandbox</option>
              <option value="production">Produção</option>
            </select>
          </label>
          <label><span>Prioridade</span><input type="number" min={0} max={100} value={priority} onChange={(event) => setPriority(Math.max(0, Math.min(100, Math.trunc(Number(event.target.value) || 0))))} /></label>
          {providerKey === "manual_pix" && <>
            <label><span>Chave Pix</span><input maxLength={180} value={pixKey} onChange={(event) => setPixKey(event.target.value)} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" /></label>
            <label><span>Nome do recebedor</span><input maxLength={160} value={pixRecipient} onChange={(event) => setPixRecipient(event.target.value)} placeholder="Nome que aparecerá para o aluno" /></label>
          </>}
        </div>
        <div className="payment-provider-note">
          <strong>{selectedProvider.name}</strong>
          <span>{selectedProvider.description}</span>
          {selectedProvider.notes && <small>{selectedProvider.notes}</small>}
        </div>
        {providerKey !== "manual_pix" && <div className="payment-secret-note">As chaves secretas não serão gravadas no aplicativo nem no banco acessível ao cliente. Após criar a conexão, o AulaFácil abre o cofre seguro para configurá-las.</div>}
        {message && <div className={`payment-message ${message.tone}`} role="status">{message.text}</div>}
        <button type="button" className="primary-button" disabled={busy || !schoolId} onClick={addConnection}>{busy ? "Aguarde..." : "Adicionar conexão"}</button>
      </div>
    </section>
  );
}
