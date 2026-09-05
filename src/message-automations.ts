import { cloud } from "./cloud";

export type MessageProviderKey = "meta" | "robot_webhook";
export type MessageEventKey =
  | "invoice_before_due"
  | "invoice_due"
  | "invoice_overdue"
  | "payment_confirmed"
  | "negotiation_due"
  | "absence"
  | "notice";
export type RecipientMode = "auto" | "student" | "guardian";

export type MessageChannel = {
  id: string;
  schoolId: string;
  providerKey: MessageProviderKey;
  displayName: string;
  enabled: boolean;
  credentialsConfigured: boolean;
  publicConfig: Record<string, unknown>;
};

export type MessageTemplate = {
  id: string;
  schoolId: string;
  name: string;
  eventKey: MessageEventKey;
  body: string;
  enabled: boolean;
  metaTemplateName: string;
  metaLanguage: string;
  metaParameterKeys: string[];
};

export type MessageAutomation = {
  id: string;
  schoolId: string;
  channelId: string;
  templateId: string;
  eventKey: MessageEventKey;
  enabled: boolean;
  daysOffset: number;
  sendHour: number;
  recipientMode: RecipientMode;
};

export type OutboxItem = {
  id: string;
  recipientPhone: string;
  messageBody: string;
  status: "queued" | "sending" | "sent" | "failed" | "skipped";
  scheduledFor: string;
  sentAt: string | null;
  attempts: number;
  lastError: string;
  providerMessageId: string;
};

function fail(message: string, cause?: unknown): never {
  if (cause instanceof Error) throw new Error(`${message}: ${cause.message}`);
  throw new Error(message);
}

function mapChannel(row: any): MessageChannel {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    providerKey: row.provider_key as MessageProviderKey,
    displayName: String(row.display_name),
    enabled: Boolean(row.enabled),
    credentialsConfigured: Boolean(row.credentials_configured),
    publicConfig: row.public_config && typeof row.public_config === "object" ? row.public_config : {},
  };
}

function mapTemplate(row: any): MessageTemplate {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    name: String(row.name),
    eventKey: row.event_key as MessageEventKey,
    body: String(row.body),
    enabled: Boolean(row.enabled),
    metaTemplateName: String(row.meta_template_name ?? ""),
    metaLanguage: String(row.meta_language ?? "pt_BR"),
    metaParameterKeys: Array.isArray(row.meta_parameter_keys) ? row.meta_parameter_keys.map(String) : [],
  };
}

function mapAutomation(row: any): MessageAutomation {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    channelId: String(row.channel_id),
    templateId: String(row.template_id),
    eventKey: row.event_key as MessageEventKey,
    enabled: Boolean(row.enabled),
    daysOffset: Number(row.days_offset ?? 0),
    sendHour: Number(row.send_hour ?? 8),
    recipientMode: row.recipient_mode as RecipientMode,
  };
}

export async function listMessageChannels(schoolId: string) {
  const { data, error } = await cloud.from("message_channels").select("*").eq("school_id", schoolId).order("created_at");
  if (error) fail("Não foi possível carregar os canais de mensagem", error);
  return (data ?? []).map(mapChannel);
}

export async function createMessageChannel(schoolId: string, providerKey: MessageProviderKey, displayName: string) {
  const name = displayName.trim().slice(0, 120);
  if (name.length < 2) throw new Error("Informe um nome para o canal.");
  const { data, error } = await cloud.from("message_channels").insert({
    school_id: schoolId,
    provider_key: providerKey,
    display_name: name,
    enabled: true,
    credentials_configured: false,
    public_config: providerKey === "meta" ? { graphVersion: "v23.0" } : {},
  }).select("*").single();
  if (error) fail("Não foi possível criar o canal", error);
  return mapChannel(data);
}

export async function updateMessageChannel(id: string, patch: Partial<Pick<MessageChannel, "displayName" | "enabled" | "publicConfig">>) {
  const payload: Record<string, unknown> = {};
  if (patch.displayName !== undefined) payload.display_name = patch.displayName.trim().slice(0, 120);
  if (patch.enabled !== undefined) payload.enabled = patch.enabled;
  if (patch.publicConfig !== undefined) payload.public_config = patch.publicConfig;
  const { data, error } = await cloud.from("message_channels").update(payload).eq("id", id).select("*").single();
  if (error) fail("Não foi possível atualizar o canal", error);
  return mapChannel(data);
}

async function credentialAction(channelId: string, action: "configure" | "clear" | "delete", credentials?: Record<string, string>) {
  const { data, error } = await cloud.functions.invoke("message-credentials", { body: { channelId, action, credentials } });
  if (error) fail("O backend seguro recusou a configuração do canal", error);
  if (data?.error) throw new Error(String(data.error));
}

export async function configureMessageCredentials(channelId: string, credentials: Record<string, string>) {
  await credentialAction(channelId, "configure", credentials);
}

export async function removeMessageChannel(channelId: string) {
  await credentialAction(channelId, "delete");
}

export async function listMessageTemplates(schoolId: string) {
  const { data, error } = await cloud.from("message_templates").select("*").eq("school_id", schoolId).order("created_at");
  if (error) fail("Não foi possível carregar os modelos de mensagem", error);
  return (data ?? []).map(mapTemplate);
}

export async function createMessageTemplate(schoolId: string, input: Omit<MessageTemplate, "id" | "schoolId">) {
  const { data, error } = await cloud.from("message_templates").insert({
    school_id: schoolId,
    name: input.name.trim().slice(0, 120),
    event_key: input.eventKey,
    body: input.body.trim().slice(0, 4000),
    enabled: input.enabled,
    meta_template_name: input.metaTemplateName.trim().slice(0, 512) || null,
    meta_language: input.metaLanguage.trim().slice(0, 30) || "pt_BR",
    meta_parameter_keys: input.metaParameterKeys.slice(0, 20),
  }).select("*").single();
  if (error) fail("Não foi possível criar o modelo de mensagem", error);
  return mapTemplate(data);
}

export async function updateMessageTemplate(id: string, patch: Partial<Omit<MessageTemplate, "id" | "schoolId">>) {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name.trim().slice(0, 120);
  if (patch.eventKey !== undefined) payload.event_key = patch.eventKey;
  if (patch.body !== undefined) payload.body = patch.body.trim().slice(0, 4000);
  if (patch.enabled !== undefined) payload.enabled = patch.enabled;
  if (patch.metaTemplateName !== undefined) payload.meta_template_name = patch.metaTemplateName.trim().slice(0, 512) || null;
  if (patch.metaLanguage !== undefined) payload.meta_language = patch.metaLanguage.trim().slice(0, 30) || "pt_BR";
  if (patch.metaParameterKeys !== undefined) payload.meta_parameter_keys = patch.metaParameterKeys.slice(0, 20);
  const { data, error } = await cloud.from("message_templates").update(payload).eq("id", id).select("*").single();
  if (error) fail("Não foi possível atualizar o modelo", error);
  return mapTemplate(data);
}

export async function listMessageAutomations(schoolId: string) {
  const { data, error } = await cloud.from("message_automations").select("*").eq("school_id", schoolId).order("created_at");
  if (error) fail("Não foi possível carregar as automações", error);
  return (data ?? []).map(mapAutomation);
}

export async function createMessageAutomation(schoolId: string, input: Omit<MessageAutomation, "id" | "schoolId">) {
  const { data, error } = await cloud.from("message_automations").insert({
    school_id: schoolId,
    channel_id: input.channelId,
    template_id: input.templateId,
    event_key: input.eventKey,
    enabled: input.enabled,
    days_offset: Math.max(-365, Math.min(365, Math.trunc(input.daysOffset))),
    send_hour: Math.max(0, Math.min(23, Math.trunc(input.sendHour))),
    recipient_mode: input.recipientMode,
  }).select("*").single();
  if (error) fail("Não foi possível criar a automação", error);
  return mapAutomation(data);
}

export async function updateMessageAutomation(id: string, patch: Partial<Omit<MessageAutomation, "id" | "schoolId">>) {
  const payload: Record<string, unknown> = {};
  if (patch.channelId !== undefined) payload.channel_id = patch.channelId;
  if (patch.templateId !== undefined) payload.template_id = patch.templateId;
  if (patch.eventKey !== undefined) payload.event_key = patch.eventKey;
  if (patch.enabled !== undefined) payload.enabled = patch.enabled;
  if (patch.daysOffset !== undefined) payload.days_offset = Math.max(-365, Math.min(365, Math.trunc(patch.daysOffset)));
  if (patch.sendHour !== undefined) payload.send_hour = Math.max(0, Math.min(23, Math.trunc(patch.sendHour)));
  if (patch.recipientMode !== undefined) payload.recipient_mode = patch.recipientMode;
  const { data, error } = await cloud.from("message_automations").update(payload).eq("id", id).select("*").single();
  if (error) fail("Não foi possível atualizar a automação", error);
  return mapAutomation(data);
}

export async function removeMessageAutomation(id: string) {
  const { error } = await cloud.from("message_automations").delete().eq("id", id);
  if (error) fail("Não foi possível excluir a automação", error);
}

export async function listRecentOutbox(schoolId: string, limit = 50): Promise<OutboxItem[]> {
  const { data, error } = await cloud.from("message_outbox").select("id,recipient_phone,message_body,status,scheduled_for,sent_at,attempts,last_error,provider_message_id").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(limit);
  if (error) fail("Não foi possível carregar o histórico de mensagens", error);
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    recipientPhone: String(row.recipient_phone ?? ""),
    messageBody: String(row.message_body ?? ""),
    status: row.status,
    scheduledFor: String(row.scheduled_for ?? ""),
    sentAt: row.sent_at ? String(row.sent_at) : null,
    attempts: Number(row.attempts ?? 0),
    lastError: String(row.last_error ?? ""),
    providerMessageId: String(row.provider_message_id ?? ""),
  }));
}
