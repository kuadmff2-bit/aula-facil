from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Trecho não encontrado: {label}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, repl: str, label: str) -> str:
    next_text, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Substituição falhou ({count}): {label}")
    return next_text


# ---------------------------------------------------------------------------
# 1) Modelo: nova tela de Automações e data de conclusão da turma
# ---------------------------------------------------------------------------
model = read("src/model.ts")
model = replace_once(
    model,
    'export type View = "dashboard" | "students" | "classes" | "attendance" | "finance" | "notices" | "backup" | "cloud" | "settings";',
    'export type View = "dashboard" | "students" | "classes" | "attendance" | "finance" | "notices" | "automations" | "backup" | "cloud" | "settings";',
    "View com automations",
)
model = replace_once(
    model,
    '  durationMonths?: number | null;\n  workloadHours?: number | null;',
    '  durationMonths?: number | null;\n  endDate?: string | null;\n  workloadHours?: number | null;',
    "ClassItem.endDate",
)
write("src/model.ts", model)


# ---------------------------------------------------------------------------
# 2) Plano financeiro: usa data final da turma e nunca vence depois dela
# ---------------------------------------------------------------------------
enrollment = read("src/enrollment-plan.ts")
new_build = '''export function buildFixedCoursePlan(
  database: SchoolDatabase,
  student: Student,
  classItem: ClassItem,
  options: { startDate?: string } = {},
) {
  if ((classItem.durationType ?? "open_ended") !== "fixed" || classItem.monthlyFee <= 0) return [] as Invoice[];

  const planStartDate = options.startDate || student.enrollmentStartDate || student.createdAt.slice(0, 10);
  const startMonth = monthFromDate(planStartDate);
  const endDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(classItem.endDate ?? "") ? String(classItem.endDate) : "";

  let months = 0;
  if (endDate) {
    const endMonth = endDate.slice(0, 7);
    if (startMonth > endMonth) return [] as Invoice[];
    const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
    const [endYear, endMonthNumber] = endMonth.split("-").map(Number);
    months = (endYear - startYear) * 12 + (endMonthNumber - startMonthNumber) + 1;
  } else {
    const requestedMonths = classItem.durationMonths ?? 0;
    if (!Number.isInteger(requestedMonths) || requestedMonths < 1 || requestedMonths > 240) return [] as Invoice[];
    months = requestedMonths;
  }

  if (months < 1 || months > 240) return [] as Invoice[];

  const dueDay = dueDayFor(student, database);
  const now = new Date().toISOString();
  const invoices: Invoice[] = [];

  for (let index = 0; index < months; index += 1) {
    const referenceMonth = addMonths(startMonth, index);
    const duplicate = database.invoices.some((item) => item.studentId === student.id && (
      (item.installmentNumber === index + 1 && item.planGenerated && !options.startDate)
      || (item.reference === referenceMonth && item.status !== "cancelled")
    ));
    if (duplicate) continue;

    let dueDate = dueDateForMonth(referenceMonth, dueDay);
    if (endDate && dueDate > endDate) dueDate = endDate;
    if (endDate && dueDate > endDate) continue;

    invoices.push({
      id: makeId("cobranca"),
      studentId: student.id,
      reference: referenceMonth,
      dueDate,
      amount: classItem.monthlyFee,
      status: invoiceStatusFor(dueDate),
      paidAt: null,
      installmentNumber: index + 1,
      planGenerated: true,
      cancelledAt: null,
      cancellationReason: "",
      createdAt: now,
    });
  }
  return invoices;
}
'''
enrollment = sub_once(
    enrollment,
    r'export function buildFixedCoursePlan\(.*?\n}\n\nexport function ensureOpenEndedInvoiceForMonth',
    new_build + '\nexport function ensureOpenEndedInvoiceForMonth',
    "buildFixedCoursePlan",
)
write("src/enrollment-plan.ts", enrollment)


# ---------------------------------------------------------------------------
# 3) App: linguagem simples, Automações separadas e turma por data final
# ---------------------------------------------------------------------------
app = read("src/AppNext.tsx")
app = replace_once(app, '  WalletCards,\n  X,', '  WalletCards,\n  Zap,\n  X,', "ícone Zap")
app = replace_once(app, 'import "./app-next.css";', 'import "./app-next.css";\nimport "./didactic-ux.css";', "CSS didático")

old_nav = '''const navItems = [
  { id: "dashboard" as View, label: "Início", icon: LayoutDashboard },
  { id: "students" as View, label: "Alunos", icon: Users },
  { id: "classes" as View, label: "Turmas", icon: BookOpen },
  { id: "attendance" as View, label: "Chamada", icon: ClipboardCheck },
  { id: "finance" as View, label: "Financeiro", icon: WalletCards },
  { id: "notices" as View, label: "Avisos", icon: Megaphone },
  { id: "backup" as View, label: "Backup", icon: DatabaseBackup },
  { id: "cloud" as View, label: "Conta e nuvem", icon: Cloud },
  { id: "settings" as View, label: "Configurações", icon: Settings2 },
];'''
new_nav = '''const navItems = [
  { id: "dashboard" as View, label: "Início", icon: LayoutDashboard },
  { id: "students" as View, label: "Alunos", icon: Users },
  { id: "classes" as View, label: "Turmas", icon: BookOpen },
  { id: "attendance" as View, label: "Chamada", icon: ClipboardCheck },
  { id: "finance" as View, label: "Mensalidades", icon: WalletCards },
  { id: "notices" as View, label: "Avisos", icon: Megaphone },
  { id: "automations" as View, label: "Automações", icon: Zap },
  { id: "cloud" as View, label: "Conta e sincronização", icon: Cloud },
  { id: "backup" as View, label: "Backup e segurança", icon: DatabaseBackup },
  { id: "settings" as View, label: "Ajustes da escola", icon: Settings2 },
];'''
app = replace_once(app, old_nav, new_nav, "menu principal")

old_copy = '''const viewCopy: Record<View, { title: string; description: string }> = {
  dashboard: { title: "Visão geral", description: "O que precisa da sua atenção hoje." },
  students: { title: "Alunos", description: "Cadastro, curso e financeiro em um só lugar." },
  classes: { title: "Turmas", description: "Cursos, horários, duração e distribuição de alunos." },
  attendance: { title: "Chamada geral", description: "Veja as turmas do dia como uma planilha e marque a presença." },
  finance: { title: "Financeiro", description: "Acompanhe mensalidades, pagamentos e atrasos." },
  notices: { title: "Avisos", description: "Organize comunicados para alunos e responsáveis." },
  backup: { title: "Proteção dos dados", description: "Faça cópias e restaure o sistema com segurança." },
  cloud: { title: "Conta e nuvem", description: "Login, instituição, sincronização e estado deste dispositivo." },
  settings: { title: "Personalização", description: "Adapte o AulaFácil à realidade da sua instituição." },
};'''
new_copy = '''const viewCopy: Record<View, { title: string; description: string }> = {
  dashboard: { title: "Início", description: "Veja rapidamente o que precisa da sua atenção." },
  students: { title: "Alunos", description: "Cadastre, consulte e acompanhe cada aluno." },
  classes: { title: "Turmas", description: "Organize cursos, horários, alunos e data de conclusão." },
  attendance: { title: "Chamada", description: "Marque presença sem abrir turma por turma." },
  finance: { title: "Mensalidades", description: "Veja quem pagou, quem está devendo e receba pagamentos." },
  notices: { title: "Avisos", description: "Envie comunicados para alunos e responsáveis." },
  automations: { title: "Automações", description: "Deixe o AulaFácil enviar lembretes e confirmações sozinho." },
  backup: { title: "Backup e segurança", description: "Proteja seus dados e restaure uma cópia quando precisar." },
  cloud: { title: "Conta e sincronização", description: "Entre na conta e mantenha os dados deste computador alinhados com a nuvem." },
  settings: { title: "Ajustes da escola", description: "Mude dados, aparência, cobranças, documentos e integrações." },
};'''
app = replace_once(app, old_copy, new_copy, "textos das telas")

app = replace_once(
    app,
    '''function classDurationLabel(item: ClassItem) {
  return (item.durationType ?? "open_ended") === "fixed" ? `${item.durationMonths ?? "—"} meses` : "Sem prazo definido";
}''',
    '''function classDurationLabel(item: ClassItem) {
  if ((item.durationType ?? "open_ended") !== "fixed") return "Sem data de término";
  if (item.endDate) return `Até ${dateLabel(item.endDate)}`;
  return item.durationMonths ? `${item.durationMonths} meses` : "Data final não informada";
}''',
    "rótulo de duração",
)

app = replace_once(
    app,
    '    const durationMonths = classDurationType === "fixed" ? Number(formValue(form, "durationMonths")) : null;\n    const workloadHours = Number(formValue(form, "workloadHours")) || null;',
    '    const endDate = classDurationType === "fixed" ? formValue(form, "endDate") : "";\n    const workloadHours = Number(formValue(form, "workloadHours")) || null;',
    "data final no cadastro da turma",
)
app = replace_once(
    app,
    '''    if (classDurationType === "fixed" && (!Number.isInteger(durationMonths) || Number(durationMonths) < 1 || Number(durationMonths) > 240)) {
      notify("Informe uma duração entre 1 e 240 meses.", "danger");
      return;
    }''',
    '''    if (classDurationType === "fixed" && (genericDateError(endDate) || endDate < localTodayIso())) {
      notify("Informe uma data de conclusão válida, igual ou posterior a hoje.", "danger");
      return;
    }''',
    "validação da data final",
)
app = replace_once(
    app,
    '      durationType: classDurationType, durationMonths: classDurationType === "fixed" ? Number(durationMonths) : null,\n      workloadHours, color:',
    '      durationType: classDurationType, durationMonths: null, endDate: classDurationType === "fixed" ? endDate : null,\n      workloadHours, color:',
    "persistência da data final",
)

app = replace_once(
    app,
    '    const extraFields = collectStudentFields(form, database.settings.studentFields);\n    const birthError = birthDateError(birthDate);',
    '    const extraFields = collectStudentFields(form, database.settings.studentFields);\n    const selectedClassForEnrollment = classById.get(classId);\n    const birthError = birthDateError(birthDate);',
    "turma selecionada na matrícula",
)
app = replace_once(
    app,
    '''    if (name.length < 3 || birthError || studentPhoneError || guardianPhoneError || !classById.has(classId) || !Number.isInteger(dueDay) || !database.settings.finance.allowedDueDays.includes(dueDay) || genericDateError(enrollmentStartDate)) {
      notify(birthError || studentPhoneError || guardianPhoneError || "Preencha os dados obrigatórios com valores válidos.", "danger");
      return;
    }
    let generated = 0;''',
    '''    if (name.length < 3 || birthError || studentPhoneError || guardianPhoneError || !classById.has(classId) || !Number.isInteger(dueDay) || !database.settings.finance.allowedDueDays.includes(dueDay) || genericDateError(enrollmentStartDate)) {
      notify(birthError || studentPhoneError || guardianPhoneError || "Preencha os dados obrigatórios com valores válidos.", "danger");
      return;
    }
    if (selectedClassForEnrollment?.durationType === "fixed" && selectedClassForEnrollment.endDate && enrollmentStartDate > selectedClassForEnrollment.endDate) {
      notify("A matrícula não pode começar depois da data de conclusão da turma.", "danger");
      return;
    }
    let generated = 0;''',
    "limite da matrícula pela conclusão",
)

edit_pattern = r'''    let rescheduled = 0;\n    const classChanged = classId !== selectedStudent\.classId;\n    updateDatabase\(\(draft\) => \{.*?\n    setModal\(null\);\n    notify\(classChanged \? .*?\n  \};'''
edit_replacement = '''    let rescheduled = 0;
    let generatedForNewClass = 0;
    let cancelledFromOldClass = 0;
    const classChanged = classId !== selectedStudent.classId;
    updateDatabase((draft) => {
      const target = draft.students.find((item) => item.id === selectedStudent.id);
      if (!target) return;
      const oldDueDay = target.dueDay;
      const today = localTodayIso();
      if (classChanged) {
        for (const invoice of draft.invoices) {
          if (invoice.studentId !== target.id) continue;
          if (invoice.status !== "pending" && invoice.status !== "overdue") continue;
          if (invoice.dueDate <= today) continue;
          invoice.status = "cancelled";
          invoice.cancelledAt = new Date().toISOString();
          invoice.cancellationReason = "Aluno transferido para outra turma";
          cancelledFromOldClass += 1;
        }
      }
      Object.assign(target, { name, birthDate, documentNumber, classId, ...extraFields });
      if (oldDueDay !== dueDay) rescheduled = rescheduleFutureInvoices(draft, target.id, dueDay);
      else target.dueDay = dueDay;

      if (classChanged && (target.enrollmentStatus ?? (target.active ? "active" : "paused")) === "active") {
        const nextClass = draft.classes.find((item) => item.id === classId);
        if (nextClass?.durationType === "fixed") {
          const plan = buildFixedCoursePlan(draft, target, nextClass, { startDate: today });
          draft.invoices.push(...plan);
          generatedForNewClass = plan.length;
        } else if (nextClass) {
          const invoice = ensureOpenEndedInvoiceForMonth(draft, target, nextClass, today.slice(0, 7));
          if (invoice) { draft.invoices.push(invoice); generatedForNewClass = 1; }
        }
      }
    });
    setModal(null);
    notify(classChanged
      ? `Aluno movido para a nova turma. ${cancelledFromOldClass} cobrança${cancelledFromOldClass === 1 ? "" : "s"} futura${cancelledFromOldClass === 1 ? "" : "s"} da turma anterior foi${cancelledFromOldClass === 1 ? "" : "ram"} cancelada${cancelledFromOldClass === 1 ? "" : "s"} e ${generatedForNewClass} nova${generatedForNewClass === 1 ? "" : "s"} mensalidade${generatedForNewClass === 1 ? "" : "s"} foi${generatedForNewClass === 1 ? "" : "ram"} preparada${generatedForNewClass === 1 ? "" : "s"}.`
      : `Cadastro atualizado${rescheduled ? ` e ${rescheduled} mensalidade${rescheduled === 1 ? "" : "s"} futura${rescheduled === 1 ? "" : "s"} foi${rescheduled === 1 ? "" : "ram"} para o novo vencimento` : ""}.`);
  };'''
app = sub_once(app, edit_pattern, edit_replacement, "transferência pelo cadastro do aluno")

move_handler = '''
  const moveStudentsToClass = (targetClassId: string, studentIds: string[]) => {
    const selected = new Set(studentIds);
    const targetClass = classById.get(targetClassId);
    if (!targetClass || !selected.size) return;
    const today = localTodayIso();
    let moved = 0;
    let cancelled = 0;
    let generated = 0;

    updateDatabase((draft) => {
      const destination = draft.classes.find((item) => item.id === targetClassId);
      if (!destination) return;
      for (const student of draft.students) {
        if (!selected.has(student.id) || student.classId === targetClassId) continue;

        for (const invoice of draft.invoices) {
          if (invoice.studentId !== student.id) continue;
          if (invoice.status !== "pending" && invoice.status !== "overdue") continue;
          if (invoice.dueDate <= today) continue;
          invoice.status = "cancelled";
          invoice.cancelledAt = new Date().toISOString();
          invoice.cancellationReason = "Aluno transferido para outra turma";
          cancelled += 1;
        }

        student.classId = targetClassId;
        moved += 1;
        if ((student.enrollmentStatus ?? (student.active ? "active" : "paused")) !== "active" || !student.active) continue;

        if ((destination.durationType ?? "open_ended") === "fixed") {
          const plan = buildFixedCoursePlan(draft, student, destination, { startDate: today });
          draft.invoices.push(...plan);
          generated += plan.length;
        } else {
          const invoice = ensureOpenEndedInvoiceForMonth(draft, student, destination, today.slice(0, 7));
          if (invoice) { draft.invoices.push(invoice); generated += 1; }
        }
      }
    });

    notify(`${moved} aluno${moved === 1 ? "" : "s"} movido${moved === 1 ? "" : "s"}. ${cancelled} cobrança${cancelled === 1 ? "" : "s"} futura${cancelled === 1 ? "" : "s"} da turma anterior foi${cancelled === 1 ? "" : "ram"} cancelada${cancelled === 1 ? "" : "s"}; ${generated} nova${generated === 1 ? "" : "s"} mensalidade${generated === 1 ? "" : "s"} foi${generated === 1 ? "" : "ram"} preparada${generated === 1 ? "" : "s"}.`);
  };
'''
app = replace_once(app, '  const deleteStudent = (student: Student) =>', move_handler + '\n  const deleteStudent = (student: Student) =>', "handler de mover alunos")
app = replace_once(app, '          onAddStudent={openStudentFormForClass}\n          onDeleteClass={deleteClass}', '          onAddStudent={openStudentFormForClass}\n          onMoveStudents={moveStudentsToClass}\n          onDeleteClass={deleteClass}', "ligar transferência à lógica financeira")

app = replace_once(app, '<div className="nav-label">GESTÃO</div>', '<div className="nav-label">MENU</div>', "rótulo do menu")

settings_line = '        {view === "settings" && <section className="stack settings-page"><InstitutionSettingsPanel value={database.settings.institution} onChange={(institution) => updateDatabase((draft) => { draft.settings.institution = institution; })}/><AppearanceSettings value={database.settings.appearance} onChange={(appearance) => updateDatabase((draft) => { draft.settings.appearance = appearance; })}/><StudentFieldsSettings fields={database.settings.studentFields} onChange={(fields) => updateDatabase((draft) => { draft.settings.studentFields = fields; })}/><FinanceSettingsPanel institution={database.settings.institution} value={database.settings.finance} onChange={(finance) => updateDatabase((draft) => { draft.settings.finance = finance; })}/><DocumentSettingsPanel institution={database.settings.institution} receipt={database.settings.receipt} certificate={database.settings.certificate} onReceiptChange={(receipt) => updateDatabase((draft) => { draft.settings.receipt = receipt; })} onCertificateChange={(certificate) => updateDatabase((draft) => { draft.settings.certificate = certificate; })}/><PaymentConnectionsPanel/><MessageAutomationsPanel/></section>}'
settings_new = '''        {view === "automations" && <section className="stack automation-hub-page">
          <div className="card didactic-guide"><div><span className="didactic-eyebrow">AUTOMAÇÕES</span><h2>Escolha o que o AulaFácil deve fazer sozinho</h2><p>Conecte o WhatsApp uma vez, escreva a mensagem e escolha quando ela deve ser enviada.</p></div><div className="didactic-steps"><span><b>1</b><strong>Conectar WhatsApp</strong><small>Leia o QR Code do Robô AulaFácil.</small></span><span><b>2</b><strong>Escolher a mensagem</strong><small>Ex.: lembrar mensalidade antes de vencer.</small></span><span><b>3</b><strong>Escolher quando enviar</strong><small>Defina o dia e o horário. O servidor cuida do resto.</small></span></div></div>
          <MessageAutomationsPanel/>
        </section>}
        {view === "settings" && <section className="stack settings-page"><div className="card didactic-guide compact"><div><span className="didactic-eyebrow">AJUSTES DA ESCOLA</span><h2>Mude só o que você precisar</h2><p>Os recursos automáticos agora ficam em “Automações”. Aqui ficam dados da escola, aparência, cadastro, cobranças, documentos e formas de pagamento.</p></div></div><InstitutionSettingsPanel value={database.settings.institution} onChange={(institution) => updateDatabase((draft) => { draft.settings.institution = institution; })}/><AppearanceSettings value={database.settings.appearance} onChange={(appearance) => updateDatabase((draft) => { draft.settings.appearance = appearance; })}/><StudentFieldsSettings fields={database.settings.studentFields} onChange={(fields) => updateDatabase((draft) => { draft.settings.studentFields = fields; })}/><FinanceSettingsPanel institution={database.settings.institution} value={database.settings.finance} onChange={(finance) => updateDatabase((draft) => { draft.settings.finance = finance; })}/><DocumentSettingsPanel institution={database.settings.institution} receipt={database.settings.receipt} certificate={database.settings.certificate} onReceiptChange={(receipt) => updateDatabase((draft) => { draft.settings.receipt = receipt; })} onCertificateChange={(certificate) => updateDatabase((draft) => { draft.settings.certificate = certificate; })}/><PaymentConnectionsPanel/></section>}'''
app = replace_once(app, settings_line, settings_new, "separar automações das configurações")

class_modal = '''    {modal === "class" && <Modal title="Cadastrar turma" description="Cadastre o curso e informe até quando essa turma vai funcionar." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addClass}><Field label="Curso" wide><input name="name" maxLength={160} placeholder="Ex.: Informática" autoFocus required/></Field><Field label="Nome da turma"><input name="groupName" maxLength={120} placeholder="Ex.: Segunda 08h"/></Field><Field label="Professor"><input name="teacher" maxLength={120} required/></Field><Field label="Sala"><input name="room" maxLength={80} placeholder="Sala 1"/></Field><div className="field wide"><span>Dias da semana</span><div className="weekday-picker">{WEEKDAYS.map((day) => <label key={day.id}><input type="checkbox" name={`day-${day.id}`}/><span>{day.label}</span></label>)}</div></div><Field label="Começa às"><input name="startTime" type="time" required/></Field><Field label="Termina às"><input name="endTime" type="time" required/></Field><Field label="Valor da mensalidade"><input name="monthlyFee" type="number" min="0" step="0.01" required/></Field><Field label="Carga horária"><input name="workloadHours" type="number" min="0" max="100000" step="1"/></Field><Field label="A turma tem data para terminar?" wide><select value={classDurationType} onChange={(event) => setClassDurationType(event.target.value as "fixed"|"open_ended")}><option value="fixed">Sim, tem data de conclusão</option><option value="open_ended">Não, ainda não tem data de término</option></select></Field>{classDurationType === "fixed" && <Field label="Data de conclusão da turma" wide><DateField name="endDate" min={localTodayIso()} max="2100-12-31" required/></Field>}<div className="form-note wide"><BookOpen size={19}/><span>{classDurationType === "fixed" ? "Ao matricular um aluno, o AulaFácil cria todas as mensalidades desde o início da matrícula até essa data. Nenhuma cobrança será criada depois da conclusão da turma." : "O AulaFácil cria a mensalidade atual e continua gerando as próximas enquanto o aluno permanecer ativo."}</span></div><FormActions onCancel={() => setModal(null)} submit="Cadastrar turma"/></form></Modal>}
'''
app = sub_once(app, r'    \{modal === "class".*?\n\n    \{modal === "student"', class_modal + '\n    {modal === "student"', "modal de turma")

app = replace_once(app, '<strong>Nova turma</strong><small>Curso e horário</small>', '<strong>Nova turma</strong><small>Curso, horário e conclusão</small>', "atalho nova turma")
write("src/AppNext.tsx", app)


# ---------------------------------------------------------------------------
# 4) Tela de turmas: deixa a conclusão visível e explica transferência
# ---------------------------------------------------------------------------
classes = read("src/class-overview-panel.tsx")
classes = replace_once(
    classes,
    'function enrollmentLabel(student: Student) {',
    '''function dateLabel(value?: string | null) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function enrollmentLabel(student: Student) {''',
    "dateLabel turmas",
)
classes = replace_once(
    classes,
    '<small>{scheduleLabel(classItem)}</small>',
    '<small>{scheduleLabel(classItem)}</small><small className="class-overview-end">{(classItem.durationType ?? "open_ended") === "fixed" ? classItem.endDate ? `Conclusão: ${dateLabel(classItem.endDate)}` : classItem.durationMonths ? `Duração: ${classItem.durationMonths} meses` : "Data de conclusão não informada" : "Sem data de término"}</small>',
    "mostrar conclusão na turma",
)
classes = replace_once(
    classes,
    '<span><strong>O aluno sai da turma atual e entra nesta.</strong> Chamadas, notas e mensalidades já registradas continuam no histórico e não são apagadas.</span>',
    '<span><strong>O aluno sai da turma atual e entra nesta.</strong> O histórico continua guardado. Cobranças futuras da turma anterior são canceladas e o novo plano respeita a data de conclusão da turma de destino.</span>',
    "explicação da transferência",
)
write("src/class-overview-panel.tsx", classes)


# ---------------------------------------------------------------------------
# 5) Automações: reduz termos técnicos e deixa Robô AulaFácil como padrão
# ---------------------------------------------------------------------------
automations = read("src/message-automations-panel.tsx")
automations = replace_once(automations, 'invoice_before_due: "Mensalidade antes do vencimento",', 'invoice_before_due: "Lembrar antes do vencimento",', "evento antes")
automations = replace_once(automations, 'invoice_due: "Mensalidade vencendo hoje",', 'invoice_due: "Avisar no dia do vencimento",', "evento dia")
automations = replace_once(automations, 'invoice_overdue: "Mensalidade atrasada",', 'invoice_overdue: "Avisar mensalidade atrasada",', "evento atraso")
automations = replace_once(automations, 'payment_confirmed: "Pagamento confirmado",', 'payment_confirmed: "Confirmar pagamento recebido",', "evento pagamento")
automations = replace_once(automations, 'negotiation_due: "Parcela de negociação",', 'negotiation_due: "Lembrar parcela de acordo",', "evento acordo")
automations = replace_once(automations, 'absence: "Falta do aluno",', 'absence: "Avisar falta do aluno",', "evento falta")
automations = replace_once(automations, 'notice: "Novo comunicado",', 'notice: "Enviar novo aviso",', "evento aviso")
automations = replace_once(automations, 'const [channelProvider, setChannelProvider] = useState<MessageProviderKey>("meta");', 'const [channelProvider, setChannelProvider] = useState<MessageProviderKey>("robot_webhook");', "robô padrão")
automations = replace_once(automations, 'const [channelName, setChannelName] = useState("WhatsApp oficial");', 'const [channelName, setChannelName] = useState("Robô AulaFácil");', "nome do canal padrão")
automations = replace_once(automations, '<div><span className="message-eyebrow">AUTOMAÇÕES</span><h2>WhatsApp e mensagens automáticas</h2><p>Configure lembretes e confirmações que rodam no servidor, mesmo com os computadores da escola desligados.</p></div>', '<div><span className="message-eyebrow">AUTOMAÇÕES</span><h2>Mensagens automáticas pelo WhatsApp</h2><p>Escolha o que deve ser enviado e quando. Depois de ativado, o servidor trabalha sozinho mesmo com o computador desligado.</p></div>', "cabeçalho automações")

automations = sub_once(
    automations,
    r'      <div className="automation-setup-guide".*?</div>\n      <div className=\{automationReady',
    '''      <div className="automation-setup-guide" aria-label="Passos para ativar mensagens automáticas">
        <div className={schoolId ? "done" : cloudEmail ? "current" : ""}><b>1</b><span><strong>Conta</strong><small>{schoolId ? "Instituição pronta" : cloudEmail ? "Escolher instituição" : "Entrar na conta"}</small></span></div>
        <div className={channelReady ? "done" : schoolId ? "current" : ""}><b>2</b><span><strong>WhatsApp</strong><small>{channelReady ? "Conectado" : "Ler QR Code"}</small></span></div>
        <div className={templateReady ? "done" : channelReady ? "current" : ""}><b>3</b><span><strong>Mensagem</strong><small>{templateReady ? "Pronta" : "Escrever texto"}</small></span></div>
        <div className={automationReady ? "done" : templateReady ? "current" : ""}><b>4</b><span><strong>Quando enviar</strong><small>{automationReady ? "Funcionando" : "Dia e horário"}</small></span></div>
      </div>
      <div className={automationReady''',
    "guia simplificado",
)

automations = automations.replace("AulaFácil Cloud", "Conta e sincronização")
automations = automations.replace("1. Canal de envio", "1. Conectar o WhatsApp")
automations = automations.replace("2. Modelo da mensagem", "2. Escolher a mensagem")
automations = automations.replace("3. Regra automática", "3. Escolher quando enviar")
automations = automations.replace("Credenciais protegidas", "Conexão protegida")
automations = automations.replace("Trocar credenciais", "Trocar conexão")
automations = automations.replace("Salvar credenciais", "Salvar conexão")
automations = automations.replace("Nome interno", "Nome para identificar")
automations = automations.replace("Texto / prévia", "Mensagem que será enviada")
automations = automations.replace("Dias de antecedência/atraso", "Quantos dias antes/depois")
automations = automations.replace("Evento selecionado", "O que dispara")
automations = automations.replace("Ativar automação", "Ligar automação")
automations = automations.replace('<option value="meta">Meta WhatsApp Cloud API</option><option value="robot_webhook">Robô AulaFácil · QR Code</option>', '<option value="robot_webhook">Robô AulaFácil · QR Code (mais simples)</option><option value="meta">WhatsApp oficial da Meta (avançado)</option>')
automations = automations.replace('setChannelName(value === "meta" ? "WhatsApp oficial" : "Robô AulaFácil")', 'setChannelName(value === "meta" ? "WhatsApp oficial da Meta" : "Robô AulaFácil")')

meta_fields = '''<label><span>Template aprovado da Meta</span><input placeholder="ex.: mensalidade_vence_amanha" value={metaTemplateName} onChange={(e) => setMetaTemplateName(e.target.value)} /></label>
          <label><span>Idioma Meta</span><input value={metaLanguage} maxLength={30} onChange={(e) => setMetaLanguage(e.target.value)} /></label>
          <label className="message-span-2"><span>Parâmetros Meta, na ordem</span><input value={metaParameterKeys} onChange={(e) => setMetaParameterKeys(e.target.value)} /><small>Use os nomes sem chaves, separados por vírgula. Ex.: destinatario, contexto, valor, vencimento.</small></label>'''
meta_fields_new = '''{(channelProvider === "meta" || metaReady) && <details className="message-advanced message-span-2"><summary>Configuração avançada da Meta</summary><div className="message-form-grid"><label><span>Nome do template aprovado</span><input placeholder="ex.: mensalidade_vence_amanha" value={metaTemplateName} onChange={(e) => setMetaTemplateName(e.target.value)} /></label><label><span>Idioma</span><input value={metaLanguage} maxLength={30} onChange={(e) => setMetaLanguage(e.target.value)} /></label><label className="message-span-2"><span>Campos do template, na ordem</span><input value={metaParameterKeys} onChange={(e) => setMetaParameterKeys(e.target.value)} /><small>Esta parte só é necessária para quem usa a API oficial da Meta.</small></label></div></details>}'''
automations = replace_once(automations, meta_fields, meta_fields_new, "ocultar Meta avançado")
write("src/message-automations-panel.tsx", automations)


# ---------------------------------------------------------------------------
# 6) Sincronização em nuvem da data de conclusão
# ---------------------------------------------------------------------------
cloud = read("src/cloud.ts")
cloud = replace_once(
    cloud,
    '    duration_months: item.durationType === "fixed" ? item.durationMonths ?? null : null,\n    workload_hours:',
    '    duration_months: item.durationType === "fixed" ? item.durationMonths ?? null : null,\n    end_date: item.durationType === "fixed" ? item.endDate ?? null : null,\n    workload_hours:',
    "upload end_date cloud.ts",
)
cloud = replace_once(
    cloud,
    '      durationMonths: row.duration_type === "fixed" && row.duration_months != null ? numeric(row.duration_months) : null,\n      workloadHours:',
    '      durationMonths: row.duration_type === "fixed" && row.duration_months != null ? numeric(row.duration_months) : null,\n      endDate: row.duration_type === "fixed" && row.end_date ? asDate(row.end_date) : null,\n      workloadHours:',
    "download end_date cloud.ts",
)
write("src/cloud.ts", cloud)

safe = read("src/cloud-safe-sync.ts")
safe = replace_once(
    safe,
    'duration_months: item.durationType === "fixed" ? item.durationMonths ?? null : null, workload_hours:',
    'duration_months: item.durationType === "fixed" ? item.durationMonths ?? null : null, end_date: item.durationType === "fixed" ? item.endDate ?? null : null, workload_hours:',
    "sync end_date",
)
write("src/cloud-safe-sync.ts", safe)


# ---------------------------------------------------------------------------
# 7) Testes do limite pela data de conclusão
# ---------------------------------------------------------------------------
tests = read("src/enrollment-plan.test.ts")
marker = '''  it("não duplica uma parcela já criada pelo plano", () => {'''
extra_tests = '''  it("gera mensalidades somente até a data de conclusão da turma", () => {
    const database = emptyDatabase();
    database.settings.finance.allowedDueDays = [10, 31];
    const klass = classItem({ durationMonths: null, endDate: "2027-11-15" });
    const person = student(klass.id, { dueDay: 31, enrollmentStartDate: "2026-09-05" });
    database.classes.push(klass);
    database.students.push(person);

    const invoices = buildFixedCoursePlan(database, person, klass);
    expect(invoices).toHaveLength(15);
    expect(invoices[0].reference).toBe("2026-09");
    expect(invoices[14].reference).toBe("2027-11");
    expect(invoices[14].dueDate).toBe("2027-11-15");
    expect(invoices.every((item) => item.dueDate <= "2027-11-15")).toBe(true);
  });

  it("não gera cobrança quando a matrícula começa depois da conclusão", () => {
    const database = emptyDatabase();
    const klass = classItem({ durationMonths: null, endDate: "2026-09-10" });
    const person = student(klass.id, { enrollmentStartDate: "2026-10-01" });
    database.classes.push(klass);
    database.students.push(person);
    expect(buildFixedCoursePlan(database, person, klass)).toHaveLength(0);
  });

'''
tests = replace_once(tests, marker, extra_tests + marker, "testes data final")
write("src/enrollment-plan.test.ts", tests)


# ---------------------------------------------------------------------------
# 8) CSS da reorganização didática
# ---------------------------------------------------------------------------
css = '''.didactic-guide {
  display: grid;
  gap: 20px;
  padding: 22px 24px;
}
.didactic-guide.compact { gap: 8px; }
.didactic-guide h2 { margin: 4px 0 6px; font-size: 1.2rem; }
.didactic-guide p { margin: 0; color: var(--text-muted, var(--muted)); max-width: 820px; }
.didactic-eyebrow { font-size: .72rem; font-weight: 900; letter-spacing: .08em; color: var(--school-primary, var(--blue)); }
.didactic-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.didactic-steps > span { display: grid; grid-template-columns: 32px 1fr; gap: 2px 10px; align-items: center; min-width: 0; padding: 14px; border: 1px solid var(--border, var(--line)); border-radius: 14px; background: var(--surface-soft, var(--canvas)); }
.didactic-steps b { grid-row: 1 / span 2; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: var(--school-primary, var(--blue)); color: var(--school-on-primary, #fff); }
.didactic-steps strong { min-width: 0; }
.didactic-steps small { color: var(--text-muted, var(--muted)); line-height: 1.35; }
.message-advanced { border: 1px dashed var(--border, var(--line)); border-radius: 12px; padding: 10px 12px; }
.message-advanced summary { cursor: pointer; font-weight: 800; }
.message-advanced[open] summary { margin-bottom: 12px; }
.class-overview-end { color: var(--text-muted, var(--muted)); font-weight: 700; }
@media (max-width: 1050px) { .didactic-steps { grid-template-columns: 1fr; } }
'''
write("src/didactic-ux.css", css)

print("Refatoração didática aplicada com sucesso.")
