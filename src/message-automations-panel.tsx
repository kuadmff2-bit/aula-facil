import { useEffect, useMemo, useRef, useState } from "react";
import {
  configureMessageCredentials,
  createMessageAutomation,
  createMessageChannel,
  createMessageTemplate,
  listMessageAutomations,
  listMessageChannels,
  listMessageTemplates,
  listRecentOutbox,
  removeMessageAutomation,
  removeMessageChannel,
  updateMessageAutomation,
  updateMessageChannel,
  updateMessageTemplate,
  type MessageAutomation,
  type MessageChannel,
  type MessageEventKey,
  type MessageProviderKey,
  type MessageTemplate,
  type OutboxItem,
  type RecipientMode,
} from "./message-automations";
import { getCloudAuthState, onCloudAuthChange } from "./cloud";
import { RobotConnectBox } from "./robot-connect";
import "./message-automations-panel.css";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";
const CLOUD_SCHOOL_CHANGE_EVENT = "aulafacil:cloud-school-change";

const EVENT_LABELS: Record<MessageEventKey, string> = {
  invoice_before_due: "Lembrar antes do vencimento",
  invoice_due: "Avisar no dia do vencimento",
  invoice_overdue: "Avisar mensalidade atrasada",
  payment_confirmed: "Confirmar pagamento recebido",
  negotiation_due: "Lembrar parcela de acordo",
  absence: "Avisar falta do aluno",
  notice: "Enviar novo aviso",
};

const EVENT_DEFAULTS: Record<MessageEventKey, { body: string; offset: number }> = {
  invoice_before_due: { body: "Olá, {destinatario}! {contexto}, no valor de {valor}, vence em {vencimento}. Caso já tenha pago, desconsidere esta mensagem.", offset: 1 },
  invoice_due: { body: "Olá, {destinatario}! {contexto}, no valor de {valor}, vence hoje ({vencimento}).", offset: 0 },
  invoice_overdue: { body: "Olá, {destinatario}. {contexto}, referente a {referencia}, está em atraso. Valor atualizado: {valor}.", offset: 1 },
  payment_confirmed: { body: "Olá, {destinatario}! Confirmamos {contexto}, no valor de {valor}, referente a {referencia}. Obrigado!", offset: 0 },
  negotiation_due: { body: "Olá, {destinatario}! {contexto}, no valor de {valor}, vence em {vencimento}.", offset: 1 },
  absence: { body: "Olá, {destinatario}. Registramos {contexto} em {data}. Em caso de dúvida, entre em contato com a escola.", offset: 0 },
  notice: { body: "{escola}: {titulo}\n{aviso}", offset: 0 },
};

const META_PARAMETER_SUGGESTIONS: Record<MessageEventKey, string[]> = {
  invoice_before_due: ["destinatario", "contexto", "valor", "vencimento"],
  invoice_due: ["destinatario", "contexto", "valor", "vencimento"],
  invoice_overdue: ["destinatario", "contexto", "referencia", "valor"],
  payment_confirmed: ["destinatario", "contexto", "valor", "referencia"],
  negotiation_due: ["destinatario", "contexto", "valor", "vencimento"],
  absence: ["destinatario", "contexto", "data"],
  notice: ["escola", "titulo", "aviso"],
};

type Message = { tone: "success" | "warning" | "danger"; text: string } | null;

function maskPhone(value: string) {
  if (value.length < 6) return value;
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function statusLabel(status: OutboxItem["status"]) {
  return status === "sent" ? "Enviada" : status === "queued" ? "Na fila" : status === "sending" ? "Enviando" : status === "failed" ? "Falhou" : "Ignorada";
}

export function MessageAutomationsPanel() {
  const [schoolId, setSchoolId] = useState(() => localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "");
  const [cloudEmail, setCloudEmail] = useState("");
  const [channels, setChannels] = useState<MessageChannel[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [automations, setAutomations] = useState<MessageAutomation[]>([]);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const [channelProvider, setChannelProvider] = useState<MessageProviderKey>("robot_webhook");
  const [channelName, setChannelName] = useState("Robô AulaFácil");
  const [credentialChannelId, setCredentialChannelId] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const credentialBoxRef = useRef<HTMLDivElement | null>(null);

  const [eventKey, setEventKey] = useState<MessageEventKey>("invoice_before_due");
  const [templateName, setTemplateName] = useState("Mensalidade vence amanhã");
  const [templateBody, setTemplateBody] = useState(EVENT_DEFAULTS.invoice_before_due.body);
  const [metaTemplateName, setMetaTemplateName] = useState("");
  const [metaLanguage, setMetaLanguage] = useState("pt_BR");
  const [metaParameterKeys, setMetaParameterKeys] = useState(META_PARAMETER_SUGGESTIONS.invoice_before_due.join(", "));

  const [automationChannelId, setAutomationChannelId] = useState("");
  const [automationTemplateId, setAutomationTemplateId] = useState("");
  const [daysOffset, setDaysOffset] = useState(1);
  const [sendHour, setSendHour] = useState(8);
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("auto");

  const credentialChannel = useMemo(() => channels.find((item) => item.id === credentialChannelId) ?? null, [channels, credentialChannelId]);
  const selectedTemplate = useMemo(() => templates.find((item) => item.id === automationTemplateId) ?? null, [templates, automationTemplateId]);
  const channelProviderAlreadyAdded = channels.some((item) => item.providerKey === channelProvider);

  useEffect(() => {
    if (!credentialChannelId) return;
    const frame = window.requestAnimationFrame(() => credentialBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => window.cancelAnimationFrame(frame);
  }, [credentialChannelId]);

  const refresh = async (targetSchoolId = schoolId) => {
    if (!targetSchoolId) {
      setChannels([]); setTemplates([]); setAutomations([]); setOutbox([]);
      return;
    }
    const [nextChannels, nextTemplates, nextAutomations, nextOutbox] = await Promise.all([
      listMessageChannels(targetSchoolId),
      listMessageTemplates(targetSchoolId),
      listMessageAutomations(targetSchoolId),
      listRecentOutbox(targetSchoolId, 30),
    ]);
    setChannels(nextChannels);
    setTemplates(nextTemplates);
    setAutomations(nextAutomations);
    setOutbox(nextOutbox);
    setAutomationChannelId((current) => nextChannels.some((item) => item.id === current) ? current : nextChannels[0]?.id ?? "");
    setAutomationTemplateId((current) => nextTemplates.some((item) => item.id === current) ? current : nextTemplates[0]?.id ?? "");
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
    const sync = () => {
      const next = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
      setSchoolId(next);
      setCredentialChannelId("");
      setCredentials({});
      void refresh(next).catch((error) => setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível carregar as automações." }));
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(CLOUD_SCHOOL_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CLOUD_SCHOOL_CHANGE_EVENT, sync);
    };
  }, []);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try { await operation(); }
    catch (error) { setMessage({ tone: "danger", text: error instanceof Error ? error.message : "A operação não pôde ser concluída." }); }
    finally { setBusy(false); }
  };

  const changeEvent = (next: MessageEventKey) => {
    setEventKey(next);
    setTemplateName(EVENT_LABELS[next]);
    setTemplateBody(EVENT_DEFAULTS[next].body);
    setDaysOffset(EVENT_DEFAULTS[next].offset);
    setMetaParameterKeys(META_PARAMETER_SUGGESTIONS[next].join(", "));
  };

  const addChannel = () => void run(async () => {
    if (!schoolId) throw new Error("Selecione uma instituição no Conta e sincronização.");
    const channel = await createMessageChannel(schoolId, channelProvider, channelName || (channelProvider === "meta" ? "WhatsApp oficial" : "Robô externo"));
    await refresh();
    setCredentialChannelId(channel.id);
    setCredentials({});
    setMessage({ tone: "warning", text: channelProvider === "meta" ? "Canal criado. Agora conclua a configuração abaixo." : "Canal criado. Clique em Conectar WhatsApp para gerar o QR Code." });
  });

  const saveCredentials = () => {
    if (!credentialChannel) return;
    void run(async () => {
      if (credentialChannel.providerKey === "meta") {
        if (!credentials.access_token?.trim() || !credentials.phone_number_id?.trim()) throw new Error("Informe Access Token e Phone Number ID da Meta.");
        await configureMessageCredentials(credentialChannel.id, {
          access_token: credentials.access_token.trim(),
          phone_number_id: credentials.phone_number_id.trim(),
          business_account_id: credentials.business_account_id?.trim() ?? "",
        });
      } else {
        throw new Error("Use o botão Conectar WhatsApp no canal Robô AulaFácil.");
      }
      await updateMessageChannel(credentialChannel.id, { enabled: true });
      setCredentials({});
      setCredentialChannelId("");
      await refresh();
      setMessage({ tone: "success", text: "Conexão protegida no servidor. O aplicativo não consegue exibir o segredo novamente." });
    });
  };

  const addTemplate = () => void run(async () => {
    if (!schoolId) throw new Error("Selecione uma instituição no Conta e sincronização.");
    if (!templateBody.trim()) throw new Error("Escreva a mensagem do modelo.");
    const created = await createMessageTemplate(schoolId, {
      name: templateName.trim() || EVENT_LABELS[eventKey],
      eventKey,
      body: templateBody,
      enabled: true,
      metaTemplateName,
      metaLanguage,
      metaParameterKeys: metaParameterKeys.split(",").map((item) => item.trim()).filter(Boolean),
    });
    await refresh();
    setAutomationTemplateId(created.id);
    setMessage({ tone: metaTemplateName.trim() ? "success" : "warning", text: metaTemplateName.trim() ? "Modelo criado e associado ao template oficial da Meta." : "Modelo criado. Para envio automático pela Meta, informe depois o nome de um template aprovado." });
  });

  const addAutomation = () => void run(async () => {
    if (!schoolId || !automationChannelId || !automationTemplateId) throw new Error("Escolha canal e modelo.");
    const channel = channels.find((item) => item.id === automationChannelId);
    const template = templates.find((item) => item.id === automationTemplateId);
    if (!channel || !template) throw new Error("Canal ou modelo inválido.");
    if (!channel.credentialsConfigured) throw new Error("Configure as credenciais do canal antes de criar a automação.");
    if (channel.providerKey === "meta" && !template.metaTemplateName) throw new Error("Para envio automático pela Meta, o modelo precisa ter o nome de um template aprovado.");
    await createMessageAutomation(schoolId, {
      channelId: automationChannelId,
      templateId: automationTemplateId,
      eventKey: template.eventKey,
      enabled: true,
      daysOffset,
      sendHour,
      recipientMode,
    });
    await refresh();
    setMessage({
      tone: "success",
      text: recipientMode === "auto"
        ? "Automação ativada. Menores de 18 anos recebem pelo responsável; alunos com 18 anos ou mais recebem diretamente, com texto adaptado à idade."
        : "Automação ativada no servidor. Ela continuará funcionando com o AulaFácil fechado.",
    });
  });

  const metaReady = channels.some((channel) => channel.enabled && channel.credentialsConfigured && channel.providerKey === "meta");
  const robotReady = channels.some((channel) => channel.enabled && channel.credentialsConfigured && channel.providerKey === "robot_webhook");
  const channelReady = metaReady || robotReady;
  const templateReady = templates.some((template) => template.enabled && (robotReady || Boolean(template.metaTemplateName)));
  const automationReady = automations.some((automation) => automation.enabled);
  const automationNextStep = !cloudEmail
    ? "Entre no Conta e sincronização."
    : !schoolId
      ? "Sua conta já está conectada. Crie ou selecione a instituição no bloco Conta e sincronização acima."
      : !channels.length
        ? "Adicione a Meta ou o Robô AulaFácil."
        : !channelReady
          ? "Conecte o canal escolhido."
          : !templates.length
            ? "Crie um modelo de mensagem."
            : !templateReady
              ? "Na Meta, associe um template aprovado. No Robô AulaFácil, o texto é enviado diretamente."
              : !automationReady
                ? "Escolha canal, modelo, horário e destinatário e clique em Ligar automação."
                : "Automação ativa. O servidor continuará processando mensagens mesmo com o computador desligado.";

  return (
    <section className="card message-automation-card">
      <div className="message-heading">
        <div><span className="message-eyebrow">AUTOMAÇÕES</span><h2>Mensagens automáticas pelo WhatsApp</h2><p>Escolha o que deve ser enviado e quando. Depois de ativado, o servidor trabalha sozinho mesmo com o computador desligado.</p></div>
      </div>

      <div className="automation-setup-guide" aria-label="Passos para ativar mensagens automáticas">
        <div className={schoolId ? "done" : cloudEmail ? "current" : ""}><b>1</b><span><strong>Conta</strong><small>{schoolId ? "Instituição pronta" : cloudEmail ? "Escolher instituição" : "Entrar na conta"}</small></span></div>
        <div className={channelReady ? "done" : schoolId ? "current" : ""}><b>2</b><span><strong>WhatsApp</strong><small>{channelReady ? "Conectado" : "Ler QR Code"}</small></span></div>
        <div className={templateReady ? "done" : channelReady ? "current" : ""}><b>3</b><span><strong>Mensagem</strong><small>{templateReady ? "Pronta" : "Escrever texto"}</small></span></div>
        <div className={automationReady ? "done" : templateReady ? "current" : ""}><b>4</b><span><strong>Quando enviar</strong><small>{automationReady ? "Funcionando" : "Dia e horário"}</small></span></div>
      </div>
      <div className={automationReady ? "automation-readiness success" : "automation-readiness info"}><strong>{automationReady ? "Pronto" : "Próximo passo"}</strong><span>{automationNextStep}</span></div>

      {!schoolId && <div className="message-box warning">{cloudEmail ? <>A conta <strong>{cloudEmail}</strong> está conectada. O que falta é criar ou selecionar a instituição no Conta e sincronização acima.</> : <>Entre no Conta e sincronização e selecione a instituição para configurar automações.</>}</div>}
      {schoolId && !automationReady && <div className="message-box success">Instituição Cloud reconhecida. Continue pelas etapas destacadas acima.</div>}
      {message && <div className={`message-box ${message.tone}`} role="status">{message.text}</div>}

      <div className="message-section">
        <h3>1. Conectar o WhatsApp</h3>
        {channels.length > 0 && <div className="message-channel-grid">{channels.map((channel) => (
          <article key={channel.id} className="message-channel-item">
            <div><strong>{channel.displayName}</strong><span>{channel.providerKey === "meta" ? "Meta WhatsApp Cloud API" : "Robô AulaFácil"}</span></div>
            <div className="message-tags">
              {channel.providerKey === "meta" ? (
                <span>{!channel.enabled ? "Pausado" : channel.credentialsConfigured ? "Ativo" : "Aguardando configuração"}</span>
              ) : (
                <span>{!channel.enabled ? "Pausado" : String(channel.publicConfig.robotStatus ?? "disconnected") === "connected" ? "Conectado" : ["starting", "qr", "connecting"].includes(String(channel.publicConfig.robotStatus ?? "")) ? "Preparando conexão" : ["error", "auth_failure"].includes(String(channel.publicConfig.robotStatus ?? "")) ? "Erro de conexão" : "Desconectado"}</span>
              )}
            </div>
            <div className="message-actions">
              {channel.providerKey === "meta" ? <button type="button" onClick={() => { setCredentialChannelId(channel.id); setCredentials({}); }}>{channel.credentialsConfigured ? "Trocar conexão" : "Configurar"}</button> : <RobotConnectBox channel={channel} disabled={busy} onChanged={() => refresh()} />}
              <button type="button" onClick={() => void run(async () => { await updateMessageChannel(channel.id, { enabled: !channel.enabled }); await refresh(); })}>{channel.enabled ? "Pausar" : "Ativar"}</button>
              <button type="button" className="danger" onClick={() => void run(async () => { await removeMessageChannel(channel.id); await refresh(); setMessage({ tone: "success", text: "Canal e segredo associado removidos." }); })}>Remover</button>
            </div>
          </article>
        ))}</div>}

        <div className="message-form-grid">
          <label><span>Tipo</span><select value={channelProvider} onChange={(e) => { const value = e.target.value as MessageProviderKey; setChannelProvider(value); setChannelName(value === "meta" ? "WhatsApp oficial da Meta" : "Robô AulaFácil"); }}><option value="robot_webhook">Robô AulaFácil · QR Code (mais simples)</option><option value="meta">WhatsApp oficial da Meta (avançado)</option></select></label>
          <label><span>Nome</span><input value={channelName} maxLength={120} onChange={(e) => setChannelName(e.target.value)} /></label>
        </div>
        <button type="button" className="secondary-button" disabled={busy || !schoolId || channelProviderAlreadyAdded} onClick={addChannel}>{channelProviderAlreadyAdded ? "Canal já adicionado" : "Adicionar canal"}</button>

        {credentialChannel && credentialChannel.providerKey === "meta" && <div ref={credentialBoxRef} className="message-credential-box"><div><strong>Conexão protegida · {credentialChannel.displayName}</strong><p>As credenciais são protegidas no servidor e não entram no backup local.</p></div>{credentialChannel.providerKey === "meta" ? <div className="message-form-grid"><label><span>Access Token *</span><input type="password" autoComplete="off" value={credentials.access_token ?? ""} onChange={(e) => setCredentials((current) => ({ ...current, access_token: e.target.value }))} /></label><label><span>Phone Number ID *</span><input type="password" autoComplete="off" value={credentials.phone_number_id ?? ""} onChange={(e) => setCredentials((current) => ({ ...current, phone_number_id: e.target.value }))} /></label><label><span>Business Account ID</span><input type="password" autoComplete="off" value={credentials.business_account_id ?? ""} onChange={(e) => setCredentials((current) => ({ ...current, business_account_id: e.target.value }))} /></label></div> : <div className="message-form-grid"><label><span>URL HTTPS do robô *</span><input type="password" autoComplete="off" value={credentials.webhook_url ?? ""} onChange={(e) => setCredentials((current) => ({ ...current, webhook_url: e.target.value }))} /></label><label><span>Token do robô</span><input type="password" autoComplete="off" value={credentials.auth_token ?? ""} onChange={(e) => setCredentials((current) => ({ ...current, auth_token: e.target.value }))} /></label></div>}<div className="message-actions"><button className="secondary-button" type="button" onClick={() => { setCredentials({}); setCredentialChannelId(""); }}>Cancelar</button><button className="primary-button" type="button" disabled={busy} onClick={saveCredentials}>Salvar conexão</button></div></div>}
      </div>

      <div className="message-section">
        <h3>2. Escolher a mensagem</h3>
        <div className="message-form-grid">
          <label><span>Evento</span><select value={eventKey} onChange={(e) => changeEvent(e.target.value as MessageEventKey)}>{Object.entries(EVENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label><span>Nome para identificar</span><input maxLength={120} value={templateName} onChange={(e) => setTemplateName(e.target.value)} /></label>
          <label className="message-span-2"><span>Mensagem que será enviada</span><textarea rows={4} maxLength={4000} value={templateBody} onChange={(e) => setTemplateBody(e.target.value)} /></label>
          {(channelProvider === "meta" || metaReady) && <details className="message-advanced message-span-2"><summary>Configuração avançada da Meta</summary><div className="message-form-grid"><label><span>Nome do template aprovado</span><input placeholder="ex.: mensalidade_vence_amanha" value={metaTemplateName} onChange={(e) => setMetaTemplateName(e.target.value)} /></label><label><span>Idioma</span><input value={metaLanguage} maxLength={30} onChange={(e) => setMetaLanguage(e.target.value)} /></label><label className="message-span-2"><span>Campos do template, na ordem</span><input value={metaParameterKeys} onChange={(e) => setMetaParameterKeys(e.target.value)} /><small>Esta parte só é necessária para quem usa a API oficial da Meta.</small></label></div></details>}
        </div>
        <div className="message-variable-help">Variáveis disponíveis: <code>{'{destinatario}'}</code> <code>{'{contexto}'}</code> <code>{'{aluno}'}</code> <code>{'{responsavel}'}</code> <code>{'{valor}'}</code> <code>{'{vencimento}'}</code> <code>{'{referencia}'}</code> <code>{'{escola}'}</code> <code>{'{data}'}</code> <code>{'{link_pagamento}'}</code>. <strong>{'{destinatario}'}</strong> e <strong>{'{contexto}'}</strong> mudam automaticamente conforme a idade.</div>
        <button className="secondary-button" type="button" disabled={busy || !schoolId} onClick={addTemplate}>Salvar novo modelo</button>

        {templates.length > 0 && <div className="message-template-list">{templates.map((template) => <article key={template.id}><div><strong>{template.name}</strong><span>{EVENT_LABELS[template.eventKey]} · {template.metaTemplateName ? `Meta: ${template.metaTemplateName}` : "sem template Meta"}</span></div><button type="button" onClick={() => void run(async () => { await updateMessageTemplate(template.id, { enabled: !template.enabled }); await refresh(); })}>{template.enabled ? "Desativar" : "Ativar"}</button></article>)}</div>}
      </div>

      <div className="message-section">
        <h3>3. Escolher quando enviar</h3>
        <div className="message-form-grid">
          <label><span>Canal</span><select value={automationChannelId} onChange={(e) => setAutomationChannelId(e.target.value)}><option value="">Escolha</option>{channels.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
          <label><span>Modelo</span><select value={automationTemplateId} onChange={(e) => { const id = e.target.value; setAutomationTemplateId(id); const template = templates.find((item) => item.id === id); if (template) setDaysOffset(EVENT_DEFAULTS[template.eventKey].offset); }}><option value="">Escolha</option>{templates.filter((item) => item.enabled).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>Quantos dias antes/depois</span><input type="number" min={0} max={365} value={daysOffset} onChange={(e) => setDaysOffset(Math.max(0, Math.min(365, Math.trunc(Number(e.target.value) || 0))))} /></label>
          <label><span>Hora de envio</span><select value={sendHour} onChange={(e) => setSendHour(Number(e.target.value))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label>
          <label><span>Destinatário</span><select value={recipientMode} onChange={(e) => setRecipientMode(e.target.value as RecipientMode)}><option value="auto">Automático pela idade (recomendado)</option><option value="guardian">Sempre responsável</option><option value="student">Sempre aluno</option></select></label>
          <label><span>O que dispara</span><input readOnly value={selectedTemplate ? EVENT_LABELS[selectedTemplate.eventKey] : "Escolha um modelo"} /></label>
          {recipientMode === "auto" && <div className="message-age-rule message-span-2"><strong>Como o destinatário é escolhido</strong><span>Menores recebem pelo responsável; a partir de 18 anos, pelo telefone do aluno. Se o contato correto não existir, o envio é ignorado com segurança.</span></div>}
        </div>
        <button className="primary-button" type="button" disabled={busy || !schoolId} onClick={addAutomation}>Ligar automação</button>

        {automations.length > 0 && <div className="automation-list">{automations.map((automation) => { const channel = channels.find((item) => item.id === automation.channelId); const template = templates.find((item) => item.id === automation.templateId); return <article key={automation.id}><div><strong>{template?.name ?? EVENT_LABELS[automation.eventKey]}</strong><span>{channel?.displayName ?? "Canal"} · {String(automation.sendHour).padStart(2, "0")}:00 · {automation.recipientMode === "auto" ? "por idade: menor → responsável, 18+ → aluno" : automation.recipientMode === "guardian" ? "responsável" : "aluno"}</span></div><div className="message-actions"><button type="button" onClick={() => void run(async () => { await updateMessageAutomation(automation.id, { enabled: !automation.enabled }); await refresh(); })}>{automation.enabled ? "Pausar" : "Ativar"}</button><button className="danger" type="button" onClick={() => void run(async () => { await removeMessageAutomation(automation.id); await refresh(); })}>Excluir</button></div></article>; })}</div>}
      </div>

      <div className="message-section">
        <div className="message-history-title"><div><h3>Histórico recente</h3><p>O AulaFácil registra envio, falha e tentativa sem mostrar os tokens usados.</p></div><button type="button" className="secondary-button" disabled={busy || !schoolId} onClick={() => void refresh()}>Atualizar</button></div>
        {outbox.length ? <div className="message-history">{outbox.map((item) => <article key={item.id}><span className={`message-history-status ${item.status}`}>{statusLabel(item.status)}</span><div><strong>{maskPhone(item.recipientPhone)}</strong><p>{item.messageBody}</p><small>{new Date(item.sentAt || item.scheduledFor).toLocaleString("pt-BR")}{item.lastError ? ` · ${item.lastError}` : ""}</small></div></article>)}</div> : <div className="message-empty">Nenhuma mensagem processada ainda.</div>}
      </div>
    </section>
  );
}