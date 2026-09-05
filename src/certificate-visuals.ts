export type CertificateVisualStyle = "classic" | "elegant" | "modern" | "prestige";
export type CertificatePaperSize = "a4" | "letter";
export type CertificateOrientation = "landscape" | "portrait";
export type CertificateSpacing = "compact" | "normal" | "wide";

export type CertificateLayout = {
  paperSize: CertificatePaperSize;
  orientation: CertificateOrientation;
  spacing: CertificateSpacing;
};

export const DEFAULT_CERTIFICATE_LAYOUT: CertificateLayout = {
  paperSize: "a4",
  orientation: "landscape",
  spacing: "normal",
};

export const CERTIFICATE_VISUAL_STYLES: Array<{
  id: CertificateVisualStyle;
  name: string;
  description: string;
}> = [
  { id: "classic", name: "Clássico", description: "Moldura tradicional, formal e equilibrada." },
  { id: "elegant", name: "Elegante", description: "Detalhes finos nos cantos e composição sofisticada." },
  { id: "modern", name: "Moderno", description: "Geometria limpa, faixa lateral e aparência contemporânea." },
  { id: "prestige", name: "Prestígio", description: "Dupla moldura, selo central e acabamento solene." },
];

export function normalizeCertificateVisualStyle(value: unknown): CertificateVisualStyle {
  return value === "elegant" || value === "modern" || value === "prestige" || value === "classic" ? value : "classic";
}

export function normalizeCertificateLayout(value: unknown): CertificateLayout {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<CertificateLayout> : {};
  return {
    paperSize: raw.paperSize === "letter" ? "letter" : "a4",
    orientation: raw.orientation === "portrait" ? "portrait" : "landscape",
    spacing: raw.spacing === "compact" || raw.spacing === "wide" ? raw.spacing : "normal",
  };
}
