from pathlib import Path

root = Path(__file__).resolve().parents[1]

def replace_once(path: str, old: str, new: str):
    p = root / path
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Trecho esperado não encontrado em {path}')
    if text.count(old) != 1:
        raise SystemExit(f'Trecho ambíguo em {path}: {text.count(old)} ocorrências')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# 1. Modelo + migração compatível.
replace_once('src/model.ts', '''export type ReceiptSettings = {
  title: string;
  footer: string;
  schoolSignatureLabel: string;
  payerSignatureLabel: string;
};''', '''export type ReceiptFieldId =
  | "guardian"
  | "class"
  | "reference"
  | "dueDate"
  | "paidAt"
  | "method"
  | "provider"
  | "principal"
  | "lateFee"
  | "interest"
  | "discount"
  | "notes";

export type ReceiptFieldSetting = {
  id: ReceiptFieldId;
  label: string;
  visible: boolean;
};

export type ReceiptSettings = {
  title: string;
  footer: string;
  observation: string;
  schoolSignatureLabel: string;
  payerSignatureLabel: string;
  showLogo: boolean;
  showInstitutionDocument: boolean;
  showInstitutionAddress: boolean;
  showInstitutionContact: boolean;
  fields: ReceiptFieldSetting[];
};''')

replace_once('src/model.ts', '''const INTEREST_MODES: InterestMode[] = ["none", "daily_percent", "monthly_percent", "fixed_daily"];
const UUID_PATTERN''', '''const INTEREST_MODES: InterestMode[] = ["none", "daily_percent", "monthly_percent", "fixed_daily"];
const RECEIPT_FIELD_IDS: ReceiptFieldId[] = ["guardian", "class", "reference", "dueDate", "paidAt", "method", "provider", "principal", "lateFee", "interest", "discount", "notes"];
const UUID_PATTERN''')

replace_once('src/model.ts', '''function defaultReceiptSettings(): ReceiptSettings {
  return {
    title: "Recibo de pagamento",
    footer: "Emitido pelo AulaFácil",
    schoolSignatureLabel: "Assinatura da escola / responsável pelo recebimento",
    payerSignatureLabel: "Assinatura do pagador",
  };
}''', '''function defaultReceiptSettings(): ReceiptSettings {
  return {
    title: "Recibo de pagamento",
    footer: "Emitido eletronicamente pelo AulaFácil",
    observation: "Recebemos {valor} referente a {referencia}, pago por ou em nome de {aluno}.",
    schoolSignatureLabel: "Assinatura da escola / responsável pelo recebimento",
    payerSignatureLabel: "Assinatura do pagador",
    showLogo: true,
    showInstitutionDocument: true,
    showInstitutionAddress: true,
    showInstitutionContact: true,
    fields: [
      { id: "guardian", label: "Responsável", visible: true },
      { id: "class", label: "Turma / curso", visible: true },
      { id: "reference", label: "Referência", visible: true },
      { id: "dueDate", label: "Vencimento", visible: true },
      { id: "paidAt", label: "Pagamento", visible: true },
      { id: "method", label: "Forma", visible: true },
      { id: "provider", label: "Provedor", visible: false },
      { id: "principal", label: "Valor principal", visible: true },
      { id: "lateFee", label: "Multa", visible: true },
      { id: "interest", label: "Juros", visible: true },
      { id: "discount", label: "Desconto", visible: true },
      { id: "notes", label: "Observação do pagamento", visible: false },
    ],
  };
}''')

# Insert sanitizador antes de sanitizeSettings.
replace_once('src/model.ts', '''function sanitizeSettings(rawSettings: Record<string, unknown>): SchoolSettings | null {''', '''function sanitizeReceiptFields(value: unknown, fallback: ReceiptFieldSetting[]): ReceiptFieldSetting[] {
  const byId = new Map(fallback.map((field) => [field.id, field]));
  const result: ReceiptFieldSetting[] = [];
  const seen = new Set<ReceiptFieldId>();
  if (Array.isArray(value)) {
    for (const item of value.slice(0, RECEIPT_FIELD_IDS.length)) {
      if (!isRecord(item) || !RECEIPT_FIELD_IDS.includes(item.id as ReceiptFieldId)) continue;
      const id = item.id as ReceiptFieldId;
      if (seen.has(id)) continue;
      const defaultField = byId.get(id)!;
      result.push({
        id,
        label: text(item.label, 60, defaultField.label) || defaultField.label,
        visible: item.visible === undefined ? defaultField.visible : Boolean(item.visible),
      });
      seen.add(id);
    }
  }
  for (const field of fallback) {
    if (!seen.has(field.id)) result.push({ ...field });
  }
  return result;
}

function sanitizeSettings(rawSettings: Record<string, unknown>): SchoolSettings | null {''')

replace_once('src/model.ts', '''    receipt: {
      title: text(rawReceipt.title, 120, defaults.receipt.title),
      footer: text(rawReceipt.footer, 300, defaults.receipt.footer),
      schoolSignatureLabel: text(rawReceipt.schoolSignatureLabel, 160, defaults.receipt.schoolSignatureLabel),
      payerSignatureLabel: text(rawReceipt.payerSignatureLabel, 160, defaults.receipt.payerSignatureLabel),
    },''', '''    receipt: {
      title: text(rawReceipt.title, 120, defaults.receipt.title),
      footer: text(rawReceipt.footer, 300, defaults.receipt.footer),
      observation: text(rawReceipt.observation, 500, defaults.receipt.observation),
      schoolSignatureLabel: text(rawReceipt.schoolSignatureLabel, 160, defaults.receipt.schoolSignatureLabel),
      payerSignatureLabel: text(rawReceipt.payerSignatureLabel, 160, defaults.receipt.payerSignatureLabel),
      showLogo: rawReceipt.showLogo === undefined ? defaults.receipt.showLogo : Boolean(rawReceipt.showLogo),
      showInstitutionDocument: rawReceipt.showInstitutionDocument === undefined ? defaults.receipt.showInstitutionDocument : Boolean(rawReceipt.showInstitutionDocument),
      showInstitutionAddress: rawReceipt.showInstitutionAddress === undefined ? defaults.receipt.showInstitutionAddress : Boolean(rawReceipt.showInstitutionAddress),
      showInstitutionContact: rawReceipt.showInstitutionContact === undefined ? defaults.receipt.showInstitutionContact : Boolean(rawReceipt.showInstitutionContact),
      fields: sanitizeReceiptFields(rawReceipt.fields, defaults.receipt.fields),
    },''')

# 2. Configurações: controles completos do recibo.
replace_once('src/professional-settings.tsx', '''export function DocumentSettingsPanel({ receipt, certificate, onReceiptChange, onCertificateChange }: DocumentSettingsProps) {
  const updateReceipt = <K extends keyof ReceiptSettings>(key: K, fieldValue: ReceiptSettings[K]) => onReceiptChange({ ...receipt, [key]: fieldValue });
  const updateCertificate''', '''export function DocumentSettingsPanel({ receipt, certificate, onReceiptChange, onCertificateChange }: DocumentSettingsProps) {
  const updateReceipt = <K extends keyof ReceiptSettings>(key: K, fieldValue: ReceiptSettings[K]) => onReceiptChange({ ...receipt, [key]: fieldValue });
  const updateReceiptField = (index: number, patch: Partial<ReceiptSettings["fields"][number]>) => {
    const fields = receipt.fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field);
    updateReceipt("fields", fields);
  };
  const moveReceiptField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= receipt.fields.length) return;
    const fields = [...receipt.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    updateReceipt("fields", fields);
  };
  const updateCertificate''')

replace_once('src/professional-settings.tsx', '''      <div className="settings-subsection">
        <h3>Recibo em duas vias</h3>
        <div className="settings-form-grid">
          <label><span>Título</span><input value={receipt.title} maxLength={120} onChange={(e) => updateReceipt("title", e.target.value)} /></label>
          <label><span>Rodapé</span><input value={receipt.footer} maxLength={300} onChange={(e) => updateReceipt("footer", e.target.value)} /></label>
          <label><span>Assinatura da escola</span><input value={receipt.schoolSignatureLabel} maxLength={160} onChange={(e) => updateReceipt("schoolSignatureLabel", e.target.value)} /></label>
          <label><span>Assinatura do pagador</span><input value={receipt.payerSignatureLabel} maxLength={160} onChange={(e) => updateReceipt("payerSignatureLabel", e.target.value)} /></label>
        </div>
      </div>''', '''      <div className="settings-subsection">
        <h3>Recibo em duas vias</h3>
        <p className="receipt-customizer-note">A VIA DO PAGANTE e a VIA DA ESCOLA usam o mesmo número e ficam juntas em uma folha A4. Número do recibo, aluno e total recebido são sempre exibidos para preservar a integridade financeira.</p>
        <div className="settings-form-grid">
          <label><span>Título</span><input value={receipt.title} maxLength={120} onChange={(e) => updateReceipt("title", e.target.value)} /></label>
          <label><span>Rodapé</span><input value={receipt.footer} maxLength={300} onChange={(e) => updateReceipt("footer", e.target.value)} /></label>
          <label className="settings-span-2"><span>Texto / observação do recibo</span><textarea rows={3} maxLength={500} value={receipt.observation} onChange={(e) => updateReceipt("observation", e.target.value)} /><small>Variáveis disponíveis: {'{aluno}'}, {'{valor}'}, {'{referencia}'}, {'{data}'}, {'{responsavel}'}, {'{turma}'}.</small></label>
          <label><span>Assinatura da escola</span><input value={receipt.schoolSignatureLabel} maxLength={160} onChange={(e) => updateReceipt("schoolSignatureLabel", e.target.value)} /></label>
          <label><span>Assinatura do pagador</span><input value={receipt.payerSignatureLabel} maxLength={160} onChange={(e) => updateReceipt("payerSignatureLabel", e.target.value)} /></label>
        </div>

        <div className="receipt-options-grid">
          <label><input type="checkbox" checked={receipt.showLogo} onChange={(e) => updateReceipt("showLogo", e.target.checked)} /><span>Logo</span></label>
          <label><input type="checkbox" checked={receipt.showInstitutionDocument} onChange={(e) => updateReceipt("showInstitutionDocument", e.target.checked)} /><span>CNPJ / CPF da instituição</span></label>
          <label><input type="checkbox" checked={receipt.showInstitutionAddress} onChange={(e) => updateReceipt("showInstitutionAddress", e.target.checked)} /><span>Endereço da instituição</span></label>
          <label><input type="checkbox" checked={receipt.showInstitutionContact} onChange={(e) => updateReceipt("showInstitutionContact", e.target.checked)} /><span>Telefone / WhatsApp / e-mail</span></label>
        </div>

        <div className="receipt-field-editor">
          <div><strong>Campos do recibo</strong><small>Ligue/desligue, renomeie e use as setas para mudar a ordem.</small></div>
          <div className="receipt-field-list">
            {receipt.fields.map((field, index) => (
              <div className="receipt-field-row" key={field.id}>
                <label className="receipt-field-toggle"><input type="checkbox" checked={field.visible} onChange={(e) => updateReceiptField(index, { visible: e.target.checked })} /><span>Mostrar</span></label>
                <input aria-label={`Rótulo de ${field.id}`} maxLength={60} value={field.label} onChange={(e) => updateReceiptField(index, { label: e.target.value })} />
                <div className="receipt-field-actions"><button type="button" disabled={index === 0} onClick={() => moveReceiptField(index, -1)} aria-label="Mover campo para cima">↑</button><button type="button" disabled={index === receipt.fields.length - 1} onClick={() => moveReceiptField(index, 1)} aria-label="Mover campo para baixo">↓</button></div>
              </div>
            ))}
          </div>
        </div>
      </div>''')

# CSS dos controles.
p = root / 'src/professional-settings.css'
css = p.read_text(encoding='utf-8')
addition = '''\n.receipt-customizer-note{margin:-5px 0 16px;color:var(--muted);font-size:12px;line-height:1.55}.receipt-options-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:16px}.receipt-options-grid label{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--line);border-radius:11px;background:var(--canvas);color:var(--text);font-size:12px;font-weight:700}.receipt-field-editor{margin-top:18px;padding:16px;border:1px solid var(--line);border-radius:15px;background:var(--canvas)}.receipt-field-editor>div:first-child{display:flex;flex-direction:column;gap:3px;margin-bottom:11px}.receipt-field-editor strong{font-size:13px;color:var(--text)}.receipt-field-editor small{font-size:11px;color:var(--muted)}.receipt-field-list{display:grid;gap:8px}.receipt-field-row{display:grid;grid-template-columns:90px minmax(0,1fr) auto;align-items:center;gap:9px;padding:8px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}.receipt-field-row>input{width:100%;min-height:36px;padding:7px 9px;color:var(--text);border:1px solid var(--line);border-radius:8px;background:var(--surface)}.receipt-field-toggle{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11px;font-weight:700}.receipt-field-actions{display:flex;gap:5px}.receipt-field-actions button{width:32px;height:32px;border:1px solid var(--line);border-radius:8px;background:var(--canvas);color:var(--text);font-weight:900}.receipt-field-actions button:disabled{opacity:.35;cursor:not-allowed}@media(max-width:700px){.receipt-options-grid{grid-template-columns:1fr}.receipt-field-row{grid-template-columns:76px minmax(0,1fr) auto}}\n'''
if '.receipt-field-editor{' not in css:
    p.write_text(css + addition, encoding='utf-8')

# 3. Documento totalmente personalizável + duas vias compactas A4.
(root / 'src/receipt-document.tsx').write_text(r'''import type { ClassItem, InstitutionSettings, Invoice, Payment, ReceiptFieldId, ReceiptSettings, Student } from "./model";
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
''', encoding='utf-8')

(root / 'src/receipt-document.css').write_text(r'''@page{size:A4 portrait;margin:7mm}.receipt-two-copies{display:flex;flex-direction:column;gap:14px;width:min(860px,100%);margin:0 auto}.receipt-copy{--receipt-primary:#1749b8;background:#fff;border:1px solid #d7dfeb;border-radius:16px;padding:20px 24px;color:#17233c;box-shadow:0 12px 30px rgba(20,45,90,.07);min-width:0}.receipt-header,.receipt-title-row,.receipt-footer{display:flex;align-items:center;justify-content:space-between;gap:14px}.receipt-school{display:flex;align-items:center;gap:10px;min-width:0}.receipt-school img{width:42px;height:42px;object-fit:contain;border-radius:9px;border:1px solid #e4eaf3;flex:0 0 auto}.receipt-school>div{display:flex;flex-direction:column;gap:2px;min-width:0}.receipt-header strong{font-size:15px}.receipt-header span,.receipt-header small,.receipt-footer,.receipt-number,.receipt-data-grid small,.receipt-required-grid small,.receipt-signatures small{color:#66748d}.receipt-header span,.receipt-header small{font-size:10px;line-height:1.3;overflow-wrap:anywhere}.receipt-badge{padding:6px 10px;border-radius:999px;background:#eef4ff;color:var(--receipt-primary);font-weight:800;font-size:10px;letter-spacing:.05em;white-space:nowrap}.receipt-title-row{margin-top:12px}.receipt-title-row h1{margin:0 0 3px;font-size:19px}.receipt-amount{font-size:22px;color:var(--receipt-primary);white-space:nowrap}.receipt-required-grid,.receipt-data-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:10px}.receipt-required-grid{grid-template-columns:2fr 1fr}.receipt-required-grid>div,.receipt-data-grid>div{padding:7px 9px;border:1px solid #e4eaf3;border-radius:9px;display:flex;flex-direction:column;gap:2px;min-width:0}.receipt-required-grid small,.receipt-data-grid small{font-size:9px;text-transform:uppercase;letter-spacing:.03em}.receipt-required-grid strong,.receipt-data-grid strong{font-size:11px;line-height:1.25;overflow-wrap:anywhere}.receipt-text{margin:9px 0 0;line-height:1.35;font-size:10.5px}.receipt-signatures{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px}.receipt-signatures.single{grid-template-columns:1fr}.receipt-signatures div{display:flex;flex-direction:column;gap:4px;text-align:center}.receipt-signatures span{display:block;border-top:1px solid #76849a}.receipt-signatures small{font-size:9px}.receipt-footer{margin-top:9px;padding-top:7px;border-top:1px solid #edf0f5;font-size:8.5px}.receipt-cut-line{display:flex;align-items:center;gap:8px;color:#9aa6b8}.receipt-cut-line i{display:block;flex:1;border-top:2px dashed #c9d1dd}@media(max-width:700px){.receipt-copy{padding:17px}.receipt-title-row,.receipt-header{align-items:flex-start;flex-direction:column}.receipt-data-grid{grid-template-columns:1fr 1fr}.receipt-required-grid{grid-template-columns:1fr}.receipt-signatures{grid-template-columns:1fr}.receipt-badge{align-self:flex-end}}@media print{html,body{margin:0!important;padding:0!important;background:#fff!important}.receipt-two-copies{display:grid;grid-template-rows:minmax(0,1fr) auto minmax(0,1fr);width:100%;height:283mm;gap:2.5mm;margin:0;overflow:hidden}.receipt-copy{box-sizing:border-box;height:100%;max-height:139mm;overflow:hidden;box-shadow:none;border:1px solid #9ea8b6;border-radius:0;padding:3.5mm 4.5mm;break-inside:avoid}.receipt-cut-line{margin:0 1mm;height:4mm}.receipt-badge{border:1px solid #9ea8b6;background:transparent}.receipt-title-row{margin-top:2.5mm}.receipt-required-grid,.receipt-data-grid{margin-top:2mm;gap:1.5mm}.receipt-required-grid>div,.receipt-data-grid>div{padding:1.7mm 2mm}.receipt-text{margin-top:2mm;max-height:12mm;overflow:hidden}.receipt-signatures{margin-top:4mm}.receipt-footer{margin-top:2mm;padding-top:1.5mm}.receipt-header strong{font-size:11pt}.receipt-title-row h1{font-size:14pt}.receipt-amount{font-size:16pt}.receipt-required-grid strong,.receipt-data-grid strong{font-size:8.2pt}.receipt-header span,.receipt-header small,.receipt-text{font-size:7.5pt}.receipt-footer,.receipt-signatures small{font-size:6.7pt}}
''', encoding='utf-8')

# App passa a turma/curso ao recibo.
replace_once('src/App.tsx', '''<ReceiptDocument student={value.student} invoice={value.invoice} payment={value.payment} institution={institution} settings={database.settings.receipt} />''', '''<ReceiptDocument student={value.student} invoice={value.invoice} payment={value.payment} institution={institution} settings={database.settings.receipt} classItem={classItem} />''')

# 4. Testes da migração/persistência das preferências.
(root / 'src/receipt-settings.test.ts').write_text(r'''import { describe, expect, it } from "vitest";
import { emptyDatabase, normalizeDatabase } from "./model";

describe("configuração de recibos", () => {
  it("preserva ordem, rótulos e visibilidade personalizados", () => {
    const database = emptyDatabase();
    database.settings.receipt.title = "Comprovante escolar";
    database.settings.receipt.observation = "Pago por {responsavel}: {valor}";
    database.settings.receipt.showInstitutionContact = false;
    database.settings.receipt.fields = [
      { id: "method", label: "Meio usado", visible: true },
      { id: "reference", label: "Competência", visible: true },
      ...database.settings.receipt.fields.filter((field) => field.id !== "method" && field.id !== "reference"),
    ];
    const normalized = normalizeDatabase(structuredClone(database));
    expect(normalized).not.toBeNull();
    expect(normalized!.settings.receipt.title).toBe("Comprovante escolar");
    expect(normalized!.settings.receipt.observation).toContain("{valor}");
    expect(normalized!.settings.receipt.showInstitutionContact).toBe(false);
    expect(normalized!.settings.receipt.fields[0]).toEqual({ id: "method", label: "Meio usado", visible: true });
    expect(normalized!.settings.receipt.fields[1]).toEqual({ id: "reference", label: "Competência", visible: true });
  });

  it("migra configurações antigas sem perder compatibilidade", () => {
    const database: any = emptyDatabase();
    database.settings.receipt = {
      title: "Recibo antigo",
      footer: "Rodapé antigo",
      schoolSignatureLabel: "Escola",
      payerSignatureLabel: "Pagador",
    };
    const normalized = normalizeDatabase(database);
    expect(normalized).not.toBeNull();
    expect(normalized!.settings.receipt.title).toBe("Recibo antigo");
    expect(normalized!.settings.receipt.fields).toHaveLength(12);
    expect(normalized!.settings.receipt.showLogo).toBe(true);
    expect(normalized!.settings.receipt.observation).toContain("{aluno}");
  });

  it("remove campos desconhecidos e duplicados, repondo os obrigatórios de configuração", () => {
    const database: any = emptyDatabase();
    database.settings.receipt.fields = [
      { id: "reference", label: "Ref.", visible: false },
      { id: "reference", label: "Duplicado", visible: true },
      { id: "invalido", label: "Não pode", visible: true },
    ];
    const normalized = normalizeDatabase(database)!;
    expect(normalized.settings.receipt.fields).toHaveLength(12);
    expect(normalized.settings.receipt.fields.filter((field) => field.id === "reference")).toHaveLength(1);
    expect(normalized.settings.receipt.fields[0]).toEqual({ id: "reference", label: "Ref.", visible: false });
  });
});
''', encoding='utf-8')

print('Personalização completa do recibo aplicada com sucesso.')
