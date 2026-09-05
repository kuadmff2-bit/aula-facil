from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    file = ROOT / path
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: esperado 1 trecho, encontrado {count}: {old[:80]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{path}: padrão não encontrado exatamente uma vez: {pattern[:90]!r}")
    write(path, updated)


def append_block(path: str, marker: str, block: str) -> None:
    text = read(path)
    if marker in text:
        return
    write(path, text.rstrip() + "\n\n" + block.strip() + "\n")

# -----------------------------------------------------------------------------
# App principal: menu compacto, títulos dinâmicos, turmas organizadas e PDF.
# -----------------------------------------------------------------------------
app = "src/AppNext.tsx"
replace_once(app, "  LayoutDashboard,\n  List,\n  Megaphone,\n  PanelsTopLeft,\n  Plus,\n  Printer,", "  LayoutDashboard,\n  Download,\n  Megaphone,\n  Menu,\n  Plus,\n  Printer,")
replace_once(app, 'import { ClassRosterBoard } from "./class-roster-board";\n', 'import { ClassRosterBoard } from "./class-roster-board";\nimport { ClassOverviewPanel } from "./class-overview-panel";\n')
replace_once(app, 'import { birthDateError, genericDateError, localTodayIso, MIN_REASONABLE_DATE, phoneError } from "./validation";\n', 'import { birthDateError, genericDateError, localTodayIso, MIN_REASONABLE_DATE, phoneError } from "./validation";\nimport { exportElementToPdf } from "./pdf-export";\n')
replace_once(app, '\ntype ClassLayout = "cards" | "table";\n', '\n')
replace_once(app, '  const [classLayout, setClassLayout] = useState<ClassLayout>("table");\n', '')
replace_once(app, '  const [busy, setBusy] = useState(false);\n', '  const [busy, setBusy] = useState(false);\n  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);\n')
replace_once(app, '  useEffect(() => saveDatabase(database), [database]);\n', '  useEffect(() => saveDatabase(database), [database]);\n  useEffect(() => {\n    document.title = `${viewCopy[view].title} | AulaFácil`;\n    const meta = document.querySelector<HTMLMetaElement>(\'meta[name="description"]\');\n    if (meta) meta.content = `${viewCopy[view].description} AulaFácil.`.slice(0, 155);\n  }, [view]);\n')
replace_once(app, '  const changeView = (next: View) => {\n    setView(next);\n    setModal(null);\n', '  const changeView = (next: View) => {\n    setView(next);\n    setModal(null);\n    setMobileMenuOpen(false);\n')

regex_once(app, r'        \{view === "classes" && <section className="stack">.*?\n\n        \{view === "attendance"', '''        {view === "classes" && <ClassOverviewPanel\n          database={database}\n          onNewClass={() => { setClassDurationType("open_ended"); setModal("class"); }}\n          onDeleteClass={deleteClass}\n          onAttendance={() => { setAttendanceDate(localTodayIso()); changeView("attendance"); }}\n        />}\n\n        {view === "attendance"''')

replace_once(app, '  return <div className="app-shell">\n    <aside className="sidebar">\n', '  return <div className={`app-shell ${mobileMenuOpen ? "mobile-menu-open" : ""}`}>\n    <aside className="sidebar">\n      <button className="mobile-menu-close" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}><X size={20}/></button>\n')
replace_once(app, '    </aside>\n\n    <main className="workspace">\n      <header className="topbar"><div><h1>{viewCopy[view].title}</h1><p>{viewCopy[view].description}</p></div><div className="top-actions">', '    </aside>\n    <button className="mobile-menu-scrim" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}/>\n\n    <main className="workspace">\n      <header className="topbar"><div className="topbar-title-wrap"><button className="mobile-menu-button icon-button" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(true)}><Menu size={20}/></button><div><h1>{viewCopy[view].title}</h1><p>{viewCopy[view].description}</p></div></div><div className="top-actions">')

regex_once(app, r'function DocumentModal\(\{ value, database, classItem, onClose \}: .*?\n\}\n\nfunction Modal', '''function DocumentModal({ value, database, classItem, onClose }: { value: NonNullable<Printable>; database: SchoolDatabase; classItem?: ClassItem; onClose: () => void }) {\n  const institution = database.settings.institution;\n  const schoolName = institution.name || institution.legalName || "Instituição de ensino";\n  const today = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());\n  const filename = `${value.type}-${value.student.name}`;\n  const downloadPdf = () => void exportElementToPdf("print-area", filename, "portrait");\n  return <div className="modal-backdrop document-backdrop"><section className="document-dialog"><div className="document-toolbar"><div><strong>{value.type}</strong><span>Confira antes de imprimir ou baixar em PDF.</span></div><button className="secondary-button" onClick={onClose}>Fechar</button><button className="secondary-button" onClick={downloadPdf}><Download size={18}/> Baixar PDF</button><button className="primary-button" onClick={() => window.print()}><Printer size={18}/> Imprimir</button></div>{value.type === "Recibo" && value.invoice ? <ReceiptDocument student={value.student} invoice={value.invoice} payment={value.payment} institution={institution} settings={database.settings.receipt} classItem={classItem}/> : <article id="print-area" className="printable-declaration"><header><div><strong>{schoolName}</strong><span>{[institution.city,institution.state].filter(Boolean).join(" — ") || institution.address}</span></div><b>AF</b></header><h1>Declaração</h1><p>Declaramos, para os devidos fins, que <strong>{value.student.name}</strong> encontra-se regularmente matriculado(a) no curso <strong>{classItem?.name ?? "informado pela instituição"}</strong>, na turma <strong>{classItem?.groupName || classItem?.schedule || "registrada pela secretaria"}</strong>.</p><div className="document-date">{institution.city ? `${institution.city}, ` : ""}{today}.</div><footer><span/><p>Secretaria<br/>{schoolName}</p></footer></article>}</section></div>;\n}\n\nfunction Modal''')

regex_once(app, r'function PageHeader\(\{ title, subtitle, action, icon: Icon, onAction, secondaryAction, onSecondary \}: .*?\nfunction EmptyState', '''function PageHeader({ title, subtitle, action, icon: Icon, onAction }: { title: string; subtitle: string; action: string; icon: typeof Plus; onAction: () => void }) { return <div className="page-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><div><button className="primary-button" onClick={onAction}><Icon size={18}/>{action}</button></div></div>; }\nfunction EmptyState''')

# -----------------------------------------------------------------------------
# Financeiro: busca por aluno, referência, contato, documento e vencimento.
# -----------------------------------------------------------------------------
fin = "src/finance-ultimate.tsx"
replace_once(fin, 'import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Plus, ReceiptText, WalletCards, X } from "lucide-react";', 'import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Plus, ReceiptText, Search, WalletCards, X } from "lucide-react";')
replace_once(fin, '  const [reopenArmed, setReopenArmed] = useState("");\n', '  const [reopenArmed, setReopenArmed] = useState("");\n  const [query, setQuery] = useState("");\n')
regex_once(fin, r'  const visibleInvoices = useMemo\(\(\) => database\.invoices\n    \.filter\(\(invoice\) => filter === "all" \|\| effectiveStatus\(invoice\) === filter\)\n    \.sort\(\(a, b\) => a\.dueDate\.localeCompare\(b\.dueDate\)\), \[database\.invoices, filter\]\);', '''  const visibleInvoices = useMemo(() => {\n    const normalized = query.trim().toLocaleLowerCase("pt-BR");\n    return database.invoices\n      .filter((invoice) => filter === "all" || effectiveStatus(invoice) === filter)\n      .filter((invoice) => {\n        if (!normalized) return true;\n        const student = students.get(invoice.studentId);\n        return `${student?.name ?? ""} ${student?.documentNumber ?? ""} ${student?.phone ?? ""} ${student?.guardianName ?? ""} ${student?.guardianPhone ?? ""} ${invoice.reference} ${invoice.dueDate} ${statusLabel(effectiveStatus(invoice))}`.toLocaleLowerCase("pt-BR").includes(normalized);\n      })\n      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));\n  }, [database.invoices, filter, query, students]);''')
replace_once(fin, '    <div className="filter-tabs">', '    <label className="finance-search"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar aluno, mensalidade, CPF, telefone ou vencimento"/></label>\n\n    <div className="filter-tabs">')

# -----------------------------------------------------------------------------
# Conta Cloud: reenvio de confirmação caso o e-mail não chegue.
# -----------------------------------------------------------------------------
cloud = "src/cloud.ts"
replace_once(cloud, 'export async function signOutCloud() {', '''export async function resendCloudSignupConfirmation(email: string) {\n  const normalizedEmail = email.trim().toLowerCase();\n  if (!normalizedEmail || !normalizedEmail.includes("@")) throw new Error("Informe um e-mail válido para reenviar a confirmação.");\n  const { error } = await cloud.auth.resend({ type: "signup", email: normalizedEmail });\n  if (error) fail("Não foi possível reenviar o e-mail de confirmação", error);\n}\n\nexport async function signOutCloud() {''')

account = "src/cloud-account.tsx"
replace_once(account, '  signOutCloud,\n  signUpCloud,', '  signOutCloud,\n  signUpCloud,\n  resendCloudSignupConfirmation,')
replace_once(account, '  const [legalReady, setLegalReady] = useState(false);\n', '  const [legalReady, setLegalReady] = useState(false);\n  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState("");\n')
replace_once(account, '        if (result.session) {\n          setMessage({ tone: "success", text: "Conta criada. Agora crie ou selecione a instituição." });\n        } else {\n          setMessage({ tone: "warning", text: "Conta criada. Confira seu e-mail para confirmar o cadastro e depois faça login." });\n        }', '        if (result.session) {\n          setPendingConfirmationEmail("");\n          setMessage({ tone: "success", text: "Conta criada. Agora crie ou selecione a instituição." });\n        } else {\n          setPendingConfirmationEmail(email.trim().toLowerCase());\n          setMessage({ tone: "warning", text: "Conta criada. Enviamos a confirmação por e-mail. Confira também Spam, Lixo eletrônico e Promoções. Se não chegar, use o botão de reenvio abaixo." });\n        }')
replace_once(account, '        </form>\n        <button className="cloud-mode-button"', '        </form>\n        {pendingConfirmationEmail && <div className="cloud-resend-box"><strong>Não recebeu o e-mail?</strong><span>Confirme se o endereço está correto e aguarde alguns minutos antes de tentar novamente.</span><button className="secondary-button" type="button" disabled={busy} onClick={() => void run(async () => { await resendCloudSignupConfirmation(pendingConfirmationEmail); setMessage({ tone: "success", text: `Novo e-mail de confirmação enviado para ${pendingConfirmationEmail}. Confira também as pastas de spam e promoções.` }); })}>Reenviar confirmação</button></div>}\n        <button className="cloud-mode-button"')

# -----------------------------------------------------------------------------
# Certificados: impressão não vazia e botão de PDF real.
# -----------------------------------------------------------------------------
certdoc = "src/certificate-document.tsx"
replace_once(certdoc, '      className={`professional-certificate certificate-style-${resolvedStyle}`}\n', '      id="certificate-print-area"\n      className={`professional-certificate certificate-style-${resolvedStyle}`}\n')

certmgr = "src/certificate-manager.tsx"
replace_once(certmgr, 'import { CheckCircle2, FileCheck2, Palette, Printer, ShieldCheck, X } from "lucide-react";', 'import { CheckCircle2, Download, FileCheck2, Palette, Printer, ShieldCheck, X } from "lucide-react";')
replace_once(certmgr, 'import type { CertificateSettings, ClassItem, InstitutionSettings, SchoolDatabase, Student } from "./model";\n', 'import type { CertificateSettings, ClassItem, InstitutionSettings, SchoolDatabase, Student } from "./model";\nimport { exportElementToPdf } from "./pdf-export";\n')
replace_once(certmgr, '          {(selected || isDraftPreview) && <button className="primary-button" onClick={() => window.print()} title="Imprimir certificado ou salvar em PDF"><Printer size={17}/> Imprimir prévia</button>}\n', '          {(selected || isDraftPreview) && <><button className="secondary-button" onClick={() => void exportElementToPdf("certificate-print-area", `certificado-${student.name}-${selected?.certificateNumber ?? "previa"}`, "landscape")}><Download size={17}/> Baixar PDF</button><button className="primary-button" onClick={() => window.print()} title="Imprimir certificado"><Printer size={17}/> Imprimir</button></>}\n')

# -----------------------------------------------------------------------------
# HTML, favicon/manifest e identidade de aba.
# -----------------------------------------------------------------------------
index = "index.html"
replace_once(index, '    <meta name="description" content="AulaFácil — gestão escolar local, segura e personalizável" />\n    <title>AulaFácil</title>', '    <meta name="description" content="Organize alunos, turmas, mensalidades e chamadas com segurança e praticidade no AulaFácil." />\n    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />\n    <link rel="manifest" href="/site.webmanifest" />\n    <meta name="apple-mobile-web-app-title" content="AulaFácil" />\n    <title>Gestão escolar simples | AulaFácil</title>')

favicon = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n  <rect width="512" height="512" rx="136" fill="#0d2d73"/>\n  <path d="M136 144h240v64H200v56h144v64H200v104h-64V144Z" fill="#fff"/>\n  <circle cx="368" cy="144" r="64" fill="#f2b134"/>\n</svg>\n'''
write("public/favicon.svg", favicon)
write("public/site.webmanifest", '''{\n  "name": "AulaFácil",\n  "short_name": "AulaFácil",\n  "description": "Gestão escolar simples, segura e organizada.",\n  "start_url": ".",\n  "display": "standalone",\n  "background_color": "#eef1f5",\n  "theme_color": "#0d2d73",\n  "icons": [{ "src": "/favicon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }]\n}\n''')

# -----------------------------------------------------------------------------
# CSS de robustez: zero overflow de página, contraste, toque e menu compacto.
# -----------------------------------------------------------------------------
append_block("src/layout-safety.css", "/* UX-HARDENING-2026 */", r'''/* UX-HARDENING-2026 */
@media screen {
  html, body, #root { width: 100%; max-width: 100%; min-width: 0 !important; overflow-x: clip !important; overscroll-behavior-x: none; }
  body { touch-action: pan-y; }
  .app-shell, .workspace, .page-content, .stack, .card { min-width: 0; max-width: 100%; }
  .table-card, .roster-sheet { max-width: 100%; overflow-x: auto; overscroll-behavior-x: contain; }
  .table-card table { width: max-content; min-width: 100%; max-width: none; }
  p, span, small, strong, td, th, code, .generated-charge { overflow-wrap: anywhere; word-break: normal; }
  img { max-width: 100%; height: auto; }
  .mobile-menu-button, .mobile-menu-close, .mobile-menu-scrim { display: none; }
  .topbar-title-wrap { min-width: 0; display: flex; align-items: center; gap: 10px; }
}
@media screen and (max-width: 640px) {
  .app-shell { display: block; }
  .sidebar { position: fixed; inset: 0 auto 0 0; z-index: 70; width: min(84vw, 300px) !important; height: 100dvh; align-items: stretch !important; transform: translateX(-105%); transition: transform .22s ease; }
  .mobile-menu-open .sidebar { transform: translateX(0); }
  .sidebar .brand { justify-content: flex-start !important; padding: 18px 16px !important; }
  .sidebar .brand > span:last-child, .sidebar .nav-label, .sidebar .main-nav button span, .sidebar .sidebar-foot { display: initial !important; }
  .sidebar .main-nav { width: 100%; padding: 12px !important; }
  .sidebar .main-nav button { justify-content: flex-start !important; padding: 0 13px !important; min-height: 48px; }
  .mobile-menu-button { display: inline-grid; flex: 0 0 auto; }
  .mobile-menu-close { display: grid; place-items: center; position: absolute; z-index: 2; right: 10px; top: 10px; width: 40px; height: 40px; border-radius: 11px; color: white; background: rgba(255,255,255,.1); }
  .mobile-menu-scrim { display: block; position: fixed; inset: 0; z-index: 65; pointer-events: none; opacity: 0; background: rgba(7,15,29,.52); transition: opacity .2s ease; }
  .mobile-menu-open .mobile-menu-scrim { pointer-events: auto; opacity: 1; }
  .topbar { min-height: 68px; }
  .topbar p { display: none; }
  .page-content { padding: 16px 12px 34px !important; }
  .metric-grid, .class-grid, .dashboard-grid, .finance-ultimate-metrics, .info-grid { grid-template-columns: 1fr !important; }
  .form-grid { grid-template-columns: 1fr !important; padding-left: 16px; padding-right: 16px; }
  .wide { grid-column: auto !important; }
  button, .primary-button, .secondary-button, input, select { min-height: 44px; }
  input, select, textarea { font-size: 16px !important; }
  .document-toolbar { flex-wrap: wrap; }
  .document-toolbar > div:first-child { width: 100%; }
}
@media screen and (max-width: 420px) {
  .topbar { padding-left: 10px !important; padding-right: 10px !important; }
  .page-content { padding-left: 10px !important; padding-right: 10px !important; }
  .card { border-radius: 14px; }
}
''')

append_block("src/theme.css", "/* CONTRAST-HARDENING-2026 */", r'''/* CONTRAST-HARDENING-2026 */
html[data-theme="light"] {
  --text: #202938;
  --muted: #5d6979;
  --line: #cbd3de;
  --surface: #f8f9fb;
  --canvas: #eef1f5;
  --text-muted: #5d6979;
  --border: #cbd3de;
  --surface-soft: #eef2f6;
  --primary: var(--blue);
}
html[data-theme="light"] body,
html[data-theme="light"] .workspace { background: #eef1f5; }
html[data-theme="light"] .card,
html[data-theme="light"] .modal,
html[data-theme="light"] .details-panel { background: #f8f9fb; border-color: #cbd3de; }
html[data-theme="light"] input,
html[data-theme="light"] select,
html[data-theme="light"] textarea { background: #f2f4f7; border-color: #b9c4d2; color: #202938; }
html[data-theme="dark"] {
  --text: #f1f5fb;
  --muted: #b6c1d1;
  --line: #3e4c60;
  --surface: #1c2634;
  --canvas: #121923;
  --text-muted: #b6c1d1;
  --border: #3e4c60;
  --surface-soft: #16202c;
  --primary: #8fb5ff;
}
html[data-theme="dark"] .card,
html[data-theme="dark"] .modal,
html[data-theme="dark"] .details-panel,
html[data-theme="dark"] .professional-settings-card { background: #1c2634; border-color: #3e4c60; color: #f1f5fb; }
html[data-theme="dark"] input,
html[data-theme="dark"] select,
html[data-theme="dark"] textarea { color: #f5f8fd; background: #121a24; border-color: #4a5a70; }
html[data-theme="dark"] input::placeholder,
html[data-theme="dark"] textarea::placeholder { color: #9aa7b9; opacity: 1; }
html[data-theme="dark"] .info-box,
html[data-theme="dark"] .record-list > div,
html[data-theme="dark"] .batch-payment-list,
html[data-theme="dark"] .payment-breakdown { background: #16202c; border-color: #3e4c60; }
html[data-theme="dark"] .info-box strong,
html[data-theme="dark"] .record-list strong,
html[data-theme="dark"] .class-overview-student strong { color: #f1f5fb; }
html[data-theme="dark"] .info-box small,
html[data-theme="dark"] .record-list small { color: #b6c1d1; }
''')

append_block("src/finance-ultimate.css", "/* FINANCE-SEARCH-2026 */", r'''/* FINANCE-SEARCH-2026 */
.finance-search{display:flex;align-items:center;gap:9px;width:100%;min-height:48px;padding:0 13px;border:1px solid var(--border,var(--line));border-radius:13px;background:var(--surface);color:var(--text-muted,var(--muted))}.finance-search input{width:100%;min-width:0;border:0!important;background:transparent!important;color:var(--text);box-shadow:none!important;outline:0}.finance-search svg{flex:0 0 auto}.finance-search:focus-within{border-color:var(--school-primary,var(--blue));box-shadow:0 0 0 3px color-mix(in srgb,var(--school-primary,var(--blue)) 12%,transparent)}
''')
append_block("src/cloud-account.css", "/* CLOUD-RESEND-2026 */", r'''/* CLOUD-RESEND-2026 */
.cloud-resend-box{display:grid;gap:7px;margin-top:12px;padding:14px;border:1px solid var(--border,var(--line));border-radius:12px;background:var(--surface-soft,var(--canvas))}.cloud-resend-box strong{color:var(--text);font-size:.86rem}.cloud-resend-box span{color:var(--text-muted,var(--muted));font-size:.78rem;line-height:1.5}.cloud-resend-box .secondary-button{justify-self:start}
''')

append_block("src/styles.css", "/* PRINT-FIX-2026 */", r'''/* PRINT-FIX-2026 */
@media print {
  body * { visibility: hidden !important; }
  #print-area, #print-area *, #certificate-print-area, #certificate-print-area * { visibility: visible !important; }
  #print-area, #certificate-print-area { position: absolute !important; left: 0 !important; top: 0 !important; margin: 0 !important; box-shadow: none !important; }
  #print-area { width: 100% !important; min-height: 0 !important; }
  #certificate-print-area { width: 297mm !important; height: 210mm !important; max-width: none !important; }
  .document-backdrop, .certificate-manager { background: #fff !important; }
}
@page receipt-page { size: A4 portrait; margin: 7mm; }
@page certificate-page { size: A4 landscape; margin: 0; }
#print-area.receipt-two-copies { page: receipt-page; }
#certificate-print-area { page: certificate-page; }
''')

# Favicon e logo são clicáveis pelo botão .brand; melhora o cursor e a presença visual.
append_block("src/school-brand.css", "/* BRAND-POLISH-2026 */", r'''/* BRAND-POLISH-2026 */
.brand{cursor:pointer}.school-brand-mark{box-shadow:0 8px 22px rgba(0,0,0,.18),0 0 0 1px rgba(255,255,255,.18)}.school-brand-mark img{padding:4px;border-radius:12px}.brand:hover .school-brand-mark{transform:translateY(-1px);transition:transform .16s ease,box-shadow .16s ease;box-shadow:0 11px 26px rgba(0,0,0,.23),0 0 0 2px rgba(255,255,255,.22)}
''')

print("Acabamento aplicado com sucesso.")
