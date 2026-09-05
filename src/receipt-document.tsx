import type { InstitutionSettings, Invoice, Payment, ReceiptSettings, Student } from "./model";
import "./receipt-document.css";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const normalized = value.slice(0, 10);
  return new Date(`${normalized}T12:00:00`).toLocaleDateString("pt-BR");
}

function methodLabel(value: string) {
  const labels: Record<string, string> = { dinheiro: "Dinheiro", pix_manual: "Pix", pix: "Pix", boleto: "Boleto", cartao: "Cartão", transferencia: "Transferência", manual: "Pagamento manual", outro: "Outro" };
  return labels[value] ?? value;
}

type ReceiptDocumentProps = {
  student: Student;
  invoice: Invoice;
  payment?: Payment;
  institution?: InstitutionSettings;
  settings?: ReceiptSettings;
  schoolName?: string;
  schoolLocation?: string;
};

function normalizedProps(props: ReceiptDocumentProps) {
  const institution: InstitutionSettings = props.institution ?? {
    name: props.schoolName || "Instituição de ensino", legalName: "", documentNumber: "", address: "",
    city: props.schoolLocation || "", state: "", phone: "", whatsapp: "", email: "",
    primaryColor: "#1749b8", secondaryColor: "#0f766e", logoDataUrl: "",
  };
  const settings: ReceiptSettings = props.settings ?? {
    title: "Recibo de pagamento", footer: "Emitido pelo AulaFácil",
    schoolSignatureLabel: "Assinatura da escola / responsável pelo recebimento",
    payerSignatureLabel: "Assinatura do pagador",
  };
  const payment: Payment = props.payment ?? {
    id: props.invoice.id, studentId: props.student.id, invoiceId: props.invoice.id,
    amountReceived: props.invoice.amount, principalAmount: props.invoice.amount,
    lateFeeAmount: 0, interestAmount: 0, discountAmount: 0, paymentMethod: "manual",
    status: "confirmed", paidAt: props.invoice.paidAt, receiptNumber: props.invoice.id.toUpperCase(),
    createdAt: props.invoice.paidAt ?? props.invoice.createdAt,
  };
  return { ...props, institution, settings, payment };
}

function ReceiptCopy({ label, student, invoice, payment, institution, settings }: ReturnType<typeof normalizedProps> & { label: string }) {
  const location = [institution.city, institution.state].filter(Boolean).join(" — ");
  return <article className="receipt-copy" style={{ ["--receipt-primary" as string]: institution.primaryColor }}>
    <header className="receipt-header"><div className="receipt-school">{institution.logoDataUrl && <img src={institution.logoDataUrl} alt="" />}<div><strong>{institution.name || "Instituição de ensino"}</strong><span>{location || institution.address}</span>{institution.documentNumber && <small>{institution.documentNumber}</small>}</div></div><div className="receipt-badge">{label}</div></header>
    <div className="receipt-title-row"><div><h1>{settings.title || "Recibo de pagamento"}</h1><span className="receipt-number">Nº {payment.receiptNumber || payment.id.toUpperCase()}</span></div><strong className="receipt-amount">{money(payment.amountReceived)}</strong></div>
    <div className="receipt-data-grid"><div><small>Aluno</small><strong>{student.name}</strong></div><div><small>Referência</small><strong>{invoice.reference}</strong></div><div><small>Vencimento</small><strong>{dateLabel(invoice.dueDate)}</strong></div><div><small>Pagamento</small><strong>{dateLabel(payment.paidAt)}</strong></div><div><small>Forma</small><strong>{methodLabel(payment.paymentMethod)}</strong></div>{payment.provider && <div><small>Provedor</small><strong>{payment.provider}</strong></div>}</div>
    <div className="receipt-breakdown"><div><span>Valor principal</span><strong>{money(payment.principalAmount)}</strong></div>{payment.lateFeeAmount > 0 && <div><span>Multa</span><strong>{money(payment.lateFeeAmount)}</strong></div>}{payment.interestAmount > 0 && <div><span>Juros</span><strong>{money(payment.interestAmount)}</strong></div>}{payment.discountAmount > 0 && <div><span>Desconto</span><strong>- {money(payment.discountAmount)}</strong></div>}<div className="total"><span>Total recebido</span><strong>{money(payment.amountReceived)}</strong></div></div>
    <p className="receipt-text">Declaramos o recebimento de <strong>{money(payment.amountReceived)}</strong> referente a <strong>{invoice.reference}</strong>, pago por ou em nome de <strong>{student.name}</strong>.</p>
    <div className="receipt-signatures"><div><span /><small>{settings.schoolSignatureLabel || "Assinatura da escola / responsável pelo recebimento"}</small></div><div><span /><small>{settings.payerSignatureLabel || "Assinatura do pagador"}</small></div></div>
    <footer className="receipt-footer"><span>{settings.footer || "Emitido pelo AulaFácil"}</span><span>Recibo: {payment.receiptNumber || payment.id.toUpperCase()}</span></footer>
  </article>;
}

export function ReceiptDocument(props: ReceiptDocumentProps) {
  const value = normalizedProps(props);
  return <div id="print-area" className="receipt-two-copies"><ReceiptCopy label="VIA DO ALUNO" {...value} /><div className="receipt-cut-line"><span>✂</span><i /></div><ReceiptCopy label="VIA DA ESCOLA" {...value} /></div>;
}
