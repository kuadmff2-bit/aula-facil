const PRINT_STAGE_ID = "aulafacil-print-stage";
const PRINTING_CLASS = "aulafacil-printing";
const PRINT_PAGE_STYLE_ID = "aulafacil-print-page-style";
const nativeWindowPrint = window.print.bind(window);
let printInstalled = false;
let printBusy = false;

function pageDescription(source: HTMLElement) {
  const paper = source.dataset.paperSize === "letter" ? "Letter" : "A4";
  const orientation = source.dataset.pageOrientation === "landscape" ? "landscape" : "portrait";
  const dimensions = paper === "Letter"
    ? orientation === "landscape" ? { width: "279.4mm", height: "215.9mm" } : { width: "215.9mm", height: "279.4mm" }
    : orientation === "landscape" ? { width: "297mm", height: "210mm" } : { width: "210mm", height: "297mm" };
  return { paper, orientation, ...dimensions };
}

function clearPrintStage() {
  document.getElementById(PRINT_STAGE_ID)?.remove();
  document.getElementById(PRINT_PAGE_STYLE_ID)?.remove();
  document.documentElement.classList.remove(PRINTING_CLASS);
  printBusy = false;
}

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
}

function activePrintable() {
  const candidates = [
    document.getElementById("certificate-print-area"),
    document.getElementById("print-area"),
  ].filter((item): item is HTMLElement => item instanceof HTMLElement);
  return candidates.find(isVisible) ?? null;
}

function printSource(source: HTMLElement) {
  if (printBusy) return;
  printBusy = true;
  clearPrintStage();
  printBusy = true;

  const page = pageDescription(source);
  const stage = document.createElement("div");
  stage.id = PRINT_STAGE_ID;
  stage.setAttribute("aria-hidden", "true");
  stage.style.width = page.width;
  stage.style.height = page.height;

  const clone = source.cloneNode(true) as HTMLElement;
  clone.dataset.printClone = "true";
  stage.appendChild(clone);

  const pageStyle = document.createElement("style");
  pageStyle.id = PRINT_PAGE_STYLE_ID;
  pageStyle.textContent = `@media print { @page { size: ${page.paper} ${page.orientation}; margin: 0; } }`;

  document.head.appendChild(pageStyle);
  document.body.appendChild(stage);
  document.documentElement.classList.add(PRINTING_CLASS);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearPrintStage();
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(() => {
    try {
      nativeWindowPrint();
    } catch (error) {
      console.error("Falha ao abrir a impressão", error);
      cleanup();
      window.dispatchEvent(new CustomEvent("aulafacil:contact-error", {
        detail: { message: "Não foi possível abrir a impressão deste documento." },
      }));
    }
  }, 80);

  window.setTimeout(cleanup, 120_000);
}

export function printElement(elementId: string) {
  const source = document.getElementById(elementId);
  if (!(source instanceof HTMLElement)) {
    window.dispatchEvent(new CustomEvent("aulafacil:contact-error", {
      detail: { message: "Não foi possível localizar o documento para impressão." },
    }));
    return;
  }
  printSource(source);
}

export function installDocumentPrintIsolation() {
  if (printInstalled) return;
  printInstalled = true;
  window.print = () => {
    const source = activePrintable();
    if (!source) {
      nativeWindowPrint();
      return;
    }
    printSource(source);
  };
}
