import { cloud } from "./cloud";

export type BillingProfile = {
  payerName: string;
  email: string;
  documentNumber: string;
  phone: string;
  postalCode: string;
  streetName: string;
  streetNumber: string;
  neighborhood: string;
  city: string;
  state: string;
};

export type ChargeDelivery = {
  attempted: boolean;
  status: string;
  recipient: string;
  message: string;
  attempts: number;
  sentAt: string | null;
  providerMessageId: string;
  error: string;
};

export type GeneratedCharge = {
  provider: string;
  providerChargeId: string;
  pixCopyPaste: string;
  pixQrCodeBase64: string;
  boletoUrl: string;
  paymentUrl: string;
  publicPaymentUrl: string;
  amount: number;
  reused: boolean;
  environment: "sandbox" | "production";
  delivery: ChargeDelivery | null;
  metadata: Record<string, unknown>;
};

export type CancelledProviderCharge = {
  providerChargeCancelled: boolean;
  invoiceCancelled: boolean;
  result: Record<string, unknown>;
};

export const emptyBillingProfile = (): BillingProfile => ({
  payerName: "", email: "", documentNumber: "", phone: "", postalCode: "", streetName: "",
  streetNumber: "", neighborhood: "", city: "", state: "",
});

export async function getBillingProfile(schoolId: string, studentId: string): Promise<BillingProfile> {
  const { data, error } = await cloud.from("student_billing_profiles").select("*")
    .eq("school_id", schoolId).eq("student_id", studentId).maybeSingle();
  if (error) throw new Error(`Não foi possível carregar os dados de faturamento: ${error.message}`);
  if (!data) return emptyBillingProfile();
  return {
    payerName: String(data.payer_name ?? ""),
    email: String(data.email ?? ""),
    documentNumber: String(data.document_number ?? ""),
    phone: String(data.phone ?? ""),
    postalCode: String(data.postal_code ?? ""),
    streetName: String(data.street_name ?? ""),
    streetNumber: String(data.street_number ?? ""),
    neighborhood: String(data.neighborhood ?? ""),
    city: String(data.city ?? ""),
    state: String(data.state ?? ""),
  };
}

export async function saveBillingProfile(schoolId: string, studentId: string, profile: BillingProfile) {
  const { error } = await cloud.from("student_billing_profiles").upsert({
    school_id: schoolId,
    student_id: studentId,
    payer_name: profile.payerName.trim() || null,
    email: profile.email.trim() || null,
    document_number: profile.documentNumber.replace(/\D/g, "") || null,
    phone: profile.phone.replace(/\D/g, "") || null,
    postal_code: profile.postalCode.replace(/\D/g, "") || null,
    street_name: profile.streetName.trim() || null,
    street_number: profile.streetNumber.trim() || null,
    neighborhood: profile.neighborhood.trim() || null,
    city: profile.city.trim() || null,
    state: profile.state.trim().toUpperCase() || null,
  }, { onConflict: "school_id,student_id" });
  if (error) throw new Error(`Não foi possível salvar os dados de faturamento: ${error.message}`);
}

async function getEdgeFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : String(error ?? "Erro desconhecido ao chamar o servidor.");
  const candidate = error as { context?: unknown };
  const context = candidate?.context as any;
  const response = context instanceof Response
    ? context
    : context?.response instanceof Response
      ? context.response
      : null;

  if (response) {
    try {
      const payload = await response.clone().json();
      const detail = payload?.error ?? payload?.message ?? payload?.detail;
      if (detail) return String(detail);
    } catch {
      try {
        const raw = (await response.clone().text()).trim();
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            const detail = parsed?.error ?? parsed?.message ?? parsed?.detail;
            if (detail) return String(detail);
          } catch {
            if (raw.length <= 500) return raw;
          }
        }
      } catch {
        // Mantém a mensagem de fallback abaixo.
      }
    }
  }

  if (/Edge Function returned a non-2xx status code/i.test(fallback)) {
    return "O servidor recusou a operação financeira. A cobrança não foi alterada localmente. Confira a conexão do provedor e tente novamente; quando o provedor informar o motivo, ele aparecerá aqui.";
  }
  return fallback;
}

export async function generateProviderCharge(input: {
  invoiceId: string;
  method: "pix" | "boleto";
  connectionId?: string;
  billingProfile?: BillingProfile;
}): Promise<GeneratedCharge> {
  const { data, error } = await cloud.functions.invoke("payment-charge-link", {
    body: {
      invoiceId: input.invoiceId,
      method: input.method,
      connectionId: input.connectionId || undefined,
      billingProfile: input.billingProfile ? {
        payer_name: input.billingProfile.payerName,
        email: input.billingProfile.email,
        document_number: input.billingProfile.documentNumber,
        phone: input.billingProfile.phone,
        postal_code: input.billingProfile.postalCode,
        street_name: input.billingProfile.streetName,
        street_number: input.billingProfile.streetNumber,
        neighborhood: input.billingProfile.neighborhood,
        city: input.billingProfile.city,
        state: input.billingProfile.state,
      } : undefined,
    },
  });
  if (error) throw new Error(await getEdgeFunctionErrorMessage(error));
  if (data?.error) throw new Error(String(data.error));
  return {
    provider: String(data?.provider ?? ""),
    providerChargeId: String(data?.providerChargeId ?? ""),
    pixCopyPaste: String(data?.pixCopyPaste ?? ""),
    pixQrCodeBase64: String(data?.pixQrCodeBase64 ?? ""),
    boletoUrl: String(data?.boletoUrl ?? ""),
    paymentUrl: String(data?.paymentUrl ?? ""),
    publicPaymentUrl: String(data?.publicPaymentUrl ?? ""),
    amount: Number(data?.amount ?? 0),
    reused: Boolean(data?.reused),
    environment: data?.environment === "sandbox" ? "sandbox" : "production",
    delivery: data?.delivery && typeof data.delivery === "object" ? {
      attempted: Boolean(data.delivery.attempted),
      status: String(data.delivery.status ?? ""),
      recipient: String(data.delivery.recipient ?? ""),
      message: String(data.delivery.message ?? ""),
      attempts: Number(data.delivery.attempts ?? 0),
      sentAt: data.delivery.sentAt ? String(data.delivery.sentAt) : null,
      providerMessageId: String(data.delivery.providerMessageId ?? ""),
      error: String(data.delivery.error ?? ""),
    } : null,
    metadata: data?.metadata && typeof data.metadata === "object" ? data.metadata : {},
  };
}

export async function cancelProviderCharge(input: {
  invoiceId: string;
  cancelInvoice: boolean;
  reason?: string;
}): Promise<CancelledProviderCharge> {
  const { data, error } = await cloud.functions.invoke("payment-charge-cancel", {
    body: {
      invoiceId: input.invoiceId,
      cancelInvoice: input.cancelInvoice,
      reason: input.reason?.trim() || undefined,
    },
  });
  if (error) throw new Error(await getEdgeFunctionErrorMessage(error));
  if (data?.error) throw new Error(String(data.error));
  return {
    providerChargeCancelled: Boolean(data?.providerChargeCancelled),
    invoiceCancelled: Boolean(data?.invoiceCancelled),
    result: data?.result && typeof data.result === "object" ? data.result : {},
  };
}
