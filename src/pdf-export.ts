type PdfOrientation = "portrait" | "landscape";
type PdfFormat = "a4" | "letter";

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
  if (!source) throw new Error("Não foi possível localizar a prévia do documento.");
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
  } catch (error) {
    console.error("Falha ao gerar PDF", error);
    throw new Error("O PDF não pôde ser gerado. Tente novamente ou use Imprimir e escolha ‘Microsoft Print to PDF’.");
  } finally {
    stage.remove();
  }
}
