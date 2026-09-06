import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, HandCoins, ReceiptText, X } from "lucide-react";
import { getCloudSyncStatus, safePullFromCloud } from "./cloud-safe-sync";
import { invoiceAmountDue } from "./finance-utils";
import {
  cancelDebtNegotiation,
  confirmNegotiationDownPayment,
  confirmNegotiationInstallmentPayment,
  createDebtNegotiation,
  listDebtNegotiations,
  listNegotiationInstallments,
  type DebtNegotiation,
  type NegotiationInstallment,
} from "./debt-negotiation";
import type { Invoice, SchoolDatabase } from "./model";
import "./debt-negotiation-panel.css";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";

type Props = {
  database: SchoolDatabase;
  onChange: (database: SchoolDatabase) => void;
};

type Message = { tone: "success" | "warning" | "danger"; text: string } | null;

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function dateLabel(value: string | null | undefined) {
  return value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(invoice: Invoice) {
  return !["paid", "cancelled", "negotiated"].includes(invoice.status) && invoice.dueDate < today();
}

export function DebtNegotiationPanel({ database, onChange }: Props) {
  const [schoolId, setSchoolId] = useState(() => localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "");
  const [agreements, setAgreements] = useState<DebtNegotiation[]>([]);
  const [expanded, setExpanded] = useState<Record<string, NegotiationInstallment[]>>({});
  const [studentId, setStudentId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const [discountValue, setDiscountValue] = useState(0);
  const [downPayment, setDownPayment] = useState(0);
  const [installmentCount, setInstallmentCount] = useState(3);
  const [firstDueDate, setFirstDueDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("dinheiro");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const studentMap = useMemo(() => new Map(database.students.map((student) => [student.id, student])), [database.students]);
  const overdueByStudent = useMemo(() => {
    const map = new Map<string, Invoice[]>();
    for (const invoice of database.invoices.filter(isOverdue)) {
      const list = map.get(invoice.studentId) ?? [];
      list.push(invoice);
      map.set(invoice.studentId, list);
    }
    return map;
  }, [database.invoices]);
  const eligibleStudents = useMemo(
    () => database.students.filter((student) => (overdueByStudent.get(student.id)?.length ?? 0) > 0),
    [database.students, overdueByStudent],
  );
  const invoices = studentId ? overdueByStudent.get(studentId) ?? [] : [];

  const preview = useMemo(() => {
    let original = 0;
    let late = 0;
    for (const invoice of invoices.filter((item) => selected.includes(item.id))) {
      const breakdown = invoiceAmountDue(invoice, database.settings.finance);
      original += breakdown.baseAmount;
      late += breakdown.lateFee + breakdown.interest;
    }
    const gross = Math.round((original + late) * 100) / 100;
    const discount = discountType === "percent"
      ? gross * Math.min(100, Math.max(0, discountValue)) / 100
      : Math.min(gross, Math.max(0, discountValue));
    const total = Math.max(0, Math.round((gross - discount) * 100) / 100);
    const remaining = Math.max(0, Math.round((total - Math.max(0, downPayment)) * 100) / 100);
    return {
      original,
      late,
      discount,
      total,
      remaining,
      installment: installmentCount ? Math.round(remaining / installmentCount * 100) / 100 : 0,
    };
  }, [invoices, selected, database.settings.finance, discountType, discountValue, downPayment, installmentCount]);

  const refresh = async (target = schoolId) => {
    if (!target) {
      setAgreements([]);
      return;
    }
    setAgreements(await listDebtNegotiations(target));
  };

  const requireSynced = async () => {
    if (!schoolId) throw new Error("Selecione a instituição no AulaFácil Cloud.");
    const status = await getCloudSyncStatus(schoolId, database);
    if (status !== "synced") {
      throw new Error("Sincronize este computador antes desta operação financeira. Isso evita usar ou sobrescrever dados antigos.");
    }
  };

  const adoptRemoteChanges = async () => {
    const restored = await safePullFromCloud(schoolId, database.settings.appearance);
    onChange(restored);
    await refresh(schoolId);
    return restored;
  };

  useEffect(() => {
    const id = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
    setSchoolId(id);
    void refresh(id).catch((error) => setMessage({
      tone: "danger",
      text: error instanceof Error ? error.message : "Não foi possível carregar os acordos.",
    }));
  }, []);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await operation();
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "A operação falhou." });
    } finally {
      setBusy(false);
    }
  };

  const create = () => void run(async () => {
    if (!studentId || !selected.length) throw new Error("Selecione o aluno e ao menos uma mensalidade atrasada.");
    if (preview.remaining <= 0) throw new Error("A entrada deve ser menor que o valor final negociado.");
    await requireSynced();
    await createDebtNegotiation({
      schoolId,
      studentId,
      invoiceIds: selected,
      discountType,
      discountValue,
      downPayment,
      installmentCount,
      firstDueDate,
      notes,
    });
    await adoptRemoteChanges();
    setSelected([]);
    setDiscountValue(0);
    setDownPayment(0);
    setNotes("");
    setMessage({ tone: "success", text: "Acordo criado e sincronizado. As mensalidades originais ficaram marcadas como renegociadas." });
  });

  const toggle = (agreement: DebtNegotiation) => void run(async () => {
    if (expanded[agreement.id]) {
      setExpanded((current) => {
        const next = { ...current };
        delete next[agreement.id];
        return next;
      });
      return;
    }
    const installments = await listNegotiationInstallments(schoolId, agreement.id);
    setExpanded((current) => ({ ...current, [agreement.id]: installments }));
  });

  const receiveEntry = (agreement: DebtNegotiation) => void run(async () => {
    await requireSynced();
    const receipt = await confirmNegotiationDownPayment(schoolId, agreement.id, paymentMethod);
    await adoptRemoteChanges();
    setMessage({ tone: "success", text: `Entrada recebida. Recibo ${receipt.receiptNumber ?? receipt.id} · ${money(receipt.amountReceived)}.` });
  });

  const receiveInstallment = (agreement: DebtNegotiation, installment: NegotiationInstallment) => void run(async () => {
    await requireSynced();
    const receipt = await confirmNegotiationInstallmentPayment(schoolId, installment.id, paymentMethod);
    await adoptRemoteChanges();
    const parts = await listNegotiationInstallments(schoolId, agreement.id);
    setExpanded((current) => ({ ...current, [agreement.id]: parts }));
    setMessage({ tone: "success", text: `Parcela ${installment.number} recebida. Recibo ${receipt.receiptNumber ?? receipt.id} · ${money(receipt.amountReceived)}.` });
  });

  const cancel = (agreement: DebtNegotiation) => void run(async () => {
    await requireSynced();
    await cancelDebtNegotiation(schoolId, agreement.id);
    await adoptRemoteChanges();
    setExpanded((current) => {
      const next = { ...current };
      delete next[agreement.id];
      return next;
    });
    setMessage({ tone: "warning", text: "Acordo cancelado. As mensalidades originais voltaram à cobrança normal e o desktop foi atualizado." });
  });

  return <section className="card debt-panel">
    <div className="debt-heading">
      <div><span>NEGOCIAÇÃO</span><h2>Acordos de mensalidades atrasadas</h2><p>Desconto, entrada, parcelamento e recibos sem apagar a dívida original.</p></div>
      <HandCoins />
    </div>

    {!schoolId && <div className="debt-message warning">Conecte a instituição no AulaFácil Cloud para formalizar acordos.</div>}
    {message && <div className={`debt-message ${message.tone}`}><span>{message.text}</span><button onClick={() => setMessage(null)}><X size={15} /></button></div>}

    <div className="debt-builder">
      <h3>Novo acordo</h3>
      <div className="debt-form-grid">
        <label><span>Aluno inadimplente</span><select value={studentId} onChange={(event) => { setStudentId(event.target.value); setSelected([]); }}><option value="">Escolha</option>{eligibleStudents.map((student) => <option key={student.id} value={student.id}>{student.name} · {overdueByStudent.get(student.id)?.length} pendência(s)</option>)}</select></label>
        <label><span>Primeiro vencimento</span><input type="date" defaultValue={firstDueDate} onChange={(event) => { const next = event.currentTarget.value; if (next) setFirstDueDate(next); }} /></label>
      </div>

      {studentId && <div className="debt-invoices">{invoices.map((invoice) => {
        const breakdown = invoiceAmountDue(invoice, database.settings.finance);
        return <label key={invoice.id}><input type="checkbox" checked={selected.includes(invoice.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, invoice.id] : current.filter((id) => id !== invoice.id))} /><div><strong>{invoice.reference}</strong><span>Venceu {dateLabel(invoice.dueDate)} · Base {money(invoice.amount)}</span></div><b>{money(breakdown.totalDue)}</b></label>;
      })}</div>}

      <div className="debt-form-grid">
        <label><span>Desconto</span><div className="debt-combo"><select value={discountType} onChange={(event) => setDiscountType(event.target.value as "fixed" | "percent")}><option value="fixed">R$</option><option value="percent">%</option></select><input type="number" min={0} step=".01" value={discountValue} onChange={(event) => setDiscountValue(Math.max(0, Number(event.target.value) || 0))} /></div></label>
        <label><span>Entrada</span><input type="number" min={0} step=".01" value={downPayment} onChange={(event) => setDownPayment(Math.max(0, Number(event.target.value) || 0))} /></label>
        <label><span>Parcelas</span><input type="number" min={1} max={120} value={installmentCount} onChange={(event) => setInstallmentCount(Math.max(1, Math.min(120, Math.trunc(Number(event.target.value) || 1))))} /></label>
        <label><span>Observações</span><input maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      </div>

      <div className="debt-preview">
        <div><span>Dívida original</span><b>{money(preview.original)}</b></div><div><span>Multa + juros</span><b>{money(preview.late)}</b></div><div><span>Desconto</span><b>- {money(preview.discount)}</b></div><div><span>Total</span><strong>{money(preview.total)}</strong></div><div><span>Entrada</span><b>{money(downPayment)}</b></div><div><span>Saldo / parcelas</span><strong>{money(preview.remaining)} · aprox. {installmentCount}x {money(preview.installment)}</strong></div>
      </div>
      <button className="primary-button" disabled={busy || !schoolId || !selected.length} onClick={create}>{busy ? "Processando..." : "Criar acordo"}</button>
    </div>

    <div className="debt-existing">
      <div className="debt-list-head"><h3>Acordos registrados</h3><label><span>Forma de recebimento</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="dinheiro">Dinheiro</option><option value="pix_manual">Pix</option><option value="transferencia">Transferência</option><option value="cartao">Cartão/maquininha</option><option value="outro">Outro</option></select></label></div>
      {agreements.length ? agreements.map((agreement) => <article key={agreement.id} className="debt-agreement">
        <div className="debt-agreement-main"><div><strong>{studentMap.get(agreement.studentId)?.name ?? "Aluno"}</strong><span>{agreement.installmentCount} parcelas · {dateLabel(agreement.createdAt)}</span></div><div><b>{money(agreement.negotiatedTotal)}</b><span className={`status ${agreement.status}`}>{agreement.status === "active" ? "Ativo" : agreement.status === "paid" ? "Quitado" : agreement.status === "cancelled" ? "Cancelado" : agreement.status === "defaulted" ? "Inadimplente" : "Rascunho"}</span></div></div>
        {agreement.downPayment > 0 && <div className="debt-entry"><div><strong>Entrada</strong><span>{agreement.downPaymentPaidAt ? `Recebida em ${dateLabel(agreement.downPaymentPaidAt)}` : "Aguardando pagamento"}</span></div><b>{money(agreement.downPayment)}</b>{agreement.status === "active" && !agreement.downPaymentPaidAt && <button className="primary-button small" disabled={busy} onClick={() => receiveEntry(agreement)}><ReceiptText size={15} /> Receber entrada</button>}</div>}
        <div className="debt-agreement-actions"><button onClick={() => toggle(agreement)}>{expanded[agreement.id] ? "Ocultar parcelas" : "Ver parcelas"}</button>{agreement.status === "active" && <button className="danger" disabled={busy} onClick={() => cancel(agreement)}>Cancelar acordo</button>}</div>
        {expanded[agreement.id] && <div className="debt-installments">{expanded[agreement.id].map((installment) => <div key={installment.id}><span>{installment.number}ª parcela · {dateLabel(installment.dueDate)}</span><b>{money(installment.amount)}</b><em className={`status ${installment.status}`}>{installment.status === "paid" ? "Paga" : installment.status === "overdue" ? "Atrasada" : installment.status === "cancelled" ? "Cancelada" : "Pendente"}</em>{agreement.status === "active" && installment.status !== "paid" && installment.status !== "cancelled" && <button className="primary-button small" disabled={busy} onClick={() => receiveInstallment(agreement, installment)}>Receber</button>}</div>)}</div>}
      </article>) : <div className="debt-empty"><CheckCircle2 /><span>Nenhum acordo registrado.</span></div>}
    </div>
  </section>;
}
