import { cloud } from "./cloud";

export type DebtNegotiation = {
  id: string;
  studentId: string;
  originalTotal: number;
  lateChargesTotal: number;
  grossTotal: number;
  discountType: "fixed" | "percent";
  discountValue: number;
  discountAmount: number;
  negotiatedTotal: number;
  downPayment: number;
  downPaymentPaidAt: string | null;
  downPaymentPaymentId: string | null;
  installmentCount: number;
  firstDueDate: string;
  status: "draft" | "active" | "paid" | "cancelled" | "defaulted";
  notes: string;
  createdAt: string;
};

export type NegotiationInstallment = {
  id: string;
  negotiationId: string;
  number: number;
  dueDate: string;
  amount: number;
  status: "pending" | "paid" | "overdue" | "cancelled";
  paidAt: string | null;
};

export type NegotiationPaymentReceipt = {
  id: string;
  amountReceived: number;
  paidAt: string | null;
  receiptNumber: string | null;
  paymentMethod: string;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadPayment(paymentId: string): Promise<NegotiationPaymentReceipt> {
  const { data, error } = await cloud.from("payments")
    .select("id,amount_received,paid_at,receipt_number,payment_method")
    .eq("id", paymentId).single();
  if (error) throw new Error(`O pagamento foi processado, mas o recibo não pôde ser carregado: ${error.message}`);
  return {
    id: String(data.id), amountReceived: numberValue(data.amount_received), paidAt: data.paid_at ? String(data.paid_at) : null,
    receiptNumber: data.receipt_number ? String(data.receipt_number) : null, paymentMethod: String(data.payment_method ?? "manual"),
  };
}

export async function createDebtNegotiation(input: {
  schoolId: string;
  studentId: string;
  invoiceIds: string[];
  discountType: "fixed" | "percent";
  discountValue: number;
  downPayment: number;
  installmentCount: number;
  firstDueDate: string;
  notes?: string;
}) {
  const { data, error } = await cloud.rpc("create_debt_negotiation", {
    target_school: input.schoolId,
    target_student: input.studentId,
    target_invoice_ids: input.invoiceIds,
    target_discount_type: input.discountType,
    target_discount_value: input.discountValue,
    target_down_payment: input.downPayment,
    target_installment_count: input.installmentCount,
    target_first_due_date: input.firstDueDate,
    target_notes: input.notes?.trim() || null,
  });
  if (error) throw new Error(`Não foi possível criar o acordo: ${error.message}`);
  return String(data);
}

export async function listDebtNegotiations(schoolId: string): Promise<DebtNegotiation[]> {
  const { data, error } = await cloud.from("debt_negotiations").select("*")
    .eq("school_id", schoolId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Não foi possível carregar os acordos: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: String(row.id), studentId: String(row.student_id),
    originalTotal: numberValue(row.original_total), lateChargesTotal: numberValue(row.late_charges_total),
    grossTotal: numberValue(row.gross_total), discountType: row.discount_type === "percent" ? "percent" : "fixed",
    discountValue: numberValue(row.discount_value), discountAmount: numberValue(row.discount_amount),
    negotiatedTotal: numberValue(row.negotiated_total), downPayment: numberValue(row.down_payment),
    downPaymentPaidAt: row.down_payment_paid_at ? String(row.down_payment_paid_at) : null,
    downPaymentPaymentId: row.down_payment_payment_id ? String(row.down_payment_payment_id) : null,
    installmentCount: Number(row.installment_count ?? 0), firstDueDate: String(row.first_due_date ?? ""),
    status: row.status, notes: String(row.notes ?? ""), createdAt: String(row.created_at ?? ""),
  }));
}

export async function listNegotiationInstallments(schoolId: string, negotiationId: string): Promise<NegotiationInstallment[]> {
  const { data, error } = await cloud.from("negotiation_installments").select("*")
    .eq("school_id", schoolId).eq("negotiation_id", negotiationId).order("installment_number", { ascending: true });
  if (error) throw new Error(`Não foi possível carregar as parcelas: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: String(row.id), negotiationId: String(row.negotiation_id), number: Number(row.installment_number ?? 0),
    dueDate: String(row.due_date ?? ""), amount: numberValue(row.amount), status: row.status,
    paidAt: row.paid_at ? String(row.paid_at) : null,
  }));
}

export async function confirmNegotiationDownPayment(schoolId: string, negotiationId: string, method = "manual") {
  const { data, error } = await cloud.rpc("confirm_negotiation_down_payment", {
    target_school: schoolId,
    target_negotiation: negotiationId,
    target_method: method,
  });
  if (error) throw new Error(`Não foi possível receber a entrada: ${error.message}`);
  return loadPayment(String(data));
}

export async function confirmNegotiationInstallmentPayment(schoolId: string, installmentId: string, method = "manual") {
  const { data, error } = await cloud.rpc("confirm_negotiation_installment_payment", {
    target_school: schoolId,
    target_installment: installmentId,
    target_method: method,
  });
  if (error) throw new Error(`Não foi possível receber a parcela: ${error.message}`);
  return loadPayment(String(data));
}

export async function cancelDebtNegotiation(schoolId: string, negotiationId: string) {
  const { error } = await cloud.rpc("cancel_debt_negotiation", {
    target_school: schoolId,
    target_negotiation: negotiationId,
  });
  if (error) throw new Error(`Não foi possível cancelar o acordo: ${error.message}`);
}
