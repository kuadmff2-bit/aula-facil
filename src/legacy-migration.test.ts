import { describe, expect, it } from "vitest";
import { ensureUuidDatabase, normalizeDatabase } from "./model";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("migração do banco legado do AulaFácil", () => {
  it("preserva dados e referências do formato antigo e preenche os campos profissionais novos", () => {
    const legacyDatabase = {
      version: 1,
      updatedAt: "2026-08-01T12:00:00.000Z",
      settings: {
        appearance: "dark",
        studentFields: [
          {
            id: "student-phone",
            label: "Telefone do aluno",
            type: "tel",
            required: false,
            visibility: "always",
            placeholder: "(92) 99999-9999",
            source: "phone",
          },
          {
            id: "guardian-name",
            label: "Nome do responsável",
            type: "text",
            required: false,
            visibility: "always",
            placeholder: "Nome completo",
            source: "guardianName",
          },
        ],
        allowedDueDays: [5, 10, 31],
      },
      students: [
        {
          id: "student-legacy-001",
          name: "Aluno de Migração",
          birthDate: "2008-05-10",
          phone: "92999999999",
          guardianName: "Responsável Legado",
          guardianPhone: "92988888888",
          customFields: { rg: "123456" },
          classId: "class-legacy-001",
          dueDay: 31,
          active: true,
          createdAt: "2026-01-15T10:00:00.000Z",
        },
      ],
      classes: [
        {
          id: "class-legacy-001",
          name: "Informática",
          teacher: "Professor Legado",
          schedule: "Segunda e quarta, 08:00",
          room: "Sala 1",
          monthlyFee: 150,
          color: "#1649b8",
          createdAt: "2026-01-10T10:00:00.000Z",
        },
      ],
      invoices: [
        {
          id: "invoice-legacy-001",
          studentId: "student-legacy-001",
          reference: "01/2026",
          dueDate: "2026-01-31",
          amount: 150,
          status: "paid",
          paidAt: "2026-01-30T14:00:00.000Z",
          createdAt: "2026-01-15T10:00:00.000Z",
        },
      ],
      attendance: [
        {
          id: "attendance-legacy-001",
          studentId: "student-legacy-001",
          classId: "class-legacy-001",
          date: "2026-01-20",
          status: "present",
        },
      ],
      grades: [
        {
          id: "grade-legacy-001",
          studentId: "student-legacy-001",
          classId: "class-legacy-001",
          label: "Avaliação 1",
          term: "1º módulo",
          score: 9.5,
          createdAt: "2026-01-25T10:00:00.000Z",
        },
      ],
      notices: [
        {
          id: "notice-legacy-001",
          title: "Comunicado antigo",
          message: "Mensagem preservada na migração.",
          audience: "Todos",
          publishedAt: "2026-01-18T10:00:00.000Z",
        },
      ],
    };

    const normalized = normalizeDatabase(legacyDatabase);
    expect(normalized).not.toBeNull();
    if (!normalized) return;

    expect(normalized.settings.appearance).toBe("dark");
    expect(normalized.settings.finance.allowedDueDays).toEqual([5, 10, 31]);
    expect(normalized.payments).toEqual([]);

    expect(normalized.students[0]).toMatchObject({
      name: "Aluno de Migração",
      documentNumber: "",
      dueDay: 31,
      enrollmentStatus: "active",
      enrollmentStartDate: "2026-01-15",
      pauseReason: "",
    });
    expect(normalized.classes[0]).toMatchObject({
      name: "Informática",
      durationType: "open_ended",
      durationMonths: null,
      meetingDays: [],
      startTime: "",
      endTime: "",
    });
    expect(normalized.invoices[0]).toMatchObject({
      status: "paid",
      installmentNumber: null,
      planGenerated: false,
      cancellationReason: "",
    });

    const migrated = ensureUuidDatabase(normalized);
    const student = migrated.students[0];
    const classItem = migrated.classes[0];
    const invoice = migrated.invoices[0];

    expect(student.id).toMatch(UUID_PATTERN);
    expect(classItem.id).toMatch(UUID_PATTERN);
    expect(invoice.id).toMatch(UUID_PATTERN);
    expect(student.classId).toBe(classItem.id);
    expect(invoice.studentId).toBe(student.id);
    expect(migrated.attendance[0].studentId).toBe(student.id);
    expect(migrated.attendance[0].classId).toBe(classItem.id);
    expect(migrated.grades[0].studentId).toBe(student.id);
    expect(migrated.grades[0].classId).toBe(classItem.id);
    expect(migrated.students[0].customFields.rg).toBe("123456");
    expect(migrated.notices[0].message).toBe("Mensagem preservada na migração.");
  });
});
