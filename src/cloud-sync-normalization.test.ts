import { describe, expect, it } from "vitest";
import { emptyDatabase } from "./model";
import { normalizeFinanceSnapshotForSync } from "./cloud-sync-normalization";

describe("normalização financeira para sincronização", () => {
  it("mantém uma mensalidade por aluno e referência e remapeia pagamentos", () => {
    const database = emptyDatabase();
    const studentId = "11111111-1111-4111-8111-111111111111";
    const firstId = "22222222-2222-4222-8222-222222222222";
    const duplicateId = "33333333-3333-4333-8333-333333333333";

    database.invoices = [
      { id: firstId, studentId, reference: "2026-09", dueDate: "2026-09-05", amount: 150, status: "pending", paidAt: null, createdAt: "2026-09-01T00:00:00.000Z" },
      { id: duplicateId, studentId, reference: "2026-09", dueDate: "2026-09-05", amount: 150, status: "pending", paidAt: null, createdAt: "2026-09-02T00:00:00.000Z" },
    ];
    database.payments = [{
      id: "44444444-4444-4444-8444-444444444444",
      studentId,
      invoiceId: duplicateId,
      amountReceived: 150,
      principalAmount: 150,
      lateFeeAmount: 0,
      interestAmount: 0,
      discountAmount: 0,
      paymentMethod: "manual",
      status: "confirmed",
      paidAt: "2026-09-07T00:00:00.000Z",
      createdAt: "2026-09-07T00:00:00.000Z",
    }];

    const normalized = normalizeFinanceSnapshotForSync(database);
    expect(normalized.database.invoices).toHaveLength(1);
    expect(normalized.database.invoices[0].id).toBe(firstId);
    expect(normalized.database.payments[0].invoiceId).toBe(firstId);
    expect(normalized.removedInvoices).toBe(1);
    expect(normalized.remappedInvoiceIds).toBe(1);
  });

  it("prefere a mensalidade com cobrança de provedor", () => {
    const database = emptyDatabase();
    const studentId = "11111111-1111-4111-8111-111111111111";
    database.invoices = [
      { id: "22222222-2222-4222-8222-222222222222", studentId, reference: "2026-10", dueDate: "2026-10-05", amount: 150, status: "pending", paidAt: null, createdAt: "2026-09-01T00:00:00.000Z" },
      { id: "33333333-3333-4333-8333-333333333333", studentId, reference: "2026-10", dueDate: "2026-10-05", amount: 150, status: "pending", paidAt: null, provider: "asaas", providerChargeId: "pay_123", createdAt: "2026-09-02T00:00:00.000Z" },
    ];

    const normalized = normalizeFinanceSnapshotForSync(database);
    expect(normalized.database.invoices).toHaveLength(1);
    expect(normalized.database.invoices[0].providerChargeId).toBe("pay_123");
  });
});
