export type PaymentCapability = "pix" | "boleto" | "card";

export type PaymentProviderKey =
  | "manual_pix"
  | "asaas"
  | "mercado_pago"
  | "efi"
  | "pagarme"
  | "stripe"
  | "custom";

export type PaymentProviderDefinition = {
  key: PaymentProviderKey;
  name: string;
  description: string;
  capabilities: PaymentCapability[];
  credentialFields: Array<{
    key: string;
    label: string;
    secret: boolean;
    required: boolean;
    placeholder?: string;
  }>;
  notes?: string;
};

// A interface da versão 0.3.0 expõe apenas conectores que possuem fluxo de
// geração/conciliação implementado no backend. Novos provedores só devem entrar
// nesta lista depois que credenciais, cobrança, idempotência e conciliação
// estiverem implementados e testados de ponta a ponta.
export const PAYMENT_PROVIDERS: PaymentProviderDefinition[] = [
  {
    key: "manual_pix",
    name: "Pix manual",
    description: "Recebimento por chave Pix da própria escola, sem integração bancária automática.",
    capabilities: ["pix"],
    credentialFields: [],
    notes: "A baixa do pagamento é manual, pois não há conciliação bancária automática.",
  },
  {
    key: "asaas",
    name: "Asaas",
    description: "Cobranças e recebimentos integrados pelo Asaas.",
    capabilities: ["pix", "boleto"],
    credentialFields: [
      { key: "api_key", label: "API Key", secret: true, required: true },
    ],
    notes: "Pix e boleto são gerados pelo backend seguro. Cartão não é coletado diretamente pelo AulaFácil.",
  },
  {
    key: "mercado_pago",
    name: "Mercado Pago",
    description: "Cobranças Pix e boleto usando a API do Mercado Pago.",
    capabilities: ["pix", "boleto"],
    credentialFields: [
      { key: "access_token", label: "Access Token", secret: true, required: true },
    ],
    notes: "A disponibilidade efetiva de cada meio também depende da conta do Mercado Pago.",
  },
  {
    key: "pagarme",
    name: "Pagar.me",
    description: "Cobranças Pix e boleto via Pagar.me.",
    capabilities: ["pix", "boleto"],
    credentialFields: [
      { key: "secret_key", label: "Secret Key", secret: true, required: true },
    ],
    notes: "A cobrança é criada no servidor e conciliada sem expor a chave secreta ao aplicativo.",
  },
];

export function getPaymentProvider(key: string) {
  return PAYMENT_PROVIDERS.find((provider) => provider.key === key) ?? null;
}

export function providerSupports(key: string, capability: PaymentCapability) {
  return Boolean(getPaymentProvider(key)?.capabilities.includes(capability));
}
