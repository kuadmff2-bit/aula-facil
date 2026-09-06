import { describe, expect, it } from "vitest";
import { buildFixedCoursePlan, ensureOpenEndedInvoiceForMonth, pauseEnrollment, rescheduleFutureInvoices } from "./enrollment-plan";
import { emptyDatabase, makeId, type ClassItem, type Student } from "./model";

function classItem(change: Partial<ClassItem> = {}): ClassItem {
  return {
    id: makeId(), name: "Informática", groupName: "Segunda 08h", teacher: "Professor", schedule: "Seg · 08:00–09:00",
    meetingDays: ["monday"], startTime: "08:00", endTime: "09:00", room: "Sala 1", monthlyFee: 150,
    durationType: "fixed", durationMonths: 15, workloadHours: 120, color: "#1649b8", createdAt: "2026-09-01T12:00:00.000Z",
    ...change,
  };
}

function student(classId: string, change: Partial<Student> = {}): Student {
  return {
    id: makeId(), name: "Aluno Teste", birthDate: "2000-01-01", documentNumber: "12345678900", phone: "92999999999",
    guardianName: "", guardianPhone: "", customFields: {}, classId, dueDay: 31, enrollmentStatus: "active",
    enrollmentStartDate: "2026-09-05", pausedAt: null, pauseReason: "", active: true, completedAt: null,
    createdAt: "2026-09-05T12:00:00.000Z", ...change,
  };
}

describe("plano financeiro da matrícula", () => {
  it("gera exatamente as 15 mensalidades de um curso de 15 meses", () => {
    const database = emptyDatabase();
    database.settings.finance.allowedDueDays = [10, 31];
    const klass = classItem();
    const person = student(klass.id);
    database.classes.push(klass);
    database.students.push(person);

    const invoices = buildFixedCoursePlan(database, person, klass);
    expect(invoices).toHaveLength(15);
    expect(invoices.map((item) => item.installmentNumber)).toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
    expect(invoices[0].reference).toBe("2026-09");
    expect(invoices[0].dueDate).toBe("2026-09-30");
    expect(invoices[14].reference).toBe("2027-11");
    expect(invoices.every((item) => item.planGenerated)).toBe(true);
  });

  it("gera mensalidades somente até a data de conclusão da turma", () => {
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

  it("não duplica uma parcela já criada pelo plano", () => {
    const database = emptyDatabase();
    database.settings.finance.allowedDueDays = [10];
    const klass = classItem({ durationMonths: 2 });
    const person = student(klass.id, { dueDay: 10 });
    database.classes.push(klass);
    database.students.push(person);
    database.invoices.push(...buildFixedCoursePlan(database, person, klass));

    expect(buildFixedCoursePlan(database, person, klass)).toHaveLength(0);
  });

  it("curso sem prazo cria apenas a mensalidade solicitada e não duplica o mês", () => {
    const database = emptyDatabase();
    database.settings.finance.allowedDueDays = [10];
    const klass = classItem({ durationType: "open_ended", durationMonths: null });
    const person = student(klass.id, { dueDay: 10 });
    database.classes.push(klass);
    database.students.push(person);

    const first = ensureOpenEndedInvoiceForMonth(database, person, klass, "2026-09");
    expect(first?.reference).toBe("2026-09");
    expect(first?.planGenerated).toBe(false);
    if (first) database.invoices.push(first);
    expect(ensureOpenEndedInvoiceForMonth(database, person, klass, "2026-09")).toBeNull();
    expect(ensureOpenEndedInvoiceForMonth(database, person, klass, "2026-10")?.reference).toBe("2026-10");
  });
});

describe("trancamento e alteração de vencimento", () => {
  it("tranca a matrícula, preserva débito anterior e cancela somente cobranças futuras", () => {
    const database = emptyDatabase();
    const klass = classItem({ durationMonths: 3 });
    const person = student(klass.id, { dueDay: 10 });
    database.classes.push(klass);
    database.students.push(person);
    database.invoices.push(...buildFixedCoursePlan(database, person, klass));

    const cancelled = pauseEnrollment(database, person.id, "Solicitação do responsável", "2026-09-15T12:00:00.000Z");
    expect(cancelled).toBe(2);
    expect(database.students[0].enrollmentStatus).toBe("paused");
    expect(database.invoices[0].status).not.toBe("cancelled");
    expect(database.invoices[1].status).toBe("cancelled");
    expect(database.invoices[2].status).toBe("cancelled");
  });

  it("muda apenas vencimentos futuros em aberto e mantém pagamento já baixado", () => {
    const database = emptyDatabase();
    const klass = classItem({ durationMonths: 3 });
    const person = student(klass.id, { dueDay: 10 });
    database.classes.push(klass);
    database.students.push(person);
    database.invoices.push(...buildFixedCoursePlan(database, person, klass));
    database.invoices[0].status = "paid";
    database.invoices[0].paidAt = "2026-09-09T12:00:00.000Z";

    const changed = rescheduleFutureInvoices(database, person.id, 25, "2026-09-15");
    expect(changed).toBe(2);
    expect(database.invoices[0].dueDate).toBe("2026-09-10");
    expect(database.invoices[1].dueDate).toBe("2026-10-25");
    expect(database.invoices[2].dueDate).toBe("2026-11-25");
  });
});
