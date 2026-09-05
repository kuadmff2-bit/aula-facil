import { cloud } from "./cloud";
import type { Payment } from "./model";

export async function confirmManualInvoicePayment(input: {
  schoolId: string;
  invoiceId: string;
  method: string;
  discount: number;
  notes?: string;
}): Promise<Payment> {
  const { data, error } = await cloud.rpc("confirm_manual_invoice_payment", {
    target_school: input.schoolId,
    target_invoice: input.invoiceId,
    target_method: input.method,
    target_discount: Math.max(0, Number(input.discount) || 0),
    target_notes: input.notes?.trim() || null,
  });
  if (error) throw new Error(`Não foi possível confirmar o pagamento: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.payment_id || !row?.invoice_id || !row?.student_id) {
    throw new Error("O servidor não retornou o pagamento confirmado.");
  }

  const paidAt = row.paid_at ? String(row.paid_at) : new Date().toISOString();
  return {
    id: String(row.payment_id),
    studentId: String(row.student_id),
    invoiceId: String(row.invoice_id),
    negotiationInstallmentId: null,
    amountReceived: Number(row.amount_received ?? 0),
    principalAmount: Number(row.principal_amount ?? 0),
    lateFeeAmount: Number(row.late_fee_amount ?? 0),
    interestAmount: Number(row.interest_amount ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    paymentMethod: String(row.payment_method ?? input.method ?? "manual"),
    provider: null,
    providerPaymentId: null,
    status: "confirmed",
    paidAt,
    receiptNumber: row.receipt_number ? String(row.receipt_number) : null,
    notes: input.notes?.trim() || "",
    createdAt: paidAt,
  };
}
