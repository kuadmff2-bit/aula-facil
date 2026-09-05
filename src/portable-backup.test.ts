import { describe, expect, it } from "vitest";
import { emptyDatabase } from "./model";
import {
  createEncryptedBackup,
  decryptPortableBackup,
  isEncryptedBackup,
  parseLegacyBackup,
  validateBackupPassword,
} from "./portable-backup";

describe("backup portátil criptografado", () => {
  it("criptografa e restaura o banco sem perder dados", async () => {
    const database = emptyDatabase();
    database.settings.institution.name = "Escola Teste";
    database.classes.push({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Turma Teste",
      teacher: "Professor Teste",
      schedule: "Segunda 08:00",
      room: "Sala 1",
      monthlyFee: 150,
      workloadHours: 120,
      color: "#2563eb",
      createdAt: "2026-09-05T00:00:00.000Z",
    });
    database.students.push({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Aluno de Teste",
      birthDate: "2010-05-10",
      phone: "92999999999",
      guardianName: "Responsável",
      guardianPhone: "92988888888",
      customFields: {},
      classId: "22222222-2222-4222-8222-222222222222",
      dueDay: 10,
      active: true,
      completedAt: null,
      createdAt: "2026-09-05T00:00:00.000Z",
    });

    const password = "Senha-forte-backup-2026";
    const encrypted = await createEncryptedBackup(database, password);

    expect(isEncryptedBackup(encrypted)).toBe(true);
    expect(encrypted).not.toContain("Aluno de Teste");
    expect(encrypted).not.toContain("Escola Teste");

    const restored = await decryptPortableBackup(encrypted, password);
    expect(restored.settings.institution.name).toBe("Escola Teste");
    expect(restored.students).toHaveLength(1);
    expect(restored.students[0]?.dueDay).toBe(10);
    expect(restored.classes).toHaveLength(1);
  }, 20_000);

  it("rejeita senha incorreta", async () => {
    const encrypted = await createEncryptedBackup(emptyDatabase(), "Senha-correta-backup-2026");
    await expect(decryptPortableBackup(encrypted, "Senha-errada-backup-2026")).rejects.toThrow(/Senha incorreta|corrompido/);
  }, 20_000);

  it("continua aceitando o formato JSON legado com validação", () => {
    const database = emptyDatabase();
    database.settings.institution.name = "Legado";
    const restored = parseLegacyBackup(JSON.stringify(database));
    expect(restored.settings.institution.name).toBe("Legado");
  });

  it("exige senha de backup com pelo menos 12 caracteres", () => {
    expect(() => validateBackupPassword("curta")).toThrow(/12 caracteres/);
    expect(() => validateBackupPassword("uma-senha-segura")).not.toThrow();
  });
});
