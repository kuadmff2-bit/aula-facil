import { useEffect, useMemo, useState } from "react";
import {
  createPaymentConnection,
  listPaymentConnections,
  removePaymentConnection,
  updatePaymentConnection,
  type PaymentConnection,
} from "./payment-connections";
import { PAYMENT_PROVIDERS, type PaymentProviderKey } from "./payment-providers";
import "./payment-connections-panel.css";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";

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
  const [connections, setConnections] = useState<PaymentConnection[]>([]);
  const [providerKey, setProviderKey] = useState<PaymentProviderKey>("manual_pix");
  const [displayName, setDisplayName] = useState("Pix da escola");
  const [pixKey, setPixKey] = useState("");
  const [pixRecipient, setPixRecipient] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("production");
  const [priority, setPriority] = useState(50);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const selectedProvider = useMemo(
    () => PAYMENT_PROVIDERS.find((provider) => provider.key === providerKey) ?? PAYMENT_PROVIDERS[0],
    [providerKey],
  );

  const refresh = async (targetSchoolId = schoolId) => {
    if (!targetSchoolId) {
      setConnections([]);
      return;
    }
    setConnections(await listPaymentConnections(targetSchoolId));
  };

  useEffect(() => {
    const syncSchool = () => {
      const next = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
      setSchoolId(next);
      void refresh(next).catch((error) => setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível carregar os recebimentos." }));
    };
    syncSchool();
    window.addEventListener("storage", syncSchool);
    return () => window.removeEventListener("storage", syncSchool);
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

    await createPaymentConnection(schoolId, {
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
    setMessage({
      tone: providerKey === "manual_pix" ? "success" : "warning",
      text: providerKey === "manual_pix"
        ? "Pix manual adicionado. A escola pode usá-lo como opção de recebimento."
        : "Conexão adicionada. Ela só será usada depois que as credenciais secretas forem configuradas no servidor.",
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

  return (
    <section className="card payment-connections-card">
      <div className="payment-connections-heading">
        <div>
          <span className="payment-eyebrow">RECEBIMENTOS</span>
          <h2>Bancos e provedores de pagamento</h2>
          <p>Conecte mais de um serviço. O AulaFácil pode usar provedores diferentes para Pix, boleto e cartão sem prender a escola a uma única empresa.</p>
        </div>
      </div>

      {!schoolId && (
        <div className="payment-message warning">Conecte uma conta e selecione a instituição no AulaFácil Cloud para habilitar integrações bancárias.</div>
      )}

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
                <button type="button" onClick={() => void run(async () => { await updatePaymentConnection(connection.id, { enabled: !connection.enabled }); await refresh(); })}>{connection.enabled ? "Pausar" : "Ativar"}</button>
                <button type="button" className="danger" onClick={() => void run(async () => { await removePaymentConnection(connection.id); await refresh(); setMessage({ tone: "success", text: "Conexão removida." }); })}>Remover</button>
              </div>
            </article>
          ))}
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
        {providerKey !== "manual_pix" && <div className="payment-secret-note">As chaves secretas não serão gravadas no aplicativo nem no banco acessível ao cliente. A configuração de credenciais será enviada ao backend seguro.</div>}
        {message && <div className={`payment-message ${message.tone}`} role="status">{message.text}</div>}
        <button type="button" className="primary-button" disabled={busy || !schoolId} onClick={addConnection}>{busy ? "Aguarde..." : "Adicionar conexão"}</button>
      </div>
    </section>
  );
}
