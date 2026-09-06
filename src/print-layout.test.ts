import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./print-document-fixes.css", import.meta.url), "utf8");
const printSource = readFileSync(new URL("./print-export.ts", import.meta.url), "utf8");

describe("layout de impressão do AulaFácil", () => {
  it("remove a interface normal do fluxo ao imprimir um documento", () => {
    expect(css).toContain('body>*:not(#aulafacil-print-stage){display:none!important}');
    expect(printSource).toContain('document.documentElement.classList.add(PRINTING_CLASS)');
    expect(printSource).toContain('nativeWindowPrint()');
  });

  it("divide o recibo A4 em duas metades sem corredor vazio", () => {
    expect(css).toContain('grid-template-rows:calc((297mm - .4mm)/2) .4mm calc((297mm - .4mm)/2)!important');
    expect(css).toContain('grid-template-columns:210mm!important');
    expect(css).toContain('border-top:.28mm dashed #6f7886!important');
  });

  it("mantém certificado limitado à única página do palco", () => {
    expect(css).toContain('#aulafacil-print-stage>.professional-certificate');
    expect(css).toContain('overflow:hidden!important');
    expect(css).toContain('page-break-inside:avoid!important');
  });
});
