import type { ClassItem, InstitutionSettings, Invoice, Payment, ReceiptFieldId, ReceiptSettings, Student } from "./model";
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

const fallbackFields: ReceiptSettings["fields"] = [
  { id: "guardian", label: "Responsável", visible: true }, { id: "class", label: "Turma / curso", visible: true },
  { id: "reference", label: "Referência", visible: true }, { id: "dueDate", label: "Vencimento", visible: true },
  { id: "paidAt", label: "Pagamento", visible: true }, { id: "method", label: "Forma", visible: true },
  { id: "provider", label: "Provedor", visible: false }, { id: "principal", label: "Valor principal", visible: true },
  { id: "lateFee", label: "Multa", visible: true }, { id: "interest", label: "Juros", visible: true },
  { id: "discount", label: "Desconto", visible: true }, { id: "notes", label: "Observação do pagamento", visible: false },
];

const fallbackSettings: ReceiptSettings = {
  title: "Recibo de pagamento", footer: "Emitido eletronicamente pelo AulaFácil",
  observation: "Recebemos {valor} referente a {referencia}, pago por ou em nome de {aluno}.",
  schoolSignatureLabel: "Assinatura da escola / responsável pelo recebimento", payerSignatureLabel: "Assinatura do pagador",
  showLogo: true, showInstitutionDocument: true, showInstitutionAddress: true, showInstitutionContact: true, fields: fallbackFields,
};

type ReceiptDocumentProps = {
  student: Student;
  invoice: Invoice;
  payment?: Payment;
  institution?: InstitutionSettings;
  settings?: ReceiptSettings;
  classItem?: ClassItem;
  schoolName?: string;
  schoolLocation?: string;
};

function normalizedProps(props: ReceiptDocumentProps) {
  const institution: InstitutionSettings = props.institution ?? {
    name: props.schoolName || "Instituição de ensino", legalName: "", documentNumber: "", address: "",
    city: props.schoolLocation || "", state: "", phone: "", whatsapp: "", email: "",
    primaryColor: "#1749b8", secondaryColor: "#0f766e", logoDataUrl: "",
  };
  const settings: ReceiptSettings = { ...fallbackSettings, ...(props.settings ?? {}), fields: props.settings?.fields?.length ? props.settings.fields : fallbackFields };
  const payment: Payment = props.payment ?? {
    id: props.invoice.id, studentId: props.student.id, invoiceId: props.invoice.id,
    amountReceived: props.invoice.amount, principalAmount: props.invoice.amount,
    lateFeeAmount: 0, interestAmount: 0, discountAmount: 0, paymentMethod: "manual",
    status: "confirmed", paidAt: props.invoice.paidAt, receiptNumber: props.invoice.id.toUpperCase(),
    createdAt: props.invoice.paidAt ?? props.invoice.createdAt,
  };
  return { ...props, institution, settings, payment };
}

function fieldValue(id: ReceiptFieldId, value: ReturnType<typeof normalizedProps>) {
  const { student, invoice, payment, classItem } = value;
  switch (id) {
    case "guardian": return student.guardianName || "";
    case "class": return classItem?.name || "";
    case "reference": return invoice.reference;
    case "dueDate": return dateLabel(invoice.dueDate);
    case "paidAt": return dateLabel(payment.paidAt);
    case "method": return methodLabel(payment.paymentMethod);
    case "provider": return payment.provider || "";
    case "principal": return money(payment.principalAmount);
    case "lateFee": return payment.lateFeeAmount > 0 ? money(payment.lateFeeAmount) : "";
    case "interest": return payment.interestAmount > 0 ? money(payment.interestAmount) : "";
    case "discount": return payment.discountAmount > 0 ? `- ${money(payment.discountAmount)}` : "";
    case "notes": return payment.notes || "";
  }
}

function observationText(template: string, value: ReturnType<typeof normalizedProps>) {
  const replacements: Record<string, string> = {
    "{aluno}": value.student.name,
    "{valor}": money(value.payment.amountReceived),
    "{referencia}": value.invoice.reference,
    "{data}": dateLabel(value.payment.paidAt),
    "{responsavel}": value.student.guardianName || value.student.name,
    "{turma}": value.classItem?.name || "",
  };
  return Object.entries(replacements).reduce((text, [key, replacement]) => text.split(key).join(replacement), template || "").trim();
}

function ReceiptCopy({ label, ...value }: ReturnType<typeof normalizedProps> & { label: string }) {
  const { student, payment, institution, settings } = value;
  const location = [institution.city, institution.state].filter(Boolean).join(" — ");
  const address = [institution.address, location].filter(Boolean).join(" · ");
  const contact = [institution.phone, institution.whatsapp && institution.whatsapp !== institution.phone ? `WhatsApp ${institution.whatsapp}` : "", institution.email].filter(Boolean).join(" · ");
  const fields = settings.fields
    .filter((field) => field.visible)
    .map((field) => ({ ...field, value: fieldValue(field.id, value) }))
    .filter((field) => field.value);
  const observation = observationText(settings.observation, value);
  const receiptNumber = payment.receiptNumber || payment.id.toUpperCase();

  return <article className="receipt-copy" style={{ ["--receipt-primary" as string]: institution.primaryColor }}>
    <header className="receipt-header">
      <div className="receipt-school">
        {settings.showLogo && institution.logoDataUrl && <img src={institution.logoDataUrl} alt="Logo da instituição" />}
        <div><strong>{institution.name || "Instituição de ensino"}</strong>
          {settings.showInstitutionAddress && address && <span>{address}</span>}
          {settings.showInstitutionDocument && institution.documentNumber && <small>{institution.documentNumber}</small>}
          {settings.showInstitutionContact && contact && <small>{contact}</small>}
        </div>
      </div>
      <div className="receipt-badge">{label}</div>
    </header>

    <div className="receipt-title-row"><div><h1>{settings.title || "Recibo de pagamento"}</h1><span className="receipt-number">Nº {receiptNumber}</span></div><strong className="receipt-amount">{money(payment.amountReceived)}</strong></div>

    <div className="receipt-required-grid"><div><small>Aluno</small><strong>{student.name}</strong></div><div><small>Total recebido</small><strong>{money(payment.amountReceived)}</strong></div></div>
    {fields.length > 0 && <div className="receipt-data-grid">{fields.map((field) => <div key={field.id}><small>{field.label}</small><strong>{field.value}</strong></div>)}</div>}
    {observation && <p className="receipt-text">{observation}</p>}

    {(settings.schoolSignatureLabel || settings.payerSignatureLabel) && <div className={`receipt-signatures ${!settings.schoolSignatureLabel || !settings.payerSignatureLabel ? "single" : ""}`}>
      {settings.schoolSignatureLabel && <div><span /><small>{settings.schoolSignatureLabel}</small></div>}
      {settings.payerSignatureLabel && <div><span /><small>{settings.payerSignatureLabel}</small></div>}
    </div>}
    <footer className="receipt-footer"><span>{settings.footer || "Emitido pelo AulaFácil"}</span><span>Recibo: {receiptNumber}</span></footer>
  </article>;
}

export function ReceiptDocument(props: ReceiptDocumentProps) {
  const value = normalizedProps(props);
  return <div id="print-area" className="receipt-two-copies"><ReceiptCopy label="VIA DO PAGANTE" {...value} /><div className="receipt-cut-line"><span>✂</span><i /></div><ReceiptCopy label="VIA DA ESCOLA" {...value} /></div>;
}
