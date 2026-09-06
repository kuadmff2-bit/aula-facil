from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)


# Versão e dependências
package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["version"] = "0.4.0"
package.setdefault("dependencies", {})["exceljs"] = "4.4.0"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

for path in ["src-tauri/tauri.conf.json"]:
    data = json.loads(read(path))
    data["version"] = "0.4.0"
    write(path, json.dumps(data, ensure_ascii=False, indent=2) + "\n")

cargo = read("src-tauri/Cargo.toml")
cargo = cargo.replace('version = "0.3.2"', 'version = "0.4.0"', 1)
write("src-tauri/Cargo.toml", cargo)

cargo_lock = read("src-tauri/Cargo.lock")
cargo_lock = re.sub(r'(name = "aula-facil"\nversion = ")0\.3\.2(" )?', lambda m: m.group(1) + '0.4.0' + (m.group(2) or ''), cargo_lock, count=1)
# O formato normal não tem espaço depois da aspa; fallback explícito.
cargo_lock = cargo_lock.replace('name = "aula-facil"\nversion = "0.3.2"', 'name = "aula-facil"\nversion = "0.4.0"', 1)
write("src-tauri/Cargo.lock", cargo_lock)

# CSS global 0.4 carregado por último
main = read("src/main.tsx")
if 'import "./ux-0.4.css";' not in main:
    main = replace_once(main, 'import "./contrast-fixes.css";\n', 'import "./contrast-fixes.css";\nimport "./ux-0.4.css";\n', "import ux")
write("src/main.tsx", main)

# Geração local automática de mensalidades contínuas
enrollment = read("src/enrollment-plan.ts")
if "export function ensureContinuousInvoicesDue" not in enrollment:
    marker = "export function outstandingStudentInvoices(database: SchoolDatabase, studentId: string) {"
    helper = '''export function ensureContinuousInvoicesDue(database: SchoolDatabase, asOf = localDate(), daysAhead = 5) {\n  const normalizedAsOf = /^\\d{4}-\\d{2}-\\d{2}$/.test(asOf) ? asOf : localDate();\n  const horizonDate = new Date(`${normalizedAsOf}T12:00:00Z`);\n  horizonDate.setUTCDate(horizonDate.getUTCDate() + Math.max(0, Math.min(31, Math.trunc(daysAhead))));\n  const horizon = horizonDate.toISOString().slice(0, 10);\n  const horizonMonth = horizon.slice(0, 7);\n  let created = 0;\n\n  for (const student of database.students) {\n    if (!(student.enrollmentStatus ?? (student.active ? "active" : "paused")).includes("active") || !student.active) continue;\n    const classItem = database.classes.find((item) => item.id === student.classId);\n    if (!classItem || (classItem.durationType ?? "open_ended") !== "open_ended" || classItem.monthlyFee <= 0) continue;\n    const startMonth = monthFromDate(student.enrollmentStartDate || student.createdAt.slice(0, 10));\n    for (let offset = 0; offset < 240; offset += 1) {\n      const referenceMonth = addMonths(startMonth, offset);\n      if (referenceMonth > horizonMonth) break;\n      const dueDate = dueDateForMonth(referenceMonth, dueDayFor(student, database));\n      if (dueDate > horizon) continue;\n      if (database.invoices.some((item) => item.studentId === student.id && item.reference === referenceMonth)) continue;\n      const invoice = ensureOpenEndedInvoiceForMonth(database, student, classItem, referenceMonth);\n      if (!invoice) continue;\n      database.invoices.push(invoice);\n      created += 1;\n    }\n  }\n  return created;\n}\n\n'''
    enrollment = replace_once(enrollment, marker, helper + marker, "helper mensalidades contínuas")
write("src/enrollment-plan.ts", enrollment)

# Billing retorna link público individual
billing = read("src/billing.ts")
if "publicPaymentUrl: string;" not in billing:
    billing = replace_once(billing, "  paymentUrl: string;\n", "  paymentUrl: string;\n  publicPaymentUrl: string;\n", "tipo link público")
billing = billing.replace('cloud.functions.invoke("payment-charge",', 'cloud.functions.invoke("payment-charge-link",', 1)
if "publicPaymentUrl: String(data?.publicPaymentUrl" not in billing:
    billing = replace_once(billing, '    paymentUrl: String(data?.paymentUrl ?? ""),\n', '    paymentUrl: String(data?.paymentUrl ?? ""),\n    publicPaymentUrl: String(data?.publicPaymentUrl ?? ""),\n', "retorno link público")
write("src/billing.ts", billing)

# Turmas exportam XLSX pronto em vez de CSV cru
classes = read("src/class-overview-panel.tsx")
if 'from "./spreadsheet-export"' not in classes:
    classes = replace_once(classes, 'import type { ClassItem, SchoolDatabase, Student, Weekday } from "./model";\n', 'import type { ClassItem, SchoolDatabase, Student, Weekday } from "./model";\nimport { exportClassWorkbook } from "./spreadsheet-export";\n', "import exportação turmas")
classes = re.sub(r'\nfunction csvCell\(value: unknown\) \{.*?\n\}\n\ntype Props = \{', '\n\ntype Props = {', classes, count=1, flags=re.S)
classes = classes.replace('onClick={() => downloadRosterCsv(database.classes, database.students, "aulafacil-todas-as-turmas.csv")}', 'onClick={() => void exportClassWorkbook(database.classes, database.students, "aulafacil-todas-as-turmas")}')
classes = re.sub(r'onClick=\{\(\) => downloadRosterCsv\(\[classItem\], database\.students, `aulafacil-\$\{safeFilename\(`\$\{classItem\.name\}-\$\{classItem\.groupName \?\? classItem\.room\}`\)\}\.csv`\)\}', 'onClick={() => void exportClassWorkbook([classItem], database.students, `aulafacil-${classItem.name}-${classItem.groupName ?? classItem.room}`)}', classes)
if "downloadRosterCsv" in classes or "safeFilename(" in classes or "csvCell(" in classes:
    raise RuntimeError("exportação CSV antiga de turmas ainda presente")
write("src/class-overview-panel.tsx", classes)

# Cloud: criação mostra feedback e não fica parecendo botão morto
cloud_account = read("src/cloud-account.tsx")
old_create = '''            <button className="primary-button" disabled={busy} onClick={() => void run(async () => {\n              const id = await createCloudSchool(schoolName || database.settings.institution.name);\n              await copyCurrentLegalAcceptanceToSchool(id);\n              await refreshSchools();\n              setSelectedSchoolId(id);\n              setSchoolName("");\n              setMessage({ tone: "success", text: "Instituição criada. Os dados ainda não foram enviados; você decide quando sincronizar." });\n            })}>Criar instituição</button>'''
new_create = '''            <button type="button" className="primary-button" disabled={busy} onClick={() => void run(async () => {\n              const id = await createCloudSchool(schoolName || database.settings.institution.name);\n              await refreshSchools();\n              setSelectedSchoolId(id);\n              setSchoolName("");\n              try {\n                await copyCurrentLegalAcceptanceToSchool(id);\n                setMessage({ tone: "success", text: "Instituição criada. Agora você já pode sincronizar e configurar recebimentos." });\n              } catch {\n                setMessage({ tone: "warning", text: "Instituição criada. Revise a aceitação dos termos antes da primeira sincronização." });\n              }\n            })}>{busy ? "Criando..." : "Criar instituição"}</button>'''
if old_create in cloud_account:
    cloud_account = replace_once(cloud_account, old_create, new_create, "criação cloud")
if 'cloud-empty-school">\n          <h3>Crie a instituição online</h3>' in cloud_account and 'cloud-empty-school-message' not in cloud_account:
    cloud_account = replace_once(cloud_account, '          </div>\n        </div>\n      ) : (\n', '          </div>\n          {message && <div className={`cloud-message ${message.tone} cloud-empty-school-message`} role="status">{message.text}</div>}\n        </div>\n      ) : (\n', "feedback cloud vazio")
write("src/cloud-account.tsx", cloud_account)

# Financeiro: cursos contínuos automáticos e link de pagamento copiável
finance = read("src/finance-ultimate.tsx")
finance = finance.replace('<div className="monthly-generator"><label><span>Mês</span><input type="month" defaultValue={referenceMonth} onChange={(event) => { const next = event.currentTarget.value; if (next) setReferenceMonth(next); }} /></label><button className="primary-button" onClick={generateMonthly}><Plus size={17}/> Gerar cursos contínuos</button></div>', '<div className="automatic-billing-badge"><CheckCircle2 size={17}/> Mensalidades contínuas automáticas</div>')
finance = finance.replace('<p>Gere as mensalidades de cursos contínuos ou altere o filtro.</p>', '<p>As mensalidades contínuas aparecem automaticamente. Tente outro filtro.</p>')
if "generatedCharge.publicPaymentUrl" not in finance:
    needle = '{(generatedCharge.boletoUrl || generatedCharge.paymentUrl) && <button className="secondary-button" onClick={() => window.open(generatedCharge.boletoUrl || generatedCharge.paymentUrl, "_blank", "noopener,noreferrer")}><ExternalLink size={16}/> Abrir cobrança</button>}'
    addition = needle + '{generatedCharge.publicPaymentUrl && <div className="generated-payment-link"><code>{generatedCharge.publicPaymentUrl}</code><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(generatedCharge.publicPaymentUrl)}><Copy size={16}/> Copiar link do aluno</button></div>}'
    finance = replace_once(finance, needle, addition, "link público no financeiro")
write("src/finance-ultimate.tsx", finance)

# Campos extras: linhas responsivas e texto mais curto
student_fields = read("src/student-fields.tsx")
student_fields = student_fields.replace('<div><h2>Cadastro montado pela própria escola</h2><p>Nome do aluno, nascimento e turma permanecem como base do sistema. Todos os demais campos podem ser criados, renomeados, tornados obrigatórios ou removidos.</p></div>', '<div><h2>Campos do cadastro</h2><p>Escolha apenas as informações que sua escola precisa.</p></div>')
student_fields = student_fields.replace('<div key={field.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1.3fr) minmax(150px, .8fr) minmax(220px, 1fr) auto auto", gap: 10, alignItems: "center", padding: 14, border: "1px solid var(--border)", borderRadius: 14 }}>', '<div className="student-field-config-row" key={field.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1.3fr) minmax(150px, .8fr) minmax(220px, 1fr) auto auto", gap: 10, alignItems: "center", padding: 14, border: "1px solid var(--border)", borderRadius: 14 }}>')
write("src/student-fields.tsx", student_fields)

# Mensagens: Robô AulaFácil interno, QR e automações liberadas
message_panel = read("src/message-automations-panel.tsx")
if 'from "./robot-connect"' not in message_panel:
    message_panel = replace_once(message_panel, 'import { getCloudAuthState, onCloudAuthChange } from "./cloud";\n', 'import { getCloudAuthState, onCloudAuthChange } from "./cloud";\nimport { RobotConnectBox } from "./robot-connect";\n', "import robô")
message_panel = message_panel.replace('        if (!credentials.webhook_url?.trim()) throw new Error("Informe a URL HTTPS do robô.");\n        await configureMessageCredentials(credentialChannel.id, {\n          webhook_url: credentials.webhook_url.trim(),\n          auth_token: credentials.auth_token?.trim() ?? "",\n        });', '        throw new Error("Use o botão Conectar WhatsApp no canal Robô AulaFácil.");')
message_panel = message_panel.replace('    if (channel.providerKey === "robot_webhook") throw new Error("O robô externo está preparado, mas o envio agendado só será liberado depois de validar o endpoint específico do seu robô.");\n', '')
message_panel = message_panel.replace('    if (!template.metaTemplateName) throw new Error("Para envio automático pela Meta, o modelo precisa ter o nome de um template aprovado.");', '    if (channel.providerKey === "meta" && !template.metaTemplateName) throw new Error("Para envio automático pela Meta, o modelo precisa ter o nome de um template aprovado.");')
old_ready = '''  const channelReady = channels.some((channel) => channel.enabled && channel.credentialsConfigured && channel.providerKey === "meta");\n  const templateReady = templates.some((template) => template.enabled && Boolean(template.metaTemplateName));'''
new_ready = '''  const metaReady = channels.some((channel) => channel.enabled && channel.credentialsConfigured && channel.providerKey === "meta");\n  const robotReady = channels.some((channel) => channel.enabled && channel.credentialsConfigured && channel.providerKey === "robot_webhook");\n  const channelReady = metaReady || robotReady;\n  const templateReady = templates.some((template) => template.enabled && (robotReady || Boolean(template.metaTemplateName)));'''
if old_ready in message_panel:
    message_panel = replace_once(message_panel, old_ready, new_ready, "readiness mensagens")
message_panel = message_panel.replace('"Adicione o canal WhatsApp oficial da Meta."', '"Adicione a Meta ou o Robô AulaFácil."')
message_panel = message_panel.replace('"Configure as credenciais do canal e deixe-o ativo."', '"Conecte o canal escolhido."')
message_panel = message_panel.replace('"Associe o modelo ao nome de um template aprovado pela Meta."', '"Na Meta, associe um template aprovado. No Robô AulaFácil, o texto é enviado diretamente."')
message_panel = message_panel.replace('<small>WhatsApp Meta</small>', '<small>Meta ou Robô AulaFácil</small>')
message_panel = message_panel.replace('<small>Cofre seguro</small>', '<small>Conexão segura</small>')
message_panel = message_panel.replace('channel.providerKey === "meta" ? "Meta WhatsApp Cloud API" : "Robô externo"', 'channel.providerKey === "meta" ? "Meta WhatsApp Cloud API" : "Robô AulaFácil"')
message_panel = message_panel.replace('setChannelName(value === "meta" ? "WhatsApp oficial" : "Robô externo")', 'setChannelName(value === "meta" ? "WhatsApp oficial" : "Robô AulaFácil")')
message_panel = message_panel.replace('<option value="robot_webhook">Robô externo</option>', '<option value="robot_webhook">Robô AulaFácil · QR Code</option>')
old_action = '<button type="button" onClick={() => { setCredentialChannelId(channel.id); setCredentials({}); }}>{channel.credentialsConfigured ? "Trocar credenciais" : "Configurar"}</button>'
new_action = '{channel.providerKey === "meta" ? <button type="button" onClick={() => { setCredentialChannelId(channel.id); setCredentials({}); }}>{channel.credentialsConfigured ? "Trocar credenciais" : "Configurar"}</button> : <RobotConnectBox channel={channel} disabled={busy} onChanged={() => refresh()} />}'
if old_action in message_panel:
    message_panel = replace_once(message_panel, old_action, new_action, "ação conexão robô")
message_panel = message_panel.replace("<code>{'{data}'}</code>.", "<code>{'{data}'}</code> <code>{'{link_pagamento}'}</code>.")
message_panel = message_panel.replace('Menor de 18 anos: usa o telefone do responsável e fala sobre o aluno pelo nome. A partir de 18 anos: usa o telefone do próprio aluno e escreve diretamente “sua mensalidade”, “seu pagamento” ou “sua ausência”. Se o telefone correto não estiver cadastrado, o AulaFácil não troca silenciosamente para outra pessoa.', 'Menores recebem pelo responsável; a partir de 18 anos, pelo telefone do aluno. Se o contato correto não existir, o envio é ignorado com segurança.')
# Nunca abrir caixa de credenciais externas para canal interno.
message_panel = message_panel.replace('{credentialChannel && <div className="message-credential-box">', '{credentialChannel && credentialChannel.providerKey === "meta" && <div className="message-credential-box">')
write("src/message-automations-panel.tsx", message_panel)

# Personalização com prévias ao vivo
professional = read("src/professional-settings.tsx")
if 'from "./document-live-preview"' not in professional:
    professional = replace_once(professional, 'import "./professional-settings.css";\n', 'import { CertificateSettingsPreview, FinanceSettingsPreview, ReceiptSettingsPreview } from "./document-live-preview";\nimport "./professional-settings.css";\n', "import preview")
professional = professional.replace('type FinanceSettingsProps = {\n  value: FinanceSettings;', 'type FinanceSettingsProps = {\n  institution: InstitutionSettings;\n  value: FinanceSettings;')
professional = professional.replace('type DocumentSettingsProps = {\n  receipt: ReceiptSettings;', 'type DocumentSettingsProps = {\n  institution: InstitutionSettings;\n  receipt: ReceiptSettings;')
professional = professional.replace('export function FinanceSettingsPanel({ value, onChange }: FinanceSettingsProps) {', 'export function FinanceSettingsPanel({ institution, value, onChange }: FinanceSettingsProps) {')
professional = professional.replace('export function DocumentSettingsPanel({ receipt, certificate, onReceiptChange, onCertificateChange }: DocumentSettingsProps) {', 'export function DocumentSettingsPanel({ institution, receipt, certificate, onReceiptChange, onCertificateChange }: DocumentSettingsProps) {')
professional = professional.replace('description="Esses dados serão usados no sistema, recibos, cobranças, declarações e certificados."', 'description="Logo, nome e contatos usados pelo AulaFácil."')
professional = professional.replace('description="Configure vencimentos disponíveis, tolerância, multa e juros. O valor original da mensalidade continua preservado."', 'description="Vencimentos, multa, juros e aparência da cobrança."')
professional = professional.replace('<p>O aluno poderá escolher um dos dias habilitados no cadastro. Dias 29, 30 e 31 usam o último dia quando o mês for menor.</p>', '<p>O aluno escolhe um dos dias habilitados.</p>')
professional = professional.replace('description="Personalize os documentos emitidos sem alterar certificados antigos já formalizados."', 'description="Edite e confira o resultado ao mesmo tempo."')
professional = professional.replace('<p className="receipt-customizer-note">A VIA DO PAGANTE e a VIA DA ESCOLA usam o mesmo número e ficam juntas em uma folha A4. Número do recibo, aluno e total recebido são sempre exibidos para preservar a integridade financeira.</p>', '<p className="receipt-customizer-note">As duas vias usam o mesmo número e cabem em uma folha A4.</p>')

# Envolve FinanceSettingsPanel em layout com preview.
start = professional.index('export function FinanceSettingsPanel')
end = professional.index('export function DocumentSettingsPanel')
finance_sub = professional[start:end]
if 'finance-customizer-layout' not in finance_sub:
    finance_sub = finance_sub.replace('      />\n\n      <div className="settings-block">', '      />\n\n      <div className="finance-customizer-layout">\n        <div className="finance-customizer-controls">\n      <div className="settings-block">', 1)
    close = finance_sub.rfind('    </section>\n  );\n}\n\n')
    if close < 0:
        raise RuntimeError('fechamento FinanceSettingsPanel não encontrado')
    finance_sub = finance_sub[:close] + '        </div>\n        <div className="finance-customizer-preview"><span className="live-preview-label">PRÉVIA EM TEMPO REAL</span><FinanceSettingsPreview institution={institution} finance={value}/></div>\n      </div>\n' + finance_sub[close:]
professional = professional[:start] + finance_sub + professional[end:]

# Envolve DocumentSettingsPanel em layout com alternância de preview.
start = professional.index('export function DocumentSettingsPanel')
doc_sub = professional[start:]
if 'const [previewKind' not in doc_sub:
    doc_sub = doc_sub.replace('  const updateCertificate = <K extends keyof CertificateSettings>(key: K, fieldValue: CertificateSettings[K]) => onCertificateChange({ ...certificate, [key]: fieldValue });\n', '  const updateCertificate = <K extends keyof CertificateSettings>(key: K, fieldValue: CertificateSettings[K]) => onCertificateChange({ ...certificate, [key]: fieldValue });\n  const [previewKind, setPreviewKind] = useState<"receipt" | "certificate">("receipt");\n')
if 'document-customizer-layout' not in doc_sub:
    doc_sub = doc_sub.replace('      />\n\n      <div className="settings-subsection">', '      />\n\n      <div className="document-customizer-layout">\n        <div className="document-customizer-controls">\n      <div className="settings-subsection">', 1)
    close = doc_sub.rfind('    </section>\n  );\n}\n')
    if close < 0:
        raise RuntimeError('fechamento DocumentSettingsPanel não encontrado')
    preview = '''        </div>\n        <div className="document-customizer-preview">\n          <span className="live-preview-label">PRÉVIA EM TEMPO REAL</span>\n          <div className="preview-switch"><button type="button" className={previewKind === "receipt" ? "active" : ""} onClick={() => setPreviewKind("receipt")}>Recibo</button><button type="button" className={previewKind === "certificate" ? "active" : ""} onClick={() => setPreviewKind("certificate")}>Certificado</button></div>\n          {previewKind === "receipt" ? <ReceiptSettingsPreview institution={institution} receipt={receipt}/> : <CertificateSettingsPreview institution={institution} certificate={certificate}/>}\n        </div>\n      </div>\n'''
    doc_sub = doc_sub[:close] + preview + doc_sub[close:]
professional = professional[:start] + doc_sub
write("src/professional-settings.tsx", professional)

# App principal: data estável, branding, exportação, avisos e fallback automático
app = read("src/AppNext.tsx")
if 'from "./date-field"' not in app:
    app = replace_once(app, 'import { exportElementToPdf } from "./pdf-export";\n', 'import { exportElementToPdf } from "./pdf-export";\nimport { DateField } from "./date-field";\nimport { NoticesCenter } from "./notices-center";\nimport { exportStudentsWorkbook } from "./spreadsheet-export";\n', "imports AppNext")
if 'ensureContinuousInvoicesDue,' not in app:
    app = replace_once(app, '  ensureOpenEndedInvoiceForMonth,\n', '  ensureOpenEndedInvoiceForMonth,\n  ensureContinuousInvoicesDue,\n', "import helper contínuo")
app = app.replace('AulaFácil Desktop <span>v0.3.0</span>', 'AulaFácil Desktop <span>v0.4.0</span>')

if 'ensureContinuousInvoicesDue(next)' not in app:
    app = replace_once(app, '  useEffect(() => saveDatabase(database), [database]);\n', '''  useEffect(() => saveDatabase(database), [database]);\n  useEffect(() => {\n    setDatabase((current) => {\n      const next = structuredClone(current);\n      const created = ensureContinuousInvoicesDue(next);\n      if (!created) return current;\n      next.updatedAt = new Date().toISOString();\n      return next;\n    });\n  }, []);\n  useEffect(() => {\n    const downloaded = (event: Event) => {\n      const detail = (event as CustomEvent<{ filename?: string }>).detail;\n      setToast({ message: `${detail?.filename || "Arquivo"} baixado com sucesso.`, tone: "success" });\n    };\n    window.addEventListener("aulafacil:download-success", downloaded);\n    return () => window.removeEventListener("aulafacil:download-success", downloaded);\n  }, []);\n''', "efeitos automáticos")

old_brand = '<button className="brand" onClick={() => changeView("dashboard")} aria-label="Ir para o início"><SchoolBrand institution={database.settings.institution}/></button>'
new_brand = '{view !== "dashboard" ? <button className="brand" onClick={() => changeView("dashboard")} aria-label="Ir para o início"><SchoolBrand institution={database.settings.institution}/></button> : <div className="dashboard-sidebar-placeholder" aria-hidden="true"/>}'
if old_brand in app:
    app = replace_once(app, old_brand, new_brand, "brand sidebar")

if 'dashboard-home-grid' not in app:
    app = replace_once(app, '<div className="dashboard-grid">', '<div className="dashboard-home-grid"><div className="dashboard-grid">', "abrir hero dashboard")
    tail = '</button>)}{!overdueInvoices.length && <div className="compact-empty"><CheckCircle2/><strong>Nenhuma cobrança atrasada</strong><span>As pendências aparecerão aqui.</span></div>}</div></div>\n        </section>}'
    replacement = '</button>)}{!overdueInvoices.length && <div className="compact-empty"><CheckCircle2/><strong>Nenhuma cobrança atrasada</strong><span>As pendências aparecerão aqui.</span></div>}</div></div><div className="dashboard-brand-hero"><div><SchoolBrand institution={database.settings.institution}/></div></div></div>\n        </section>}'
    app = replace_once(app, tail, replacement, "fechar hero dashboard")

# Botão de exportar alunos dentro da barra de busca.
old_toolbar = '<select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="all">Todas as turmas</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.groupName ? ` · ${item.groupName}` : ""}</option>)}</select></div>'
new_toolbar = '<select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="all">Todas as turmas</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.groupName ? ` · ${item.groupName}` : ""}</option>)}</select><button className="secondary-button" type="button" onClick={() => void exportStudentsWorkbook(database)}><Download size={17}/> Baixar alunos</button></div>'
if old_toolbar in app:
    app = replace_once(app, old_toolbar, new_toolbar, "exportar alunos")

# Centro de avisos substitui mural passivo.
app = re.sub(r'\{view === "notices" && <section className="stack">.*?</section>\}', '{view === "notices" && <NoticesCenter database={database} onChange={setDatabase} notify={notify}/>} ', app, count=1, flags=re.S)

# Configurações com classe própria e previews recebendo instituição.
app = app.replace('{view === "settings" && <section className="stack">', '{view === "settings" && <section className="stack settings-page">')
app = app.replace('<FinanceSettingsPanel value={database.settings.finance}', '<FinanceSettingsPanel institution={database.settings.institution} value={database.settings.finance}')
app = app.replace('<DocumentSettingsPanel receipt={database.settings.receipt}', '<DocumentSettingsPanel institution={database.settings.institution} receipt={database.settings.receipt}')

# Datas de matrícula e nascimento usam entrada DD/MM/AAAA sem resetar o ano.
app = app.replace('<Field label="Data de nascimento"><input name="birthDate" type="date" min={MIN_REASONABLE_DATE} max={localTodayIso()} defaultValue="" onChange={(event) => setStudentBirthDate(event.currentTarget.value)} required/></Field>', '<Field label="Data de nascimento"><DateField name="birthDate" min={MIN_REASONABLE_DATE} max={localTodayIso()} required onIsoChange={setStudentBirthDate}/></Field>')
app = app.replace('<Field label="Início da matrícula"><input name="enrollmentStartDate" type="date" min={MIN_REASONABLE_DATE} max="2100-12-31" defaultValue={localTodayIso()} required/></Field>', '<Field label="Início da matrícula"><DateField name="enrollmentStartDate" min={MIN_REASONABLE_DATE} max="2100-12-31" initialIso={localTodayIso()} required/></Field>')
app = app.replace('<Field label="Data de nascimento"><input key={selectedStudent.id} name="birthDate" type="date" min={MIN_REASONABLE_DATE} max={localTodayIso()} defaultValue={selectedStudent.birthDate} onChange={(event) => setEditBirthDate(event.currentTarget.value)} required/></Field>', '<Field label="Data de nascimento"><DateField name="birthDate" min={MIN_REASONABLE_DATE} max={localTodayIso()} initialIso={selectedStudent.birthDate} required onIsoChange={setEditBirthDate}/></Field>')
write("src/AppNext.tsx", app)

print("AulaFácil 0.4.0 aplicado com sucesso.")
