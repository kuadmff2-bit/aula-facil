import { cloud } from "./cloud";
import {
  getPaymentProvider,
  providerSupports,
  type PaymentCapability,
  type PaymentProviderKey,
} from "./payment-providers";

export type PaymentConnection = {
  id: string;
  schoolId: string;
  providerKey: PaymentProviderKey | string;
  displayName: string;
  environment: "sandbox" | "production";
  enabled: boolean;
  supportsPix: boolean;
  supportsBoleto: boolean;
  supportsCard: boolean;
  defaultForPix: boolean;
  defaultForBoleto: boolean;
  defaultForCard: boolean;
  priority: number;
  credentialsConfigured: boolean;
  publicConfig: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PaymentConnectionInput = {
  providerKey: PaymentProviderKey | string;
  displayName: string;
  environment?: "sandbox" | "production";
  enabled?: boolean;
  defaultForPix?: boolean;
  defaultForBoleto?: boolean;
  defaultForCard?: boolean;
  priority?: number;
  publicConfig?: Record<string, unknown>;
};

function fail(message: string, cause?: unknown): never {
  if (cause instanceof Error) throw new Error(`${message}: ${cause.message}`);
  throw new Error(message);
}

function mapRow(row: any): PaymentConnection {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    providerKey: String(row.provider_key),
    displayName: String(row.display_name),
    environment: row.environment === "sandbox" ? "sandbox" : "production",
    enabled: Boolean(row.enabled),
    supportsPix: Boolean(row.supports_pix),
    supportsBoleto: Boolean(row.supports_boleto),
    supportsCard: Boolean(row.supports_card),
    defaultForPix: Boolean(row.default_for_pix),
    defaultForBoleto: Boolean(row.default_for_boleto),
    defaultForCard: Boolean(row.default_for_card),
    priority: Number(row.priority ?? 0),
    credentialsConfigured: Boolean(row.credentials_configured),
    publicConfig: row.public_config && typeof row.public_config === "object" ? row.public_config : {},
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function connectionCapabilities(providerKey: string) {
  const provider = getPaymentProvider(providerKey);
  return {
    supports_pix: Boolean(provider?.capabilities.includes("pix")),
    supports_boleto: Boolean(provider?.capabilities.includes("boleto")),
    supports_card: Boolean(provider?.capabilities.includes("card")),
  };
}

export async function listPaymentConnections(schoolId: string): Promise<PaymentConnection[]> {
  const { data, error } = await cloud
    .from("payment_connections")
    .select("*")
    .eq("school_id", schoolId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) fail("Não foi possível carregar as conexões de pagamento", error);
  return (data ?? []).map(mapRow);
}

export async function createPaymentConnection(schoolId: string, input: PaymentConnectionInput) {
  const provider = getPaymentProvider(input.providerKey);
  if (!provider && input.providerKey !== "custom") throw new Error("Provedor de pagamento desconhecido.");

  const displayName = input.displayName.trim().slice(0, 120);
  if (displayName.length < 2) throw new Error("Informe um nome para identificar esta conexão.");

  const capabilities = connectionCapabilities(input.providerKey);
  const { data, error } = await cloud
    .from("payment_connections")
    .insert({
      school_id: schoolId,
      provider_key: input.providerKey,
      display_name: displayName,
      environment: input.environment ?? "production",
      enabled: input.enabled ?? true,
      ...capabilities,
      default_for_pix: Boolean(input.defaultForPix && capabilities.supports_pix),
      default_for_boleto: Boolean(input.defaultForBoleto && capabilities.supports_boleto),
      default_for_card: Boolean(input.defaultForCard && capabilities.supports_card),
      priority: Math.max(0, Math.min(100, Math.trunc(input.priority ?? 50))),
      credentials_configured: input.providerKey === "manual_pix",
      public_config: input.publicConfig ?? {},
    })
    .select("*")
    .single();

  if (error) fail("Não foi possível adicionar a conexão de pagamento", error);
  return mapRow(data);
}

export async function updatePaymentConnection(
  connectionId: string,
  patch: Partial<Omit<PaymentConnectionInput, "providerKey">>,
) {
  const payload: Record<string, unknown> = {};
  if (patch.displayName !== undefined) payload.display_name = patch.displayName.trim().slice(0, 120);
  if (patch.environment !== undefined) payload.environment = patch.environment;
  if (patch.enabled !== undefined) payload.enabled = patch.enabled;
  if (patch.priority !== undefined) payload.priority = Math.max(0, Math.min(100, Math.trunc(patch.priority)));
  if (patch.publicConfig !== undefined) payload.public_config = patch.publicConfig;
  if (patch.defaultForPix !== undefined) payload.default_for_pix = patch.defaultForPix;
  if (patch.defaultForBoleto !== undefined) payload.default_for_boleto = patch.defaultForBoleto;
  if (patch.defaultForCard !== undefined) payload.default_for_card = patch.defaultForCard;

  const { data, error } = await cloud
    .from("payment_connections")
    .update(payload)
    .eq("id", connectionId)
    .select("*")
    .single();

  if (error) fail("Não foi possível atualizar a conexão de pagamento", error);
  return mapRow(data);
}

export async function removePaymentConnection(connectionId: string) {
  const { error } = await cloud.from("payment_connections").delete().eq("id", connectionId);
  if (error) fail("Não foi possível remover a conexão de pagamento", error);
}

export function connectionSupports(connection: PaymentConnection, capability: PaymentCapability) {
  if (!providerSupports(connection.providerKey, capability) && connection.providerKey !== "custom") return false;
  if (capability === "pix") return connection.supportsPix;
  if (capability === "boleto") return connection.supportsBoleto;
  return connection.supportsCard;
}

export function selectPaymentConnection(
  connections: PaymentConnection[],
  capability: PaymentCapability,
): PaymentConnection | null {
  const usable = connections
    .filter((connection) => connection.enabled && connectionSupports(connection, capability))
    .filter((connection) => connection.providerKey === "manual_pix" || connection.credentialsConfigured)
    .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));

  const explicit = usable.find((connection) => {
    if (capability === "pix") return connection.defaultForPix;
    if (capability === "boleto") return connection.defaultForBoleto;
    return connection.defaultForCard;
  });

  return explicit ?? usable[0] ?? null;
}
