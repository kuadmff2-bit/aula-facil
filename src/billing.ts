import { cloud } from "./cloud";

export type BillingProfile = {
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

export type GeneratedCharge = {
  provider: string;
  providerChargeId: string;
  pixCopyPaste: string;
  pixQrCodeBase64: string;
  boletoUrl: string;
  paymentUrl: string;
  amount: number;
  reused: boolean;
  metadata: Record<string, unknown>;
};

export const emptyBillingProfile = (): BillingProfile => ({
  email: "", documentNumber: "", phone: "", postalCode: "", streetName: "",
  streetNumber: "", neighborhood: "", city: "", state: "",
});

export async function getBillingProfile(schoolId: string, studentId: string): Promise<BillingProfile> {
  const { data, error } = await cloud.from("student_billing_profiles").select("*")
    .eq("school_id", schoolId).eq("student_id", studentId).maybeSingle();
  if (error) throw new Error(`Não foi possível carregar os dados de faturamento: ${error.message}`);
  if (!data) return emptyBillingProfile();
  return {
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

export async function generateProviderCharge(input: {
  invoiceId: string;
  method: "pix" | "boleto";
  connectionId?: string;
  billingProfile?: BillingProfile;
}): Promise<GeneratedCharge> {
  const { data, error } = await cloud.functions.invoke("payment-charge", {
    body: {
      invoiceId: input.invoiceId,
      method: input.method,
      connectionId: input.connectionId || undefined,
      billingProfile: input.billingProfile ? {
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
  if (error) throw new Error(`Não foi possível gerar a cobrança: ${error.message}`);
  if (data?.error) throw new Error(String(data.error));
  return {
    provider: String(data?.provider ?? ""),
    providerChargeId: String(data?.providerChargeId ?? ""),
    pixCopyPaste: String(data?.pixCopyPaste ?? ""),
    pixQrCodeBase64: String(data?.pixQrCodeBase64 ?? ""),
    boletoUrl: String(data?.boletoUrl ?? ""),
    paymentUrl: String(data?.paymentUrl ?? ""),
    amount: Number(data?.amount ?? 0),
    reused: Boolean(data?.reused),
    metadata: data?.metadata && typeof data.metadata === "object" ? data.metadata : {},
  };
}
