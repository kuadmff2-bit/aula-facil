from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)


app_path = Path("src/App.tsx")
main_path = Path("src/main.tsx")
app = app_path.read_text(encoding="utf-8")
main = main_path.read_text(encoding="utf-8")

app = replace_once(
    app,
    'import { ReceiptDocument } from "./receipt-document";\n',
    'import { ReceiptDocument } from "./receipt-document";\n'
    'import { AppearanceSettings } from "./appearance-settings";\n'
    'import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";\n',
    "imports",
)

app = replace_once(
    app,
    '  const [studentBirthDate, setStudentBirthDate] = useState("");\n  const importRef = useRef<HTMLInputElement>(null);',
    '  const [studentBirthDate, setStudentBirthDate] = useState("");\n'
    '  const [confirmation, setConfirmation] = useState<(ConfirmRequest & { onConfirm: () => void }) | null>(null);\n'
    '  const importRef = useRef<HTMLInputElement>(null);',
    "confirmation state",
)

app = replace_once(
    app,
    '  useEffect(() => saveDatabase(database), [database]);\n  useEffect(() => {\n    if (!toast) return;',
    '  useEffect(() => saveDatabase(database), [database]);\n'
    '  useEffect(() => {\n'
    '    const media = window.matchMedia("(prefers-color-scheme: dark)");\n'
    '    const applyTheme = () => {\n'
    '      const appearance = database.settings.appearance ?? "system";\n'
    '      const resolved = appearance === "system" ? (media.matches ? "dark" : "light") : appearance;\n'
    '      document.documentElement.dataset.theme = resolved;\n'
    '      document.documentElement.style.colorScheme = resolved;\n'
    '    };\n'
    '    applyTheme();\n'
    '    media.addEventListener("change", applyTheme);\n'
    '    return () => media.removeEventListener("change", applyTheme);\n'
    '  }, [database.settings.appearance]);\n'
    '  useEffect(() => {\n'
    '    if (!toast) return;',
    "theme effect",
)

app = replace_once(
    app,
    '  const notify = (message: string, tone: Toast["tone"] = "success") => setToast({ message, tone });\n',
    '  const notify = (message: string, tone: Toast["tone"] = "success") => setToast({ message, tone });\n\n'
    '  const confirmAction = (request: ConfirmRequest, action: () => void) => {\n'
    '    setConfirmation({ ...request, onConfirm: action });\n'
    '  };\n',
    "confirm helper",
)

app = replace_once(
    app,
    '''  const deleteStudent = (student: Student) => {
    if (!window.confirm(`Excluir o cadastro de ${student.name} e todos os registros relacionados?`)) return;
    updateDatabase((draft) => {
      draft.students = draft.students.filter((item) => item.id !== student.id);
      draft.invoices = draft.invoices.filter((item) => item.studentId !== student.id);
      draft.attendance = draft.attendance.filter((item) => item.studentId !== student.id);
      draft.grades = draft.grades.filter((item) => item.studentId !== student.id);
    });
    setSelectedStudentId("");
    setModal(null);
    notify("Cadastro removido.", "warning");
  };
''',
    '''  const deleteStudent = (student: Student) => {
    confirmAction({
      title: "Excluir aluno?",
      message: `O cadastro de ${student.name} e os registros relacionados serão removidos deste dispositivo.`,
      detail: "Mensalidades, chamadas e notas vinculadas também serão removidas. Faça um backup se precisar preservar essas informações.",
      confirmLabel: "Excluir aluno",
      tone: "danger",
    }, () => {
      updateDatabase((draft) => {
        draft.students = draft.students.filter((item) => item.id !== student.id);
        draft.invoices = draft.invoices.filter((item) => item.studentId !== student.id);
        draft.attendance = draft.attendance.filter((item) => item.studentId !== student.id);
        draft.grades = draft.grades.filter((item) => item.studentId !== student.id);
      });
      setSelectedStudentId("");
      setModal(null);
      notify("Cadastro removido.", "warning");
    });
  };
''',
    "delete student",
)

app = replace_once(
    app,
    '''    if (!window.confirm(`Excluir a turma ${classItem.name}?`)) return;
    updateDatabase((draft) => {
      draft.classes = draft.classes.filter((item) => item.id !== classItem.id);
    });
    notify("Turma removida.", "warning");''',
    '''    confirmAction({
      title: "Excluir turma?",
      message: `A turma ${classItem.name} será removida do AulaFácil.`,
      detail: "Esta ação só é permitida quando a turma não possui alunos vinculados.",
      confirmLabel: "Excluir turma",
      tone: "danger",
    }, () => {
      updateDatabase((draft) => {
        draft.classes = draft.classes.filter((item) => item.id !== classItem.id);
      });
      notify("Turma removida.", "warning");
    });''',
    "delete class",
)

app = replace_once(
    app,
    '''      const restored = parseBackup(await file.text());
      if (!window.confirm("Restaurar este backup substituirá os dados atuais. Continuar?")) return;
      setDatabase(restored);
      setModal(null);
      setSelectedStudentId("");
      notify("Backup restaurado com sucesso.");''',
    '''      const restored = parseBackup(await file.text());
      confirmAction({
        title: "Restaurar este backup?",
        message: "Os dados locais atuais serão substituídos pelo conteúdo do arquivo selecionado.",
        detail: "O arquivo já foi validado pelo AulaFácil. Crie um backup dos dados atuais antes de continuar se precisar preservá-los.",
        confirmLabel: "Restaurar backup",
        tone: "warning",
      }, () => {
        setDatabase(restored);
        setModal(null);
        setSelectedStudentId("");
        notify("Backup restaurado com sucesso.");
      });''',
    "restore backup",
)

app = replace_once(
    app,
    '''  const resetDatabase = () => {
    if (!window.confirm("Apagar definitivamente todos os dados deste computador? Faça um backup antes.")) return;
    setDatabase(emptyDatabase());
    setSelectedStudentId("");
    setAttendanceMarks({});
    notify("O AulaFácil voltou ao estado vazio.", "warning");
  };
''',
    '''  const resetDatabase = () => {
    confirmAction({
      title: "Limpar todos os dados locais?",
      message: "Alunos, turmas, notas, chamadas, cobranças e avisos desta instalação serão removidos.",
      detail: "Esta ação é destrutiva. Faça um backup antes se existir qualquer informação que precise ser preservada.",
      confirmLabel: "Limpar sistema",
      tone: "danger",
    }, () => {
      setDatabase(emptyDatabase());
      setSelectedStudentId("");
      setAttendanceMarks({});
      notify("O AulaFácil voltou ao estado vazio.", "warning");
    });
  };
''',
    "reset database",
)

app = replace_once(
    app,
    'onClick={() => { if (window.confirm("Excluir este aviso?")) updateDatabase((draft) => { draft.notices = draft.notices.filter((item) => item.id !== notice.id); }); }}',
    'onClick={() => confirmAction({ title: "Excluir aviso?", message: `O aviso “${notice.title}” será removido do mural.`, confirmLabel: "Excluir aviso", tone: "danger" }, () => updateDatabase((draft) => { draft.notices = draft.notices.filter((item) => item.id !== notice.id); }))}',
    "delete notice",
)

app = replace_once(
    app,
    '''          {view === "settings" && (
            <StudentFieldsSettings
              fields={database.settings.studentFields}
              onChange={(fields) => updateDatabase((draft) => { draft.settings.studentFields = fields; })}
            />
          )}''',
    '''          {view === "settings" && (
            <section className="stack">
              <AppearanceSettings
                value={database.settings.appearance}
                onChange={(appearance) => updateDatabase((draft) => { draft.settings.appearance = appearance; })}
              />
              <StudentFieldsSettings
                fields={database.settings.studentFields}
                onChange={(fields) => updateDatabase((draft) => { draft.settings.studentFields = fields; })}
              />
            </section>
          )}''',
    "settings appearance",
)

app = replace_once(
    app,
    '''      {printable && <DocumentModal value={printable} classItem={classById.get(printable.student.classId)} onClose={() => setPrintable(null)} />}
      {toast && <div className={`toast ${toast.tone}`}>{toast.tone === "success" ? <CheckCircle2 /> : <AlertTriangle />}<span>{toast.message}</span><button onClick={() => setToast(null)}><X size={16} /></button></div>}''',
    '''      {printable && <DocumentModal value={printable} classItem={classById.get(printable.student.classId)} onClose={() => setPrintable(null)} />}
      {confirmation && <ConfirmDialog
        {...confirmation}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          const action = confirmation.onConfirm;
          setConfirmation(null);
          action();
        }}
      />}
      {toast && <div className={`toast ${toast.tone}`}>{toast.tone === "success" ? <CheckCircle2 /> : <AlertTriangle />}<span>{toast.message}</span><button onClick={() => setToast(null)}><X size={16} /></button></div>}''',
    "confirmation render",
)

if "window.confirm(" in app:
    raise RuntimeError("Ainda existe window.confirm no App.tsx após a integração")

main = replace_once(
    main,
    'import "./styles.css";\n',
    'import "./styles.css";\nimport "./theme.css";\n',
    "theme css import",
)

app_path.write_text(app, encoding="utf-8")
main_path.write_text(main, encoding="utf-8")
print("Integração de tema e confirmações aplicada com sucesso.")
