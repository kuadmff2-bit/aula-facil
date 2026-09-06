type PdfOrientation = "portrait" | "landscape";
type PdfFormat = "a4" | "letter";

const PDF_STATUS_ID = "aulafacil-pdf-status";

function safeFilename(value: string) {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${base || "aulafacil-documento"}.pdf`;
}

function pagePixels(format: PdfFormat, orientation: PdfOrientation) {
  const portrait = format === "letter" ? { width: 816, height: 1056 } : { width: 794, height: 1123 };
  return orientation === "landscape"
    ? { width: portrait.height, height: portrait.width }
    : portrait;
}

function showPdfStatus(message: string, tone: "busy" | "success" | "error", timeout = 0) {
  document.getElementById(PDF_STATUS_ID)?.remove();
  const notice = document.createElement("div");
  notice.id = PDF_STATUS_ID;
  notice.setAttribute("role", "status");
  notice.setAttribute("aria-live", "polite");
  const symbol = tone === "busy" ? "…" : tone === "success" ? "✓" : "!";
  const background = tone === "busy" ? "#173f8f" : tone === "success" ? "#087a55" : "#b42318";
  notice.innerHTML = `<strong style="font-size:18px;line-height:1">${symbol}</strong><span>${message}</span>`;
  Object.assign(notice.style, {
    position: "fixed",
    right: "24px",
    bottom: "24px",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    gap: "11px",
    maxWidth: "min(430px, calc(100vw - 32px))",
    padding: "14px 17px",
    borderRadius: "14px",
    background,
    color: "#fff",
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
    fontSize: "14px",
    fontWeight: "750",
    boxShadow: "0 18px 48px rgba(0,0,0,.28)",
  });
  document.body.appendChild(notice);
  if (timeout > 0) window.setTimeout(() => notice.remove(), timeout);
}

async function waitForImages(element: HTMLElement) {
  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => resolve();
      image.addEventListener("load", done, { once: true });
      image.addEventListener("error", done, { once: true });
      window.setTimeout(done, 2500);
    });
  }));
}

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export async function exportElementToPdf(
  elementId: string,
  filename: string,
  orientation: PdfOrientation,
  format: PdfFormat = "a4",
) {
  const source = document.getElementById(elementId);
  if (!source) {
    showPdfStatus("Não foi possível localizar a prévia do documento.", "error", 6000);
    throw new Error("Não foi possível localizar a prévia do documento.");
  }

  showPdfStatus("Gerando o PDF… não feche esta janela.", "busy");
  await waitForImages(source);

  const { width, height } = pagePixels(format, orientation);
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.style.position = "fixed";
  stage.style.left = "-20000px";
  stage.style.top = "0";
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.overflow = "hidden";
  stage.style.background = "#ffffff";
  stage.style.pointerEvents = "none";
  stage.style.zIndex = "-1";

  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.classList.add("pdf-export-root");
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.maxWidth = "none";
  clone.style.maxHeight = "none";
  clone.style.margin = "0";
  clone.style.overflow = "hidden";
  stage.appendChild(clone);
  document.body.appendChild(stage);

  try {
    await waitForImages(clone);
    await nextPaint();
    const { default: html2pdf } = await import("html2pdf.js");
    const options = {
      margin: 0,
      filename: safeFilename(filename.replace(/\.pdf$/i, "")),
      image: { type: "jpeg" as const, quality: 0.94 },
      html2canvas: {
        scale: 1.25,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        scrollX: 0,
        scrollY: 0,
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        removeContainer: true,
      },
      jsPDF: {
        unit: "mm",
        format,
        orientation,
        compress: true,
      },
      pagebreak: { mode: ["css"] },
    };
    await html2pdf().set(options).from(clone).save();
    showPdfStatus("PDF baixado com sucesso. Verifique a pasta Downloads.", "success", 5000);
  } catch (error) {
    console.error("Falha ao gerar PDF", error);
    showPdfStatus("Não foi possível gerar o PDF. Você pode usar Imprimir e escolher ‘Microsoft Print to PDF’.", "error", 7000);
    throw new Error("O PDF não pôde ser gerado. Tente novamente ou use Imprimir e escolha ‘Microsoft Print to PDF’. ");
  } finally {
    stage.remove();
  }
}
