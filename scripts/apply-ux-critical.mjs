import fs from "node:fs";

function edit(path, mutator) {
  const before = fs.readFileSync(path, "utf8");
  const after = mutator(before);
  if (after === before) throw new Error(`Nenhuma alteração aplicada em ${path}`);
  fs.writeFileSync(path, after);
}

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 trecho, encontrado ${count}`);
  return text.replace(from, to);
}

edit("src/AppNext.tsx", (source) => {
  let text = source;
  text = replaceOnce(text,
    '  const [studentBirthDate, setStudentBirthDate] = useState("");\n  const [editBirthDate, setEditBirthDate] = useState("");',
    '  const [studentBirthDate, setStudentBirthDate] = useState("");\n  const [editBirthDate, setEditBirthDate] = useState("");\n  const [studentClassPreset, setStudentClassPreset] = useState("");',
    "estado de turma pré-selecionada");

  text = replaceOnce(text,
`  const openStudentForm = () => {
    if (!database.classes.length) {
      notify("Cadastre uma turma antes do primeiro aluno.", "warning");
      setClassDurationType("open_ended");
      setModal("class");
      return;
    }
    setStudentBirthDate("");
    setModal("student");
  };
`,
`  const openStudentForm = () => {
    if (!database.classes.length) {
      notify("Cadastre uma turma antes do primeiro aluno.", "warning");
      setClassDurationType("open_ended");
      setModal("class");
      return;
    }
    setStudentBirthDate("");
    setStudentClassPreset("");
    setModal("student");
  };

  const openStudentFormForClass = (classId: string) => {
    if (!classById.has(classId)) {
      notify("Esta turma não está mais disponível.", "warning");
      return;
    }
    setStudentBirthDate("");
    setStudentClassPreset(classId);
    setModal("student");
  };
`,
    "abertura de matrícula por turma");

  text = replaceOnce(text,
    '    setModal(null);\n    notify(generated > 1 ? `Aluno matriculado. As ${generated} mensalidades do curso já foram criadas.` : "Aluno matriculado e primeira mensalidade preparada.");',
    '    setStudentClassPreset("");\n    setModal(null);\n    notify(generated > 1 ? `Aluno matriculado. As ${generated} mensalidades do curso já foram criadas.` : "Aluno matriculado e primeira mensalidade preparada.");',
    "limpeza da turma pré-selecionada");

  text = replaceOnce(text,
`        {view === "classes" && <ClassOverviewPanel
          database={database}
          onNewClass={() => { setClassDurationType("open_ended"); setModal("class"); }}
          onDeleteClass={deleteClass}
          onAttendance={() => { setAttendanceDate(localTodayIso()); changeView("attendance"); }}
        />}`,
`        {view === "classes" && <ClassOverviewPanel
          database={database}
          onNewClass={() => { setClassDurationType("open_ended"); setModal("class"); }}
          onAddStudent={openStudentFormForClass}
          onDeleteClass={deleteClass}
          onAttendance={() => { setAttendanceDate(localTodayIso()); changeView("attendance"); }}
        />}`,
    "prop adicionar aluno");

  text = replaceOnce(text,
    '<Field label="Data de nascimento"><input name="birthDate" type="date" min={MIN_REASONABLE_DATE} max={localTodayIso()} value={studentBirthDate} onChange={(event) => setStudentBirthDate(event.target.value)} required/></Field>',
    '<Field label="Data de nascimento"><input name="birthDate" type="date" min={MIN_REASONABLE_DATE} max={localTodayIso()} defaultValue="" onChange={(event) => setStudentBirthDate(event.currentTarget.value)} required/></Field>',
    "data de nascimento da matrícula");

  text = replaceOnce(text,
    '<Field label="Turma"><select name="classId" required defaultValue=""><option value="" disabled>Escolha a turma</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.groupName ? ` · ${item.groupName}` : ""} · {item.schedule}</option>)}</select></Field>',
    '<Field label="Turma"><select name="classId" required defaultValue={studentClassPreset}><option value="" disabled>Escolha a turma</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.groupName ? ` · ${item.groupName}` : ""} · {item.schedule}</option>)}</select></Field>',
    "turma pré-selecionada");

  text = replaceOnce(text,
    '<Field label="Data de nascimento"><input name="birthDate" type="date" min={MIN_REASONABLE_DATE} max={localTodayIso()} value={editBirthDate} onChange={(event) => setEditBirthDate(event.target.value)} required/></Field>',
    '<Field label="Data de nascimento"><input key={selectedStudent.id} name="birthDate" type="date" min={MIN_REASONABLE_DATE} max={localTodayIso()} defaultValue={selectedStudent.birthDate} onChange={(event) => setEditBirthDate(event.currentTarget.value)} required/></Field>',
    "data de nascimento da edição");

  return text;
});

edit("src/class-overview-panel.tsx", (source) => {
  let text = source;
  text = replaceOnce(text,
    'import { CalendarClock, Download, Search, Trash2, Users } from "lucide-react";',
    'import { CalendarClock, Download, Search, Trash2, UserPlus, Users } from "lucide-react";',
    "ícone adicionar aluno");
  text = replaceOnce(text,
`  onNewClass: () => void;
  onDeleteClass: (classItem: ClassItem) => void;`,
`  onNewClass: () => void;
  onAddStudent: (classId: string) => void;
  onDeleteClass: (classItem: ClassItem) => void;`,
    "prop onAddStudent");
  text = replaceOnce(text,
    'export function ClassOverviewPanel({ database, onNewClass, onDeleteClass, onAttendance }: Props) {',
    'export function ClassOverviewPanel({ database, onNewClass, onAddStudent, onDeleteClass, onAttendance }: Props) {',
    "assinatura ClassOverviewPanel");
  text = replaceOnce(text,
    '<button className="secondary-button small" onClick={() => downloadRosterCsv([classItem], database.students, `aulafacil-${safeFilename(`${classItem.name}-${classItem.groupName ?? classItem.room}`)}.csv`)}><Download size={15}/> Baixar turma</button>\n          <button className="secondary-button small" onClick={onAttendance}>Fazer chamada</button>',
    '<button className="secondary-button small" onClick={() => onAddStudent(classItem.id)}><UserPlus size={15}/> Adicionar aluno</button>\n          <button className="secondary-button small" onClick={() => downloadRosterCsv([classItem], database.students, `aulafacil-${safeFilename(`${classItem.name}-${classItem.groupName ?? classItem.room}`)}.csv`)}><Download size={15}/> Baixar turma</button>\n          <button className="secondary-button small" onClick={onAttendance}>Fazer chamada</button>',
    "botão adicionar aluno");
  return text;
});

console.log("Correções críticas aplicadas com sucesso.");
