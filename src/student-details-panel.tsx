import { useMemo, useState } from "react";
import { CheckCircle2, FileCheck2, FileText, MessageCircle, PauseCircle, Pencil, ReceiptText, UserCheck, WalletCards, X } from "lucide-react";
import { invoiceAmountDue } from "./finance-utils";
import { openStudentWhatsApp } from "./student-contact";
import type { ClassItem, Invoice, InvoiceStatus, SchoolDatabase, Student } from "./model";
import "./student-details-panel.css";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

function effectiveStatus(invoice: Invoice): InvoiceStatus {
  if (["paid", "cancelled", "negotiated"].includes(invoice.status)) return invoice.status;
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  const iso = new Date(today.getTime() - offset).toISOString().slice(0, 10);
  return invoice.dueDate < iso ? "overdue" : "pending";
}

function statusLabel(status: InvoiceStatus) {
  if (status === "paid") return "Pago";
  if (status === "overdue") return "Atrasado";
  if (status === "cancelled") return "Cancelado";
  if (status === "negotiated") return "Renegociado";
  return "Pendente";
}

type Props = {
  student: Student;
  classItem?: ClassItem;
  database: SchoolDatabase;
  onClose: () => void;
  onEdit: () => void;
  onPause: () => void;
  onResume: () => void;
  onNewInvoice: () => void;
  onDocument: () => void;
  onCertificate: () => void;
  onPay: (invoiceIds: string[]) => void;
  onCancelInvoice: (invoice: Invoice) => void;
  onReopenInvoice: (invoice: Invoice) => void;
  onReceipt: (invoice: Invoice) => void;
};

export function StudentDetailsPanel({ student, classItem, database, onClose, onEdit, onPause, onResume, onNewInvoice, onDocument, onCertificate, onPay, onCancelInvoice, onReopenInvoice, onReceipt }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const invoices = useMemo(() => database.invoices.filter((item) => item.studentId === student.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [database.invoices, student.id]);
  const open = invoices.filter((item) => { const status = effectiveStatus(item); return status === "pending" || status === "overdue"; });
  const oldestOpen = open[0] ?? null;
  const totalOpen = open.reduce((sum, invoice) => sum + invoiceAmountDue(invoice, database.settings.finance).totalDue, 0);
  const selectedOpen = open.filter((item) => selected.includes(item.id));
  const selectedTotal = selectedOpen.reduce((sum, invoice) => sum + invoiceAmountDue(invoice, database.settings.finance).totalDue, 0);
  const status = student.enrollmentStatus ?? (student.active ? "active" : "paused");

  const toggle = (invoiceId: string) => setSelected((current) => current.includes(invoiceId) ? current.filter((id) => id !== invoiceId) : [...current, invoiceId]);
  const contact = (kind: "general" | "pending" | "overdue", invoice?: Invoice | null) => {
    void openStudentWhatsApp(database, student, kind, invoice).catch((error) => {
      window.dispatchEvent(new CustomEvent("aulafacil:contact-error", { detail: { message: error instanceof Error ? error.message : "Contato indisponível." } }));
    });
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="student-details-next">
      <header>
        <div><span className={`status ${status === "active" ? "active" : status === "completed" ? "paid" : "cancelled"}`}>{status === "active" ? "Matrícula ativa" : status === "completed" ? "Curso concluído" : "Matrícula trancada"}</span><h2>{student.name}</h2><p>{classItem?.name ?? "Sem turma"}{classItem?.groupName ? ` · ${classItem.groupName}` : ""} · {classItem?.schedule ?? "Horário não informado"}</p></div>
        <button className="modal-close" onClick={onClose} aria-label="Fechar"><X/></button>
      </header>

      <div className="student-details-body">
        <div className="student-details-summary">
          <article><small>Mensalidades em aberto</small><strong>{open.length}</strong></article>
          <article><small>Total atualizado</small><strong>{money(totalOpen)}</strong></article>
          <article><small>Vencimento</small><strong>{student.dueDay ? `Dia ${student.dueDay}` : "Padrão"}</strong></article>
          <article><small>Curso</small><strong>{classItem?.durationType === "fixed" ? `${classItem.durationMonths ?? "—"} meses` : "Sem prazo definido"}</strong></article>
        </div>

        <div className="student-contact-actions">
          <button className="secondary-button" onClick={() => contact("general")}><MessageCircle size={17}/> WhatsApp</button>
          {oldestOpen && <button className="primary-button" onClick={() => contact(effectiveStatus(oldestOpen) === "overdue" ? "overdue" : "pending", oldestOpen)}><MessageCircle size={17}/> Cobrar no WhatsApp</button>}
          <button className="secondary-button" onClick={onEdit}><Pencil size={17}/> Editar aluno</button>
          {status === "active" ? <button className="secondary-button" onClick={onPause}><PauseCircle size={17}/> Trancar curso</button> : status === "paused" ? <button className="secondary-button" onClick={onResume}><UserCheck size={17}/> Reativar matrícula</button> : null}
        </div>

        <div className="student-info-strip">
          <span><small>Nascimento</small><strong>{dateLabel(student.birthDate)}</strong></span>
          <span><small>CPF / documento</small><strong>{student.documentNumber || "Não informado"}</strong></span>
          <span><small>Telefone</small><strong>{student.phone || "Não informado"}</strong></span>
          <span><small>Responsável</small><strong>{student.guardianName || "Não informado"}</strong></span>
        </div>

        <section className="student-finance-section">
          <div className="student-section-title"><div><h3>Mensalidades</h3><p>{classItem?.durationType === "fixed" ? "O plano completo do curso aparece aqui desde a matrícula." : "Curso contínuo: novas mensalidades são criadas conforme o aluno continua."}</p></div><button className="secondary-button small" onClick={onNewInvoice}>Nova cobrança</button></div>
          {open.length > 0 && <div className="student-batch-bar"><span>{selectedOpen.length ? `${selectedOpen.length} selecionada${selectedOpen.length === 1 ? "" : "s"} · ${money(selectedTotal)}` : "Selecione mensalidades ou quite todas"}</span><div>{selectedOpen.length > 0 && <button className="primary-button small" onClick={() => onPay(selectedOpen.map((item) => item.id))}><WalletCards size={16}/> Receber selecionadas</button>}<button className="secondary-button small" onClick={() => onPay(open.map((item) => item.id))}><CheckCircle2 size={16}/> Quitar tudo</button></div></div>}
          {invoices.length ? <div className="student-invoice-table"><div className="student-invoice-head"><span/><span>Parcela</span><span>Vencimento</span><span>Valor</span><span>Status</span><span>Ações</span></div>{invoices.map((invoice) => {
            const invoiceStatus = effectiveStatus(invoice);
            const canSelect = invoiceStatus === "pending" || invoiceStatus === "overdue";
            const due = invoiceAmountDue(invoice, database.settings.finance);
            return <div className="student-invoice-row" key={invoice.id}>
              <span>{canSelect ? <input type="checkbox" checked={selected.includes(invoice.id)} onChange={() => toggle(invoice.id)} aria-label={`Selecionar ${invoice.reference}`} /> : null}</span>
              <span><strong>{invoice.installmentNumber ? `${invoice.installmentNumber}ª` : invoice.reference}</strong><small>{invoice.installmentNumber ? invoice.reference : invoice.planGenerated ? "Plano do curso" : "Cobrança"}</small></span>
              <span>{dateLabel(invoice.dueDate)}</span>
              <span><strong>{money(invoiceStatus === "paid" ? invoice.amount : due.totalDue)}</strong>{due.daysOverdue > 0 && canSelect ? <small>+ {money(due.lateFee + due.interest)}</small> : null}</span>
              <span><em className={`status ${invoiceStatus}`}>{statusLabel(invoiceStatus)}</em></span>
              <span className="student-invoice-actions">{canSelect && <><button className="text-button" onClick={() => onPay([invoice.id])}>Receber</button><button className="text-button danger" onClick={() => onCancelInvoice(invoice)}>Cancelar</button></>}{invoiceStatus === "paid" && <><button className="text-button" onClick={() => onReceipt(invoice)}><ReceiptText size={15}/> Recibo</button><button className="text-button danger" onClick={() => onReopenInvoice(invoice)}>Reabrir</button></>}</span>
            </div>;
          })}</div> : <p className="inline-empty">Nenhuma mensalidade cadastrada.</p>}
        </section>

        <div className="student-document-actions"><button className="secondary-button" onClick={onDocument}><FileText size={17}/> Declaração</button><button className="secondary-button" onClick={onCertificate}><FileCheck2 size={17}/> Certificado</button></div>
      </div>
    </section>
  </div>;
}
