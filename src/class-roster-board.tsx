import { useMemo, useState } from "react";
import { CalendarCheck2, Check, Clock3, Search, X } from "lucide-react";
import type { ClassItem, SchoolDatabase, Weekday } from "./model";
import "./class-roster-board.css";

const DAY_LABELS: Record<Weekday, string> = {
  monday: "Segunda",
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
  sunday: "Domingo",
};

function localDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function weekdayFromDate(value: string): Weekday {
  const index = new Date(`${value}T12:00:00`).getDay();
  return (["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as Weekday[])[index];
}

function timeLabel(start?: string, end?: string, fallback?: string) {
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  return fallback || "Horário não informado";
}

function minutes(value?: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function isClassHappeningNow(classItem: ClassItem, weekday: Weekday) {
  if (classItem.meetingDays?.length && !classItem.meetingDays.includes(weekday)) return false;
  const start = minutes(classItem.startTime);
  const end = minutes(classItem.endTime);
  if (start === null || end === null) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  return current >= start && current < end;
}

type Props = {
  database: SchoolDatabase;
  date?: string;
  onDateChange?: (date: string) => void;
  onSaveAttendance: (classId: string, date: string, marks: Record<string, "present" | "absent">) => void;
};

export function ClassRosterBoard({ database, date = localDate(), onDateChange, onSaveAttendance }: Props) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"current" | "all">("current");
  const [marksByClass, setMarksByClass] = useState<Record<string, Record<string, "present" | "absent">>>({});
  const weekday = weekdayFromDate(date);
  const currentScopeApplies = scope === "current" && date === localDate();

  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return database.classes
      .filter((item) => !item.meetingDays?.length || item.meetingDays.includes(weekday))
      .filter((item) => !currentScopeApplies || isClassHappeningNow(item, weekday))
      .map((classItem) => {
        const students = database.students
          .filter((student) => student.classId === classItem.id && student.active)
          .filter((student) => !normalized || `${student.name} ${classItem.name} ${classItem.groupName ?? ""}`.toLocaleLowerCase("pt-BR").includes(normalized));
        return { classItem, students };
      })
      .filter((row) => row.students.length || !normalized)
      .sort((a, b) => `${a.classItem.startTime ?? "99:99"}${a.classItem.name}`.localeCompare(`${b.classItem.startTime ?? "99:99"}${b.classItem.name}`));
  }, [currentScopeApplies, database.classes, database.students, query, weekday]);

  const markFor = (classId: string, studentId: string) => {
    const local = marksByClass[classId]?.[studentId];
    if (local) return local;
    return database.attendance.find((item) => item.classId === classId && item.studentId === studentId && item.date === date)?.status ?? "present";
  };

  const setMark = (classId: string, studentId: string, status: "present" | "absent") => {
    setMarksByClass((current) => ({
      ...current,
      [classId]: { ...(current[classId] ?? {}), [studentId]: status },
    }));
  };

  return <section className="roster-board stack">
    <div className="card roster-toolbar">
      <div>
        <span className="roster-eyebrow">CHAMADA GERAL</span>
        <h2>{currentScopeApplies ? "Turma(s) deste horário" : `Turmas de ${DAY_LABELS[weekday]}`}</h2>
        <p>{currentScopeApplies ? "O AulaFácil mostra primeiro só as turmas que estão acontecendo agora, para a chamada ficar limpa." : "Veja horários e alunos como uma planilha e marque a presença sem abrir turma por turma."}</p>
      </div>
      <div className="roster-controls">
        <div className="roster-scope" role="group" aria-label="Filtrar turmas da chamada">
          <button className={scope === "current" ? "active" : ""} onClick={() => setScope("current")}><Clock3 size={15}/> Agora</button>
          <button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>Todas as turmas</button>
        </div>
        <label><span>Data</span><input type="date" value={date} onChange={(event) => { setMarksByClass({}); onDateChange?.(event.target.value); }} /></label>
        <label className="roster-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar aluno ou turma" /></label>
      </div>
    </div>

    {rows.length === 0 ? <div className="card roster-empty"><CalendarCheck2/><strong>{currentScopeApplies ? "Nenhuma turma acontecendo agora" : "Nenhuma turma encontrada"}</strong><span>{currentScopeApplies ? "Clique em “Todas as turmas” para consultar os outros horários." : "Confira o dia escolhido ou a busca."}</span>{currentScopeApplies && <button className="secondary-button" onClick={() => setScope("all")}>Ver todas as turmas</button>}</div> : rows.map(({ classItem, students }) => {
      const classMarks = Object.fromEntries(students.map((student) => [student.id, markFor(classItem.id, student.id)])) as Record<string, "present" | "absent">;
      return <article className="card roster-class" key={classItem.id}>
        <header>
          <div className="roster-class-color" style={{ background: classItem.color }} />
          <div><strong>{classItem.name}{classItem.groupName ? ` · ${classItem.groupName}` : ""}</strong><span>{timeLabel(classItem.startTime, classItem.endTime, classItem.schedule)} · {classItem.room || "Sala não informada"} · Prof.: {classItem.teacher || "não informado"}</span></div>
          <b>{students.length} aluno{students.length === 1 ? "" : "s"}</b>
          <button className="secondary-button small" onClick={() => setMarksByClass((current) => ({ ...current, [classItem.id]: Object.fromEntries(students.map((student) => [student.id, "present"])) }))}>Todos presentes</button>
          <button className="primary-button small" onClick={() => onSaveAttendance(classItem.id, date, classMarks)}>Salvar chamada</button>
        </header>
        <div className="roster-sheet" role="table" aria-label={`Chamada de ${classItem.name}`}>
          <div className="roster-head" role="row"><span>Aluno</span><span>Contato</span><span>Presença</span></div>
          {students.length === 0 ? <div className="roster-no-students">Nenhum aluno ativo nesta turma.</div> : students.map((student) => {
            const mark = markFor(classItem.id, student.id);
            return <div className="roster-row" role="row" key={student.id}>
              <span><strong>{student.name}</strong><small>{student.documentNumber || "Documento não informado"}</small></span>
              <span>{student.phone || student.guardianPhone || "Não informado"}</span>
              <span className="roster-mark">
                <button className={mark === "present" ? "present active" : "present"} onClick={() => setMark(classItem.id, student.id, "present")}><Check size={15}/> Presente</button>
                <button className={mark === "absent" ? "absent active" : "absent"} onClick={() => setMark(classItem.id, student.id, "absent")}><X size={15}/> Ausente</button>
              </span>
            </div>;
          })}
        </div>
      </article>;
    })}
  </section>;
}
