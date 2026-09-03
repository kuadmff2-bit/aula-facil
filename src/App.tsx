import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  DatabaseBackup,
  Download,
  FileCheck2,
  FileText,
  GraduationCap,
  HardDrive,
  LayoutDashboard,
  Megaphone,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  emptyDatabase,
  makeId,
  type ClassItem,
  type Grade,
  type Invoice,
  type InvoiceStatus,
  type SchoolDatabase,
  type Student,
  type View,
} from "./model";
import { loadDatabase, parseBackup, saveDatabase } from "./storage";

type ModalKind = "student" | "class" | "invoice" | "bulk-invoice" | "notice" | "grade" | "student-details" | null;
type Toast = { message: string; tone: "success" | "warning" | "danger" };
type Printable = { type: "Declaração" | "Certificado" | "Recibo"; student: Student; invoice?: Invoice } | null;

const navItems = [
  { id: "dashboard" as View, label: "Início", icon: LayoutDashboard },
  { id: "students" as View, label: "Alunos", icon: Users },
  { id: "classes" as View, label: "Turmas", icon: BookOpen },
  { id: "attendance" as View, label: "Chamada", icon: ClipboardCheck },
  { id: "finance" as View, label: "Financeiro", icon: WalletCards },
  { id: "notices" as View, label: "Avisos", icon: Megaphone },
  { id: "backup" as View, label: "Backup", icon: DatabaseBackup },
];

const viewCopy: Record<View, { title: string; description: string }> = {
  dashboard: { title: "Visão geral", description: "O que precisa da sua atenção hoje." },
  students: { title: "Alunos", description: "Cadastros organizados e fáceis de encontrar." },
  classes: { title: "Turmas", description: "Cursos, horários, professores e mensalidades." },
  attendance: { title: "Fazer chamada", description: "Registre a presença de uma turma em segundos." },
  finance: { title: "Financeiro", description: "Acompanhe cobranças, atrasos e recebimentos." },
  notices: { title: "Avisos", description: "Organize comunicados para alunos e responsáveis." },
  backup: { title: "Proteção dos dados", description: "Faça cópias e restaure o sistema com segurança." },
};

const classColors = ["#1649b8", "#8b5cf6", "#d97706", "#059669", "#e11d48", "#0891b2"];

function localDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function monthReference(date = new Date()) {
  const value = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const normalized = value.slice(0, 10);
  return new Date(`${normalized}T12:00:00`).toLocaleDateString("pt-BR");
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function effectiveStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.status === "paid") return "paid";
  return invoice.dueDate < localDate() ? "overdue" : "pending";
}

function statusText(status: InvoiceStatus) {
  return status === "paid" ? "Pago" : status === "overdue" ? "Atrasado" : "Pendente";
}

function formValue(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

export default function App() {
  const [database, setDatabase] = useState<SchoolDatabase>(() => loadDatabase());
  const [view, setView] = useState<View>("dashboard");
  const [modal, setModal] = useState<ModalKind>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [financeFilter, setFinanceFilter] = useState<"all" | InvoiceStatus>("all");
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(localDate());
  const [attendanceMarks, setAttendanceMarks] = useState<Record<string, "present" | "absent">>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const [printable, setPrintable] = useState<Printable>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => saveDatabase(database), [database]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const classById = useMemo(() => new Map(database.classes.map((item) => [item.id, item])), [database.classes]);
  const studentById = useMemo(() => new Map(database.students.map((item) => [item.id, item])), [database.students]);
  const selectedStudent = selectedStudentId ? studentById.get(selectedStudentId) ?? null : null;

  const updateDatabase = (change: (draft: SchoolDatabase) => void) => {
    setDatabase((current) => {
      const next = structuredClone(current);
      change(next);
      next.updatedAt = new Date().toISOString();
      return next;
    });
  };

  const notify = (message: string, tone: Toast["tone"] = "success") => setToast({ message, tone });

  const openStudentForm = () => {
    if (database.classes.length === 0) {
      notify("Cadastre uma turma antes do primeiro aluno.", "warning");
      setModal("class");
      return;
    }
    setModal("student");
  };

  const openInvoiceForm = (studentId = "") => {
    if (database.students.length === 0) {
      notify("Cadastre um aluno antes de criar uma cobrança.", "warning");
      openStudentForm();
      return;
    }
    if (studentId) setSelectedStudentId(studentId);
    setModal("invoice");
  };

  const changeView = (next: View) => {
    setView(next);
    setModal(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addClass = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = formValue(form, "name");
    const teacher = formValue(form, "teacher");
    const schedule = formValue(form, "schedule");
    const monthlyFee = Number(formValue(form, "monthlyFee"));
    if (!name || !teacher || !schedule || !Number.isFinite(monthlyFee) || monthlyFee < 0) {
      notify("Revise os dados da turma.", "danger");
      return;
    }
    updateDatabase((draft) => {
      draft.classes.push({
        id: makeId("turma"), name, teacher, schedule,
        room: formValue(form, "room") || "Sala 1",
        monthlyFee,
        color: classColors[draft.classes.length % classColors.length],
        createdAt: new Date().toISOString(),
      });
    });
    setModal(null);
    notify("Turma cadastrada.");
  };

  const addStudent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = formValue(form, "name");
    const birthDate = formValue(form, "birthDate");
    const classId = formValue(form, "classId");
    if (name.length < 3 || !birthDate || !classById.has(classId)) {
      notify("Preencha nome, nascimento e turma.", "danger");
      return;
    }
    updateDatabase((draft) => {
      draft.students.push({
        id: makeId("aluno"), name, birthDate, classId,
        phone: formValue(form, "phone"),
        guardianName: formValue(form, "guardianName"),
        guardianPhone: formValue(form, "guardianPhone"),
        active: true,
        createdAt: new Date().toISOString(),
      });
    });
    setModal(null);
    notify("Aluno cadastrado.");
  };

  const addInvoice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const studentId = formValue(form, "studentId");
    const reference = formValue(form, "reference");
    const dueDate = formValue(form, "dueDate");
    const amount = Number(formValue(form, "amount"));
    if (!studentById.has(studentId) || !reference || !dueDate || !Number.isFinite(amount) || amount <= 0) {
      notify("Revise os dados da cobrança.", "danger");
      return;
    }
    const duplicate = database.invoices.some((item) => item.studentId === studentId && item.reference.toLowerCase() === reference.toLowerCase());
    if (duplicate) {
      notify("Este aluno já possui uma cobrança com essa referência.", "warning");
      return;
    }
    updateDatabase((draft) => {
      draft.invoices.push({
        id: makeId("cobranca"), studentId, reference, dueDate, amount,
        status: dueDate < localDate() ? "overdue" : "pending",
        paidAt: null,
        createdAt: new Date().toISOString(),
      });
    });
    setModal(null);
    notify("Cobrança criada.");
  };

  const generateMonthlyInvoices = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const reference = formValue(form, "reference");
    const dueDate = formValue(form, "dueDate");
    if (!reference || !dueDate || database.students.length === 0) {
      notify("Preencha a referência e o vencimento.", "danger");
      return;
    }
    let generated = 0;
    updateDatabase((draft) => {
      for (const student of draft.students.filter((item) => item.active)) {
        const exists = draft.invoices.some((item) => item.studentId === student.id && item.reference.toLowerCase() === reference.toLowerCase());
        const classItem = draft.classes.find((item) => item.id === student.classId);
        if (!exists && classItem && classItem.monthlyFee > 0) {
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
    notify(generated ? `${generated} mensalidade${generated > 1 ? "s" : ""} gerada${generated > 1 ? "s" : ""}.` : "Nenhuma nova mensalidade foi necessária.", generated ? "success" : "warning");
  };

  const addNotice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = formValue(form, "title");
    const message = formValue(form, "message");
    if (!title || !message) {
      notify("Escreva o título e a mensagem.", "danger");
      return;
    }
    updateDatabase((draft) => draft.notices.unshift({
      id: makeId("aviso"), title, message,
      audience: formValue(form, "audience") || "Todos",
      publishedAt: new Date().toISOString(),
    }));
    setModal(null);
    notify("Aviso salvo.");
  };

  const addGrade = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStudent) return;
    const form = new FormData(event.currentTarget);
    const label = formValue(form, "label");
    const term = formValue(form, "term");
    const score = Number(formValue(form, "score"));
    if (!label || !term || !Number.isFinite(score) || score < 0 || score > 10) {
      notify("Revise a atividade, etapa e nota.", "danger");
      return;
    }
    updateDatabase((draft) => draft.grades.push({
      id: makeId("nota"), studentId: selectedStudent.id, classId: selectedStudent.classId,
      label, term, score, createdAt: new Date().toISOString(),
    }));
    setModal("student-details");
    notify("Nota salva.");
  };

  const setInvoicePaid = (invoice: Invoice) => {
    const nextPaid = invoice.status !== "paid";
    updateDatabase((draft) => {
      const target = draft.invoices.find((item) => item.id === invoice.id);
      if (!target) return;
      target.status = nextPaid ? "paid" : target.dueDate < localDate() ? "overdue" : "pending";
      target.paidAt = nextPaid ? new Date().toISOString() : null;
    });
    notify(nextPaid ? "Pagamento confirmado." : "Pagamento voltou para pendente.");
  };

  const deleteStudent = (student: Student) => {
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

  const deleteClass = (classItem: ClassItem) => {
    const count = database.students.filter((student) => student.classId === classItem.id).length;
    if (count > 0) {
      notify("Mova ou remova os alunos desta turma primeiro.", "warning");
      return;
    }
    if (!window.confirm(`Excluir a turma ${classItem.name}?`)) return;
    updateDatabase((draft) => {
      draft.classes = draft.classes.filter((item) => item.id !== classItem.id);
    });
    notify("Turma removida.", "warning");
  };

  const saveAttendance = () => {
    if (!attendanceClassId) {
      notify("Escolha uma turma.", "warning");
      return;
    }
    const students = database.students.filter((item) => item.classId === attendanceClassId && item.active);
    if (students.length === 0) {
      notify("Esta turma ainda não possui alunos.", "warning");
      return;
    }
    updateDatabase((draft) => {
      const studentIds = new Set(students.map((item) => item.id));
      draft.attendance = draft.attendance.filter((item) => !(item.classId === attendanceClassId && item.date === attendanceDate && studentIds.has(item.studentId)));
      for (const student of students) {
        draft.attendance.push({
          id: makeId("presenca"), studentId: student.id, classId: attendanceClassId,
          date: attendanceDate, status: attendanceMarks[student.id] ?? "present",
        });
      }
    });
    notify("Chamada salva.");
  };

  const selectAttendanceContext = (classId: string, date: string) => {
    setAttendanceClassId(classId);
    setAttendanceDate(date);
    const marks: Record<string, "present" | "absent"> = {};
    for (const student of database.students.filter((item) => item.classId === classId)) {
      marks[student.id] = database.attendance.find((item) => item.studentId === student.id && item.classId === classId && item.date === date)?.status ?? "present";
    }
    setAttendanceMarks(marks);
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(database, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aulafacil-backup-${localDate()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("Backup criado. Guarde o arquivo em local seguro.");
  };

  const importBackup = async (file: File) => {
    try {
      const restored = parseBackup(await file.text());
      if (!window.confirm("Restaurar este backup substituirá os dados atuais. Continuar?")) return;
      setDatabase(restored);
      setModal(null);
      setSelectedStudentId("");
      notify("Backup restaurado com sucesso.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível restaurar o arquivo.", "danger");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const resetDatabase = () => {
    if (!window.confirm("Apagar definitivamente todos os dados deste computador? Faça um backup antes.")) return;
    setDatabase(emptyDatabase());
    setSelectedStudentId("");
    setAttendanceMarks({});
    notify("O AulaFácil voltou ao estado vazio.", "warning");
  };

  const activeStudents = database.students.filter((item) => item.active);
  const paidInvoices = database.invoices.filter((item) => effectiveStatus(item) === "paid");
  const openInvoices = database.invoices.filter((item) => effectiveStatus(item) !== "paid");
  const overdueInvoices = database.invoices.filter((item) => effectiveStatus(item) === "overdue");
  const receivedTotal = paidInvoices.reduce((sum, item) => sum + item.amount, 0);
  const pendingTotal = openInvoices.reduce((sum, item) => sum + item.amount, 0);
  const attendanceToday = database.attendance.filter((item) => item.date === localDate());
  const presentToday = attendanceToday.filter((item) => item.status === "present").length;
  const attendanceRate = attendanceToday.length ? Math.round((presentToday / attendanceToday.length) * 100) : 0;

  const filteredStudents = database.students.filter((student) => {
    const query = search.toLocaleLowerCase("pt-BR");
    const className = classById.get(student.classId)?.name ?? "";
    return (classFilter === "all" || student.classId === classFilter)
      && `${student.name} ${student.phone} ${student.guardianName} ${className}`.toLocaleLowerCase("pt-BR").includes(query);
  });

  const filteredInvoices = database.invoices
    .filter((invoice) => financeFilter === "all" || effectiveStatus(invoice) === financeFilter)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const attendanceStudents = database.students.filter((item) => item.classId === attendanceClassId && item.active);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => changeView("dashboard")}>
          <span className="brand-mark">A<i /></span>
          <span><strong>AulaFácil</strong><small>Centro Shekinah</small></span>
        </button>

        <div className="nav-label">GESTÃO</div>
        <nav className="main-nav">
          {navItems.map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => changeView(item.id)}>
              <item.icon size={20} strokeWidth={2.1} />
              <span>{item.label}</span>
              {item.id === "finance" && overdueInvoices.length > 0 && <b>{overdueInvoices.length}</b>}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="local-status"><HardDrive size={18} /><span><strong>Dados locais</strong><small>Salvos neste computador</small></span><CheckCircle2 size={17} /></div>
          <div className="version">AulaFácil Desktop <span>v0.2.0</span></div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{viewCopy[view].title}</h1>
            <p>{viewCopy[view].description}</p>
          </div>
          <div className="top-actions">
            <span className="offline-pill"><ShieldCheck size={16} /> Sistema local</span>
            <button className="icon-button" onClick={() => changeView("notices")} aria-label="Abrir avisos"><Bell size={20} />{database.notices.length > 0 && <i />}</button>
            <div className="avatar">CA</div>
          </div>
        </header>

        <div className="page-content">
          {view === "dashboard" && (
            <Dashboard
              database={database}
              activeStudents={activeStudents.length}
              receivedTotal={receivedTotal}
              pendingTotal={pendingTotal}
              overdueCount={overdueInvoices.length}
              attendanceRate={attendanceRate}
              classById={classById}
              studentById={studentById}
              onAddClass={() => setModal("class")}
              onAddStudent={openStudentForm}
              onAttendance={() => changeView("attendance")}
              onFinance={() => changeView("finance")}
              onStudent={(id) => { setSelectedStudentId(id); setModal("student-details"); }}
            />
          )}

          {view === "students" && (
            <section className="stack">
              <PageHeader title={`${database.students.length} aluno${database.students.length === 1 ? "" : "s"}`} subtitle="Cadastros reais da instituição." action="Novo aluno" icon={UserPlus} onAction={openStudentForm} />
              <div className="toolbar card">
                <label className="search-box"><Search size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por aluno, responsável ou turma" /></label>
                <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} aria-label="Filtrar por turma"><option value="all">Todas as turmas</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              </div>
              {filteredStudents.length ? (
                <div className="card table-card">
                  <table>
                    <thead><tr><th>Aluno</th><th>Turma</th><th>Contato</th><th>Situação</th><th /></tr></thead>
                    <tbody>{filteredStudents.map((student) => {
                      const classItem = classById.get(student.classId);
                      return <tr key={student.id} onClick={() => { setSelectedStudentId(student.id); setModal("student-details"); }}>
                        <td><div className="person"><span>{initials(student.name)}</span><div><strong>{student.name}</strong><small>Nascimento: {dateLabel(student.birthDate)}</small></div></div></td>
                        <td>{classItem?.name ?? "Sem turma"}</td>
                        <td>{student.phone || student.guardianPhone || "Não informado"}</td>
                        <td><span className="status active">Ativo</span></td>
                        <td><ChevronRight size={19} /></td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
              ) : <EmptyState icon={Users} title={database.students.length ? "Nenhum resultado" : "Nenhum aluno cadastrado"} text={database.students.length ? "Tente outro nome ou filtro." : "Cadastre o primeiro aluno quando estiver pronto."} action={database.students.length ? undefined : "Cadastrar primeiro aluno"} onAction={openStudentForm} />}
            </section>
          )}

          {view === "classes" && (
            <section className="stack">
              <PageHeader title={`${database.classes.length} turma${database.classes.length === 1 ? "" : "s"}`} subtitle="Cada turma define o valor usado na geração mensal." action="Nova turma" icon={Plus} onAction={() => setModal("class")} />
              {database.classes.length ? <div className="class-grid">{database.classes.map((classItem) => {
                const count = database.students.filter((student) => student.classId === classItem.id).length;
                return <article className="class-card card" key={classItem.id}>
                  <div className="class-stripe" style={{ background: classItem.color }} />
                  <div className="class-top"><span className="class-icon" style={{ color: classItem.color, background: `${classItem.color}12` }}><BookOpen size={22} /></span><button className="quiet-danger" onClick={() => deleteClass(classItem)} title="Excluir turma"><Trash2 size={17} /></button></div>
                  <h3>{classItem.name}</h3><p>{classItem.teacher}</p>
                  <dl><div><dt><CalendarDays size={16} /> Horário</dt><dd>{classItem.schedule}</dd></div><div><dt><Users size={16} /> Alunos</dt><dd>{count}</dd></div><div><dt><CircleDollarSign size={16} /> Mensalidade</dt><dd>{money(classItem.monthlyFee)}</dd></div><div><dt><BookOpen size={16} /> Sala</dt><dd>{classItem.room}</dd></div></dl>
                  <button className="card-link" onClick={() => { selectAttendanceContext(classItem.id, attendanceDate); changeView("attendance"); }}>Fazer chamada <ArrowRight size={17} /></button>
                </article>;
              })}</div> : <EmptyState icon={BookOpen} title="Comece pela primeira turma" text="Informe o curso, professor, horário e valor mensal. Nenhum dado fictício será criado." action="Cadastrar primeira turma" onAction={() => setModal("class")} />}
            </section>
          )}

          {view === "attendance" && (
            <section className="stack">
              <div className="card attendance-controls">
                <Field label="Turma"><select value={attendanceClassId} onChange={(event) => selectAttendanceContext(event.target.value, attendanceDate)}><option value="">Escolha uma turma</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Data"><input type="date" value={attendanceDate} onChange={(event) => selectAttendanceContext(attendanceClassId, event.target.value)} /></Field>
                <div className="control-actions"><button className="secondary-button" onClick={() => setAttendanceMarks(Object.fromEntries(attendanceStudents.map((item) => [item.id, "present"])))}>Marcar todos presentes</button></div>
              </div>
              {!attendanceClassId ? <EmptyState icon={CalendarCheck2} title="Escolha uma turma" text="Selecione a turma e a data para começar a chamada." /> : attendanceStudents.length === 0 ? <EmptyState icon={Users} title="Turma sem alunos" text="Cadastre alunos nesta turma antes de fazer a chamada." action="Cadastrar aluno" onAction={openStudentForm} /> : <div className="card attendance-list">
                <div className="list-title"><div><h2>Lista de presença</h2><p>{attendanceStudents.length} aluno{attendanceStudents.length > 1 ? "s" : ""}</p></div><button className="primary-button" onClick={saveAttendance}><Save size={18} /> Salvar chamada</button></div>
                {attendanceStudents.map((student) => {
                  const mark = attendanceMarks[student.id] ?? database.attendance.find((item) => item.studentId === student.id && item.classId === attendanceClassId && item.date === attendanceDate)?.status ?? "present";
                  return <div className="attendance-row" key={student.id}><div className="person"><span>{initials(student.name)}</span><div><strong>{student.name}</strong><small>{student.guardianName || student.phone || "Aluno"}</small></div></div><div className="mark-toggle"><button className={mark === "present" ? "present active" : "present"} onClick={() => setAttendanceMarks((current) => ({ ...current, [student.id]: "present" }))}><Check size={17} /> Presente</button><button className={mark === "absent" ? "absent active" : "absent"} onClick={() => setAttendanceMarks((current) => ({ ...current, [student.id]: "absent" }))}><X size={17} /> Ausente</button></div></div>;
                })}
              </div>}
            </section>
          )}

          {view === "finance" && (
            <section className="stack">
              <PageHeader title="Mensalidades" subtitle="Valores registrados neste computador." action="Nova cobrança" icon={Plus} onAction={() => openInvoiceForm()} secondaryAction={database.students.length ? "Gerar para todos" : undefined} onSecondary={() => setModal("bulk-invoice")} />
              <div className="finance-metrics"><MiniMetric label="Recebido" value={money(receivedTotal)} icon={CheckCircle2} tone="green" /><MiniMetric label="Em aberto" value={money(pendingTotal)} icon={Clock3} tone="amber" /><MiniMetric label="Atrasadas" value={String(overdueInvoices.length)} icon={AlertTriangle} tone="red" /></div>
              <div className="filter-tabs">{(["all", "pending", "overdue", "paid"] as const).map((item) => <button key={item} className={financeFilter === item ? "active" : ""} onClick={() => setFinanceFilter(item)}>{item === "all" ? "Todas" : statusText(item)}</button>)}</div>
              {filteredInvoices.length ? <div className="card table-card"><table><thead><tr><th>Aluno</th><th>Referência</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead><tbody>{filteredInvoices.map((invoice) => {
                const student = studentById.get(invoice.studentId);
                const status = effectiveStatus(invoice);
                return <tr key={invoice.id}><td><strong>{student?.name ?? "Aluno removido"}</strong></td><td>{invoice.reference}</td><td>{dateLabel(invoice.dueDate)}</td><td><strong>{money(invoice.amount)}</strong></td><td><span className={`status ${status}`}>{statusText(status)}</span></td><td><div className="row-actions"><button className={status === "paid" ? "secondary-button small" : "primary-button small"} onClick={() => setInvoicePaid(invoice)}>{status === "paid" ? "Reabrir" : "Confirmar"}</button>{status === "paid" && student && <button className="icon-button small" title="Abrir recibo" onClick={() => setPrintable({ type: "Recibo", student, invoice })}><ReceiptText size={17} /></button>}</div></td></tr>;
              })}</tbody></table></div> : <EmptyState icon={WalletCards} title={database.invoices.length ? "Nenhuma cobrança neste filtro" : "Nenhuma cobrança cadastrada"} text={database.invoices.length ? "Escolha outro status acima." : "Crie uma cobrança individual ou gere as mensalidades de todos."} action={database.invoices.length ? undefined : "Criar primeira cobrança"} onAction={() => openInvoiceForm()} />}
            </section>
          )}

          {view === "notices" && (
            <section className="stack">
              <PageHeader title="Mural de avisos" subtitle="Comunicados preparados pela secretaria." action="Novo aviso" icon={Plus} onAction={() => setModal("notice")} />
              {database.notices.length ? <div className="notice-grid">{database.notices.map((notice) => <article className="card notice-card" key={notice.id}><div><span className="audience">{notice.audience}</span><time>{new Date(notice.publishedAt).toLocaleDateString("pt-BR")}</time></div><h3>{notice.title}</h3><p>{notice.message}</p><button className="quiet-danger" onClick={() => { if (window.confirm("Excluir este aviso?")) updateDatabase((draft) => { draft.notices = draft.notices.filter((item) => item.id !== notice.id); }); }}><Trash2 size={16} /> Excluir</button></article>)}</div> : <EmptyState icon={Megaphone} title="Nenhum aviso" text="O mural começa vazio. Crie apenas comunicados reais." action="Criar primeiro aviso" onAction={() => setModal("notice")} />}
            </section>
          )}

          {view === "backup" && (
            <section className="stack">
              <div className="security-hero card"><span><ShieldCheck size={30} /></span><div><h2>Seus dados ficam neste computador</h2><p>O AulaFácil Desktop não envia cadastros para sites nem exige conta do ChatGPT. Faça backups frequentes para não perder informações se o computador for formatado ou danificado.</p></div></div>
              <div className="backup-grid">
                <article className="card backup-card"><span className="backup-icon blue"><Download /></span><h3>Criar backup</h3><p>Baixa uma cópia completa de alunos, turmas, notas, chamadas, cobranças e avisos.</p><button className="primary-button" onClick={exportBackup}><Download size={18} /> Salvar backup</button></article>
                <article className="card backup-card"><span className="backup-icon green"><Upload /></span><h3>Restaurar backup</h3><p>Recupera os dados a partir de um arquivo criado anteriormente pelo AulaFácil.</p><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importBackup(file); }} /><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={18} /> Escolher arquivo</button></article>
              </div>
              <div className="card data-summary"><div><h3>Resumo armazenado</h3><p>Última alteração: {new Date(database.updatedAt).toLocaleString("pt-BR")}</p></div><div className="summary-numbers"><span><b>{database.students.length}</b> alunos</span><span><b>{database.classes.length}</b> turmas</span><span><b>{database.invoices.length}</b> cobranças</span><span><b>{database.attendance.length}</b> presenças</span></div></div>
              <div className="danger-zone card"><div><h3>Apagar todos os dados</h3><p>Use apenas se quiser reiniciar o sistema completamente vazio.</p></div><button className="danger-button" onClick={resetDatabase}><Trash2 size={18} /> Limpar sistema</button></div>
            </section>
          )}
        </div>
      </main>

      {modal === "class" && <Modal title="Cadastrar turma" description="Comece com dados reais. Você poderá cadastrar os alunos em seguida." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addClass}><Field label="Nome da turma" wide><input name="name" maxLength={100} placeholder="Ex.: Informática completa" autoFocus required /></Field><Field label="Professor"><input name="teacher" maxLength={100} placeholder="Nome do professor" required /></Field><Field label="Sala"><input name="room" maxLength={60} placeholder="Sala 1" /></Field><Field label="Dias e horário"><input name="schedule" maxLength={100} placeholder="Ex.: Seg e Qua · 14h" required /></Field><Field label="Mensalidade"><input name="monthlyFee" type="number" min="0" step="0.01" placeholder="150,00" required /></Field><FormActions onCancel={() => setModal(null)} submit="Cadastrar turma" /></form></Modal>}

      {modal === "student" && <Modal title="Cadastrar aluno" description="Somente informações necessárias para a gestão escolar." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addStudent}><Field label="Nome completo" wide><input name="name" maxLength={120} placeholder="Nome do aluno" autoFocus required /></Field><Field label="Data de nascimento"><input name="birthDate" type="date" required /></Field><Field label="Turma"><select name="classId" required defaultValue=""><option value="" disabled>Escolha a turma</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Telefone do aluno"><input name="phone" inputMode="tel" maxLength={20} placeholder="(92) 99999-9999" /></Field><Field label="Nome do responsável"><input name="guardianName" maxLength={120} placeholder="Se necessário" /></Field><Field label="Telefone do responsável"><input name="guardianPhone" inputMode="tel" maxLength={20} placeholder="(92) 99999-9999" /></Field><FormActions onCancel={() => setModal(null)} submit="Cadastrar aluno" /></form></Modal>}

      {modal === "invoice" && <Modal title="Criar cobrança" description="Registre uma mensalidade ou outro valor devido pelo aluno." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addInvoice}><Field label="Aluno" wide><select name="studentId" defaultValue={selectedStudentId} required><option value="" disabled>Escolha o aluno</option>{database.students.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Referência"><input name="reference" defaultValue={monthReference()} maxLength={80} required /></Field><Field label="Vencimento"><input name="dueDate" type="date" defaultValue={localDate()} required /></Field><Field label="Valor"><input name="amount" type="number" min="0.01" step="0.01" placeholder="150,00" required /></Field><FormActions onCancel={() => setModal(null)} submit="Criar cobrança" /></form></Modal>}

      {modal === "bulk-invoice" && <Modal title="Gerar mensalidades" description="Cria uma cobrança para cada aluno ativo usando o valor definido na turma. Cobranças repetidas não serão duplicadas." onClose={() => setModal(null)}><form className="form-grid" onSubmit={generateMonthlyInvoices}><Field label="Referência" wide><input name="reference" defaultValue={monthReference()} maxLength={80} required /></Field><Field label="Vencimento"><input name="dueDate" type="date" defaultValue={localDate()} required /></Field><div className="form-note wide"><CircleDollarSign size={20} /><span>Serão usados os valores mensais cadastrados em cada turma.</span></div><FormActions onCancel={() => setModal(null)} submit="Gerar mensalidades" /></form></Modal>}

      {modal === "notice" && <Modal title="Novo aviso" description="Prepare o texto que será usado na comunicação da escola." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addNotice}><Field label="Título" wide><input name="title" maxLength={100} placeholder="Assunto do aviso" autoFocus required /></Field><Field label="Público"><select name="audience" defaultValue="Todos"><option>Todos</option><option>Alunos</option><option>Responsáveis</option></select></Field><Field label="Mensagem" wide><textarea name="message" maxLength={700} rows={6} placeholder="Escreva uma mensagem clara e curta." required /></Field><FormActions onCancel={() => setModal(null)} submit="Salvar aviso" /></form></Modal>}

      {modal === "grade" && selectedStudent && <Modal title="Lançar nota" description={`${selectedStudent.name} · ${classById.get(selectedStudent.classId)?.name ?? "Turma"}`} onClose={() => setModal("student-details")}><form className="form-grid" onSubmit={addGrade}><Field label="Atividade ou avaliação" wide><input name="label" maxLength={80} placeholder="Ex.: Avaliação 1" autoFocus required /></Field><Field label="Etapa"><input name="term" maxLength={40} placeholder="Ex.: 1º bimestre" required /></Field><Field label="Nota de 0 a 10"><input name="score" type="number" min="0" max="10" step="0.1" required /></Field><FormActions onCancel={() => setModal("student-details")} submit="Salvar nota" /></form></Modal>}

      {modal === "student-details" && selectedStudent && <StudentDetails student={selectedStudent} database={database} classItem={classById.get(selectedStudent.classId)} onClose={() => setModal(null)} onGrade={() => setModal("grade")} onInvoice={() => openInvoiceForm(selectedStudent.id)} onDocument={(type) => setPrintable({ type, student: selectedStudent })} onReceipt={(invoice) => setPrintable({ type: "Recibo", student: selectedStudent, invoice })} onToggleInvoice={setInvoicePaid} onDelete={() => deleteStudent(selectedStudent)} />}

      {printable && <DocumentModal value={printable} classItem={classById.get(printable.student.classId)} onClose={() => setPrintable(null)} />}
      {toast && <div className={`toast ${toast.tone}`}>{toast.tone === "success" ? <CheckCircle2 /> : <AlertTriangle />}<span>{toast.message}</span><button onClick={() => setToast(null)}><X size={16} /></button></div>}
    </div>
  );
}

function Dashboard({ database, activeStudents, receivedTotal, pendingTotal, overdueCount, attendanceRate, classById, studentById, onAddClass, onAddStudent, onAttendance, onFinance, onStudent }: {
  database: SchoolDatabase; activeStudents: number; receivedTotal: number; pendingTotal: number; overdueCount: number; attendanceRate: number;
  classById: Map<string, ClassItem>; studentById: Map<string, Student>; onAddClass: () => void; onAddStudent: () => void; onAttendance: () => void; onFinance: () => void; onStudent: (id: string) => void;
}) {
  const isEmpty = database.classes.length === 0 && database.students.length === 0;
  const recentInvoices = [...database.invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  return <section className="stack">
    {isEmpty && <div className="welcome-card"><div><span className="eyebrow">PRONTO PARA COMEÇAR</span><h2>Seu AulaFácil está limpo</h2><p>Nenhum aluno, cobrança ou registro de teste foi incluído. Cadastre a primeira turma e monte o sistema com os dados reais da Shekinah.</p><button className="light-button" onClick={onAddClass}><Plus size={19} /> Cadastrar primeira turma</button></div><div className="welcome-steps"><span className="done"><b>1</b><small>Turma</small></span><i /><span><b>2</b><small>Alunos</small></span><i /><span><b>3</b><small>Mensalidades</small></span></div></div>}
    <div className="metric-grid"><Metric label="Alunos ativos" value={String(activeStudents)} helper={`${database.classes.length} turma${database.classes.length === 1 ? "" : "s"}`} icon={Users} tone="blue" /><Metric label="Recebido" value={money(receivedTotal)} helper="Pagamentos confirmados" icon={CircleDollarSign} tone="green" /><Metric label="Em aberto" value={money(pendingTotal)} helper={overdueCount ? `${overdueCount} atrasada${overdueCount > 1 ? "s" : ""}` : "Nenhuma atrasada"} icon={Clock3} tone={overdueCount ? "red" : "amber"} /><Metric label="Presença hoje" value={database.attendance.some((item) => item.date === localDate()) ? `${attendanceRate}%` : "—"} helper="Chamadas de hoje" icon={CalendarCheck2} tone="violet" /></div>
    <div className="dashboard-grid"><div className="card quick-card"><div className="section-heading"><div><h2>Ações rápidas</h2><p>Comece pelo que você precisa fazer.</p></div></div><div className="quick-actions"><button onClick={onAddStudent}><span className="blue"><UserPlus /></span><div><strong>Novo aluno</strong><small>Adicionar cadastro</small></div><ChevronRight /></button><button onClick={onAttendance}><span className="violet"><ClipboardCheck /></span><div><strong>Fazer chamada</strong><small>Registrar presença</small></div><ChevronRight /></button><button onClick={onFinance}><span className="green"><WalletCards /></span><div><strong>Mensalidades</strong><small>Ver financeiro</small></div><ChevronRight /></button><button onClick={onAddClass}><span className="amber"><BookOpen /></span><div><strong>Nova turma</strong><small>Criar curso ou horário</small></div><ChevronRight /></button></div></div><div className="card attention-card"><div className="section-heading"><div><h2>Precisa de atenção</h2><p>Pendências financeiras.</p></div>{overdueCount > 0 && <span className="count-badge">{overdueCount}</span>}</div>{database.invoices.filter((item) => effectiveStatus(item) === "overdue").slice(0, 4).map((invoice) => <button key={invoice.id} onClick={() => onStudent(invoice.studentId)}><span className="warning-icon"><AlertTriangle size={18} /></span><div><strong>{studentById.get(invoice.studentId)?.name ?? "Aluno"}</strong><small>{invoice.reference} · venceu {dateLabel(invoice.dueDate)}</small></div><b>{money(invoice.amount)}</b></button>)}{overdueCount === 0 && <div className="compact-empty"><CheckCircle2 /><strong>Nenhuma cobrança atrasada</strong><span>As pendências aparecerão aqui.</span></div>}</div></div>
    <div className="dashboard-grid wide-left"><div className="card recent-card"><div className="section-heading"><div><h2>Movimentações recentes</h2><p>Cobranças adicionadas ao sistema.</p></div></div>{recentInvoices.length ? <div className="simple-list">{recentInvoices.map((invoice) => <button key={invoice.id} onClick={() => onStudent(invoice.studentId)}><span className={`status-dot ${effectiveStatus(invoice)}`} /><div><strong>{studentById.get(invoice.studentId)?.name ?? "Aluno removido"}</strong><small>{invoice.reference}</small></div><span>{money(invoice.amount)}</span><em className={`status ${effectiveStatus(invoice)}`}>{statusText(effectiveStatus(invoice))}</em></button>)}</div> : <div className="compact-empty"><ReceiptText /><strong>Nenhuma movimentação</strong><span>O sistema está pronto para dados reais.</span></div>}</div><div className="card classes-summary"><div className="section-heading"><div><h2>Turmas</h2><p>Distribuição de alunos.</p></div></div>{database.classes.length ? database.classes.slice(0, 5).map((classItem) => { const count = database.students.filter((student) => student.classId === classItem.id).length; return <div key={classItem.id}><span style={{ background: classItem.color }} /><div><strong>{classItem.name}</strong><small>{classItem.schedule}</small></div><b>{count}</b></div>; }) : <div className="compact-empty"><BookOpen /><strong>Nenhuma turma</strong><span>Cadastre a primeira para começar.</span></div>}</div></div>
  </section>;
}

function StudentDetails({ student, database, classItem, onClose, onGrade, onInvoice, onDocument, onReceipt, onToggleInvoice, onDelete }: {
  student: Student; database: SchoolDatabase; classItem?: ClassItem; onClose: () => void; onGrade: () => void; onInvoice: () => void; onDocument: (type: "Declaração" | "Certificado") => void; onReceipt: (invoice: Invoice) => void; onToggleInvoice: (invoice: Invoice) => void; onDelete: () => void;
}) {
  const grades = database.grades.filter((item) => item.studentId === student.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const invoices = database.invoices.filter((item) => item.studentId === student.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const records = database.attendance.filter((item) => item.studentId === student.id);
  const presence = records.length ? Math.round(records.filter((item) => item.status === "present").length / records.length * 100) : null;
  const average = grades.length ? grades.reduce((sum, item) => sum + item.score, 0) / grades.length : null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="details-panel"><header className="details-header"><button className="modal-close" onClick={onClose}><X /></button><div className="big-avatar">{initials(student.name)}</div><div><span className="status active">Matrícula ativa</span><h2>{student.name}</h2><p>{classItem?.name ?? "Sem turma"} · {classItem?.schedule ?? "Horário não informado"}</p></div></header><div className="details-body"><div className="student-metrics"><MiniMetric label="Média" value={average === null ? "—" : average.toFixed(1)} icon={GraduationCap} tone="blue" /><MiniMetric label="Frequência" value={presence === null ? "—" : `${presence}%`} icon={CalendarCheck2} tone="green" /><MiniMetric label="Em aberto" value={money(invoices.filter((item) => effectiveStatus(item) !== "paid").reduce((sum, item) => sum + item.amount, 0))} icon={WalletCards} tone="amber" /></div><div className="info-grid"><Info label="Nascimento" value={dateLabel(student.birthDate)} /><Info label="Telefone do aluno" value={student.phone || "Não informado"} /><Info label="Responsável" value={student.guardianName || "Não informado"} /><Info label="Telefone do responsável" value={student.guardianPhone || "Não informado"} /></div><div className="details-actions"><button className="primary-button" onClick={onGrade}><Plus size={17} /> Lançar nota</button><button className="secondary-button" onClick={onInvoice}><Plus size={17} /> Nova cobrança</button><button className="secondary-button" onClick={() => onDocument("Declaração")}><FileText size={17} /> Declaração</button><button className="secondary-button" onClick={() => onDocument("Certificado")}><FileCheck2 size={17} /> Certificado</button></div><section className="detail-section"><div className="section-heading"><div><h3>Notas</h3><p>Histórico de avaliações.</p></div></div>{grades.length ? <div className="record-list">{grades.map((grade) => <div key={grade.id}><span className={grade.score >= 7 ? "score good" : "score attention"}>{grade.score.toFixed(1)}</span><div><strong>{grade.label}</strong><small>{grade.term}</small></div></div>)}</div> : <p className="inline-empty">Nenhuma nota lançada.</p>}</section><section className="detail-section"><div className="section-heading"><div><h3>Financeiro</h3><p>Cobranças deste aluno.</p></div></div>{invoices.length ? <div className="invoice-list">{invoices.map((invoice) => { const status = effectiveStatus(invoice); return <div key={invoice.id}><div><strong>{invoice.reference}</strong><small>Vencimento: {dateLabel(invoice.dueDate)}</small></div><b>{money(invoice.amount)}</b><span className={`status ${status}`}>{statusText(status)}</span><button className="text-button" onClick={() => onToggleInvoice(invoice)}>{status === "paid" ? "Reabrir" : "Confirmar"}</button>{status === "paid" && <button className="icon-button small" onClick={() => onReceipt(invoice)} title="Recibo"><ReceiptText size={16} /></button>}</div>; })}</div> : <p className="inline-empty">Nenhuma cobrança cadastrada.</p>}</section><button className="delete-record" onClick={onDelete}><Trash2 size={17} /> Excluir aluno e registros</button></div></section></div>;
}

function DocumentModal({ value, classItem, onClose }: { value: NonNullable<Printable>; classItem?: ClassItem; onClose: () => void }) {
  const today = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());
  return <div className="modal-backdrop document-backdrop"><section className="document-dialog"><div className="document-toolbar"><div><strong>{value.type}</strong><span>Confira antes de imprimir ou salvar em PDF.</span></div><button className="secondary-button" onClick={onClose}>Fechar</button><button className="primary-button" onClick={() => window.print()}><Printer size={18} /> Imprimir ou PDF</button></div><article id="print-area"><header><div><strong>Centro Educacional Shekinah</strong><span>Barreirinha — Amazonas</span></div><b>S</b></header><h1>{value.type}</h1><p>{value.type === "Recibo" ? <>Recebemos de <strong>{value.student.name}</strong> o valor de <strong>{money(value.invoice?.amount ?? 0)}</strong>, referente a <strong>{value.invoice?.reference}</strong>, com pagamento confirmado em <strong>{dateLabel(value.invoice?.paidAt ?? null)}</strong>.</> : value.type === "Certificado" ? <>Certificamos que <strong>{value.student.name}</strong> concluiu as atividades do curso <strong>{classItem?.name ?? "informado pela instituição"}</strong> no Centro Educacional Shekinah.</> : <>Declaramos, para os devidos fins, que <strong>{value.student.name}</strong> encontra-se regularmente matriculado(a) no curso <strong>{classItem?.name ?? "informado pela instituição"}</strong>, com aulas no horário <strong>{classItem?.schedule ?? "registrado pela secretaria"}</strong>.</>}</p><div className="document-date">Barreirinha, {today}.</div><footer><span /><p>Secretaria<br />Centro Educacional Shekinah</p></footer>{value.type === "Recibo" && <small className="document-code">Recibo: {value.invoice?.id.toUpperCase()}</small>}</article></section></div>;
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal"><header><div><h2>{title}</h2><p>{description}</p></div><button className="modal-close" onClick={onClose} aria-label="Fechar"><X /></button></header>{children}</section></div>;
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) { return <label className={wide ? "field wide" : "field"}><span>{label}</span>{children}</label>; }

function FormActions({ onCancel, submit }: { onCancel: () => void; submit: string }) { return <div className="form-actions wide"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button type="submit" className="primary-button"><Check size={18} /> {submit}</button></div>; }

function PageHeader({ title, subtitle, action, icon: Icon, onAction, secondaryAction, onSecondary }: { title: string; subtitle: string; action: string; icon: typeof Plus; onAction: () => void; secondaryAction?: string; onSecondary?: () => void }) { return <div className="page-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><div>{secondaryAction && <button className="secondary-button" onClick={onSecondary}>{secondaryAction}</button>}<button className="primary-button" onClick={onAction}><Icon size={18} /> {action}</button></div></div>; }

function EmptyState({ icon: Icon, title, text, action, onAction }: { icon: typeof Users; title: string; text: string; action?: string; onAction?: () => void }) { return <div className="card empty-state"><span><Icon /></span><h2>{title}</h2><p>{text}</p>{action && <button className="primary-button" onClick={onAction}><Plus size={18} /> {action}</button>}</div>; }

function Metric({ label, value, helper, icon: Icon, tone }: { label: string; value: string; helper: string; icon: typeof Users; tone: string }) { return <article className="metric card"><span className={tone}><Icon /></span><div><small>{label}</small><strong>{value}</strong><p>{helper}</p></div></article>; }

function MiniMetric({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Users; tone: string }) { return <article className={`mini-metric ${tone}`}><span><Icon /></span><div><small>{label}</small><strong>{value}</strong></div></article>; }

function Info({ label, value }: { label: string; value: string }) { return <div className="info-box"><small>{label}</small><strong>{value}</strong></div>; }
