from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: esperado 1 trecho, encontrado {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/App.tsx",
    'import { BackupPanel } from "./backup-panel";\n',
    'import { BackupPanel } from "./backup-panel";\nimport { SchoolBrand } from "./school-brand";\n',
)

replace_once(
    "src/App.tsx",
    '''        <button className="brand" onClick={() => changeView("dashboard")}>
          <span className="brand-mark">A<i /></span>
          <span><strong>AulaFácil</strong><small>{database.settings.institution.name || "Sua instituição"}</small></span>
        </button>''',
    '''        <button className="brand" onClick={() => changeView("dashboard")} aria-label="Ir para o início">
          <SchoolBrand institution={database.settings.institution} />
        </button>''',
)

replace_once(
    "src/professional-settings.tsx",
    '''function normalizeMoneyInput(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
''',
    '''function normalizeMoneyInput(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

const MAX_LOGO_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_LOGO_SAVED_BYTES = 900 * 1024;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível processar a imagem selecionada."));
    reader.readAsDataURL(blob);
  });
}

async function optimizeLogo(file: File) {
  if (!LOGO_TYPES.has(file.type)) throw new Error("Use uma imagem PNG, JPG/JPEG ou WEBP.");
  if (file.size > MAX_LOGO_SOURCE_BYTES) throw new Error("A imagem original pode ter no máximo 12 MB.");

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("A imagem não pôde ser aberta."));
      element.src = objectUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("A imagem selecionada é inválida.");
    if (image.naturalWidth * image.naturalHeight > 80_000_000) throw new Error("A resolução da imagem é grande demais. Use uma imagem de até 80 megapixels.");

    const attempts = [
      { maxSide: 1600, quality: 0.90 },
      { maxSide: 1200, quality: 0.82 },
      { maxSide: 900, quality: 0.74 },
    ];
    for (const attempt of attempts) {
      const scale = Math.min(1, attempt.maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("O Windows não conseguiu preparar a imagem da logo.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", attempt.quality));
      if (blob && blob.size <= MAX_LOGO_SAVED_BYTES) return blobToDataUrl(blob);
    }
    throw new Error("A logo continuou muito pesada após a otimização. Escolha uma imagem com menos detalhes.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
''',
)

replace_once(
    "src/professional-settings.tsx",
    '''  const importLogo = async (file?: File) => {
    setLogoError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem válido.");
    if (file.size > 1_500_000) throw new Error("A logo deve ter no máximo 1,5 MB.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
      reader.readAsDataURL(file);
    });
    update("logoDataUrl", dataUrl);
  };''',
    '''  const importLogo = async (file?: File) => {
    setLogoError("");
    if (!file) return;
    const dataUrl = await optimizeLogo(file);
    update("logoDataUrl", dataUrl);
  };''',
)

replace_once(
    "src/professional-settings.tsx",
    '          <p>PNG, JPG, WEBP ou SVG. Recomendado: imagem quadrada ou com fundo transparente.</p>',
    '          <p>PNG, JPG/JPEG ou WEBP de até 12 MB. O AulaFácil otimiza a imagem automaticamente para manter o sistema rápido.</p>',
)

replace_once(
    "src/professional-settings.tsx",
    '            accept="image/png,image/jpeg,image/webp,image/svg+xml"',
    '            accept="image/png,image/jpeg,image/webp"',
)

for path in ("src/cloud.ts", "src/cloud-safe-sync.ts"):
    replace_once(
        path,
        '      document_number: institution.documentNumber || null,\n      primary_color: institution.primaryColor,',
        '      document_number: institution.documentNumber || null,\n      logo_url: institution.logoDataUrl || null,\n      primary_color: institution.primaryColor,',
    )

replace_once(
    "src/certificate-manager.tsx",
    '{selected && <button className="secondary-button" onClick={() => window.print()}><Printer size={17}/> Imprimir / PDF</button>}',
    '{selected && <button className="primary-button" onClick={() => window.print()} title="Imprimir certificado ou salvar em PDF"><Printer size={17}/> Imprimir certificado</button>}',
)

print("Identidade institucional, logo e impressão atualizadas.")
