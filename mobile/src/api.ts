import "react-native-url-polyfill/auto";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://fkafrirbitwlsbjpqtcf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_tf34VWh3ujn6wzB3y4W83A_JyA6L_sa";

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: secureStorage,
  },
});

export type MobileSchool = {
  id: string;
  name: string;
  role: string;
  primaryColor: string;
};

export type MobileStudent = {
  id: string;
  name: string;
  phone: string;
  guardianName: string;
  guardianPhone: string;
  enrollmentStatus: string;
};

export type MobileInvoice = {
  id: string;
  studentId: string;
  reference: string;
  dueDate: string;
  amount: number;
  status: string;
  provider: string;
  providerChargeId: string;
  pixCopyPaste: string;
  boletoUrl: string;
};

export type MobilePayment = {
  id: string;
  studentId: string;
  invoiceId: string;
  amountReceived: number;
  method: string;
  status: string;
  paidAt: string;
  receiptNumber: string;
};

export type ChargeResult = {
  provider: string;
  providerChargeId: string;
  pixCopyPaste: string;
  pixQrCodeBase64: string;
  boletoUrl: string;
  paymentUrl: string;
  publicPaymentUrl: string;
  amount: number;
  environment: "sandbox" | "production";
  reused: boolean;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function signIn(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized || password.length < 8) throw new Error("Informe e-mail e senha válidos.");
  const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
  if (error) throw new Error(error.message);
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new Error(error.message);
}

export async function listSchools(): Promise<MobileSchool[]> {
  const { data, error } = await supabase
    .from("school_members")
    .select("role,active,school:schools(id,name,primary_color)")
    .eq("active", true);
  if (error) throw new Error(`Não foi possível carregar as instituições: ${error.message}`);
  return (data ?? []).flatMap((row: any) => {
    const school = Array.isArray(row.school) ? row.school[0] : row.school;
    if (!school?.id) return [];
    return [{
      id: String(school.id),
      name: text(school.name) || "Instituição",
      role: text(row.role),
      primaryColor: text(school.primary_color) || "#1649b8",
    }];
  });
}

export async function loadStudents(schoolId: string): Promise<MobileStudent[]> {
  const { data, error } = await supabase
    .from("students")
    .select("id,name,phone,guardian_name,guardian_phone,enrollment_status,active,deleted_at")
    .eq("school_id", schoolId)
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(`Não foi possível carregar os alunos: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    name: text(row.name),
    phone: text(row.phone),
    guardianName: text(row.guardian_name),
    guardianPhone: text(row.guardian_phone),
    enrollmentStatus: text(row.enrollment_status) || (row.active ? "active" : "paused"),
  }));
}

export async function loadInvoices(schoolId: string): Promise<MobileInvoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id,student_id,reference,due_date,amount,status,provider,provider_charge_id,pix_copy_paste,boleto_url,deleted_at")
    .eq("school_id", schoolId)
    .is("deleted_at", null)
    .order("due_date", { ascending: false })
    .limit(300);
  if (error) throw new Error(`Não foi possível carregar as mensalidades: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    studentId: String(row.student_id),
    reference: text(row.reference),
    dueDate: text(row.due_date),
    amount: number(row.amount),
    status: text(row.status),
    provider: text(row.provider),
    providerChargeId: text(row.provider_charge_id),
    pixCopyPaste: text(row.pix_copy_paste),
    boletoUrl: text(row.boleto_url),
  }));
}

export async function loadPayments(schoolId: string): Promise<MobilePayment[]> {
  const { data, error } = await supabase
    .from("payments")
    .select("id,student_id,invoice_id,amount_received,payment_method,status,paid_at,receipt_number")
    .eq("school_id", schoolId)
    .order("paid_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Não foi possível carregar os pagamentos: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    studentId: String(row.student_id),
    invoiceId: text(row.invoice_id),
    amountReceived: number(row.amount_received),
    method: text(row.payment_method),
    status: text(row.status),
    paidAt: text(row.paid_at),
    receiptNumber: text(row.receipt_number),
  }));
}

export async function generateCharge(invoiceId: string, method: "pix" | "boleto"): Promise<ChargeResult> {
  const { data, error } = await supabase.functions.invoke("payment-charge-link", {
    body: { invoiceId, method },
  });
  if (error) {
    const context = (error as any)?.context;
    if (context && typeof context.json === "function") {
      try {
        const payload = await context.clone().json();
        throw new Error(String(payload?.error ?? payload?.message ?? error.message));
      } catch (nested) {
        if (nested instanceof Error && nested.message !== error.message) throw nested;
      }
    }
    throw new Error(error.message || "Não foi possível gerar a cobrança.");
  }
  if (data?.error) throw new Error(String(data.error));
  return {
    provider: text(data?.provider),
    providerChargeId: text(data?.providerChargeId),
    pixCopyPaste: text(data?.pixCopyPaste),
    pixQrCodeBase64: text(data?.pixQrCodeBase64),
    boletoUrl: text(data?.boletoUrl),
    paymentUrl: text(data?.paymentUrl),
    publicPaymentUrl: text(data?.publicPaymentUrl),
    amount: number(data?.amount),
    environment: data?.environment === "sandbox" ? "sandbox" : "production",
    reused: Boolean(data?.reused),
  };
}

export async function confirmManualPayment(input: {
  schoolId: string;
  invoiceId: string;
  method: string;
  discount?: number;
}) {
  const { data, error } = await supabase.rpc("confirm_manual_invoice_payment", {
    target_school: input.schoolId,
    target_invoice: input.invoiceId,
    target_method: input.method,
    target_discount: Math.max(0, Number(input.discount) || 0),
    target_notes: "Registrado pelo AulaFácil Mobile",
  });
  if (error) throw new Error(`Não foi possível confirmar o pagamento: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.payment_id) throw new Error("O servidor não retornou o pagamento confirmado.");
  return row;
}
