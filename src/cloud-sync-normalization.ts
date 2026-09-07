import type { Invoice, SchoolDatabase } from "./model";

function invoicePriority(invoice: Invoice) {
  if (invoice.providerChargeId) return 500;
  if (invoice.status === "paid") return 400;
  if (invoice.status === "cancelled" || invoice.status === "negotiated") return 300;
  if (invoice.planGenerated) return 100;
  return 0;
}

function preferInvoice(left: Invoice, right: Invoice) {
  const leftPriority = invoicePriority(left);
  const rightPriority = invoicePriority(right);
  if (leftPriority !== rightPriority) return rightPriority > leftPriority ? right : left;

  // Em empate, preserva o registro mais antigo para manter a UUID mais estável.
  const leftCreated = left.createdAt || "";
  const rightCreated = right.createdAt || "";
  if (leftCreated !== rightCreated) return rightCreated < leftCreated ? right : left;
  return right.id < left.id ? right : left;
}

function resolveAlias(aliases: Map<string, string>, id: string) {
  let current = id;
  const visited = new Set<string>();
  while (aliases.has(current) && !visited.has(current)) {
    visited.add(current);
    const next = aliases.get(current);
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

export function normalizeFinanceSnapshotForSync(source: SchoolDatabase) {
  const database = structuredClone(source);
  const aliases = new Map<string, string>();

  // Primeiro remove repetições da própria UUID. Um INSERT ... ON CONFLICT também
  // falha se a mesma chave primária aparecer duas vezes no mesmo lote.
  const byId = new Map<string, Invoice>();
  for (const invoice of database.invoices) {
    const existing = byId.get(invoice.id);
    byId.set(invoice.id, existing ? preferInvoice(existing, invoice) : invoice);
  }

  // Depois aplica a identidade financeira real da mensalidade: aluno + referência.
  const byObligation = new Map<string, Invoice>();
  for (const invoice of byId.values()) {
    const key = JSON.stringify([invoice.studentId, invoice.reference]);
    const existing = byObligation.get(key);
    if (!existing) {
      byObligation.set(key, invoice);
      continue;
    }

    const winner = preferInvoice(existing, invoice);
    const loser = winner.id === existing.id ? invoice : existing;
    byObligation.set(key, winner);
    if (loser.id !== winner.id) aliases.set(loser.id, winner.id);
  }

  for (const [from, to] of [...aliases]) aliases.set(from, resolveAlias(aliases, to));

  database.invoices = [...byObligation.values()];
  database.payments = database.payments.map((payment) => {
    if (!payment.invoiceId) return payment;
    const canonical = resolveAlias(aliases, payment.invoiceId);
    return canonical === payment.invoiceId ? payment : { ...payment, invoiceId: canonical };
  });

  const removedInvoices = source.invoices.length - database.invoices.length;
  if (removedInvoices > 0) database.updatedAt = new Date().toISOString();

  return { database, removedInvoices, remappedInvoiceIds: aliases.size };
}
