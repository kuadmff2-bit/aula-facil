from pathlib import Path

path = Path("src/App.tsx")
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"Trecho não encontrado: {label}")
    text = text.replace(old, new, 1)


replace_once(
    "  Save,\n  Search,\n  ShieldCheck,",
    "  Save,\n  Search,\n  Settings2,\n  ShieldCheck,",
    "ícone de configurações",
)

replace_once(
    'import { loadDatabase, parseBackup, saveDatabase } from "./storage";\n',
    'import { loadDatabase, parseBackup, saveDatabase } from "./storage";\nimport { collectStudentFields, StudentExtraFieldsForm, StudentExtraInfo, StudentFieldsSettings } from "./student-fields";\n',
    "import dos campos personalizados",
)

replace_once(
    '  { id: "backup" as View, label: "Backup", icon: DatabaseBackup },\n];',
    '  { id: "backup" as View, label: "Backup", icon: DatabaseBackup },\n  { id: "settings" as View, label: "Configurações", icon: Settings2 },\n];',
    "item de navegação",
)

replace_once(
    '  backup: { title: "Proteção dos dados", description: "Faça cópias e restaure o sistema com segurança." },\n};',
    '  backup: { title: "Proteção dos dados", description: "Faça cópias e restaure o sistema com segurança." },\n  settings: { title: "Personalização", description: "Adapte o AulaFácil à realidade da sua instituição." },\n};',
    "texto da tela de configurações",
)

replace_once(
    '  const [printable, setPrintable] = useState<Printable>(null);\n  const importRef = useRef<HTMLInputElement>(null);',
    '  const [printable, setPrintable] = useState<Printable>(null);\n  const [studentBirthDate, setStudentBirthDate] = useState("");\n  const importRef = useRef<HTMLInputElement>(null);',
    "estado da data de nascimento",
)

replace_once(
    '    setModal("student");\n  };',
    '    setStudentBirthDate("");\n    setModal("student");\n  };',
    "abertura do cadastro de aluno",
)

replace_once(
    '    const classId = formValue(form, "classId");\n    if (name.length < 3 || !birthDate || !classById.has(classId)) {',
    '    const classId = formValue(form, "classId");\n    const extraFields = collectStudentFields(form, database.settings.studentFields);\n    if (name.length < 3 || !birthDate || !classById.has(classId)) {',
    "coleta dos campos personalizados",
)

replace_once(
    '        id: makeId("aluno"), name, birthDate, classId,\n        phone: formValue(form, "phone"),\n        guardianName: formValue(form, "guardianName"),\n        guardianPhone: formValue(form, "guardianPhone"),\n        active: true,',
    '        id: makeId("aluno"), name, birthDate, classId,\n        ...extraFields,\n        active: true,',
    "gravação dos campos personalizados",
)

replace_once(
    '    const className = classById.get(student.classId)?.name ?? "";\n    return (classFilter === "all" || student.classId === classFilter)\n      && `${student.name} ${student.phone} ${student.guardianName} ${className}`.toLocaleLowerCase("pt-BR").includes(query);',
    '    const className = classById.get(student.classId)?.name ?? "";\n    const customValues = Object.values(student.customFields ?? {}).join(" ");\n    return (classFilter === "all" || student.classId === classFilter)\n      && `${student.name} ${student.phone} ${student.guardianName} ${student.guardianPhone} ${customValues} ${className}`.toLocaleLowerCase("pt-BR").includes(query);',
    "busca nos campos personalizados",
)

replace_once(
    '<div className="version">AulaFácil Desktop <span>v0.2.0</span></div>',
    '<div className="version">AulaFácil Desktop <span>v0.2.1</span></div>',
    "versão da interface",
)

backup_marker = '          {view === "backup" && (\n'
settings_block = '''          {view === "settings" && (\n            <StudentFieldsSettings\n              fields={database.settings.studentFields}\n              onChange={(fields) => updateDatabase((draft) => { draft.settings.studentFields = fields; })}\n            />\n          )}\n\n'''
replace_once(backup_marker, settings_block + backup_marker, "tela de configurações")

old_student_modal = '''      {modal === "student" && <Modal title="Cadastrar aluno" description="Somente informações necessárias para a gestão escolar." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addStudent}><Field label="Nome completo" wide><input name="name" maxLength={120} placeholder="Nome do aluno" autoFocus required /></Field><Field label="Data de nascimento"><input name="birthDate" type="date" required /></Field><Field label="Turma"><select name="classId" required defaultValue=""><option value="" disabled>Escolha a turma</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Telefone do aluno"><input name="phone" inputMode="tel" maxLength={20} placeholder="(92) 99999-9999" /></Field><Field label="Nome do responsável"><input name="guardianName" maxLength={120} placeholder="Se necessário" /></Field><Field label="Telefone do responsável"><input name="guardianPhone" inputMode="tel" maxLength={20} placeholder="(92) 99999-9999" /></Field><FormActions onCancel={() => setModal(null)} submit="Cadastrar aluno" /></form></Modal>}'''
new_student_modal = '''      {modal === "student" && <Modal title="Cadastrar aluno" description="Os campos deste cadastro são definidos pela própria instituição." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addStudent}><Field label="Nome completo" wide><input name="name" maxLength={120} placeholder="Nome do aluno" autoFocus required /></Field><Field label="Data de nascimento"><input name="birthDate" type="date" value={studentBirthDate} onChange={(event) => setStudentBirthDate(event.target.value)} required /></Field><Field label="Turma"><select name="classId" required defaultValue=""><option value="" disabled>Escolha a turma</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><StudentExtraFieldsForm fields={database.settings.studentFields} birthDate={studentBirthDate} /><FormActions onCancel={() => setModal(null)} submit="Cadastrar aluno" /></form></Modal>}'''
replace_once(old_student_modal, new_student_modal, "formulário de aluno")

old_info = '<div className="info-grid"><Info label="Nascimento" value={dateLabel(student.birthDate)} /><Info label="Telefone do aluno" value={student.phone || "Não informado"} /><Info label="Responsável" value={student.guardianName || "Não informado"} /><Info label="Telefone do responsável" value={student.guardianPhone || "Não informado"} /></div>'
new_info = '<div className="info-grid"><Info label="Nascimento" value={dateLabel(student.birthDate)} /><StudentExtraInfo student={student} fields={database.settings.studentFields} /></div>'
replace_once(old_info, new_info, "detalhes personalizados do aluno")

path.write_text(text, encoding="utf-8")
print("App.tsx atualizado com campos personalizáveis.")
