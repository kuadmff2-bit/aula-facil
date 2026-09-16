import { describe, it, expect } from "vitest";
import { cents, decimal, whatsapp, maskCpf } from "../../src/management/format";
import { pixPayload, crc16 } from "../../src/management/pix";
describe("Money inputs", () => {
  it("keeps integer cent precision", () => {
    expect(cents("150,10")).toBe(15010);
    expect(decimal(cents("150.10") - cents("20"))).toBe("130.10");
    expect(decimal(cents("0.10") + cents("0.20"))).toBe("0.30");
  });
  it.each([
    "-1",
    "NaN",
    "Infinity",
    "1e4",
    "1.999",
    "1.000,50",
    "",
    "1234567890",
  ])("rejects invalid amount %s", (s) => expect(() => cents(s)).toThrow());
  it("never masks valid money errors as zero", () =>
    expect(() => decimal(1.5)).toThrow());
});
describe("PIX", () => {
  it("matches the standard CRC16 check vector", () =>
    expect(crc16("123456789")).toBe("29B1"));
  it("includes exact BRL amount and valid CRC", () => {
    const p = pixPayload(
      "test@example.com",
      "Escola São José",
      "Barreirinha",
      "130.10",
      "abc-123",
    );
    expect(p).toContain("5406130.10");
    expect(p).toContain("ESCOLA SAO JOSE");
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
    expect(p).toContain("br.gov.bcb.pix");
  });
  it("rejects missing recipient details", () =>
    expect(() => pixPayload("", "Escola", "Cidade", "10", "ref")).toThrow());
});
describe("Privacy and collection links", () => {
  it("masks CPF on list screens", () =>
    expect(maskCpf("12345678909")).toBe("***.456.789-**"));
  it("encodes user supplied message as data", () =>
    expect(whatsapp("(92) 99999-1234", "Olá & teste")).toBe(
      "https://wa.me/5592999991234?text=Ol%C3%A1%20%26%20teste",
    ));
  it("rejects non-phone URL inputs", () =>
    expect(() => whatsapp("javascript:alert(1)", "x")).toThrow());
});
