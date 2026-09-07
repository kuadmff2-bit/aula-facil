import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Plus, ReceiptText, Search, WalletCards, X } from "lucide-react";
import { emptyBillingProfile, generateProviderCharge, getBillingProfile, saveBillingProfile, type BillingProfile, type GeneratedCharge } from "./billing";
import { invoiceAmountDue, referenceMonthFromDate } from "./finance-utils";
import { ensureOpenEndedInvoiceForMonth } from "./enrollment-plan";
import { makeId, type Invoice, type Payment, type SchoolDatabase, type Student } from "./model";
import { DebtNegotiationPanel } from "./debt-negotiation-panel";
import { getCloudSyncStatus, safePullFromCloud } from "./cloud-safe-sync";
import { confirmManualInvoicePayment, reopenInvoicePayment } from "./manual-payment";
import "./finance-ultimate.css";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";

type Props = {
  database: SchoolDatabase;
  onChange: (database: SchoolDatabase) => void;
  onReceipt: (student: Student, invoice: Invoice, payment: Payment) => void;
};

type Filter = "all" | "pending" | "overdue" | "paid" | "cancelled" | "negotiated";
type Modal = { kind: "pay" | "charge"; invoice: Invoice; student: Student } | null;
type Notice = { tone: "success" | "warning" | "danger"; text: string } | null;

function localDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

function effectiveStatus(invoice: Invoice): Filter {
  if (invoice.status === "paid" || invoice.status === "cancelled" || invoice.status === "negotiated") return invoice.status;
  return invoice.dueDate < localDate() ? "overdue" : "pending";
}

function statusLabel(status: Filter) {
  if (status === "paid") return "Pago";
  if (status === "overdue") return "Atrasado";
  if (status === "cancelled") return "Cancelado";
  if (status === "negotiated") return "Renegociada";
  if (status === "pending") return "Pendente";
  return "Todas";
}

function replaceDatabase(database: SchoolDatabase, change: (draft: SchoolDatabase) => void) {
  const next = structuredClone(database);
  change(next);
  next.updatedAt = new Date().toISOString();
  return next;
}

function paymentForInvoice(database: SchoolDatabase, invoiceId: string) {
  return database.payments
    .filter((item) => item.invoiceId === invoiceId && item.status === "confirmed")
    .sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt))[0] ?? null;
}

function localReceiptNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `LOCAL-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function FinanceUltimate({ database, onChange, onReceipt }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [modal, setModal] = useState<Modal>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [referenceMonth, setReferenceMonth] = useState(referenceMonthFromDate());
  const [paymentMethod, setPaymentMethod] = useState("dinheiro");
  const [discount, setDiscount] = useState(0);
  const [billing, setBilling] = useState<BillingProfile>(emptyBillingProfile());
  const [chargeMethod, setChargeMethod] = useState<"pix" | "boleto">("pix");
  const [generatedCharge, setGeneratedCharge] = useState<GeneratedCharge | null>(null);
  const [reopenArmed, setReopenArmed] = useState("");
  const [query, setQuery] = useState("");

  const students = useMemo(() => new Map(database.students.map((item) => [item.id, item])), [database.students]);
  const visibleInvoices = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return database.invoices
      .filter((invoice) => filter === "all" || effectiveStatus(invoice) === filter)
      .filter((invoice) => {
        if (!normalized) return true;
        const student = students.get(invoice.studentId);
        return `${student?.name ?? ""} ${student?.documentNumber ?? ""} ${student?.phone ?? ""} ${student?.guardianName ?? ""} ${student?.guardianPhone ?? ""} ${invoice.reference} ${invoice.dueDate} ${statusLabel(effectiveStatus(invoice))}`.toLocaleLowerCase("pt-BR").includes(normalized);
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [database.invoices, filter, query, students]);

  const metrics = useMemo(() => {
    const received = database.payments.filter((item) => item.status === "confirmed").reduce((sum, item) => sum + item.amountReceived, 0);
    let open = 0;
    let overdue = 0;
    for (const invoice of database.invoices) {
      const status = effectiveStatus(invoice);
      if (status === "pending" || status === "overdue") {
        open += invoiceAmountDue(invoice, database.settings.finance).totalDue;
        if (status === "overdue") overdue += 1;
      }
    }
    return { received, open, overdue };
  }, [database]);

  const generateMonthly = () => {
    if (!/^\d{4}-\d{2}$/.test(referenceMonth)) {
      setNotice({ tone: "danger", text: "Escolha um mês de referência válido." });
      return;
    }
    let created = 0;
    let fixedSkipped = 0;
    const next = replaceDatabase(database, (draft) => {
      for (const student of draft.students.filter((item) => item.active && (item.enrollmentStatus ?? "active") === "active")) {
        const classItem = draft.classes.find((item) => item.id === student.classId);
        if (!classItem || classItem.monthlyFee <= 0) continue;
        if ((classItem.durationType ?? "open_ended") === "fixed") {
          fixedSkipped += 1;
          continue;
        }
        const invoice = ensureOpenEndedInvoiceForMonth(draft, student, classItem, referenceMonth);
        if (!invoice) continue;
        draft.invoices.push(invoice);
        created += 1;
      }
    });
    onChange(next);
    setNotice({
      tone: created ? "success" : "warning",
      text: created
        ? `${created} mensalidade${created === 1 ? "" : "s"} de curso contínuo gerada${created === 1 ? "" : "s"}. Cursos com duração definida já usam o plano criado na matrícula.`
        : fixedSkipped
          ? "Nenhuma mensalidade contínua nova foi necessária. Cursos com duração definida já têm todas as parcelas do plano."
          : "Nenhuma mensalidade nova foi necessária.",
    });
  };

  const openPayment = (invoice: Invoice) => {
    const student = students.get(invoice.studentId);
    if (!student) return;
    setPaymentMethod("dinheiro");
    setDiscount(0);
    setGeneratedCharge(null);
    setModal({ kind: "pay", invoice, student });
  };

  const confirmPayment = () => void (async () => {
    if (!modal || modal.kind !== "pay" || busy) return;
    const currentModal = modal;
    const breakdown = invoiceAmountDue(currentModal.invoice, database.settings.finance);
    const safeDiscount = Math.min(Math.max(0, Number(discount) || 0), breakdown.totalDue);
    const amountReceived = Math.round((breakdown.totalDue - safeDiscount) * 100) / 100;
    if (amountReceived <= 0) {
      setNotice({ tone: "danger", text: "O valor final do pagamento precisa ser maior que zero." });
      return;
    }

    const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
    if (schoolId) {
      setBusy(true);
      setNotice(null);
      try {
        const syncStatus = await getCloudSyncStatus(schoolId, database);
        if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de registrar o pagamento. A baixa foi bloqueada para evitar recibos ou saldos divergentes.");
        const payment = await confirmManualInvoicePayment({ schoolId, invoiceId: currentModal.invoice.id, method: paymentMethod, discount: safeDiscount });
        const restored = await safePullFromCloud(schoolId, database.settings.appearance);
        onChange(restored);
        const syncedInvoice = restored.invoices.find((item) => item.id === currentModal.invoice.id) ?? { ...currentModal.invoice, status: "paid" as const, paidAt: payment.paidAt };
        setModal(null);
        setNotice({ tone: "success", text: `Pagamento de ${money(payment.amountReceived)} confirmado no servidor. Recibo ${payment.receiptNumber ?? payment.id}.` });
        onReceipt(currentModal.student, syncedInvoice, payment);
      } catch (error) {
        setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível confirmar o pagamento." });
      } finally { setBusy(false); }
      return;
    }

    const now = new Date().toISOString();
    const payment: Payment = {
      id: makeId("pagamento"), studentId: currentModal.student.id, invoiceId: currentModal.invoice.id,
      amountReceived, principalAmount: breakdown.baseAmount, lateFeeAmount: breakdown.lateFee,
      interestAmount: breakdown.interest, discountAmount: safeDiscount, paymentMethod,
      status: "confirmed", paidAt: now, receiptNumber: localReceiptNumber(),
      notes: "Pagamento registrado em modo local/offline.", reversedAt: null, reversalReason: "", createdAt: now,
    };
    const next = replaceDatabase(database, (draft) => {
      const invoice = draft.invoices.find((item) => item.id === currentModal.invoice.id);
      if (!invoice) return;
      invoice.status = "paid";
      invoice.paidAt = now;
      draft.payments.push(payment);
    });
    onChange(next);
    setModal(null);
    setNotice({ tone: "warning", text: `Pagamento registrado apenas neste dispositivo. Recibo ${payment.receiptNumber}. Ative o Cloud para recibos oficiais sincronizados.` });
    onReceipt(currentModal.student, { ...currentModal.invoice, status: "paid", paidAt: now }, payment);
  })();

  const reopenPayment = (invoice: Invoice) => void (async () => {
    if (busy) return;
    if (reopenArmed !== invoice.id) {
      setReopenArmed(invoice.id);
      setNotice({ tone: "warning", text: `Clique novamente em “Confirmar reabertura” para reabrir ${invoice.reference}. A baixa anterior ficará preservada no histórico.` });
      return;
    }
    setBusy(true);
    try {
      const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
      if (schoolId) {
        const syncStatus = await getCloudSyncStatus(schoolId, database);
        if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de reabrir o pagamento.");
        await reopenInvoicePayment({ schoolId, invoiceId: invoice.id, reason: "Pagamento marcado como pago por engano" });
        onChange(await safePullFromCloud(schoolId, database.settings.appearance));
      } else {
        onChange(replaceDatabase(database, (draft) => {
          const target = draft.invoices.find((item) => item.id === invoice.id);
          if (!target) return;
          const payment = draft.payments.filter((item) => item.invoiceId === invoice.id && item.status === "confirmed").sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt))[0];
          if (payment) {
            payment.status = "cancelled";
            payment.reversedAt = new Date().toISOString();
            payment.reversalReason = "Pagamento marcado como pago por engano";
            payment.notes = `${payment.notes ? `${payment.notes} | ` : ""}Baixa reaberta; histórico preservado.`;
          }
          target.status = target.dueDate < localDate() ? "overdue" : "pending";
          target.paidAt = null;
        }));
      }
      setReopenArmed("");
      setNotice({ tone: "warning", text: "Pagamento reaberto. A baixa anterior continua no histórico para auditoria." });
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível reabrir o pagamento." });
    } finally { setBusy(false); }
  })();

  const openCharge = async (invoice: Invoice) => {
    const student = students.get(invoice.studentId);
    if (!student) return;
    const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
    if (!schoolId) {
      setNotice({ tone: "warning", text: "Conecte o AulaFácil Cloud e selecione a instituição antes de gerar cobrança bancária." });
      return;
    }
    setBusy(true);
    setGeneratedCharge(null);
    try {
      setBilling(await getBillingProfile(schoolId, student.id));
      setModal({ kind: "charge", invoice, student });
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível carregar o faturamento." });
    } finally { setBusy(false); }
  };

  const generateCharge = async () => {
    if (!modal || modal.kind !== "charge") return;
    const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
    if (!schoolId) return;
    setBusy(true);
    setNotice(null);
    try {
      const syncStatus = await getCloudSyncStatus(schoolId, database);
      if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de gerar Pix ou boleto. Isso evita misturar uma cobrança antiga com alterações locais ainda não enviadas.");
      await saveBillingProfile(schoolId, modal.student.id, billing);
      const charge = await generateProviderCharge({ invoiceId: modal.invoice.id, method: chargeMethod, billingProfile: billing });
      setGeneratedCharge(charge);
      onChange(await safePullFromCloud(schoolId, database.settings.appearance));
      if (charge.environment === "sandbox") {
        setNotice({ tone: "warning", text: charge.delivery?.status === "sent"
          ? "Cobrança de TESTE criada e enviada pelo WhatsApp. Ela não movimenta dinheiro real."
          : `Cobrança de TESTE criada. ${charge.delivery?.message || "Ela não movimenta dinheiro real."}` });
      } else if (charge.delivery?.status === "sent") {
        setNotice({ tone: "success", text: "Cobrança criada e enviada ao WhatsApp do aluno." });
      } else if (charge.delivery) {
        setNotice({ tone: "warning", text: charge.delivery.message || "Cobrança criada, mas o envio ao aluno ainda não foi confirmado." });
      } else {
        setNotice({ tone: "success", text: charge.reused ? "Cobrança já existente recuperada e sincronizada com segurança." : "Cobrança bancária gerada e sincronizada com sucesso." });
      }
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível gerar a cobrança." });
    } finally { setBusy(false); }
  };

  const cancelInvoice = (invoice: Invoice) => {
    if (invoice.status === "paid") return;
    onChange(replaceDatabase(database, (draft) => {
      const target = draft.invoices.find((item) => item.id === invoice.id);
      if (!target) return;
      target.status = "cancelled";
      target.cancelledAt = new Date().toISOString();
      target.cancellationReason = "Cancelada manualmente no financeiro";
    }));
    setNotice({ tone: "warning", text: "Cobrança cancelada. O histórico foi preservado." });
  };

  return <section className="finance-ultimate stack">
    <div className="finance-ultimate-head">
      <div><span>FINANCEIRO</span><h2>Recebimentos e mensalidades</h2><p>Juros, pagamentos, recibos e cobranças bancárias no mesmo lugar.</p></div>
      <div className="automatic-billing-badge"><CheckCircle2 size={17}/> Mensalidades contínuas automáticas</div>
    </div>

    <div className="finance-ultimate-metrics">
      <article><CheckCircle2/><div><small>Recebido</small><strong>{money(metrics.received)}</strong></div></article>
      <article><WalletCards/><div><small>Em aberto atualizado</small><strong>{money(metrics.open)}</strong></div></article>
      <article className="danger"><AlertTriangle/><div><small>Inadimplentes</small><strong>{metrics.overdue}</strong></div></article>
    </div>

    {notice && <div className={`finance-notice ${notice.tone}`}><span>{notice.text}</span><button onClick={() => { setNotice(null); setReopenArmed(""); }}><X size={15}/></button></div>}

    <label className="finance-search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar aluno, mensalidade, CPF, telefone ou vencimento"/></label>

    <div className="filter-tabs">{(["all","pending","overdue","negotiated","paid","cancelled"] as Filter[]).map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{statusLabel(item)}</button>)}</div>

    {visibleInvoices.length ? <div className="card table-card finance-table"><table><thead><tr><th>Aluno</th><th>Referência</th><th>Vencimento</th><th>Valor atualizado</th><th>Status</th><th>Ações</th></tr></thead><tbody>{visibleInvoices.map((invoice) => {
      const student = students.get(invoice.studentId);
      const status = effectiveStatus(invoice);
      const breakdown = invoiceAmountDue(invoice, database.settings.finance);
      const payment = paymentForInvoice(database, invoice.id);
      return <tr key={invoice.id}>
        <td><strong>{student?.name ?? "Aluno removido"}</strong></td>
        <td>{invoice.reference}</td><td>{dateLabel(invoice.dueDate)}</td>
        <td><strong>{money(status === "paid" && payment ? payment.amountReceived : breakdown.totalDue)}</strong>{breakdown.daysOverdue > 0 && status !== "paid" && <small className="late-detail">+ {money(breakdown.lateFee + breakdown.interest)} · {breakdown.daysOverdue}d atraso</small>}</td>
        <td><span className={`status ${status}`}>{statusLabel(status)}</span></td>
        <td><div className="finance-actions">
          {(status === "pending" || status === "overdue") && <><button className="primary-button small" onClick={() => openPayment(invoice)}>Receber</button><button className="secondary-button small" disabled={busy} onClick={() => void openCharge(invoice)}>Pix / boleto</button><button className="text-button" onClick={() => cancelInvoice(invoice)}>Cancelar</button></>}
          {status === "paid" && student && payment && <><button className="secondary-button small" onClick={() => onReceipt(student, invoice, payment)}><ReceiptText size={16}/> Recibo</button><button className="text-button" disabled={busy} onClick={() => reopenPayment(invoice)}>{reopenArmed === invoice.id ? "Confirmar reabertura" : "Reabrir"}</button></>}
          {invoice.pixCopyPaste && <button className="icon-button small" title="Copiar Pix" onClick={() => void navigator.clipboard.writeText(invoice.pixCopyPaste ?? "")}><Copy size={16}/></button>}
          {invoice.boletoUrl && <button className="icon-button small" title="Abrir cobrança" onClick={() => window.open(invoice.boletoUrl ?? "", "_blank", "noopener,noreferrer")}><ExternalLink size={16}/></button>}
        </div></td>
      </tr>;
    })}</tbody></table></div> : <div className="card finance-empty"><WalletCards/><h3>Nenhuma cobrança</h3><p>As mensalidades contínuas aparecem automaticamente. Tente outro filtro.</p></div>}

    <DebtNegotiationPanel database={database} onChange={onChange} />

    {modal?.kind === "pay" && <div className="modal-backdrop"><section className="modal finance-modal"><header><div><h2>Registrar pagamento</h2><p>{modal.student.name} · {modal.invoice.reference}</p></div><button className="modal-close" onClick={() => setModal(null)}><X/></button></header>{(() => { const b = invoiceAmountDue(modal.invoice, database.settings.finance); const final = Math.max(0, b.totalDue - discount); return <div className="finance-payment-body"><div className="payment-breakdown"><div><span>Mensalidade</span><b>{money(b.baseAmount)}</b></div><div><span>Multa</span><b>{money(b.lateFee)}</b></div><div><span>Juros</span><b>{money(b.interest)}</b></div><div><span>Desconto</span><b>- {money(discount)}</b></div><div className="total"><span>Total recebido</span><strong>{money(final)}</strong></div></div><label><span>Desconto concedido</span><input type="number" min={0} max={b.totalDue} step="0.01" value={discount} onChange={(event) => setDiscount(Math.max(0, Number(event.target.value) || 0))}/></label><label><span>Forma de pagamento</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="dinheiro">Dinheiro</option><option value="pix_manual">Pix manual</option><option value="cartao">Cartão/maquininha</option><option value="transferencia">Transferência</option><option value="outro">Outro</option></select></label><div className="form-actions"><button className="secondary-button" onClick={() => setModal(null)}>Cancelar</button><button className="primary-button" onClick={confirmPayment}>Confirmar e gerar recibo</button></div></div>; })()}</section></div>}

    {modal?.kind === "charge" && <div className="modal-backdrop"><section className="modal finance-modal charge-modal"><header><div><h2>Gerar cobrança bancária</h2><p>{modal.student.name} · os dados abaixo são usados somente quando o provedor exigir.</p></div><button className="modal-close" onClick={() => setModal(null)}><X/></button></header><div className="billing-grid"><label><span>Método</span><select value={chargeMethod} onChange={(event) => setChargeMethod(event.target.value as "pix"|"boleto")}><option value="pix">Pix</option><option value="boleto">Boleto</option></select></label><label><span>CPF/CNPJ</span><input value={billing.documentNumber} onChange={(e) => setBilling({...billing, documentNumber:e.target.value})}/></label><label><span>E-mail</span><input type="email" value={billing.email} onChange={(e) => setBilling({...billing, email:e.target.value})}/></label><label><span>Telefone</span><input type="tel" inputMode="tel" maxLength={19} value={billing.phone} onChange={(e) => setBilling({...billing, phone:e.target.value})}/></label><label><span>CEP</span><input inputMode="numeric" maxLength={9} value={billing.postalCode} onChange={(e) => setBilling({...billing, postalCode:e.target.value})}/></label><label><span>Rua</span><input value={billing.streetName} onChange={(e) => setBilling({...billing, streetName:e.target.value})}/></label><label><span>Número</span><input value={billing.streetNumber} onChange={(e) => setBilling({...billing, streetNumber:e.target.value})}/></label><label><span>Bairro</span><input value={billing.neighborhood} onChange={(e) => setBilling({...billing, neighborhood:e.target.value})}/></label><label><span>Cidade</span><input value={billing.city} onChange={(e) => setBilling({...billing, city:e.target.value})}/></label><label><span>UF</span><input maxLength={2} value={billing.state} onChange={(e) => setBilling({...billing, state:e.target.value.toUpperCase()})}/></label></div>{generatedCharge && <div className="generated-charge"><strong>{generatedCharge.reused ? "Cobrança recuperada" : "Cobrança criada"} · {generatedCharge.provider}</strong>{generatedCharge.environment === "sandbox" && <div className="payment-message warning" role="alert"><strong>🧪 AMBIENTE DE TESTE</strong><span>Esta cobrança não é real e não movimenta dinheiro. Troque o Asaas para Produção antes de cobrar alunos de verdade.</span></div>}{generatedCharge.delivery && <div className={`payment-message ${generatedCharge.delivery.status === "sent" ? "success" : "warning"}`} role="status"><strong>Envio ao aluno</strong><span>{generatedCharge.delivery.message}</span></div>}{generatedCharge.pixCopyPaste && <div><code>{generatedCharge.pixCopyPaste}</code><button onClick={() => void navigator.clipboard.writeText(generatedCharge.pixCopyPaste)}><Copy size={16}/> Copiar Pix</button></div>}{!generatedCharge.pixCopyPaste && typeof generatedCharge.metadata.manualPixKey === "string" && generatedCharge.metadata.manualPixKey && <div><div><small>Chave Pix manual{typeof generatedCharge.metadata.recipientName === "string" && generatedCharge.metadata.recipientName ? ` · ${generatedCharge.metadata.recipientName}` : ""}</small><code>{String(generatedCharge.metadata.manualPixKey)}</code></div><button onClick={() => void navigator.clipboard.writeText(String(generatedCharge.metadata.manualPixKey))}><Copy size={16}/> Copiar chave Pix</button></div>}{(generatedCharge.boletoUrl || generatedCharge.paymentUrl) && <button className="secondary-button" onClick={() => window.open(generatedCharge.boletoUrl || generatedCharge.paymentUrl, "_blank", "noopener,noreferrer")}><ExternalLink size={16}/> Abrir cobrança</button>}{generatedCharge.publicPaymentUrl && <div className="generated-payment-link"><code>{generatedCharge.publicPaymentUrl}</code><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(generatedCharge.publicPaymentUrl)}><Copy size={16}/> Copiar link do aluno</button></div>}</div>}<div className="form-actions"><button className="secondary-button" onClick={() => setModal(null)}>Fechar</button><button className="primary-button" disabled={busy} onClick={() => void generateCharge()}>{busy ? "Gerando..." : `Gerar ${chargeMethod === "pix" ? "Pix" : "boleto"}`}</button></div></section></div>}
  </section>;
}
