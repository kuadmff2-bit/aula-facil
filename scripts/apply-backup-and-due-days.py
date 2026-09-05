from pathlib import Path
import re

path = Path('src/App.tsx')
text = path.read_text(encoding='utf-8')
original = text


def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 trecho, encontrado {count}')
    text = text.replace(old, new, 1)

replace_once('  useRef,\n', '', 'remover useRef')
replace_once('import { loadDatabase, parseBackup, saveDatabase } from "./storage";\n', 'import { loadDatabase, saveDatabase } from "./storage";\n', 'import storage')
replace_once('import { invoiceAmountDue } from "./finance-utils";\n', 'import { dueDateForMonth, invoiceAmountDue, referenceMonthFromDate } from "./finance-utils";\n', 'import finance-utils')
replace_once('import { CertificateManager } from "./certificate-manager";\n', 'import { CertificateManager } from "./certificate-manager";\nimport { BackupPanel } from "./backup-panel";\n', 'import BackupPanel')
replace_once('  const importRef = useRef<HTMLInputElement>(null);\n', '', 'remover importRef')

replace_once(
'''    const classId = formValue(form, "classId");
    const extraFields = collectStudentFields(form, database.settings.studentFields);
    if (name.length < 3 || !birthDate || !classById.has(classId)) {
      notify("Preencha nome, nascimento e turma.", "danger");
      return;
    }
''',
'''    const classId = formValue(form, "classId");
    const dueDay = Number(formValue(form, "dueDay"));
    const extraFields = collectStudentFields(form, database.settings.studentFields);
    if (name.length < 3 || !birthDate || !classById.has(classId) || !Number.isInteger(dueDay) || !database.settings.finance.allowedDueDays.includes(dueDay)) {
      notify("Preencha nome, nascimento, turma e um vencimento permitido pela escola.", "danger");
      return;
    }
''',
'validar vencimento do aluno')

replace_once(
'''        id: makeId("aluno"), name, birthDate, classId,
        ...extraFields,
        active: true,
''',
'''        id: makeId("aluno"), name, birthDate, classId,
        dueDay,
        ...extraFields,
        active: true,
''',
'salvar vencimento do aluno')

pattern = re.compile(r'''  const generateMonthlyInvoices = \(event: FormEvent<HTMLFormElement>\) => \{.*?\n  \};\n\n  const addNotice''', re.S)
replacement = '''  const generateMonthlyInvoices = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const referenceMonth = formValue(form, "referenceMonth");
    if (!/^\\d{4}-\\d{2}$/.test(referenceMonth) || database.students.length === 0) {
      notify("Escolha o mês de referência.", "danger");
      return;
    }
    let reference: string;
    try {
      reference = monthReference(new Date(`${referenceMonth}-01T12:00:00`));
    } catch {
      notify("Mês de referência inválido.", "danger");
      return;
    }
    let generated = 0;
    updateDatabase((draft) => {
      const fallbackDueDay = draft.settings.finance.allowedDueDays[0] ?? 10;
      for (const student of draft.students.filter((item) => item.active)) {
        const exists = draft.invoices.some((item) => item.studentId === student.id && item.reference.toLowerCase() === reference.toLowerCase());
        const classItem = draft.classes.find((item) => item.id === student.classId);
        const dueDay = student.dueDay && draft.settings.finance.allowedDueDays.includes(student.dueDay) ? student.dueDay : fallbackDueDay;
        if (!exists && classItem && classItem.monthlyFee > 0) {
          const dueDate = dueDateForMonth(referenceMonth, dueDay);
          draft.invoices.push({
            id: makeId("cobranca"), studentId: student.id, reference, dueDate,
            amount: classItem.monthlyFee,
            status: dueDate < localDate() ? "overdue" : "pending",
            paidAt: null,
            createdAt: new Date().toISOString(),
          });
          generated += 1;
        }
      }
    });
    setModal(null);
    notify(generated ? `${generated} mensalidade${generated > 1 ? "s" : ""} gerada${generated > 1 ? "s" : ""} com vencimentos individuais.` : "Nenhuma nova mensalidade foi necessária.", generated ? "success" : "warning");
  };

  const addNotice'''
text, count = pattern.subn(lambda _match: replacement, text, count=1)
if count != 1:
    raise SystemExit(f'geração mensal: esperado 1 trecho, encontrado {count}')

pattern = re.compile(r'''  const exportBackup = \(\) => \{.*?\n  const resetDatabase =''', re.S)
replacement = '''  const restoreBackupCandidate = (restored: SchoolDatabase, source: "encrypted" | "legacy") => {
    confirmAction({
      title: "Restaurar este backup?",
      message: "Os dados locais atuais serão substituídos pelo conteúdo validado do arquivo selecionado.",
      detail: source === "encrypted"
        ? "O arquivo criptografado e a senha foram validados. Se esta instalação também usa Cloud, sincronize depois da restauração antes de continuar trabalhando em outro dispositivo."
        : "Este é um backup JSON de uma versão anterior. O AulaFácil validou e migrou sua estrutura antes de permitir a restauração.",
      confirmLabel: "Restaurar backup",
      tone: "warning",
    }, () => {
      setDatabase(restored);
      setModal(null);
      setSelectedStudentId("");
      notify("Backup restaurado com sucesso.");
    });
  };

  const resetDatabase ='''
text, count = pattern.subn(lambda _match: replacement, text, count=1)
if count != 1:
    raise SystemExit(f'backup antigo: esperado 1 trecho, encontrado {count}')

old_student = '''{modal === "student" && <Modal title="Cadastrar aluno" description="Os campos deste cadastro são definidos pela própria instituição." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addStudent}><Field label="Nome completo" wide><input name="name" maxLength={120} placeholder="Nome do aluno" autoFocus required /></Field><Field label="Data de nascimento"><input name="birthDate" type="date" value={studentBirthDate} onChange={(event) => setStudentBirthDate(event.target.value)} required /></Field><Field label="Turma"><select name="classId" required defaultValue=""><option value="" disabled>Escolha a turma</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><StudentExtraFieldsForm fields={database.settings.studentFields} birthDate={studentBirthDate} /><FormActions onCancel={() => setModal(null)} submit="Cadastrar aluno" /></form></Modal>}'''
new_student = '''{modal === "student" && <Modal title="Cadastrar aluno" description="Os campos deste cadastro são definidos pela própria instituição." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addStudent}><Field label="Nome completo" wide><input name="name" maxLength={120} placeholder="Nome do aluno" autoFocus required /></Field><Field label="Data de nascimento"><input name="birthDate" type="date" value={studentBirthDate} onChange={(event) => setStudentBirthDate(event.target.value)} required /></Field><Field label="Turma"><select name="classId" required defaultValue=""><option value="" disabled>Escolha a turma</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Vencimento da mensalidade"><select name="dueDay" required defaultValue={String(database.settings.finance.allowedDueDays[0] ?? 10)}>{database.settings.finance.allowedDueDays.map((day) => <option key={day} value={day}>Dia {day}</option>)}</select></Field><StudentExtraFieldsForm fields={database.settings.studentFields} birthDate={studentBirthDate} /><FormActions onCancel={() => setModal(null)} submit="Cadastrar aluno" /></form></Modal>}'''
replace_once(old_student, new_student, 'modal aluno')

old_bulk = '''{modal === "bulk-invoice" && <Modal title="Gerar mensalidades" description="Cria uma cobrança para cada aluno ativo usando o valor definido na turma. Cobranças repetidas não serão duplicadas." onClose={() => setModal(null)}><form className="form-grid" onSubmit={generateMonthlyInvoices}><Field label="Referência" wide><input name="reference" defaultValue={monthReference()} maxLength={80} required /></Field><Field label="Vencimento"><input name="dueDate" type="date" defaultValue={localDate()} required /></Field><div className="form-note wide"><CircleDollarSign size={20} /><span>Serão usados os valores mensais cadastrados em cada turma.</span></div><FormActions onCancel={() => setModal(null)} submit="Gerar mensalidades" /></form></Modal>}'''
new_bulk = '''{modal === "bulk-invoice" && <Modal title="Gerar mensalidades" description="Cria uma cobrança para cada aluno ativo usando o valor da turma e o dia de vencimento escolhido no cadastro. Cobranças repetidas não serão duplicadas." onClose={() => setModal(null)}><form className="form-grid" onSubmit={generateMonthlyInvoices}><Field label="Mês de referência" wide><input name="referenceMonth" type="month" defaultValue={referenceMonthFromDate()} required /></Field><div className="form-note wide"><CircleDollarSign size={20} /><span>Cada aluno receberá o próprio vencimento. Se o dia não existir naquele mês, será usado o último dia válido.</span></div><FormActions onCancel={() => setModal(null)} submit="Gerar mensalidades" /></form></Modal>}'''
replace_once(old_bulk, new_bulk, 'modal mensalidades')

replace_once(
'''<div className="info-grid"><Info label="Nascimento" value={dateLabel(student.birthDate)} /><StudentExtraInfo student={student} fields={database.settings.studentFields} /></div>''',
'''<div className="info-grid"><Info label="Nascimento" value={dateLabel(student.birthDate)} /><Info label="Vencimento mensal" value={student.dueDay ? `Dia ${student.dueDay}` : "Padrão da escola"} /><StudentExtraInfo student={student} fields={database.settings.studentFields} /></div>''',
'detalhe vencimento aluno')

pattern = re.compile(r'''\{view === "backup" && \(\n            <section className="stack">.*?\n            </section>\n          \)\}''', re.S)
replacement = '''{view === "backup" && (
            <BackupPanel
              database={database}
              onRestoreCandidate={restoreBackupCandidate}
              onReset={resetDatabase}
              onNotify={notify}
            />
          )}'''
text, count = pattern.subn(lambda _match: replacement, text, count=1)
if count != 1:
    raise SystemExit(f'painel backup: esperado 1 trecho, encontrado {count}')

if text == original:
    raise SystemExit('Nenhuma alteração aplicada.')

path.write_text(text, encoding='utf-8')
print('App.tsx atualizado com backup criptografado e vencimentos individuais.')
