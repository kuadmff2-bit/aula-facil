import { describe, expect, it } from "vitest";
import { dueDateForMonth, invoiceAmountDue } from "./finance-utils";
import type { FinanceSettings, InvoiceStatus } from "./model";

const baseSettings: FinanceSettings = {
  allowedDueDays: [5, 10, 15, 20, 25, 31],
  lateFeeMode: "none",
  lateFeeValue: 0,
  interestMode: "none",
  interestValue: 0,
  graceDays: 0,
  boletoDueText: "",
  boletoFooter: "",
  boletoPrimaryColor: "#1649b8",
  boletoShowLogo: true,
};

function settings(change: Partial<FinanceSettings> = {}): FinanceSettings {
  return { ...baseSettings, ...change };
}

function invoice(status: InvoiceStatus = "pending", amount = 100, dueDate = "2026-09-01") {
  return { amount, dueDate, status };
}

describe("dueDateForMonth", () => {
  it("usa o último dia de fevereiro quando o aluno escolheu dia 31", () => {
    expect(dueDateForMonth("2026-02", 31)).toBe("2026-02-28");
  });

  it("respeita 29 de fevereiro em ano bissexto", () => {
    expect(dueDateForMonth("2028-02", 31)).toBe("2028-02-29");
  });

  it("usa dia 30 em mês sem dia 31", () => {
    expect(dueDateForMonth("2026-04", 31)).toBe("2026-04-30");
  });

  it("mantém o dia escolhido quando o mês possui esse dia", () => {
    expect(dueDateForMonth("2026-10", 25)).toBe("2026-10-25");
  });

  it("rejeita mês de referência inválido", () => {
    expect(() => dueDateForMonth("2026-13", 10)).toThrow();
  });
});

describe("invoiceAmountDue", () => {
  it("não aplica encargos durante a carência", () => {
    const result = invoiceAmountDue(invoice(), settings({
      graceDays: 5,
      lateFeeMode: "fixed",
      lateFeeValue: 10,
      interestMode: "fixed_daily",
      interestValue: 2,
    }), "2026-09-05");
    expect(result).toEqual({ baseAmount: 100, lateFee: 0, interest: 0, totalDue: 100, daysOverdue: 0 });
  });

  it("aplica multa fixa e juros fixos diários depois da carência", () => {
    const result = invoiceAmountDue(invoice(), settings({
      graceDays: 2,
      lateFeeMode: "fixed",
      lateFeeValue: 5,
      interestMode: "fixed_daily",
      interestValue: 1.5,
    }), "2026-09-06");
    expect(result.daysOverdue).toBe(3);
    expect(result.lateFee).toBe(5);
    expect(result.interest).toBe(4.5);
    expect(result.totalDue).toBe(109.5);
  });

  it("aplica multa percentual sobre o valor-base", () => {
    const result = invoiceAmountDue(invoice(), settings({ lateFeeMode: "percent", lateFeeValue: 2 }), "2026-09-02");
    expect(result.lateFee).toBe(2);
    expect(result.totalDue).toBe(102);
  });

  it("calcula juros percentuais diários", () => {
    const result = invoiceAmountDue(invoice(), settings({ interestMode: "daily_percent", interestValue: 0.1 }), "2026-09-11");
    expect(result.daysOverdue).toBe(10);
    expect(result.interest).toBe(1);
    expect(result.totalDue).toBe(101);
  });

  it("calcula juros mensais proporcionalmente aos dias", () => {
    const result = invoiceAmountDue(invoice(), settings({ interestMode: "monthly_percent", interestValue: 3 }), "2026-09-16");
    expect(result.daysOverdue).toBe(15);
    expect(result.interest).toBe(1.5);
    expect(result.totalDue).toBe(101.5);
  });

  it.each(["paid", "cancelled", "negotiated"] as InvoiceStatus[])("congela encargos quando o status é %s", (status) => {
    const result = invoiceAmountDue(invoice(status), settings({
      lateFeeMode: "percent",
      lateFeeValue: 10,
      interestMode: "fixed_daily",
      interestValue: 5,
    }), "2026-10-01");
    expect(result).toEqual({ baseAmount: 100, lateFee: 0, interest: 0, totalDue: 100, daysOverdue: 0 });
  });

  it("nunca gera encargo negativo mesmo com configuração inválida", () => {
    const result = invoiceAmountDue(invoice(), settings({
      lateFeeMode: "fixed",
      lateFeeValue: -50,
      interestMode: "fixed_daily",
      interestValue: -10,
    }), "2026-09-10");
    expect(result.lateFee).toBe(0);
    expect(result.interest).toBe(0);
    expect(result.totalDue).toBe(100);
  });
});
