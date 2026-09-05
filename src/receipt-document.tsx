import { useEffect, useMemo, useState } from "react";
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

type ReceiptFieldId = "student" | "reference" | "dueDate" | "paidAt" | "amount" | "receiptNumber";
type ReceiptFieldSetting = { id: ReceiptFieldId; label: string; visible: boolean };
type ReceiptSettings = {
  schoolName: string;
  schoolLocation: string;
  title: string;
  studentCopyLabel: string;
  schoolCopyLabel: string;
  fields: ReceiptFieldSetting[];
  observation: string;
  showSchoolSignature: boolean;
  schoolSignatureLabel: string;
  showPayerSignature: boolean;
  payerSignatureLabel: string;
  footerText: string;
};

const SETTINGS_KEY = "aulafacil.receipt-settings.v1";

const defaultSettings: ReceiptSettings = {
  schoolName: "Centro Educacional Shekinah",
  schoolLocation: "Barreirinha — Amazonas",
  title: "Recibo de pagamento",
  studentCopyLabel: "VIA DO ALUNO",
  schoolCopyLabel: "VIA DA ESCOLA",
  fields: [
    { id: "student", label: "Aluno", visible: true },
    { id: "reference", label: "Referência", visible: true },
    { id: "dueDate", label: "Vencimento", visible: true },
    { id: "paidAt", label: "Pagamento", visible: true },
    { id: "amount", label: "Valor", visible: false },
    { id: "receiptNumber", label: "Nº do recibo", visible: false },
  ],
  observation: "",
  showSchoolSignature: true,
  schoolSignatureLabel: "Assinatura da escola / responsável pelo recebimento",
  showPayerSignature: true,
  payerSignatureLabel: "Assinatura do pagador",
  footerText: "Emitido pelo AulaFácil",
};

function safeSettings(): ReceiptSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<ReceiptSettings>;
    const known = new Map(defaultSettings.fields.map((field) => [field.id, field]));
    const incoming = Array.isArray(parsed.fields) ? parsed.fields : [];
    const fields: ReceiptFieldSetting[] = [];
    for (const item of incoming) {
      if (!item || typeof item !== "object") continue;
      const candidate = item as Partial<ReceiptFieldSetting>;
      const fallback = candidate.id ? known.get(candidate.id) : undefined;
      if (!fallback || fields.some((field) => field.id === fallback.id)) continue;
      fields.push({
        id: fallback.id,
        label: typeof candidate.label === "string" ? candidate.label.slice(0, 40) || fallback.label : fallback.label,
        visible: candidate.visible === undefined ? fallback.visible : Boolean(candidate.visible),
      });
    }
    for (const fallback of defaultSettings.fields) {
      if (!fields.some((field) => field.id === fallback.id)) fields.push(fallback);
    }
    return {
      ...defaultSettings,
      ...parsed,
      schoolName: typeof parsed.schoolName === "string" ? parsed.schoolName.slice(0, 120) : defaultSettings.schoolName,
      schoolLocation: typeof parsed.schoolLocation === "string" ? parsed.schoolLocation.slice(0, 120) : defaultSettings.schoolLocation,
      title: typeof parsed.title === "string" ? parsed.title.slice(0, 80) : defaultSettings.title,
      studentCopyLabel: typeof parsed.studentCopyLabel === "string" ? parsed.studentCopyLabel.slice(0, 40) : defaultSettings.studentCopyLabel,
      schoolCopyLabel: typeof parsed.schoolCopyLabel === "string" ? parsed.schoolCopyLabel.slice(0, 40) : defaultSettings.schoolCopyLabel,
      observation: typeof parsed.observation === "string" ? parsed.observation.slice(0, 500) : "",
      schoolSignatureLabel: typeof parsed.schoolSignatureLabel === "string" ? parsed.schoolSignatureLabel.slice(0, 100) : defaultSettings.schoolSignatureLabel,
      payerSignatureLabel: typeof parsed.payerSignatureLabel === "string" ? parsed.payerSignatureLabel.slice(0, 100) : defaultSettings.payerSignatureLabel,
      footerText: typeof parsed.footerText === "string" ? parsed.footerText.slice(0, 100) : defaultSettings.footerText,
      fields,
    };
  } catch {
    return defaultSettings;
  }
}

type ReceiptDocumentProps = {
  student: Student;
  invoice: Invoice;
  schoolName?: string;
  schoolLocation?: string;
};

function fieldValue(id: ReceiptFieldId, student: Student, invoice: Invoice) {
  if (id === "student") return student.name;
  if (id === "reference") return invoice.reference;
  if (id === "dueDate") return dateLabel(invoice.dueDate);
  if (id === "paidAt") return dateLabel(invoice.paidAt);
  if (id === "amount") return money(invoice.amount);
  return invoice.id.toUpperCase();
}

function ReceiptCopy({ label, student, invoice, settings }: { label: string; student: Student; invoice: Invoice; settings: ReceiptSettings }) {
  const visibleFields = settings.fields.filter((field) => field.visible);
  return (
    <article className="receipt-copy">
      <header className="receipt-header">
        <div><strong>{settings.schoolName}</strong><span>{settings.schoolLocation}</span></div>
        <div className="receipt-badge">{label}</div>
      </header>

      <div className="receipt-title-row">
        <div><h1>{settings.title}</h1><span className="receipt-number">Nº {invoice.id.toUpperCase()}</span></div>
        <strong className="receipt-amount">{money(invoice.amount)}</strong>
      </div>

      {visibleFields.length > 0 && (
        <div className="receipt-data-grid">
          {visibleFields.map((field) => <div key={field.id}><small>{field.label}</small><strong>{fieldValue(field.id, student, invoice)}</strong></div>)}
        </div>
      )}

      <p className="receipt-text">Declaramos o recebimento de <strong>{money(invoice.amount)}</strong> referente a <strong>{invoice.reference}</strong>, pago por ou em nome de <strong>{student.name}</strong>.</p>
      {settings.observation.trim() && <div className="receipt-observation"><small>Observação</small><p>{settings.observation.trim()}</p></div>}

      {(settings.showSchoolSignature || settings.showPayerSignature) && (
        <div className={`receipt-signatures ${settings.showSchoolSignature && settings.showPayerSignature ? "" : "single"}`}>
          {settings.showSchoolSignature && <div><span /><small>{settings.schoolSignatureLabel}</small></div>}
          {settings.showPayerSignature && <div><span /><small>{settings.payerSignatureLabel}</small></div>}
        </div>
      )}

      <footer className="receipt-footer"><span>{settings.footerText}</span><span>Recibo: {invoice.id.toUpperCase()}</span></footer>
    </article>
  );
}

function ReceiptCustomizer({ settings, onChange, onReset }: { settings: ReceiptSettings; onChange: (next: ReceiptSettings) => void; onReset: () => void }) {
  const patch = (change: Partial<ReceiptSettings>) => onChange({ ...settings, ...change });
  const updateField = (index: number, change: Partial<ReceiptFieldSetting>) => {
    const fields = settings.fields.map((field, itemIndex) => itemIndex === index ? { ...field, ...change } : field);
    patch({ fields });
  };
  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= settings.fields.length) return;
    const fields = [...settings.fields];
    [fields[index], fields[target]] = [fields[target], fields[index]];
    patch({ fields });
  };

  return <aside className="receipt-customizer no-print">
    <div className="receipt-customizer-heading"><div><strong>Personalizar recibo</strong><span>As alterações ficam salvas neste computador.</span></div><button type="button" className="receipt-reset" onClick={onReset}>Restaurar padrão</button></div>
    <div className="receipt-customizer-grid">
      <label><span>Nome da instituição</span><input value={settings.schoolName} maxLength={120} onChange={(event) => patch({ schoolName: event.target.value })} /></label>
      <label><span>Local da instituição</span><input value={settings.schoolLocation} maxLength={120} onChange={(event) => patch({ schoolLocation: event.target.value })} /></label>
      <label><span>Título</span><input value={settings.title} maxLength={80} onChange={(event) => patch({ title: event.target.value })} /></label>
      <label><span>Via do aluno</span><input value={settings.studentCopyLabel} maxLength={40} onChange={(event) => patch({ studentCopyLabel: event.target.value })} /></label>
      <label><span>Via da escola</span><input value={settings.schoolCopyLabel} maxLength={40} onChange={(event) => patch({ schoolCopyLabel: event.target.value })} /></label>
      <label><span>Rodapé</span><input value={settings.footerText} maxLength={100} onChange={(event) => patch({ footerText: event.target.value })} /></label>
    </div>

    <div className="receipt-fields-editor"><strong>Campos, nomes e ordem</strong>{settings.fields.map((field, index) => <div className="receipt-field-row" key={field.id}>
      <label className="receipt-field-toggle"><input type="checkbox" checked={field.visible} onChange={(event) => updateField(index, { visible: event.target.checked })} /><span>Mostrar</span></label>
      <input aria-label={`Nome do campo ${field.label}`} value={field.label} maxLength={40} onChange={(event) => updateField(index, { label: event.target.value })} />
      <div className="receipt-order-buttons"><button type="button" disabled={index === 0} onClick={() => moveField(index, -1)} title="Mover para cima">↑</button><button type="button" disabled={index === settings.fields.length - 1} onClick={() => moveField(index, 1)} title="Mover para baixo">↓</button></div>
    </div>)}</div>

    <label className="receipt-observation-editor"><span>Observação personalizada</span><textarea rows={3} maxLength={500} value={settings.observation} onChange={(event) => patch({ observation: event.target.value })} placeholder="Opcional. Ex.: Pagamento referente ao curso..." /></label>

    <div className="receipt-signature-editor"><strong>Assinaturas</strong><label><input type="checkbox" checked={settings.showSchoolSignature} onChange={(event) => patch({ showSchoolSignature: event.target.checked })} /> Assinatura da escola</label>{settings.showSchoolSignature && <input maxLength={100} value={settings.schoolSignatureLabel} onChange={(event) => patch({ schoolSignatureLabel: event.target.value })} />}<label><input type="checkbox" checked={settings.showPayerSignature} onChange={(event) => patch({ showPayerSignature: event.target.checked })} /> Assinatura do pagador</label>{settings.showPayerSignature && <input maxLength={100} value={settings.payerSignatureLabel} onChange={(event) => patch({ payerSignatureLabel: event.target.value })} />}</div>
  </aside>;
}

export function ReceiptDocument({ student, invoice, schoolName, schoolLocation }: ReceiptDocumentProps) {
  const initial = useMemo(() => {
    const stored = safeSettings();
    return { ...stored, schoolName: schoolName ?? stored.schoolName, schoolLocation: schoolLocation ?? stored.schoolLocation };
  }, [schoolName, schoolLocation]);
  const [settings, setSettings] = useState<ReceiptSettings>(initial);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage can be unavailable in restricted webviews */ }
  }, [settings]);

  const reset = () => {
    const next = { ...defaultSettings, fields: defaultSettings.fields.map((field) => ({ ...field })) };
    setSettings(next);
  };

  return <div className="receipt-workspace">
    <ReceiptCustomizer settings={settings} onChange={setSettings} onReset={reset} />
    <div id="print-area" className="receipt-two-copies">
      <ReceiptCopy label={settings.studentCopyLabel} student={student} invoice={invoice} settings={settings} />
      <div className="receipt-cut-line"><span>✂</span><i /></div>
      <ReceiptCopy label={settings.schoolCopyLabel} student={student} invoice={invoice} settings={settings} />
    </div>
  </div>;
}
