from pathlib import Path


def once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1, encontrado {count}")
    return text.replace(old, new, 1)


# Financeiro: toda mutação remota exige estado sincronizado e depois adota a cópia canônica.
p = Path("src/finance-ultimate.tsx")
t = p.read_text(encoding="utf-8")
t = once(
    t,
    'import { DebtNegotiationPanel } from "./debt-negotiation-panel";\n',
    'import { DebtNegotiationPanel } from "./debt-negotiation-panel";\nimport { getCloudSyncStatus, safePullFromCloud } from "./cloud-safe-sync";\n',
    "finance cloud import",
)
t = once(
    t,
    '    try {\n      await saveBillingProfile(schoolId, modal.student.id, billing);\n      const charge = await generateProviderCharge({ invoiceId: modal.invoice.id, method: chargeMethod, billingProfile: billing });\n      setGeneratedCharge(charge);\n      onChange(replaceDatabase(database, (draft) => {\n        const invoice = draft.invoices.find((item) => item.id === modal.invoice.id);\n        if (!invoice) return;\n        invoice.provider = charge.provider;\n        invoice.providerChargeId = charge.providerChargeId;\n        invoice.pixCopyPaste = charge.pixCopyPaste || null;\n        invoice.boletoUrl = charge.boletoUrl || charge.paymentUrl || null;\n      }));\n      setNotice({ tone: "success", text: charge.reused ? "Cobrança já existente recuperada com segurança." : "Cobrança bancária gerada com sucesso." });\n',
    '    try {\n      const syncStatus = await getCloudSyncStatus(schoolId, database);\n      if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de gerar Pix ou boleto. Isso evita misturar uma cobrança antiga com alterações locais ainda não enviadas.");\n      await saveBillingProfile(schoolId, modal.student.id, billing);\n      const charge = await generateProviderCharge({ invoiceId: modal.invoice.id, method: chargeMethod, billingProfile: billing });\n      setGeneratedCharge(charge);\n      const restored = await safePullFromCloud(schoolId, database.settings.appearance);\n      onChange(restored);\n      setNotice({ tone: "success", text: charge.reused ? "Cobrança já existente recuperada e sincronizada com segurança." : "Cobrança bancária gerada e sincronizada com sucesso." });\n',
    "finance remote charge sync",
)
t = once(
    t,
    '    <DebtNegotiationPanel database={database} />',
    '    <DebtNegotiationPanel database={database} onChange={onChange} />',
    "finance negotiation props",
)
p.write_text(t, encoding="utf-8")


# Certificado: exige baseline limpo, emite no servidor e recupera a cópia oficial.
p = Path("src/certificate-manager.tsx")
t = p.read_text(encoding="utf-8")
t = once(
    t,
    'import { issueCertificate, listStudentCertificates, type IssuedCertificate } from "./certificate-service";\n',
    'import { issueCertificate, listStudentCertificates, type IssuedCertificate } from "./certificate-service";\nimport { getCloudSyncStatus, safePullFromCloud } from "./cloud-safe-sync";\n',
    "certificate sync import",
)
t = once(
    t,
    '  onCompleted: (issuedAt: string) => void;\n',
    '  onCompleted: (database: SchoolDatabase) => void;\n',
    "certificate completed prop",
)
t = once(
    t,
    '    try {\n      const certificate = await issueCertificate({\n',
    '    try {\n      const schoolId = localStorage.getItem("aulafacil.cloud.selected-school") ?? "";\n      if (!schoolId) throw new Error("Selecione uma instituição no AulaFácil Cloud para emitir o certificado.");\n      const syncStatus = await getCloudSyncStatus(schoolId, database);\n      if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de emitir o certificado. A conclusão não será registrada sobre uma cópia antiga.");\n      const certificate = await issueCertificate({\n',
    "certificate precondition",
)
t = once(
    t,
    '      setSelectedId(certificate.id);\n      setArmed(false);\n      onCompleted(certificate.issuedAt);\n      setMessage({ tone: "success", text: `Certificado ${certificate.certificateNumber} emitido e salvo no histórico da instituição.` });\n',
    '      setSelectedId(certificate.id);\n      setArmed(false);\n      try {\n        const restored = await safePullFromCloud(schoolId, database.settings.appearance);\n        onCompleted(restored);\n        setMessage({ tone: "success", text: `Certificado ${certificate.certificateNumber} emitido, salvo no histórico e sincronizado.` });\n      } catch (syncError) {\n        setMessage({ tone: "warning", text: `O certificado ${certificate.certificateNumber} foi emitido, mas a cópia local não pôde ser atualizada agora: ${syncError instanceof Error ? syncError.message : "sincronização indisponível"}.` });\n      }\n',
    "certificate adopt remote",
)
p.write_text(t, encoding="utf-8")


# Conta Cloud: remove checkbox superficial e exige aceite completo, versionado e verificável.
p = Path("src/cloud-account.tsx")
t = p.read_text(encoding="utf-8")
t = once(
    t,
    'import type { SchoolDatabase } from "./model";\n',
    'import type { SchoolDatabase } from "./model";\nimport { LegalAcceptancePanel } from "./legal-acceptance-panel";\nimport { copyCurrentLegalAcceptanceToSchool } from "./legal-acceptance";\n',
    "cloud legal imports",
)
t = once(t, '  const [acceptedTerms, setAcceptedTerms] = useState(false);\n', '', "remove superficial terms state")
t = once(
    t,
    '  const [downloadArmed, setDownloadArmed] = useState(false);\n',
    '  const [downloadArmed, setDownloadArmed] = useState(false);\n  const [schoolsLoaded, setSchoolsLoaded] = useState(false);\n  const [legalReady, setLegalReady] = useState(false);\n',
    "cloud legal state",
)
t = once(
    t,
    '  const refreshSchools = async () => {\n    const next = await listCloudSchools();\n',
    '  const refreshSchools = async () => {\n    const next = await listCloudSchools();\n',
    "refresh anchor",
)
t = once(
    t,
    '      return selected;\n    });\n  };\n',
    '      return selected;\n    });\n    setSchoolsLoaded(true);\n  };\n',
    "schools loaded",
)
t = once(
    t,
    '      if (!state.user) {\n        setSchools([]);\n        setSummary(null);\n        setSelectedSchoolId("");\n        return;\n      }\n',
    '      if (!state.user) {\n        setSchools([]);\n        setSummary(null);\n        setSelectedSchoolId("");\n        setSchoolsLoaded(false);\n        setLegalReady(false);\n        return;\n      }\n      setSchoolsLoaded(false);\n',
    "auth reset legal",
)
t = once(
    t,
    '  useEffect(() => {\n    setDownloadArmed(false);\n    if (!selectedSchoolId || !auth.user) {\n',
    '  useEffect(() => {\n    setDownloadArmed(false);\n    setLegalReady(false);\n    if (!selectedSchoolId || !auth.user) {\n',
    "school change resets legal",
)
t = once(
    t,
    '      if (mode === "signup" && !acceptedTerms) throw new Error("Leia e aceite os Termos de Uso e a Política de Privacidade para criar a conta.");\n',
    '',
    "remove signup checkbox guard",
)
t = once(
    t,
    '          {mode === "signup" && (\n            <label className="cloud-terms-check">\n              <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} />\n              <span>Li e aceito os Termos de Uso e a Política de Privacidade aplicáveis à versão online.</span>\n            </label>\n          )}\n',
    '',
    "remove signup checkbox",
)
t = once(
    t,
    '  return (\n    <section className="card cloud-account-card">\n      <div className="cloud-account-heading">\n',
    '  if (!schoolsLoaded) {\n    return <section className="card cloud-account-card"><div className="cloud-account-heading"><div><span className="cloud-eyebrow">AULAFÁCIL CLOUD</span><h2>Carregando conta</h2><p>Conferindo instituições e permissões...</p></div></div></section>;\n  }\n\n  if (!legalReady) {\n    return <LegalAcceptancePanel schoolId={selectedSchoolId || null} onReady={() => setLegalReady(true)} />;\n  }\n\n  return (\n    <section className="card cloud-account-card">\n      <div className="cloud-account-heading">\n',
    "cloud legal gate",
)
t = once(
    t,
    '              const id = await createCloudSchool(schoolName || database.settings.institution.name);\n              await refreshSchools();\n',
    '              const id = await createCloudSchool(schoolName || database.settings.institution.name);\n              await copyCurrentLegalAcceptanceToSchool(id);\n              await refreshSchools();\n',
    "copy legal acceptance",
)
p.write_text(t, encoding="utf-8")


# App principal: certificado histórico e declaração institucional sem marca hardcoded.
p = Path("src/App.tsx")
t = p.read_text(encoding="utf-8")
t = once(
    t,
    'import { invoiceAmountDue } from "./finance-utils";\n',
    'import { invoiceAmountDue } from "./finance-utils";\nimport { CertificateManager } from "./certificate-manager";\n',
    "App certificate import",
)
t = once(
    t,
    'type Printable = { type: "Declaração" | "Certificado" | "Recibo"; student: Student; invoice?: Invoice; payment?: Payment } | null;\n',
    'type Printable = { type: "Declaração" | "Recibo"; student: Student; invoice?: Invoice; payment?: Payment } | null;\n',
    "App printable type",
)
t = once(
    t,
    '  const [printable, setPrintable] = useState<Printable>(null);\n',
    '  const [printable, setPrintable] = useState<Printable>(null);\n  const [certificateStudentId, setCertificateStudentId] = useState("");\n',
    "App certificate state",
)
t = once(
    t,
    '      {modal === "student-details" && selectedStudent && <StudentDetails student={selectedStudent} database={database} classItem={classById.get(selectedStudent.classId)} onClose={() => setModal(null)} onGrade={() => setModal("grade")} onInvoice={() => openInvoiceForm(selectedStudent.id)} onDocument={(type) => setPrintable({ type, student: selectedStudent })} onReceipt={(invoice) => setPrintable({ type: "Recibo", student: selectedStudent, invoice })} onToggleInvoice={setInvoicePaid} onDelete={() => deleteStudent(selectedStudent)} />}\n\n      {printable && <DocumentModal value={printable} database={database} classItem={classById.get(printable.student.classId)} onClose={() => setPrintable(null)} />}\n',
    '      {modal === "student-details" && selectedStudent && <StudentDetails student={selectedStudent} database={database} classItem={classById.get(selectedStudent.classId)} onClose={() => setModal(null)} onGrade={() => setModal("grade")} onInvoice={() => openInvoiceForm(selectedStudent.id)} onDocument={() => setPrintable({ type: "Declaração", student: selectedStudent })} onCertificate={() => { setCertificateStudentId(selectedStudent.id); setModal(null); }} onReceipt={(invoice) => setPrintable({ type: "Recibo", student: selectedStudent, invoice })} onToggleInvoice={setInvoicePaid} onDelete={() => deleteStudent(selectedStudent)} />}\n\n      {printable && <DocumentModal value={printable} database={database} classItem={classById.get(printable.student.classId)} onClose={() => setPrintable(null)} />}\n      {certificateStudentId && studentById.get(certificateStudentId) && <CertificateManager student={studentById.get(certificateStudentId)!} classItem={classById.get(studentById.get(certificateStudentId)!.classId)} database={database} onClose={() => setCertificateStudentId("")} onCompleted={(restored) => { setDatabase(restored); notify("Conclusão do aluno atualizada a partir da nuvem."); }} />}\n',
    "App certificate render",
)
t = once(
    t,
    'function StudentDetails({ student, database, classItem, onClose, onGrade, onInvoice, onDocument, onReceipt, onToggleInvoice, onDelete }: {\n  student: Student; database: SchoolDatabase; classItem?: ClassItem; onClose: () => void; onGrade: () => void; onInvoice: () => void; onDocument: (type: "Declaração" | "Certificado") => void; onReceipt: (invoice: Invoice) => void; onToggleInvoice: (invoice: Invoice) => void; onDelete: () => void;\n}) {\n',
    'function StudentDetails({ student, database, classItem, onClose, onGrade, onInvoice, onDocument, onCertificate, onReceipt, onToggleInvoice, onDelete }: {\n  student: Student; database: SchoolDatabase; classItem?: ClassItem; onClose: () => void; onGrade: () => void; onInvoice: () => void; onDocument: () => void; onCertificate: () => void; onReceipt: (invoice: Invoice) => void; onToggleInvoice: (invoice: Invoice) => void; onDelete: () => void;\n}) {\n',
    "StudentDetails props",
)
t = once(
    t,
    '<span className="status active">Matrícula ativa</span><h2>{student.name}</h2>',
    '<span className={`status ${student.completedAt ? "paid" : student.active ? "active" : "cancelled"}`}>{student.completedAt ? "Curso concluído" : student.active ? "Matrícula ativa" : "Matrícula inativa"}</span><h2>{student.name}</h2>',
    "student completion status",
)
t = once(
    t,
    '<button className="secondary-button" onClick={() => onDocument("Declaração")}><FileText size={17} /> Declaração</button><button className="secondary-button" onClick={() => onDocument("Certificado")}><FileCheck2 size={17} /> Certificado</button>',
    '<button className="secondary-button" onClick={onDocument}><FileText size={17} /> Declaração</button><button className="secondary-button" onClick={onCertificate}><FileCheck2 size={17} /> Certificado</button>',
    "student certificate action",
)
old_document = 'function DocumentModal({ value, database, classItem, onClose }: { value: NonNullable<Printable>; database: SchoolDatabase; classItem?: ClassItem; onClose: () => void }) {\n  const today = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());\n  return <div className="modal-backdrop document-backdrop"><section className="document-dialog"><div className="document-toolbar"><div><strong>{value.type}</strong><span>Confira antes de imprimir ou salvar em PDF.</span></div><button className="secondary-button" onClick={onClose}>Fechar</button><button className="primary-button" onClick={() => window.print()}><Printer size={18} /> Imprimir ou PDF</button></div>{value.type === "Recibo" && value.invoice ? <ReceiptDocument student={value.student} invoice={value.invoice} payment={value.payment} institution={database.settings.institution} settings={database.settings.receipt} /> : <article id="print-area"><header><div><strong>Centro Educacional Shekinah</strong><span>Barreirinha — Amazonas</span></div><b>S</b></header><h1>{value.type}</h1><p>{value.type === "Certificado" ? <>Certificamos que <strong>{value.student.name}</strong> concluiu as atividades do curso <strong>{classItem?.name ?? "informado pela instituição"}</strong> no Centro Educacional Shekinah.</> : <>Declaramos, para os devidos fins, que <strong>{value.student.name}</strong> encontra-se regularmente matriculado(a) no curso <strong>{classItem?.name ?? "informado pela instituição"}</strong>, com aulas no horário <strong>{classItem?.schedule ?? "registrado pela secretaria"}</strong>.</>}</p><div className="document-date">Barreirinha, {today}.</div><footer><span /><p>Secretaria<br />Centro Educacional Shekinah</p></footer></article>}</section></div>;\n}\n'
new_document = 'function DocumentModal({ value, database, classItem, onClose }: { value: NonNullable<Printable>; database: SchoolDatabase; classItem?: ClassItem; onClose: () => void }) {\n  const today = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());\n  const institution = database.settings.institution;\n  const schoolName = institution.name || institution.legalName || "Instituição de ensino";\n  const location = [institution.city, institution.state].filter(Boolean).join(" — ");\n  return <div className="modal-backdrop document-backdrop"><section className="document-dialog"><div className="document-toolbar"><div><strong>{value.type}</strong><span>Confira antes de imprimir ou salvar em PDF.</span></div><button className="secondary-button" onClick={onClose}>Fechar</button><button className="primary-button" onClick={() => window.print()}><Printer size={18} /> Imprimir ou PDF</button></div>{value.type === "Recibo" && value.invoice ? <ReceiptDocument student={value.student} invoice={value.invoice} payment={value.payment} institution={institution} settings={database.settings.receipt} /> : <article id="print-area"><header><div><strong>{schoolName}</strong><span>{location || institution.address || "Documento institucional"}</span></div><b>AF</b></header><h1>Declaração</h1><p>Declaramos, para os devidos fins, que <strong>{value.student.name}</strong> encontra-se regularmente matriculado(a) no curso <strong>{classItem?.name ?? "informado pela instituição"}</strong>, com aulas no horário <strong>{classItem?.schedule ?? "registrado pela secretaria"}</strong>.</p><div className="document-date">{institution.city ? `${institution.city}, ` : ""}{today}.</div><footer><span /><p>Secretaria<br />{schoolName}</p></footer></article>}</section></div>;\n}\n'
t = once(t, old_document, new_document, "institutional declaration")
p.write_text(t, encoding="utf-8")
