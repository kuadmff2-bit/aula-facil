import { describe, expect, it } from "vitest";
import { ageGroupFromBirthDate, birthDateError, phoneError } from "./validation";

describe("validação de data de nascimento", () => {
  it("rejeita ano futuro em vez de tratar como menor de idade", () => {
    expect(birthDateError("2222-01-01")).toContain("futuro");
    expect(ageGroupFromBirthDate("2222-01-01")).toBeNull();
  });

  it("rejeita datas inexistentes", () => {
    expect(birthDateError("2026-02-31")).toContain("válida");
  });

  it("classifica somente datas válidas", () => {
    expect(ageGroupFromBirthDate("2000-01-01")).toBe("adult");
  });
});

describe("validação de telefone", () => {
  it("aceita telefone brasileiro com DDD e 11 dígitos", () => {
    expect(phoneError("(92) 99999-9999", true)).toBe("");
  });

  it("rejeita telefone curto", () => {
    expect(phoneError("9999-9999", true)).toContain("10 ou 11 dígitos");
  });

  it("rejeita sequência repetida", () => {
    expect(phoneError("(99) 99999-9999", true)).toContain("válido");
  });
});
