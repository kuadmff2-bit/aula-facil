import { useMemo, useState } from "react";
import { ArrowRightLeft, CalendarClock, Check, Download, Search, Trash2, UserPlus, Users, X } from "lucide-react";
import type { ClassItem, SchoolDatabase, Student, Weekday } from "./model";
import { exportClassWorkbook } from "./spreadsheet-export";
import { saveDatabase } from "./storage";
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

function dateLabel(value?: string | null) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
}

function enrollmentLabel(student: Student) {
  const value = student.enrollmentStatus ?? (student.active ? "active" : "paused");
  if (value === "completed") return "Concluído";
  if (value === "paused") return "Trancado";
  return "Ativo";
}

type Props = {
  database: SchoolDatabase;
  onNewClass: () => void;
  onAddStudent: (classId: string) => void;
  onMoveStudents?: (targetClassId: string, studentIds: string[]) => void;
  onDeleteClass: (classItem: ClassItem) => void;
  onAttendance: () => void;
};

export function ClassOverviewPanel({ database, onNewClass, onAddStudent, onMoveStudents, onDeleteClass, onAttendance }: Props) {
  const [scope, setScope] = useState<"current" | "all">("current");
  const [query, setQuery] = useState("");
  const [transferTarget, setTransferTarget] = useState<ClassItem | null>(null);
  const [transferQuery, setTransferQuery] = useState("");
  const [transferSelected, setTransferSelected] = useState<string[]>([]);

  const classById = useMemo(() => new Map(database.classes.map((item) => [item.id, item])), [database.classes]);

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

  const transferCandidates = useMemo(() => {
    if (!transferTarget) return [];
    const normalized = transferQuery.trim().toLocaleLowerCase("pt-BR");
    return database.students
      .filter((student) => student.classId !== transferTarget.id)
      .filter((student) => {
        if (!normalized) return true;
        const currentClass = classById.get(student.classId);
        return `${student.name} ${student.documentNumber ?? ""} ${currentClass?.name ?? ""} ${currentClass?.groupName ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalized);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [classById, database.students, transferQuery, transferTarget]);

  const openTransfer = (classItem: ClassItem) => {
    setTransferTarget(classItem);
    setTransferQuery("");
    setTransferSelected([]);
  };

  const closeTransfer = () => {
    setTransferTarget(null);
    setTransferQuery("");
    setTransferSelected([]);
  };

  const toggleTransferStudent = (studentId: string) => {
    setTransferSelected((current) => current.includes(studentId)
      ? current.filter((id) => id !== studentId)
      : [...current, studentId]);
  };

  const toggleAllVisible = () => {
    const visibleIds = transferCandidates.map((student) => student.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => transferSelected.includes(id));
    setTransferSelected((current) => {
      if (allVisibleSelected) return current.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  };

  const moveStudentsLocally = (targetClassId: string, studentIds: string[]) => {
    const selectedIds = new Set(studentIds);
    const next = structuredClone(database);
    for (const student of next.students) {
      if (selectedIds.has(student.id) && student.classId !== targetClassId) student.classId = targetClassId;
    }
    next.updatedAt = new Date().toISOString();
    saveDatabase(next);
    // Mantém o estado da tela coerente até o próximo render do aplicativo.
    Object.assign(database, next);
  };

  const confirmTransfer = () => {
    if (!transferTarget || !transferSelected.length) return;
    if (onMoveStudents) onMoveStudents(transferTarget.id, transferSelected);
    else moveStudentsLocally(transferTarget.id, transferSelected);
    closeTransfer();
  };

  return <>
    <section className="class-overview stack">
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
          <button className="secondary-button" disabled={!database.classes.length} onClick={() => void exportClassWorkbook(database.classes, database.students, "aulafacil-todas-as-turmas")}><Download size={16}/> Baixar todas</button>
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
        const hasStudentsElsewhere = database.students.some((student) => student.classId !== classItem.id);
        return <article className="card class-overview-group" key={classItem.id}>
          <header>
            <span className="class-overview-color" style={{ background: classItem.color }}/>
            <div className="class-overview-title">
              <strong>{classItem.name}{classItem.groupName ? ` · ${classItem.groupName}` : ""}</strong>
              <span>{classItem.room || "Sala não informada"} · Prof.: {classItem.teacher || "não informado"}</span>
              <small>{scheduleLabel(classItem)}</small><small className="class-overview-end">{(classItem.durationType ?? "open_ended") === "fixed" ? classItem.endDate ? `Conclusão: ${dateLabel(classItem.endDate)}` : classItem.durationMonths ? `Duração: ${classItem.durationMonths} meses` : "Data de conclusão não informada" : "Sem data de término"}</small>
            </div>
            <span className="class-overview-count"><Users size={15}/>{students.length} aluno{students.length === 1 ? "" : "s"}</span>
            <button className="secondary-button small" onClick={() => onAddStudent(classItem.id)}><UserPlus size={15}/> Novo aluno</button>
            <button className="secondary-button small" disabled={!hasStudentsElsewhere} onClick={() => openTransfer(classItem)}><ArrowRightLeft size={15}/> Trazer alunos</button>
            <button className="secondary-button small" onClick={() => void exportClassWorkbook([classItem], database.students, `aulafacil-${classItem.name}-${classItem.groupName ?? classItem.room}`)}><Download size={15}/> Baixar turma</button>
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
    </section>

    {transferTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeTransfer()}>
      <section className="modal class-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="class-transfer-title">
        <header>
          <div>
            <h2 id="class-transfer-title">Trazer alunos para {transferTarget.name}{transferTarget.groupName ? ` · ${transferTarget.groupName}` : ""}</h2>
            <p>Selecione alunos já cadastrados em outras turmas. O cadastro será transferido sem duplicar o aluno.</p>
          </div>
          <button className="modal-close" onClick={closeTransfer} aria-label="Fechar"><X/></button>
        </header>

        <div className="class-transfer-body">
          <div className="class-transfer-note">
            <ArrowRightLeft size={18}/>
            <span><strong>O aluno sai da turma atual e entra nesta.</strong> O histórico continua guardado. Cobranças futuras da turma anterior são canceladas e o novo plano respeita a data de conclusão da turma de destino.</span>
          </div>

          <label className="class-transfer-search"><Search size={18}/><input value={transferQuery} onChange={(event) => setTransferQuery(event.target.value)} placeholder="Buscar aluno ou turma atual" autoFocus/></label>

          <div className="class-transfer-toolbar">
            <span>{transferSelected.length} selecionado{transferSelected.length === 1 ? "" : "s"}</span>
            <button type="button" className="secondary-button small" disabled={!transferCandidates.length} onClick={toggleAllVisible}>
              <Check size={15}/> {transferCandidates.length > 0 && transferCandidates.every((student) => transferSelected.includes(student.id)) ? "Desmarcar visíveis" : "Selecionar visíveis"}
            </button>
          </div>

          <div className="class-transfer-list">
            {!transferCandidates.length ? <div className="class-transfer-empty">Nenhum aluno de outra turma encontrado.</div> : transferCandidates.map((student) => {
              const currentClass = classById.get(student.classId);
              const selected = transferSelected.includes(student.id);
              const enrollment = student.enrollmentStatus ?? (student.active ? "active" : "paused");
              return <label className={`class-transfer-row ${selected ? "selected" : ""}`} key={student.id}>
                <input type="checkbox" checked={selected} onChange={() => toggleTransferStudent(student.id)}/>
                <span>
                  <strong>{student.name}</strong>
                  <small>Turma atual: {currentClass ? `${currentClass.name}${currentClass.groupName ? ` · ${currentClass.groupName}` : ""}` : "Sem turma"}</small>
                </span>
                <em className={enrollment === "active" ? "active" : "inactive"}>{enrollmentLabel(student)}</em>
              </label>;
            })}
          </div>

          <div className="form-actions class-transfer-actions">
            <button type="button" className="secondary-button" onClick={closeTransfer}>Cancelar</button>
            <button type="button" className="primary-button" disabled={!transferSelected.length} onClick={confirmTransfer}><ArrowRightLeft size={17}/> Mover {transferSelected.length || ""} aluno{transferSelected.length === 1 ? "" : "s"}</button>
          </div>
        </div>
      </section>
    </div>}
  </>;
}
