from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"refund UI patch anchor not found: {label}")
    return text.replace(old, new, 1)

# billing.ts
p = Path("src/billing.ts")
s = p.read_text(encoding="utf-8")
s = replace_once(s,
'''export type CancelledProviderCharge = {
  providerChargeCancelled: boolean;
  invoiceCancelled: boolean;
  result: Record<string, unknown>;
};''',
'''export type CancelledProviderCharge = {
  providerChargeCancelled: boolean;
  invoiceCancelled: boolean;
  result: Record<string, unknown>;
};

export type ProviderRefundResult = {
  provider: string;
  requestedAmount: number;
  refundedAmount: number;
  refundState: string;
  completed: boolean;
  reused: boolean;
  message: string;
};''', "billing type")
s += '''

export async function requestProviderRefund(input: {
  paymentId: string;
  amount?: number;
  reason: string;
}): Promise<ProviderRefundResult> {
  const { data, error } = await cloud.functions.invoke("payment-refund", {
    body: {
      paymentId: input.paymentId,
      amount: input.amount,
      reason: input.reason.trim(),
    },
  });
  if (error) throw new Error(await getEdgeFunctionErrorMessage(error));
  if (data?.error) throw new Error(String(data.error));
  return {
    provider: String(data?.provider ?? ""),
    requestedAmount: Number(data?.requestedAmount ?? input.amount ?? 0),
    refundedAmount: Number(data?.refundedAmount ?? 0),
    refundState: String(data?.refundState ?? "pending"),
    completed: Boolean(data?.completed),
    reused: Boolean(data?.reused),
    message: String(data?.message ?? "Estorno solicitado."),
  };
}
'''
p.write_text(s, encoding="utf-8")

# model.ts
p = Path("src/model.ts")
s = p.read_text(encoding="utf-8")
s = replace_once(s,
'''  reversedAt?: string | null;
  reversalReason?: string;
  createdAt: string;''',
'''  reversedAt?: string | null;
  reversalReason?: string;
  refundedAmount?: number;
  refundStatus?: string;
  refundUpdatedAt?: string | null;
  createdAt: string;''', "model payment fields")
s = replace_once(s,
'''    reversedAt: item.reversedAt === null || item.reversedAt === undefined ? null : text(item.reversedAt, 48) || null,
    reversalReason: text(item.reversalReason, 500),
    createdAt,''',
'''    reversedAt: item.reversedAt === null || item.reversedAt === undefined ? null : text(item.reversedAt, 48) || null,
    reversalReason: text(item.reversalReason, 500),
    refundedAmount: finiteNumber(item.refundedAmount, 0, amountReceived, 0) ?? 0,
    refundStatus: text(item.refundStatus, 40, "none"),
    refundUpdatedAt: item.refundUpdatedAt === null || item.refundUpdatedAt === undefined ? null : text(item.refundUpdatedAt, 48) || null,
    createdAt,''', "model sanitizer")
p.write_text(s, encoding="utf-8")

# cloud.ts: server refund fields are read-only from desktop; download only.
p = Path("src/cloud.ts")
s = p.read_text(encoding="utf-8")
s = replace_once(s,
'''      reversedAt: row.reversed_at ? nullableText(row.reversed_at) : null,
      reversalReason: nullableText(row.reversal_reason),
      createdAt: nullableText(row.created_at),''',
'''      reversedAt: row.reversed_at ? nullableText(row.reversed_at) : null,
      reversalReason: nullableText(row.reversal_reason),
      refundedAmount: numeric(row.refunded_amount),
      refundStatus: nullableText(row.refund_status) || "none",
      refundUpdatedAt: row.refund_updated_at ? nullableText(row.refund_updated_at) : null,
      createdAt: nullableText(row.created_at),''', "cloud download refund")
p.write_text(s, encoding="utf-8")

# finance-ultimate.tsx
p = Path("src/finance-ultimate.tsx")
s = p.read_text(encoding="utf-8")
s = replace_once(s,
'import { cancelProviderCharge, emptyBillingProfile, generateProviderCharge, getBillingProfile, saveBillingProfile, type BillingProfile, type GeneratedCharge } from "./billing";',
'import { cancelProviderCharge, emptyBillingProfile, generateProviderCharge, getBillingProfile, requestProviderRefund, saveBillingProfile, type BillingProfile, type GeneratedCharge } from "./billing";', "finance billing import")
s = replace_once(s,
'type Modal = { kind: "pay" | "charge"; invoice: Invoice; student: Student } | null;',
'''type Modal =
  | { kind: "pay" | "charge"; invoice: Invoice; student: Student }
  | { kind: "refund"; invoice: Invoice; student: Student; payment: Payment }
  | null;''', "finance modal")
s = replace_once(s,
'''  const [reissueArmed, setReissueArmed] = useState("");
  const [query, setQuery] = useState("");''',
'''  const [reissueArmed, setReissueArmed] = useState("");
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState("");
  const [refundArmed, setRefundArmed] = useState(false);
  const [query, setQuery] = useState("");''', "refund states")
s = replace_once(s,
'''    const received = database.payments.filter((item) => item.status === "confirmed").reduce((sum, item) => sum + item.amountReceived, 0);''',
'''    const received = database.payments.filter((item) => item.status === "confirmed").reduce((sum, item) => sum + Math.max(0, item.amountReceived - (item.refundedAmount ?? 0)), 0);''', "received metric")

anchor = '''  const openCharge = async (invoice: Invoice) => {'''
refund_funcs = '''  const openRefund = (invoice: Invoice, payment: Payment) => {
    const student = students.get(invoice.studentId);
    if (!student) return;
    if (!payment.provider || !payment.providerPaymentId) {
      setNotice({ tone: "warning", text: "Este pagamento é manual. Use “Reabrir” para desfazer a baixa mantendo o histórico." });
      return;
    }
    const remaining = Math.max(0, Math.round((payment.amountReceived - (payment.refundedAmount ?? 0)) * 100) / 100);
    if (remaining <= 0) {
      setNotice({ tone: "warning", text: "Este pagamento já foi estornado integralmente." });
      return;
    }
    setRefundAmount(remaining);
    setRefundReason("");
    setRefundArmed(false);
    setNotice(null);
    setModal({ kind: "refund", invoice, student, payment });
  };

  const confirmRefund = () => void (async () => {
    if (!modal || modal.kind !== "refund" || busy) return;
    const remaining = Math.max(0, Math.round((modal.payment.amountReceived - (modal.payment.refundedAmount ?? 0)) * 100) / 100);
    const amount = Math.round((Number(refundAmount) || 0) * 100) / 100;
    if (amount <= 0 || amount > remaining) {
      setNotice({ tone: "danger", text: `Informe um valor entre R$ 0,01 e ${money(remaining)}.` });
      return;
    }
    if (refundReason.trim().length < 4) {
      setNotice({ tone: "danger", text: "Informe o motivo do estorno para o histórico financeiro." });
      return;
    }
    if (!refundArmed) {
      setRefundArmed(true);
      setNotice({ tone: "warning", text: `Confirme novamente: o AulaFácil solicitará ao provedor a devolução de ${money(amount)}. Esta operação pode movimentar dinheiro real.` });
      return;
    }
    const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
    if (!schoolId) {
      setNotice({ tone: "danger", text: "Conecte o AulaFácil Cloud para solicitar estorno bancário." });
      return;
    }
    setBusy(true);
    try {
      const syncStatus = await getCloudSyncStatus(schoolId, database);
      if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de solicitar o estorno.");
      const result = await requestProviderRefund({ paymentId: modal.payment.id, amount, reason: refundReason });
      const restored = await safePullFromCloud(schoolId, database.settings.appearance);
      onChange(restored);
      setModal(null);
      setRefundArmed(false);
      setNotice({ tone: result.completed ? "success" : "warning", text: result.completed
        ? `${result.message} Total devolvido reconhecido: ${money(result.refundedAmount)}.`
        : `${result.message} O AulaFácil acompanhará a confirmação pelo provedor automaticamente.` });
    } catch (error) {
      setRefundArmed(false);
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível solicitar o estorno." });
    } finally { setBusy(false); }
  })();

'''
if anchor not in s:
    raise SystemExit("refund function anchor not found")
s = s.replace(anchor, refund_funcs + anchor, 1)

# hard-block provider payments in legacy reopen, even if triggered indirectly
s = replace_once(s,
'''  const reopenPayment = (invoice: Invoice) => void (async () => {
    if (busy) return;''',
'''  const reopenPayment = (invoice: Invoice) => void (async () => {
    if (busy) return;
    const providerPayment = paymentForInvoice(database, invoice.id);
    if (providerPayment?.provider && providerPayment.providerPaymentId) {
      setNotice({ tone: "danger", text: "Pagamento confirmado por provedor não pode ser reaberto manualmente. Use “Estornar” para devolver o valor com rastreabilidade." });
      return;
    }''', "block provider reopen")

old_actions = '''          {status === "paid" && student && payment && <><button className="secondary-button small" onClick={() => onReceipt(student, invoice, payment)}><ReceiptText size={16}/> Recibo</button><button className="text-button" disabled={busy} onClick={() => reopenPayment(invoice)}>{reopenArmed === invoice.id ? "Confirmar reabertura" : "Reabrir"}</button></>}'''
new_actions = '''          {status === "paid" && student && payment && <><button className="secondary-button small" onClick={() => onReceipt(student, invoice, payment)}><ReceiptText size={16}/> Recibo</button>{payment.provider && payment.providerPaymentId ? <button className="text-button" disabled={busy} onClick={() => openRefund(invoice, payment)}>Estornar</button> : <button className="text-button" disabled={busy} onClick={() => reopenPayment(invoice)}>{reopenArmed === invoice.id ? "Confirmar reabertura" : "Reabrir"}</button>}</>}'''
s = replace_once(s, old_actions, new_actions, "paid actions")

old_value = '''<td><strong>{money(status === "paid" && payment ? payment.amountReceived : breakdown.totalDue)}</strong>{breakdown.daysOverdue > 0 && status !== "paid" && <small className="late-detail">+ {money(breakdown.lateFee + breakdown.interest)} · {breakdown.daysOverdue}d atraso</small>}</td>'''
new_value = '''<td><strong>{money(status === "paid" && payment ? Math.max(0, payment.amountReceived - (payment.refundedAmount ?? 0)) : breakdown.totalDue)}</strong>{payment && (payment.refundedAmount ?? 0) > 0 && <small className="late-detail">Estornado: {money(payment.refundedAmount ?? 0)}{payment.refundStatus && payment.refundStatus !== "none" ? ` · ${payment.refundStatus === "partial" ? "parcial" : payment.refundStatus === "pending" ? "aguardando" : payment.refundStatus}` : ""}</small>}{breakdown.daysOverdue > 0 && status !== "paid" && <small className="late-detail">+ {money(breakdown.lateFee + breakdown.interest)} · {breakdown.daysOverdue}d atraso</small>}</td>'''
s = replace_once(s, old_value, new_value, "paid value")

refund_modal = '''
    {modal?.kind === "refund" && <div className="modal-backdrop"><section className="modal finance-modal"><header><div><h2>Estornar pagamento</h2><p>{modal.student.name} · {modal.invoice.reference}</p></div><button className="modal-close" disabled={busy} onClick={() => { setModal(null); setNotice(null); setRefundArmed(false); }}><X/></button></header><div className="finance-payment-body"><div className="payment-breakdown"><div><span>Pagamento recebido</span><b>{money(modal.payment.amountReceived)}</b></div><div><span>Já estornado</span><b>{money(modal.payment.refundedAmount ?? 0)}</b></div><div className="total"><span>Máximo disponível</span><strong>{money(Math.max(0, modal.payment.amountReceived - (modal.payment.refundedAmount ?? 0)))}</strong></div></div><label><span>Valor a estornar</span><input type="number" min={0.01} max={Math.max(0, modal.payment.amountReceived - (modal.payment.refundedAmount ?? 0))} step="0.01" value={refundAmount} onChange={(event) => { setRefundAmount(Math.max(0, Number(event.target.value) || 0)); setRefundArmed(false); }}/></label><label><span>Motivo do estorno</span><textarea rows={3} maxLength={500} value={refundReason} onChange={(event) => { setRefundReason(event.target.value); setRefundArmed(false); }} placeholder="Ex.: pagamento duplicado, cancelamento acordado com o aluno..."/></label>{notice && <div className={`finance-modal-notice ${notice.tone}`} role={notice.tone === "danger" ? "alert" : "status"}><AlertTriangle size={20}/><span>{notice.text}</span></div>}<div className="form-actions"><button className="secondary-button" disabled={busy} onClick={() => { setModal(null); setNotice(null); setRefundArmed(false); }}>Cancelar</button><button className="danger-button" disabled={busy} onClick={() => confirmRefund()}>{busy ? "Processando estorno..." : refundArmed ? `Confirmar estorno de ${money(refundAmount)}` : "Solicitar estorno"}</button></div></div></section></div>}
'''
anchor = '    {modal?.kind === "charge" && <div className="modal-backdrop">'
if anchor not in s:
    raise SystemExit("refund modal anchor not found")
s = s.replace(anchor, refund_modal + "\n" + anchor, 1)

p.write_text(s, encoding="utf-8")
