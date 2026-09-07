import { describe, expect, it } from "vitest";
import { emptyBillingProfile, firstBillingProfileError, getBillingProfileErrors } from "./billing";

function randomDigits(length: number) {
  let out = "";
  for (let i = 0; i < length; i += 1) out += Math.floor(Math.random() * 10);
  return out;
}

describe("brutal finance fuzz", () => {
  it("não lança exceção em 20 mil perfis aleatórios", () => {
    for (let i = 0; i < 20_000; i += 1) {
      const profile = {
        ...emptyBillingProfile(),
        payerName: `Pagador ${i}`,
        documentNumber: randomDigits(Math.floor(Math.random() * 19)),
        phone: randomDigits(Math.floor(Math.random() * 16)),
        postalCode: randomDigits(Math.floor(Math.random() * 12)),
        email: i % 3 === 0 ? `teste${i}@exemplo.com` : `invalido-${i}`,
        state: i % 2 === 0 ? "AM" : "A",
      };
      expect(() => getBillingProfileErrors(profile)).not.toThrow();
      expect(() => firstBillingProfileError(profile)).not.toThrow();
    }
  });

  it("barra qualquer documento com comprimento diferente de CPF/CNPJ", () => {
    for (const length of [1,2,3,4,5,6,7,8,9,10,12,13,15,16,17,18]) {
      const profile = { ...emptyBillingProfile(), documentNumber: "1".repeat(length) };
      expect(getBillingProfileErrors(profile).documentNumber).toBeTruthy();
    }
  });

  it("barra qualquer CEP diferente de 8 dígitos", () => {
    for (const length of [1,2,3,4,5,6,7,9,10,11]) {
      const profile = { ...emptyBillingProfile(), postalCode: "1".repeat(length) };
      expect(getBillingProfileErrors(profile).postalCode).toBeTruthy();
    }
  });

  it("aceita formatos básicos estruturalmente válidos sem explodir", () => {
    const profile = {
      ...emptyBillingProfile(),
      payerName: "Teste",
      documentNumber: "52998224725",
      phone: "92999999999",
      postalCode: "69160000",
      email: "teste@example.com",
      state: "AM",
    };
    expect(getBillingProfileErrors(profile)).toEqual({});
  });
});
