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

export const PAYMENT_PROVIDERS: PaymentProviderDefinition[] = [
  {
    key: "manual_pix",
    name: "Pix manual",
    description: "Recebimento por chave Pix da própria escola, sem integração bancária automática.",
    capabilities: ["pix"],
    credentialFields: [],
    notes: "A baixa do pagamento é manual, pois não há webhook bancário.",
  },
  {
    key: "asaas",
    name: "Asaas",
    description: "Cobranças e recebimentos integrados pelo Asaas.",
    capabilities: ["pix", "boleto", "card"],
    credentialFields: [
      { key: "api_key", label: "API Key", secret: true, required: true },
    ],
  },
  {
    key: "mercado_pago",
    name: "Mercado Pago",
    description: "Checkout e cobranças usando a API do Mercado Pago.",
    capabilities: ["pix", "boleto", "card"],
    credentialFields: [
      { key: "access_token", label: "Access Token", secret: true, required: true },
    ],
    notes: "A disponibilidade dos meios de pagamento depende da conta e da região.",
  },
  {
    key: "efi",
    name: "Efí Bank",
    description: "Integração com APIs Pix e Cobranças da Efí.",
    capabilities: ["pix", "boleto", "card"],
    credentialFields: [
      { key: "client_id", label: "Client ID", secret: true, required: true },
      { key: "client_secret", label: "Client Secret", secret: true, required: true },
      { key: "certificate", label: "Certificado / referência do certificado", secret: true, required: false },
    ],
    notes: "Alguns produtos da API Pix exigem certificado mTLS; a configuração será mantida somente no servidor.",
  },
  {
    key: "pagarme",
    name: "Pagar.me",
    description: "Pedidos e cobranças via Pagar.me.",
    capabilities: ["pix", "boleto", "card"],
    credentialFields: [
      { key: "secret_key", label: "Secret Key", secret: true, required: true },
    ],
  },
  {
    key: "stripe",
    name: "Stripe",
    description: "Pagamentos por Stripe quando a conta da instituição tiver os meios habilitados.",
    capabilities: ["pix", "boleto", "card"],
    credentialFields: [
      { key: "secret_key", label: "Secret Key", secret: true, required: true },
    ],
    notes: "Pix pode depender de disponibilidade/convite na conta; o AulaFácil verifica capacidades antes de usar.",
  },
];

export function getPaymentProvider(key: string) {
  return PAYMENT_PROVIDERS.find((provider) => provider.key === key) ?? null;
}

export function providerSupports(key: string, capability: PaymentCapability) {
  return Boolean(getPaymentProvider(key)?.capabilities.includes(capability));
}
