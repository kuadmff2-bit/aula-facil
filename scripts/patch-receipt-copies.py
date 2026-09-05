from pathlib import Path

path = Path("src/App.tsx")
text = path.read_text(encoding="utf-8")

import_old = 'import { collectStudentFields, StudentExtraFieldsForm, StudentExtraInfo, StudentFieldsSettings } from "./student-fields";\n'
import_new = import_old + 'import { ReceiptDocument } from "./receipt-document";\n'
if 'import { ReceiptDocument } from "./receipt-document";' not in text:
    if import_old not in text:
        raise SystemExit("Import base não encontrado")
    text = text.replace(import_old, import_new, 1)

old = 'function DocumentModal({ value, classItem, onClose }: { value: NonNullable<Printable>; classItem?: ClassItem; onClose: () => void }) {\n  const today = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());\n  return <div className="modal-backdrop document-backdrop"><section className="document-dialog"><div className="document-toolbar"><div><strong>{value.type}</strong><span>Confira antes de imprimir ou salvar em PDF.</span></div><button className="secondary-button" onClick={onClose}>Fechar</button><button className="primary-button" onClick={() => window.print()}><Printer size={18} /> Imprimir ou PDF</button></div><article id="print-area"><header><div><strong>Centro Educacional Shekinah</strong><span>Barreirinha — Amazonas</span></div><b>S</b></header><h1>{value.type}</h1><p>{value.type === "Recibo" ? <>Recebemos de <strong>{value.student.name}</strong> o valor de <strong>{money(value.invoice?.amount ?? 0)}</strong>, referente a <strong>{value.invoice?.reference}</strong>, com pagamento confirmado em <strong>{dateLabel(value.invoice?.paidAt ?? null)}</strong>.</> : value.type === "Certificado" ? <>Certificamos que <strong>{value.student.name}</strong> concluiu as atividades do curso <strong>{classItem?.name ?? "informado pela instituição"}</strong> no Centro Educacional Shekinah.</> : <>Declaramos, para os devidos fins, que <strong>{value.student.name}</strong> encontra-se regularmente matriculado(a) no curso <strong>{classItem?.name ?? "informado pela instituição"}</strong>, com aulas no horário <strong>{classItem?.schedule ?? "registrado pela secretaria"}</strong>.</>}</p><div className="document-date">Barreirinha, {today}.</div><footer><span /><p>Secretaria<br />Centro Educacional Shekinah</p></footer>{value.type === "Recibo" && <small className="document-code">Recibo: {value.invoice?.id.toUpperCase()}</small>}</article></section></div>;\n}\n'

new = 'function DocumentModal({ value, classItem, onClose }: { value: NonNullable<Printable>; classItem?: ClassItem; onClose: () => void }) {\n  const today = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());\n  return <div className="modal-backdrop document-backdrop"><section className="document-dialog"><div className="document-toolbar"><div><strong>{value.type}</strong><span>Confira antes de imprimir ou salvar em PDF.</span></div><button className="secondary-button" onClick={onClose}>Fechar</button><button className="primary-button" onClick={() => window.print()}><Printer size={18} /> Imprimir ou PDF</button></div>{value.type === "Recibo" && value.invoice ? <ReceiptDocument student={value.student} invoice={value.invoice} /> : <article id="print-area"><header><div><strong>Centro Educacional Shekinah</strong><span>Barreirinha — Amazonas</span></div><b>S</b></header><h1>{value.type}</h1><p>{value.type === "Certificado" ? <>Certificamos que <strong>{value.student.name}</strong> concluiu as atividades do curso <strong>{classItem?.name ?? "informado pela instituição"}</strong> no Centro Educacional Shekinah.</> : <>Declaramos, para os devidos fins, que <strong>{value.student.name}</strong> encontra-se regularmente matriculado(a) no curso <strong>{classItem?.name ?? "informado pela instituição"}</strong>, com aulas no horário <strong>{classItem?.schedule ?? "registrado pela secretaria"}</strong>.</>}</p><div className="document-date">Barreirinha, {today}.</div><footer><span /><p>Secretaria<br />Centro Educacional Shekinah</p></footer></article>}</section></div>;\n}\n'

if '<ReceiptDocument student={value.student} invoice={value.invoice} />' not in text:
    if old not in text:
        raise SystemExit("DocumentModal original não encontrado")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("Recibo em duas vias integrado.")
