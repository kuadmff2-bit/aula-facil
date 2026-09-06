import { useMemo, useState } from "react";
import { CalendarClock, Download, Search, Trash2, UserPlus, Users } from "lucide-react";
import type { ClassItem, SchoolDatabase, Student, Weekday } from "./model";
import "./class-overview-panel.css";

const DAY_LABELS: Record<Weekday, string> = {
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sex",
  saturday: "Sáb",
  sunday: "Dom",
};

function currentWeekday(): Weekday {
  return (["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as Weekday[])[new Date().getDay()];
}

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function timeMinutes(value?: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function classIsHappeningNow(item: ClassItem) {
  const days = item.meetingDays ?? [];
  if (days.length && !days.includes(currentWeekday())) return false;
  const start = timeMinutes(item.startTime);
  const end = timeMinutes(item.endTime);
  if (start === null || end === null) return false;
  const now = currentMinutes();
  return now >= start && now < end;
}

function scheduleLabel(item: ClassItem) {
  const days = (item.meetingDays ?? []).map((day) => DAY_LABELS[day]).join(", ");
  const hours = item.startTime && item.endTime ? `${item.startTime}–${item.endTime}` : item.schedule;
  return [days, hours].filter(Boolean).join(" · ") || "Horário não informado";
}

function enrollmentLabel(student: Student) {
  const value = student.enrollmentStatus ?? (student.active ? "active" : "paused");
  if (value === "completed") return "Concluído";
  if (value === "paused") return "Trancado";
  return "Ativo";
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, '""')}"`;
}

function safeFilename(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "turma";
}

function downloadRosterCsv(classes: ClassItem[], students: Student[], filename: string) {
  const rows = [["Curso", "Turma", "Professor", "Sala", "Dias / horário", "Aluno", "Telefone", "Responsável", "Telefone do responsável", "Vencimento", "Situação"]];
  const sorted = [...classes].sort((a, b) => `${a.startTime ?? "99:99"}${a.name}${a.groupName ?? ""}`.localeCompare(`${b.startTime ?? "99:99"}${b.name}${b.groupName ?? ""}`, "pt-BR"));
  for (const classItem of sorted) {
    const members = students.filter((student) => student.classId === classItem.id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (!members.length) {
      rows.push([classItem.name, classItem.groupName ?? "", classItem.teacher, classItem.room, scheduleLabel(classItem), "", "", "", "", "", "Sem alunos"]);
      continue;
    }
    for (const student of members) {
      rows.push([
        classItem.name,
        classItem.groupName ?? "",
        classItem.teacher,
        classItem.room,
        scheduleLabel(classItem),
        student.name,
        student.phone,
        student.guardianName,
        student.guardianPhone,
        student.dueDay ? `Dia ${student.dueDay}` : "Padrão",
        enrollmentLabel(student),
      ]);
    }
  }
  const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

type Props = {
  database: SchoolDatabase;
  onNewClass: () => void;
  onAddStudent: (classId: string) => void;
  onDeleteClass: (classItem: ClassItem) => void;
  onAttendance: () => void;
};

export function ClassOverviewPanel({ database, onNewClass, onAddStudent, onDeleteClass, onAttendance }: Props) {
  const [scope, setScope] = useState<"current" | "all">("current");
  const [query, setQuery] = useState("");

  const classes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return database.classes
      .filter((item) => scope === "all" || classIsHappeningNow(item))
      .filter((item) => {
        if (!normalized) return true;
        const students = database.students.filter((student) => student.classId === item.id).map((student) => student.name).join(" ");
        return `${item.name} ${item.groupName ?? ""} ${item.teacher} ${item.room} ${item.schedule} ${students}`.toLocaleLowerCase("pt-BR").includes(normalized);
      })
      .sort((a, b) => `${a.startTime ?? "99:99"}${a.name}`.localeCompare(`${b.startTime ?? "99:99"}${b.name}`, "pt-BR"));
  }, [database.classes, database.students, query, scope]);

  return <section className="class-overview stack">
    <div className="class-overview-toolbar card">
      <div>
        <span className="class-overview-eyebrow"><CalendarClock size={15}/> ORGANIZAÇÃO DAS TURMAS</span>
        <h2>{scope === "current" ? "Turmas acontecendo agora" : "Todas as turmas"}</h2>
        <p>Veja curso, sala, professor e os alunos logo abaixo, sem precisar abrir turma por turma.</p>
      </div>
      <div className="class-overview-actions">
        <div className="class-scope-toggle" role="group" aria-label="Filtrar turmas pelo horário">
          <button className={scope === "current" ? "active" : ""} onClick={() => setScope("current")}>Agora</button>
          <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>Todas as turmas</button>
        </div>
        <button className="secondary-button" disabled={!database.classes.length} onClick={() => downloadRosterCsv(database.classes, database.students, "aulafacil-todas-as-turmas.csv")}><Download size={16}/> Baixar todas</button>
        <button className="primary-button" onClick={onNewClass}>+ Nova turma</button>
      </div>
    </div>

    <label className="class-overview-search card"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar turma, professor ou aluno"/></label>

    {!classes.length ? <div className="card class-overview-empty">
      <CalendarClock size={34}/>
      <strong>{scope === "current" ? "Nenhuma turma acontecendo neste horário" : "Nenhuma turma encontrada"}</strong>
      <span>{scope === "current" ? "Use “Todas as turmas” para consultar os demais horários." : "Tente outra busca ou cadastre uma nova turma."}</span>
      {scope === "current" && <button className="secondary-button" onClick={() => setScope("all")}>Ver todas as turmas</button>}
    </div> : classes.map((classItem) => {
      const students = database.students.filter((student) => student.classId === classItem.id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      return <article className="card class-overview-group" key={classItem.id}>
        <header>
          <span className="class-overview-color" style={{ background: classItem.color }}/>
          <div className="class-overview-title">
            <strong>{classItem.name}{classItem.groupName ? ` · ${classItem.groupName}` : ""}</strong>
            <span>{classItem.room || "Sala não informada"} · Prof.: {classItem.teacher || "não informado"}</span>
            <small>{scheduleLabel(classItem)}</small>
          </div>
          <span className="class-overview-count"><Users size={15}/>{students.length} aluno{students.length === 1 ? "" : "s"}</span>
          <button className="secondary-button small" onClick={() => onAddStudent(classItem.id)}><UserPlus size={15}/> Adicionar aluno</button>
          <button className="secondary-button small" onClick={() => downloadRosterCsv([classItem], database.students, `aulafacil-${safeFilename(`${classItem.name}-${classItem.groupName ?? classItem.room}`)}.csv`)}><Download size={15}/> Baixar turma</button>
          <button className="secondary-button small" onClick={onAttendance}>Fazer chamada</button>
          <button className="quiet-danger" onClick={() => onDeleteClass(classItem)} title="Excluir turma"><Trash2 size={16}/></button>
        </header>
        <div className="class-overview-students">
          {students.length === 0 ? <div className="class-overview-no-students">Nenhum aluno cadastrado nesta turma.</div> : students.map((student, index) => <div className="class-overview-student" key={student.id}>
            <b>{index + 1}</b>
            <span><strong>{student.name}</strong><small>{student.phone || student.guardianPhone || "Contato não informado"}</small></span>
            <span>{student.dueDay ? `Vencimento dia ${student.dueDay}` : "Vencimento padrão"}</span>
            <em className={(student.enrollmentStatus ?? (student.active ? "active" : "paused")) === "active" ? "active" : "inactive"}>{enrollmentLabel(student)}</em>
          </div>)}
        </div>
      </article>;
    })}
  </section>;
}
