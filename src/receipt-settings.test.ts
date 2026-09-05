import { describe, expect, it } from "vitest";
import { emptyDatabase, normalizeDatabase } from "./model";

describe("configuração de recibos", () => {
  it("preserva ordem, rótulos e visibilidade personalizados", () => {
    const database = emptyDatabase();
    database.settings.receipt.title = "Comprovante escolar";
    database.settings.receipt.observation = "Pago por {responsavel}: {valor}";
    database.settings.receipt.showInstitutionContact = false;
    database.settings.receipt.fields = [
      { id: "method", label: "Meio usado", visible: true },
      { id: "reference", label: "Competência", visible: true },
      ...database.settings.receipt.fields.filter((field) => field.id !== "method" && field.id !== "reference"),
    ];
    const normalized = normalizeDatabase(structuredClone(database));
    expect(normalized).not.toBeNull();
    expect(normalized!.settings.receipt.title).toBe("Comprovante escolar");
    expect(normalized!.settings.receipt.observation).toContain("{valor}");
    expect(normalized!.settings.receipt.showInstitutionContact).toBe(false);
    expect(normalized!.settings.receipt.fields[0]).toEqual({ id: "method", label: "Meio usado", visible: true });
    expect(normalized!.settings.receipt.fields[1]).toEqual({ id: "reference", label: "Competência", visible: true });
  });

  it("migra configurações antigas sem perder compatibilidade", () => {
    const database: any = emptyDatabase();
    database.settings.receipt = {
      title: "Recibo antigo",
      footer: "Rodapé antigo",
      schoolSignatureLabel: "Escola",
      payerSignatureLabel: "Pagador",
    };
    const normalized = normalizeDatabase(database);
    expect(normalized).not.toBeNull();
    expect(normalized!.settings.receipt.title).toBe("Recibo antigo");
    expect(normalized!.settings.receipt.fields).toHaveLength(12);
    expect(normalized!.settings.receipt.showLogo).toBe(true);
    expect(normalized!.settings.receipt.observation).toContain("{aluno}");
  });

  it("remove campos desconhecidos e duplicados, repondo os obrigatórios de configuração", () => {
    const database: any = emptyDatabase();
    database.settings.receipt.fields = [
      { id: "reference", label: "Ref.", visible: false },
      { id: "reference", label: "Duplicado", visible: true },
      { id: "invalido", label: "Não pode", visible: true },
    ];
    const normalized = normalizeDatabase(database)!;
    expect(normalized.settings.receipt.fields).toHaveLength(12);
    expect(normalized.settings.receipt.fields.filter((field) => field.id === "reference")).toHaveLength(1);
    expect(normalized.settings.receipt.fields[0]).toEqual({ id: "reference", label: "Ref.", visible: false });
  });
});
