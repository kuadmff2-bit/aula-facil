from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        raise SystemExit(f"Trecho esperado não encontrado em {path}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


def append_once(path: str, marker: str, block: str) -> None:
    content = read(path)
    if marker in content:
        return
    if not content.endswith("\n"):
        content += "\n"
    write(path, content + "\n" + block.strip() + "\n")


# 1) Área própria para Conta/Nuvem.
replace_once(
    "src/model.ts",
    'export type View = "dashboard" | "students" | "classes" | "attendance" | "finance" | "notices" | "backup" | "settings";',
    'export type View = "dashboard" | "students" | "classes" | "attendance" | "finance" | "notices" | "backup" | "cloud" | "settings";',
)
replace_once(
    "src/AppNext.tsx",
    "  Clock3,\n  DatabaseBackup,",
    "  Clock3,\n  Cloud,\n  DatabaseBackup,",
)
replace_once(
    "src/AppNext.tsx",
    '  { id: "backup" as View, label: "Backup", icon: DatabaseBackup },\n  { id: "settings" as View, label: "Configurações", icon: Settings2 },',
    '  { id: "backup" as View, label: "Backup", icon: DatabaseBackup },\n  { id: "cloud" as View, label: "Conta e nuvem", icon: Cloud },\n  { id: "settings" as View, label: "Configurações", icon: Settings2 },',
)
replace_once(
    "src/AppNext.tsx",
    '  backup: { title: "Proteção dos dados", description: "Faça cópias e restaure o sistema com segurança." },\n  settings: { title: "Personalização", description: "Adapte o AulaFácil à realidade da sua instituição." },',
    '  backup: { title: "Proteção dos dados", description: "Faça cópias e restaure o sistema com segurança." },\n  cloud: { title: "Conta e nuvem", description: "Login, instituição, sincronização e estado deste dispositivo." },\n  settings: { title: "Personalização", description: "Adapte o AulaFácil à realidade da sua instituição." },',
)
replace_once(
    "src/AppNext.tsx",
    '<CloudAccountPanel database={database} onReplaceDatabase={setDatabase}/><CloudSyncPanel database={database} onReplaceDatabase={setDatabase}/>',
    '',
)
replace_once(
    "src/AppNext.tsx",
    '        {view === "notices" && <NoticesCenter database={database} onChange={setDatabase} notify={notify}/>} \n        {view === "settings"',
    '        {view === "notices" && <NoticesCenter database={database} onChange={setDatabase} notify={notify}/>} \n        {view === "cloud" && <section className="stack cloud-hub-page"><CloudAccountPanel database={database} onReplaceDatabase={setDatabase}/><CloudSyncPanel database={database} onReplaceDatabase={setDatabase}/></section>}\n        {view === "settings"',
)
replace_once(
    "src/AppNext.tsx",
    'throw new Error("Sincronize este computador antes de receber várias mensalidades.");',
    'throw new Error("Abra “Conta e nuvem” e sincronize este computador antes de receber várias mensalidades.");',
)

# 2) Corrigir degradação de dados na ida/volta do Cloud.
replace_once(
    "src/cloud.ts",
    '''  await upsertRows("classes", normalized.classes.map((item) => ({\n    id: item.id,\n    school_id: schoolId,\n    name: item.name,\n    teacher: item.teacher,\n    schedule: item.schedule,\n    room: item.room,\n    monthly_fee: item.monthlyFee,\n    workload_hours: item.workloadHours ?? null,\n    color: item.color,\n    active: true,\n    created_at: item.createdAt,\n    deleted_at: null,\n  })));''',
    '''  await upsertRows("classes", normalized.classes.map((item) => ({\n    id: item.id,\n    school_id: schoolId,\n    name: item.name,\n    group_name: item.groupName ?? "",\n    teacher: item.teacher,\n    schedule: item.schedule,\n    meeting_days: item.meetingDays ?? [],\n    start_time: item.startTime || null,\n    end_time: item.endTime || null,\n    room: item.room,\n    monthly_fee: item.monthlyFee,\n    duration_type: item.durationType ?? "open_ended",\n    duration_months: item.durationType === "fixed" ? item.durationMonths ?? null : null,\n    workload_hours: item.workloadHours ?? null,\n    color: item.color,\n    active: true,\n    created_at: item.createdAt,\n    deleted_at: null,\n  })));''',
)
replace_once(
    "src/cloud.ts",
    '''  await upsertRows("students", normalized.students.map((item) => ({\n    id: item.id,\n    school_id: schoolId,\n    class_id: item.classId || null,\n    name: item.name,\n    birth_date: item.birthDate,\n    phone: item.phone,\n    guardian_name: item.guardianName,\n    guardian_phone: item.guardianPhone,\n    custom_fields: item.customFields,\n    preferred_due_day: item.dueDay ?? null,\n    active: item.active,\n    completed_at: item.completedAt ? item.completedAt.slice(0, 10) : null,\n    created_at: item.createdAt,\n    deleted_at: null,\n  })));''',
    '''  await upsertRows("students", normalized.students.map((item) => ({\n    id: item.id,\n    school_id: schoolId,\n    class_id: item.classId || null,\n    name: item.name,\n    birth_date: item.birthDate,\n    document_number: item.documentNumber || null,\n    phone: item.phone,\n    guardian_name: item.guardianName,\n    guardian_phone: item.guardianPhone,\n    custom_fields: item.customFields,\n    preferred_due_day: item.dueDay ?? null,\n    enrollment_status: item.enrollmentStatus ?? (item.active ? "active" : "paused"),\n    enrollment_start_date: item.enrollmentStartDate || item.createdAt.slice(0, 10),\n    paused_at: item.pausedAt ?? null,\n    pause_reason: item.pauseReason || null,\n    active: item.active,\n    completed_at: item.completedAt ? item.completedAt.slice(0, 10) : null,\n    created_at: item.createdAt,\n    deleted_at: null,\n  })));''',
)
replace_once(
    "src/cloud.ts",
    '''  await upsertRows("invoices", normalized.invoices.map((item) => ({\n    id: item.id,\n    school_id: schoolId,\n    student_id: item.studentId,\n    reference: item.reference,\n    due_date: item.dueDate,\n    amount: item.amount,\n    status: item.status,\n    paid_at: item.paidAt,\n    provider: item.provider ?? null,\n    provider_charge_id: item.providerChargeId ?? null,\n    pix_copy_paste: item.pixCopyPaste ?? null,\n    boleto_url: item.boletoUrl ?? null,\n    created_at: item.createdAt,\n    deleted_at: null,\n  })));''',
    '''  await upsertRows("invoices", normalized.invoices.map((item) => ({\n    id: item.id,\n    school_id: schoolId,\n    student_id: item.studentId,\n    reference: item.reference,\n    due_date: item.dueDate,\n    amount: item.amount,\n    status: item.status,\n    paid_at: item.paidAt,\n    installment_number: item.installmentNumber ?? null,\n    plan_generated: Boolean(item.planGenerated),\n    cancelled_at: item.cancelledAt ?? null,\n    cancellation_reason: item.cancellationReason || null,\n    provider: item.provider ?? null,\n    provider_charge_id: item.providerChargeId ?? null,\n    pix_copy_paste: item.pixCopyPaste ?? null,\n    boleto_url: item.boletoUrl ?? null,\n    created_at: item.createdAt,\n    deleted_at: null,\n  })));''',
)
replace_once(
    "src/cloud.ts",
    '''    notes: item.notes ?? null,\n    created_at: item.createdAt,''',
    '''    notes: item.notes ?? null,\n    reversed_at: item.reversedAt ?? null,\n    reversal_reason: item.reversalReason || null,\n    created_at: item.createdAt,''',
)
replace_once(
    "src/cloud.ts",
    '''      name: nullableText(row.name),\n      teacher: nullableText(row.teacher),\n      schedule: nullableText(row.schedule),\n      room: nullableText(row.room),\n      monthlyFee: numeric(row.monthly_fee),\n      workloadHours: row.workload_hours == null ? null : numeric(row.workload_hours),''',
    '''      name: nullableText(row.name),\n      groupName: nullableText(row.group_name),\n      teacher: nullableText(row.teacher),\n      schedule: nullableText(row.schedule),\n      meetingDays: Array.isArray(row.meeting_days) ? row.meeting_days : [],\n      startTime: nullableText(row.start_time),\n      endTime: nullableText(row.end_time),\n      room: nullableText(row.room),\n      monthlyFee: numeric(row.monthly_fee),\n      durationType: row.duration_type === "fixed" ? "fixed" : "open_ended",\n      durationMonths: row.duration_type === "fixed" && row.duration_months != null ? numeric(row.duration_months) : null,\n      workloadHours: row.workload_hours == null ? null : numeric(row.workload_hours),''',
)
replace_once(
    "src/cloud.ts",
    '''      name: nullableText(row.name),\n      birthDate: asDate(row.birth_date),\n      phone: nullableText(row.phone),''',
    '''      name: nullableText(row.name),\n      birthDate: asDate(row.birth_date),\n      documentNumber: nullableText(row.document_number),\n      phone: nullableText(row.phone),''',
)
replace_once(
    "src/cloud.ts",
    '''      dueDay: row.preferred_due_day == null ? null : numeric(row.preferred_due_day),\n      active: Boolean(row.active),\n      completedAt: row.completed_at ? asDate(row.completed_at) : null,''',
    '''      dueDay: row.preferred_due_day == null ? null : numeric(row.preferred_due_day),\n      enrollmentStatus: row.enrollment_status === "completed" ? "completed" : row.enrollment_status === "paused" ? "paused" : "active",\n      enrollmentStartDate: asDate(row.enrollment_start_date) || asDate(row.created_at),\n      pausedAt: row.paused_at ? nullableText(row.paused_at) : null,\n      pauseReason: nullableText(row.pause_reason),\n      active: Boolean(row.active),\n      completedAt: row.completed_at ? asDate(row.completed_at) : null,''',
)
replace_once(
    "src/cloud.ts",
    '''      status: row.status,\n      paidAt: row.paid_at ? nullableText(row.paid_at) : null,\n      provider: row.provider ?? null,''',
    '''      status: row.status,\n      paidAt: row.paid_at ? nullableText(row.paid_at) : null,\n      installmentNumber: row.installment_number == null ? null : numeric(row.installment_number),\n      planGenerated: Boolean(row.plan_generated),\n      cancelledAt: row.cancelled_at ? nullableText(row.cancelled_at) : null,\n      cancellationReason: nullableText(row.cancellation_reason),\n      provider: row.provider ?? null,''',
)
replace_once(
    "src/cloud.ts",
    '''      receiptNumber: row.receipt_number ?? null,\n      notes: nullableText(row.notes),\n      createdAt: nullableText(row.created_at),''',
    '''      receiptNumber: row.receipt_number ?? null,\n      notes: nullableText(row.notes),\n      reversedAt: row.reversed_at ? nullableText(row.reversed_at) : null,\n      reversalReason: nullableText(row.reversal_reason),\n      createdAt: nullableText(row.created_at),''',
)

# 3) Autorreparo financeiro: se uma versão anterior perdeu o plano, reconstruir com as regras da matrícula.
replace_once(
    "src/cloud-safe-sync.ts",
    'import { ensureUuidDatabase, type SchoolDatabase } from "./model";',
    'import { buildFixedCoursePlan, ensureContinuousInvoicesDue } from "./enrollment-plan";\nimport { ensureUuidDatabase, type SchoolDatabase } from "./model";',
)
replace_once(
    "src/cloud-safe-sync.ts",
    'function canWriteAcademicCore(role: CloudSyncRole) { return isAdmin(role) || role === "teacher" || role === "staff"; }\n\nexport async function getCloudRevision',
    '''function canWriteAcademicCore(role: CloudSyncRole) { return isAdmin(role) || role === "teacher" || role === "staff"; }\n\nfunction repairMissingEnrollmentInvoices(database: SchoolDatabase) {\n  let created = ensureContinuousInvoicesDue(database);\n  for (const student of database.students) {\n    if ((student.enrollmentStatus ?? (student.active ? "active" : "paused")) !== "active" || !student.active) continue;\n    const classItem = database.classes.find((item) => item.id === student.classId);\n    if (!classItem || (classItem.durationType ?? "open_ended") !== "fixed") continue;\n    const plan = buildFixedCoursePlan(database, student, classItem);\n    if (!plan.length) continue;\n    database.invoices.push(...plan);\n    created += plan.length;\n  }\n  if (created) database.updatedAt = new Date().toISOString();\n  return created;\n}\n\nexport async function getCloudRevision''',
)
replace_once(
    "src/cloud-safe-sync.ts",
    '  const database = ensureUuidDatabase(source);\n  const institution = database.settings.institution;',
    '  const database = ensureUuidDatabase(source);\n  if (canWriteFinance(role)) repairMissingEnrollmentInvoices(database);\n  const institution = database.settings.institution;',
)
replace_once(
    "src/cloud-safe-sync.ts",
    '''export async function safePullFromCloud(schoolId: string, localAppearance: SchoolDatabase["settings"]["appearance"] = "system") {\n  const role = await getCloudSyncRole(schoolId);\n  const base = await downloadCloudDatabase(schoolId, localAppearance);\n  const database = ensureUuidDatabase(await hydrateProfessionalCloudFields(schoolId, base));\n  writeBaseline(schoolId, await getCloudRevision(schoolId), database, role);\n  return database;\n}''',
    '''export async function safePullFromCloud(schoolId: string, localAppearance: SchoolDatabase["settings"]["appearance"] = "system") {\n  const role = await getCloudSyncRole(schoolId);\n  const base = await downloadCloudDatabase(schoolId, localAppearance);\n  const database = ensureUuidDatabase(await hydrateProfessionalCloudFields(schoolId, base));\n  const repaired = canWriteFinance(role) ? repairMissingEnrollmentInvoices(database) : 0;\n  if (repaired) await pushSnapshot(schoolId, database, role);\n  writeBaseline(schoolId, await getCloudRevision(schoolId), database, role);\n  return database;\n}''',
)

# 4) Impressão colorida, contraste das prévias, responsividade e padronização do seletor da chamada.
append_once(
    "src/print-document-fixes.css",
    "QA-PRINT-COLOR-0.4.1",
    '''/* QA-PRINT-COLOR-0.4.1 */\n@media print {\n  html.aulafacil-printing #aulafacil-print-stage,\n  html.aulafacil-printing #aulafacil-print-stage * {\n    -webkit-print-color-adjust: exact !important;\n    print-color-adjust: exact !important;\n    color-adjust: exact !important;\n  }\n  html.aulafacil-printing #aulafacil-print-stage > .professional-certificate,\n  html.aulafacil-printing #aulafacil-print-stage > .professional-certificate * {\n    -webkit-print-color-adjust: exact !important;\n    print-color-adjust: exact !important;\n  }\n}''',
)
append_once(
    "src/ux-0.4.css",
    "QA-REAL-0.4.1",
    '''/* QA-REAL-0.4.1 — correções encontradas no teste com instalador */\n\n/* Cloud: nunca usar cartões claros ilegíveis quando o aplicativo está escuro. */\nhtml[data-theme="dark"] .cloud-summary-grid > div,\nhtml[data-theme="dark"] .cloud-sync-actions > div,\nhtml[data-theme="dark"] .cloud-empty-school {\n  background: var(--surface-soft) !important;\n  border-color: var(--border) !important;\n}\nhtml[data-theme="dark"] .cloud-summary-grid strong { color: var(--text) !important; }\nhtml[data-theme="dark"] .cloud-summary-grid span { color: var(--text-muted) !important; }\nhtml[data-theme="dark"] .cloud-role-chip {\n  color: #9fbeff !important;\n  background: #1a2940 !important;\n  border-color: #465b78 !important;\n}\nhtml[data-theme="dark"] .cloud-message.success { color:#8de1c4 !important; background:#16352b !important; border-color:#315f50 !important; }\nhtml[data-theme="dark"] .cloud-message.warning { color:#f1c77a !important; background:#382b17 !important; border-color:#6a5328 !important; }\nhtml[data-theme="dark"] .cloud-message.danger { color:#ffabb8 !important; background:#3a1d24 !important; border-color:#6f3540 !important; }\n\n/* A folha da prévia continua sendo uma folha clara mesmo no modo escuro. */\nhtml[data-theme="dark"] .live-doc-paper { background:#fff !important; color:#1d2734 !important; border-color:#d4d9e0 !important; color-scheme:light; }\nhtml[data-theme="dark"] .live-doc-paper h1,\nhtml[data-theme="dark"] .live-doc-paper h2,\nhtml[data-theme="dark"] .live-doc-paper h3,\nhtml[data-theme="dark"] .live-doc-paper p,\nhtml[data-theme="dark"] .live-doc-paper strong,\nhtml[data-theme="dark"] .live-doc-paper span { color:#1d2734 !important; }\nhtml[data-theme="dark"] .live-doc-paper small,\nhtml[data-theme="dark"] .live-doc-paper footer { color:#6b7480 !important; }\nhtml[data-theme="dark"] .live-doc-paper .certificate-preview-kicker { color:var(--preview-secondary,#0f766e) !important; }\nhtml[data-theme="dark"] .live-doc-paper .certificate-preview-inner h2 { color:var(--preview-primary,#1649b8) !important; }\nhtml[data-theme="dark"] .live-doc-paper .boleto-preview-heading { border-bottom-color:var(--preview-primary,#1649b8) !important; }\n\n/* Chamada: exatamente o mesmo padrão visual de Agora/Todas as turmas usado em Turmas. */\n.roster-scope {\n  display:flex !important;\n  gap:4px !important;\n  width:max-content;\n  padding:4px;\n  border:1px solid var(--border,var(--line));\n  border-radius:12px;\n  background:var(--surface-soft,var(--canvas));\n}\n.roster-scope button {\n  min-height:34px !important;\n  padding:0 12px !important;\n  border-radius:9px !important;\n  background:transparent !important;\n  color:var(--text-muted,var(--muted)) !important;\n  font-size:.78rem !important;\n  font-weight:850 !important;\n  white-space:nowrap;\n}\n.roster-scope button.active {\n  background:var(--school-primary,var(--blue)) !important;\n  color:var(--school-on-primary,#fff) !important;\n}\n\n/* Formulários: campos completos, sem calendário quebrado ou texto encostado. */\n.form-grid > *, .field, .field > * { min-width:0; }\n.form-grid .field > input,\n.form-grid .field > select,\n.form-grid .field > textarea { width:100%; max-width:100%; }\n.field > .date-field {\n  display:grid !important;\n  grid-template-columns:minmax(0,1fr) 46px !important;\n  align-items:stretch !important;\n  gap:0 !important;\n  width:100% !important;\n  min-width:0 !important;\n  color:inherit;\n  font-size:inherit;\n  font-weight:inherit;\n}\n.date-field-text { width:100% !important; min-width:0 !important; min-height:52px !important; }\n.date-field-picker-button {\n  width:46px !important;\n  min-width:46px !important;\n  min-height:52px !important;\n  height:auto !important;\n  padding:0 !important;\n  align-self:stretch !important;\n}\n.date-field-error { width:100%; }\n\n/* Negociação e telas estreitas: nada pode escapar da caixa. */\n.debt-panel, .debt-heading, .debt-builder, .debt-existing, .debt-form-grid, .debt-preview { min-width:0; max-width:100%; }\n.debt-heading > div { min-width:0; }\n.debt-heading h2, .debt-heading p, .debt-builder h3, .debt-existing h3 { overflow-wrap:anywhere; line-height:1.25; }\n.debt-form-grid > label, .debt-form-grid input, .debt-form-grid select, .debt-combo { min-width:0; width:100%; max-width:100%; }\n.debt-combo { grid-template-columns:minmax(72px,auto) minmax(0,1fr); }\n@media(max-width:1100px){\n  .debt-form-grid,.debt-preview{grid-template-columns:1fr !important;}\n  .debt-heading{gap:12px;}\n}\n@media(max-width:760px){\n  .roster-scope{width:100%;}\n  .roster-scope button{flex:1;}\n}\n\n.cloud-hub-page { max-width:1180px; width:100%; margin:0 auto; }''',
)

print("Ajustes QA 0.4.1 aplicados com sucesso.")
