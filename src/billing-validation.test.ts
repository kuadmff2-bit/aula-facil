import { describe, expect, it } from "vitest";
import { emptyBillingProfile, getBillingProfileErrors } from "./billing";

describe("validação dos dados de cobrança", () => {
  it("aceita CPF e CEP válidos", () => {
    const profile = {
      ...emptyBillingProfile(),
      documentNumber: "529.982.247-25",
      postalCode: "69005-070",
      phone: "92 99999-9999",
      email: "pagador@example.com",
      state: "AM",
    };
    expect(getBillingProfileErrors(profile)).toEqual({});
  });

  it("aceita CNPJ válido", () => {
    const profile = {
      ...emptyBillingProfile(),
      documentNumber: "11.222.333/0001-81",
    };
    expect(getBillingProfileErrors(profile).documentNumber).toBeUndefined();
  });

  it("recusa documento com quantidade inválida de dígitos", () => {
    const profile = {
      ...emptyBillingProfile(),
      documentNumber: "1234567890123",
    };
    expect(getBillingProfileErrors(profile).documentNumber).toContain("11 dígitos");
  });

  it("recusa CEP com mais ou menos de oito dígitos", () => {
    const profile = {
      ...emptyBillingProfile(),
      postalCode: "123456789",
    };
    expect(getBillingProfileErrors(profile).postalCode).toContain("8 dígitos");
  });
});
