import type { Invoice, Student } from "./model";
import "./receipt-document.css";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const normalized = value.slice(0, 10);
  return new Date(`${normalized}T12:00:00`).toLocaleDateString("pt-BR");
}

type ReceiptDocumentProps = {
  student: Student;
  invoice: Invoice;
  schoolName?: string;
  schoolLocation?: string;
};

function ReceiptCopy({
  label,
  student,
  invoice,
  schoolName,
  schoolLocation,
}: ReceiptDocumentProps & { label: string }) {
  return (
    <article className="receipt-copy">
      <header className="receipt-header">
        <div>
          <strong>{schoolName}</strong>
          <span>{schoolLocation}</span>
        </div>
        <div className="receipt-badge">{label}</div>
      </header>

      <div className="receipt-title-row">
        <div>
          <h1>Recibo de pagamento</h1>
          <span className="receipt-number">Nº {invoice.id.toUpperCase()}</span>
        </div>
        <strong className="receipt-amount">{money(invoice.amount)}</strong>
      </div>

      <div className="receipt-data-grid">
        <div><small>Aluno</small><strong>{student.name}</strong></div>
        <div><small>Referência</small><strong>{invoice.reference}</strong></div>
        <div><small>Vencimento</small><strong>{dateLabel(invoice.dueDate)}</strong></div>
        <div><small>Pagamento</small><strong>{dateLabel(invoice.paidAt)}</strong></div>
      </div>

      <p className="receipt-text">
        Declaramos o recebimento de <strong>{money(invoice.amount)}</strong> referente a <strong>{invoice.reference}</strong>, pago por ou em nome de <strong>{student.name}</strong>.
      </p>

      <div className="receipt-signatures">
        <div><span /><small>Assinatura da escola / responsável pelo recebimento</small></div>
        <div><span /><small>Assinatura do pagador</small></div>
      </div>

      <footer className="receipt-footer">
        <span>Emitido pelo AulaFácil</span>
        <span>Recibo: {invoice.id.toUpperCase()}</span>
      </footer>
    </article>
  );
}

export function ReceiptDocument({ student, invoice, schoolName = "Centro Educacional Shekinah", schoolLocation = "Barreirinha — Amazonas" }: ReceiptDocumentProps) {
  return (
    <div id="print-area" className="receipt-two-copies">
      <ReceiptCopy label="VIA DO ALUNO" student={student} invoice={invoice} schoolName={schoolName} schoolLocation={schoolLocation} />
      <div className="receipt-cut-line"><span>✂</span><i /></div>
      <ReceiptCopy label="VIA DA ESCOLA" student={student} invoice={invoice} schoolName={schoolName} schoolLocation={schoolLocation} />
    </div>
  );
}
