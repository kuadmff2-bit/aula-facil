import ExcelJS from "exceljs";
import type { ClassItem, SchoolDatabase, Student, Weekday } from "./model";

const DAY_LABELS: Record<Weekday, string> = {
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sex",
  saturday: "Sáb",
  sunday: "Dom",
};

function safeFilename(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "aulafacil";
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

function dateLabel(value?: string | null) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

async function saveWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const data = await workbook.xlsx.writeBuffer();
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(filename.replace(/\.xlsx$/i, ""))}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  window.dispatchEvent(new CustomEvent("aulafacil:download-success", { detail: { filename: anchor.download } }));
}

function prepareSheet(worksheet: ExcelJS.Worksheet, headers: string[], rows: Array<Array<string | number>>) {
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.addTable({
    name: `Tabela${Math.random().toString(36).slice(2, 9)}`,
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true, showFirstColumn: false, showLastColumn: false },
    columns: headers.map((name) => ({ name, filterButton: true })),
    rows,
  });
  worksheet.getRow(1).height = 24;
  worksheet.getRow(1).font = { bold: true };
  worksheet.eachRow((row, rowNumber) => {
    row.alignment = { vertical: "middle", wrapText: rowNumber === 1 };
    if (rowNumber > 1) row.height = 21;
  });
  headers.forEach((_header, index) => {
    const column = worksheet.getColumn(index + 1);
    let width = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      width = Math.max(width, Math.min(42, String(cell.value ?? "").length + 2));
    });
    column.width = width;
  });
  worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  worksheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  worksheet.pageMargins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
}

export async function exportClassWorkbook(classes: ClassItem[], students: Student[], filename = "aulafacil-turmas") {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AulaFácil";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Turmas");
  const headers = ["Curso", "Turma", "Professor", "Sala", "Dias / horário", "Aluno", "Telefone", "Responsável", "Telefone responsável", "Vencimento", "Situação"];
  const rows: Array<Array<string | number>> = [];
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
        student.phone || "",
        student.guardianName || "",
        student.guardianPhone || "",
        student.dueDay ? `Dia ${student.dueDay}` : "Padrão",
        enrollmentLabel(student),
      ]);
    }
  }
  prepareSheet(sheet, headers, rows);
  for (const column of [7, 9]) sheet.getColumn(column).numFmt = "@";
  await saveWorkbook(workbook, filename);
}

export async function exportStudentsWorkbook(database: SchoolDatabase) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AulaFácil";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Alunos");
  const classMap = new Map(database.classes.map((item) => [item.id, item]));
  const headers = ["Aluno", "Nascimento", "CPF / documento", "Curso", "Turma", "Telefone", "Responsável", "Telefone responsável", "Vencimento", "Situação"];
  const rows = [...database.students]
    .sort((a, b) => `${classMap.get(a.classId)?.name ?? ""}${a.name}`.localeCompare(`${classMap.get(b.classId)?.name ?? ""}${b.name}`, "pt-BR"))
    .map((student) => {
      const classItem = classMap.get(student.classId);
      return [
        student.name,
        dateLabel(student.birthDate),
        student.documentNumber || "",
        classItem?.name ?? "",
        classItem?.groupName ?? "",
        student.phone || "",
        student.guardianName || "",
        student.guardianPhone || "",
        student.dueDay ? `Dia ${student.dueDay}` : "Padrão",
        enrollmentLabel(student),
      ] as Array<string | number>;
    });
  prepareSheet(sheet, headers, rows);
  for (const column of [3, 6, 8]) sheet.getColumn(column).numFmt = "@";
  await saveWorkbook(workbook, "aulafacil-alunos");
}
