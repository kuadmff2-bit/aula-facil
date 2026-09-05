import { describe, expect, it } from "vitest";
import { PAYMENT_PROVIDERS, getPaymentProvider, providerSupports } from "./payment-providers";

describe("provedores de pagamento da versão 0.3", () => {
  it("expõe somente conectores com fluxo operacional no backend", () => {
    expect(PAYMENT_PROVIDERS.map((provider) => provider.key)).toEqual([
      "manual_pix",
      "asaas",
      "mercado_pago",
      "pagarme",
    ]);
  });

  it("mantém Pix disponível em todas as opções expostas", () => {
    for (const provider of PAYMENT_PROVIDERS) {
      expect(providerSupports(provider.key, "pix")).toBe(true);
    }
  });

  it("não anuncia cartão como coleta direta na versão 0.3", () => {
    for (const provider of PAYMENT_PROVIDERS) {
      expect(providerSupports(provider.key, "card")).toBe(false);
    }
  });

  it("não retorna definição para provedor ainda não liberado", () => {
    expect(getPaymentProvider("efi")).toBeNull();
    expect(getPaymentProvider("stripe")).toBeNull();
  });
});
