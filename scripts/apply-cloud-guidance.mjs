import fs from "node:fs";

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${count}`);
  return text.replace(from, to);
}

function edit(path, mutator) {
  const original = fs.readFileSync(path, "utf8");
  const usesCrlf = original.includes("\r\n");
  const before = original.replace(/\r\n/g, "\n");
  const afterLf = mutator(before);
  if (afterLf === before) throw new Error(`Nenhuma alteração aplicada em ${path}`);
  fs.writeFileSync(path, usesCrlf ? afterLf.replace(/\n/g, "\r\n") : afterLf);
}

edit("src/payment-connections-panel.tsx", (source) => {
  let text = source;
  text = replaceOnce(text,
`import { PAYMENT_PROVIDERS, type PaymentProviderKey } from "./payment-providers";
import "./payment-connections-panel.css";`,
`import { PAYMENT_PROVIDERS, type PaymentProviderKey } from "./payment-providers";
import { getCloudAuthState, onCloudAuthChange } from "./cloud";
import "./payment-connections-panel.css";`,
    "import de autenticação em pagamentos");

  text = replaceOnce(text,
`  const [schoolId, setSchoolId] = useState(() => localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "");
  const [connections, setConnections] = useState<PaymentConnection[]>([]);`,
`  const [schoolId, setSchoolId] = useState(() => localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "");
  const [cloudEmail, setCloudEmail] = useState("");
  const [connections, setConnections] = useState<PaymentConnection[]>([]);`,
    "estado de autenticação em pagamentos");

  text = replaceOnce(text,
`  useEffect(() => {
    const syncSchool = () => {`,
`  useEffect(() => {
    let active = true;
    void getCloudAuthState()
      .then((state) => { if (active) setCloudEmail(state.user?.email ?? ""); })
      .catch(() => { if (active) setCloudEmail(""); });
    const unsubscribe = onCloudAuthChange((state) => setCloudEmail(state.user?.email ?? ""));
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const syncSchool = () => {`,
    "escuta da sessão em pagamentos");

  text = replaceOnce(text,
`  return (
    <section className="card payment-connections-card">`,
`  const readyConnections = connections.filter((connection) => connection.enabled && (connection.providerKey === "manual_pix" || connection.credentialsConfigured));
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
    <section className="card payment-connections-card">`,
    "estado de prontidão em pagamentos");

  text = replaceOnce(text,
`      {!schoolId && (
        <div className="payment-message warning">Conecte uma conta e selecione a instituição no AulaFácil Cloud para habilitar integrações bancárias.</div>
      )}
`,
`      <div className="payment-setup-guide" aria-label="Como funcionam as cobranças">
        <div className={schoolId ? "done" : cloudEmail ? "current" : ""}><b>1</b><span><strong>Cloud</strong><small>{schoolId ? "Instituição selecionada" : cloudEmail ? "Conta conectada; falta a instituição" : "Entrar na conta"}</small></span></div>
        <div className={connections.length ? "done" : schoolId ? "current" : ""}><b>2</b><span><strong>Recebimento</strong><small>Pix manual ou provedor como Asaas</small></span></div>
        <div className={readyConnections.length ? "done" : connections.length ? "current" : ""}><b>3</b><span><strong>Configuração</strong><small>Credenciais e meios habilitados</small></span></div>
        <div className={readyConnections.length ? "current" : ""}><b>4</b><span><strong>Cobrar</strong><small>Financeiro → mensalidade → Pix/Boleto</small></span></div>
      </div>
      <div className={`payment-readiness ${schoolId ? "info" : "warning"}`}><strong>Próximo passo</strong><span>{paymentNextStep}</span></div>

      {!schoolId && (
        <div className="payment-message warning">{cloudEmail ? <>A conta <strong>{cloudEmail}</strong> já está conectada. Falta criar ou selecionar a instituição no AulaFácil Cloud acima.</> : <>Entre no AulaFácil Cloud e selecione a instituição para habilitar integrações bancárias.</>}</div>
      )}
      {schoolId && <div className="payment-message success">Instituição Cloud selecionada. As mensalidades continuam sendo controladas no AulaFácil; Pix e boleto online são gerados somente quando você escolher uma conexão pronta.</div>}
`,
    "guia de pagamentos");
  return text;
});

edit("src/message-automations-panel.tsx", (source) => {
  let text = source;
  text = replaceOnce(text,
`  type RecipientMode,
} from "./message-automations";
import "./message-automations-panel.css";`,
`  type RecipientMode,
} from "./message-automations";
import { getCloudAuthState, onCloudAuthChange } from "./cloud";
import "./message-automations-panel.css";`,
    "import de autenticação em automações");

  text = replaceOnce(text,
`  const [schoolId, setSchoolId] = useState(() => localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "");
  const [channels, setChannels] = useState<MessageChannel[]>([]);`,
`  const [schoolId, setSchoolId] = useState(() => localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "");
  const [cloudEmail, setCloudEmail] = useState("");
  const [channels, setChannels] = useState<MessageChannel[]>([]);`,
    "estado da sessão em automações");

  text = replaceOnce(text,
`  useEffect(() => {
    const sync = () => {`,
`  useEffect(() => {
    let active = true;
    void getCloudAuthState()
      .then((state) => { if (active) setCloudEmail(state.user?.email ?? ""); })
      .catch(() => { if (active) setCloudEmail(""); });
    const unsubscribe = onCloudAuthChange((state) => setCloudEmail(state.user?.email ?? ""));
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const sync = () => {`,
    "escuta da sessão em automações");

  text = replaceOnce(text,
`  return (
    <section className="card message-automation-card">`,
`  const channelReady = channels.some((channel) => channel.enabled && channel.credentialsConfigured && channel.providerKey === "meta");
  const templateReady = templates.some((template) => template.enabled && Boolean(template.metaTemplateName));
  const automationReady = automations.some((automation) => automation.enabled);
  const automationNextStep = !cloudEmail
    ? "Entre no AulaFácil Cloud."
    : !schoolId
      ? "Sua conta já está conectada. Crie ou selecione a instituição no bloco AulaFácil Cloud acima."
      : !channels.length
        ? "Adicione o canal WhatsApp oficial da Meta."
        : !channelReady
          ? "Configure as credenciais do canal e deixe-o ativo."
          : !templates.length
            ? "Crie um modelo de mensagem."
            : !templateReady
              ? "Associe o modelo ao nome de um template aprovado pela Meta."
              : !automationReady
                ? "Escolha canal, modelo, horário e destinatário e clique em Ativar automação."
                : "Automação ativa. O servidor continuará processando mensagens mesmo com o computador desligado.";

  return (
    <section className="card message-automation-card">`,
    "estado de prontidão das automações");

  text = replaceOnce(text,
`      {!schoolId && <div className="message-box warning">Conecte uma conta e selecione a instituição no AulaFácil Cloud para configurar automações.</div>}
      {message && <div className={\`message-box ${message.tone}\`} role="status">{message.text}</div>}
`,
`      <div className="automation-setup-guide" aria-label="Etapas para ativar mensagens automáticas">
        <div className={schoolId ? "done" : cloudEmail ? "current" : ""}><b>1</b><span><strong>Instituição</strong><small>{schoolId ? "Selecionada" : cloudEmail ? "Conta pronta" : "Entrar no Cloud"}</small></span></div>
        <div className={channels.length ? "done" : schoolId ? "current" : ""}><b>2</b><span><strong>Canal</strong><small>WhatsApp Meta</small></span></div>
        <div className={channelReady ? "done" : channels.length ? "current" : ""}><b>3</b><span><strong>Credenciais</strong><small>Cofre seguro</small></span></div>
        <div className={templateReady ? "done" : channelReady ? "current" : ""}><b>4</b><span><strong>Mensagem</strong><small>Template aprovado</small></span></div>
        <div className={automationReady ? "done" : templateReady ? "current" : ""}><b>5</b><span><strong>Regra</strong><small>Idade, dia e horário</small></span></div>
        <div className={automationReady ? "done" : ""}><b>6</b><span><strong>Ativa</strong><small>Servidor 24h</small></span></div>
      </div>
      <div className={`automation-readiness ${automationReady ? "success" : "info"}`}><strong>{automationReady ? "Pronto" : "Próximo passo"}</strong><span>{automationNextStep}</span></div>

      {!schoolId && <div className="message-box warning">{cloudEmail ? <>A conta <strong>{cloudEmail}</strong> está conectada. O que falta é criar ou selecionar a instituição no AulaFácil Cloud acima.</> : <>Entre no AulaFácil Cloud e selecione a instituição para configurar automações.</>}</div>}
      {schoolId && !automationReady && <div className="message-box success">Instituição Cloud reconhecida. Continue pelas etapas destacadas acima.</div>}
      {message && <div className={\`message-box ${message.tone}\`} role="status">{message.text}</div>}
`,
    "guia das automações");
  return text;
});

edit("src/cloud-sync-panel.tsx", (source) => {
  let text = source;
  text = replaceOnce(text,
`  const state = copy[status];
  const needsRecovery = (status === "conflict" || status === "not_linked") && schoolId;`,
`  const state = schoolId
    ? copy[status]
    : { title: "Selecione a instituição do Cloud", text: "A conta pode estar conectada, mas este computador ainda não tem uma instituição selecionada para sincronizar." };
  const needsRecovery = (status === "conflict" || status === "not_linked") && schoolId;`,
    "mensagem de sincronização sem instituição");
  text = replaceOnce(text,
`        <div className={\`cloud-sync-badge ${status}\`}>{navigator.onLine ? status.replaceAll("_", " ") : "offline"}</div>`,
`        <div className={\`cloud-sync-badge ${schoolId ? status : "not_linked"}\`}>{!navigator.onLine ? "offline" : schoolId ? status.replaceAll("_", " ") : "instituição pendente"}</div>`,
    "badge da sincronização");
  text = replaceOnce(text,
`      <div className="cloud-sync-explainer">`,
`      {!schoolId && <div className="cloud-sync-warning">Use o bloco “AulaFácil Cloud” acima para criar ou selecionar a instituição. Depois disso, clique em “Sincronizar agora”.</div>}

      <div className="cloud-sync-explainer">`,
    "instrução de instituição no sync");
  return text;
});

function appendCss(path, marker, css) {
  edit(path, (source) => {
    if (source.includes(marker)) throw new Error(`${path}: marcador já existe`);
    return `${source.trimEnd()}\n\n/* ${marker} */\n${css.trim()}\n`;
  });
}

appendCss("src/payment-connections-panel.css", "PAYMENT-GUIDE-2026", `
.payment-setup-guide{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:2px 0 12px}.payment-setup-guide>div{display:grid;grid-template-columns:30px minmax(0,1fr);gap:8px;align-items:center;padding:9px 10px;border:1px solid var(--border);border-radius:11px;background:var(--surface-soft);min-width:0}.payment-setup-guide b{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:var(--surface);border:1px solid var(--border);font-size:.78rem}.payment-setup-guide span{display:grid;gap:1px;min-width:0}.payment-setup-guide strong{font-size:.78rem}.payment-setup-guide small{font-size:.69rem;color:var(--text-muted);line-height:1.25;overflow-wrap:anywhere}.payment-setup-guide .done b{color:#047857;background:rgba(5,150,105,.1);border-color:rgba(5,150,105,.25)}.payment-setup-guide .current{border-color:color-mix(in srgb,var(--primary) 38%,var(--border));background:color-mix(in srgb,var(--primary) 6%,var(--surface))}.payment-setup-guide .current b{color:var(--primary);border-color:color-mix(in srgb,var(--primary) 35%,var(--border))}.payment-readiness{display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border-radius:11px;border:1px solid var(--border);background:var(--surface-soft);font-size:.8rem;line-height:1.4;min-width:0}.payment-readiness strong{white-space:nowrap}.payment-readiness span{min-width:0;overflow-wrap:anywhere;color:var(--text-muted)}.payment-readiness.warning{border-color:rgba(217,119,6,.25);background:rgba(217,119,6,.07)}.payment-add-box>.primary-button{width:auto;justify-self:start}@media(max-width:980px){.payment-setup-guide{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.payment-setup-guide{grid-template-columns:1fr}.payment-readiness{display:grid}.payment-add-box>.primary-button{width:100%}}
`);

appendCss("src/message-automations-panel.css", "AUTOMATION-GUIDE-2026", `
.automation-setup-guide{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}.automation-setup-guide>div{display:grid;grid-template-columns:26px minmax(0,1fr);gap:7px;align-items:center;padding:8px;border:1px solid var(--border);border-radius:10px;background:var(--surface-soft);min-width:0}.automation-setup-guide b{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;border:1px solid var(--border);background:var(--surface);font-size:.72rem}.automation-setup-guide span{display:grid;gap:1px;min-width:0}.automation-setup-guide strong{font-size:.72rem}.automation-setup-guide small{font-size:.64rem;color:var(--text-muted);line-height:1.2;overflow-wrap:anywhere}.automation-setup-guide .done b{color:#047857;background:rgba(5,150,105,.1);border-color:rgba(5,150,105,.25)}.automation-setup-guide .current{border-color:color-mix(in srgb,var(--primary) 38%,var(--border));background:color-mix(in srgb,var(--primary) 6%,var(--surface))}.automation-setup-guide .current b{color:var(--primary);border-color:color-mix(in srgb,var(--primary) 35%,var(--border))}.automation-readiness{display:flex;align-items:flex-start;gap:9px;padding:10px 12px;border:1px solid var(--border);border-radius:11px;background:var(--surface-soft);font-size:.8rem;line-height:1.4;min-width:0}.automation-readiness strong{white-space:nowrap}.automation-readiness span{min-width:0;overflow-wrap:anywhere;color:var(--text-muted)}.automation-readiness.success{border-color:rgba(5,150,105,.25);background:rgba(5,150,105,.07)}.message-section>.primary-button,.message-section>.secondary-button{width:auto;justify-self:start}@media(max-width:1050px){.automation-setup-guide{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:680px){.automation-setup-guide{grid-template-columns:1fr 1fr}.automation-readiness{display:grid}.message-section>.primary-button,.message-section>.secondary-button{width:100%}}@media(max-width:430px){.automation-setup-guide{grid-template-columns:1fr}}
`);

console.log("Orientação de Cloud, pagamentos e automações aplicada.");
