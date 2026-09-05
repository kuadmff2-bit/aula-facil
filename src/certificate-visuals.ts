export type CertificateVisualStyle = "classic" | "elegant" | "modern" | "prestige";

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
