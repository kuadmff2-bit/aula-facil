const PRINT_ROOT_ID = "aulafacil-print-root";
let installed = false;

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function topVisible<T extends HTMLElement>(selector: string): T | null {
  const items = Array.from(document.querySelectorAll<T>(selector)).filter(isVisible);
  return items.at(-1) ?? null;
}

function closeTopLayer() {
  const confirm = topVisible<HTMLElement>(".confirm-backdrop");
  if (confirm) {
    const button = confirm.querySelector<HTMLButtonElement>(".confirm-close, .confirm-cancel, [data-escape-close]");
    if (button) { button.click(); return true; }
  }

  const backdrop = topVisible<HTMLElement>(".modal-backdrop");
  if (backdrop) {
    const button = backdrop.querySelector<HTMLButtonElement>(
      "[data-escape-close], .modal-close, .document-toolbar .secondary-button:first-of-type, button[aria-label='Fechar']",
    );
    if (button) { button.click(); return true; }
  }

  const panel = topVisible<HTMLElement>(".details-panel");
  if (panel) {
    const button = panel.querySelector<HTMLButtonElement>("[data-escape-close], .details-close, button[aria-label='Fechar']");
    if (button) { button.click(); return true; }
  }
  return false;
}

function waitForImages(element: HTMLElement) {
  const pending = Array.from(element.querySelectorAll("img")).filter((image) => !image.complete);
  if (!pending.length) return Promise.resolve();
  return Promise.all(pending.map((image) => new Promise<void>((resolve) => {
    const done = () => resolve();
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
    window.setTimeout(done, 1800);
  }))).then(() => undefined);
}

function cleanupPrintRoot() {
  document.getElementById(PRINT_ROOT_ID)?.remove();
  document.body.classList.remove("aulafacil-printing");
}

function createPrintRoot(source: HTMLElement) {
  cleanupPrintRoot();
  const root = document.createElement("div");
  root.id = PRINT_ROOT_ID;
  root.dataset.paperSize = source.dataset.paperSize || "a4";
  root.dataset.pageOrientation = source.dataset.pageOrientation || (source.id === "certificate-print-area" ? "landscape" : "portrait");
  const clone = source.cloneNode(true) as HTMLElement;
  root.appendChild(clone);
  document.body.appendChild(root);
  document.body.classList.add("aulafacil-printing");
  return root;
}

export function installDesktopInteractions() {
  if (installed) return;
  installed = true;

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.repeat) return;
    if (closeTopLayer()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  const nativePrint = window.print.bind(window);
  window.print = () => {
    const source = document.getElementById("certificate-print-area") ?? document.getElementById("print-area");
    if (!source) {
      nativePrint();
      return;
    }

    const root = createPrintRoot(source);
    const afterPrint = () => {
      cleanupPrintRoot();
      window.removeEventListener("afterprint", afterPrint);
    };
    window.addEventListener("afterprint", afterPrint);
    window.setTimeout(() => cleanupPrintRoot(), 60_000);

    void waitForImages(root).finally(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => nativePrint()));
    });
  };
}
