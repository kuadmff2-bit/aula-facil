type PdfOrientation = "portrait" | "landscape";

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

async function waitForImages(element: HTMLElement) {
  const images = Array.from(element.querySelectorAll("img"));
  await Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
  }));
}

export async function exportElementToPdf(elementId: string, filename: string, orientation: PdfOrientation) {
  const element = document.getElementById(elementId);
  if (!element) throw new Error("Não foi possível localizar a prévia do documento.");
  await waitForImages(element);
  const { default: html2pdf } = await import("html2pdf.js");
  const options = {
    margin: 0,
    filename: safeFilename(filename.replace(/\.pdf$/i, "")),
    image: { type: "jpeg" as const, quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: Math.max(element.scrollWidth, element.clientWidth),
    },
    jsPDF: {
      unit: "mm",
      format: "a4",
      orientation,
      compress: true,
    },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  };
  await html2pdf().set(options).from(element).save();
}
