import { useRef } from "react";
import type {
  CertificateSettings,
  FinanceSettings,
  InstitutionSettings,
  ReceiptSettings,
} from "./model";
import "./professional-settings.css";

type InstitutionSettingsProps = {
  value: InstitutionSettings;
  onChange: (value: InstitutionSettings) => void;
};

type FinanceSettingsProps = {
  value: FinanceSettings;
  onChange: (value: FinanceSettings) => void;
};

type DocumentSettingsProps = {
  receipt: ReceiptSettings;
  certificate: CertificateSettings;
  onReceiptChange: (value: ReceiptSettings) => void;
  onCertificateChange: (value: CertificateSettings) => void;
};

function normalizeMoneyInput(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function SettingsHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="professional-settings-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function InstitutionSettingsPanel({ value, onChange }: InstitutionSettingsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const update = <K extends keyof InstitutionSettings>(key: K, fieldValue: InstitutionSettings[K]) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const importLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.");
    if (file.size > 1_500_000) throw new Error("A logo deve ter no máximo 1,5 MB.");
    const reader = new FileReader();
    reader.onload = () => update("logoDataUrl", String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  return (
    <section className="card professional-settings-card">
      <SettingsHeader
        title="Identidade da instituição"
        description="Esses dados serão usados no sistema, recibos, cobranças, declarações e certificados."
      />

      <div className="institution-logo-row">
        <div className="institution-logo-preview">
          {value.logoDataUrl ? <img src={value.logoDataUrl} alt="Logo da instituição" /> : <span>LOGO</span>}
        </div>
        <div>
          <strong>Marca da escola</strong>
          <p>PNG, JPG, WEBP ou SVG. Recomendado: imagem quadrada ou com fundo transparente.</p>
          <div className="settings-inline-actions">
            <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}>Escolher logo</button>
            {value.logoDataUrl && <button type="button" className="ghost-danger-button" onClick={() => update("logoDataUrl", "")}>Remover</button>}
          </div>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(event) => {
              void importLogo(event.target.files?.[0]).catch((error) => window.alert(error instanceof Error ? error.message : "Não foi possível carregar a logo."));
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      <div className="settings-form-grid">
        <label><span>Nome exibido</span><input value={value.name} maxLength={160} onChange={(e) => update("name", e.target.value)} placeholder="Nome da instituição" /></label>
        <label><span>Razão social</span><input value={value.legalName} maxLength={200} onChange={(e) => update("legalName", e.target.value)} placeholder="Opcional" /></label>
        <label><span>CNPJ / CPF</span><input value={value.documentNumber} maxLength={40} onChange={(e) => update("documentNumber", e.target.value)} placeholder="Documento da instituição" /></label>
        <label><span>Telefone</span><input value={value.phone} maxLength={40} onChange={(e) => update("phone", e.target.value)} placeholder="(00) 0000-0000" /></label>
        <label><span>WhatsApp</span><input value={value.whatsapp} maxLength={40} onChange={(e) => update("whatsapp", e.target.value)} placeholder="(00) 00000-0000" /></label>
        <label><span>E-mail</span><input type="email" value={value.email} maxLength={200} onChange={(e) => update("email", e.target.value)} placeholder="contato@escola.com" /></label>
        <label className="settings-span-2"><span>Endereço</span><input value={value.address} maxLength={300} onChange={(e) => update("address", e.target.value)} placeholder="Rua, número, bairro" /></label>
        <label><span>Cidade</span><input value={value.city} maxLength={120} onChange={(e) => update("city", e.target.value)} /></label>
        <label><span>Estado</span><input value={value.state} maxLength={80} onChange={(e) => update("state", e.target.value)} /></label>
        <label><span>Cor principal</span><div className="color-field"><input type="color" value={value.primaryColor} onChange={(e) => update("primaryColor", e.target.value)} /><input value={value.primaryColor} maxLength={32} onChange={(e) => update("primaryColor", e.target.value)} /></div></label>
        <label><span>Cor secundária</span><div className="color-field"><input type="color" value={value.secondaryColor} onChange={(e) => update("secondaryColor", e.target.value)} /><input value={value.secondaryColor} maxLength={32} onChange={(e) => update("secondaryColor", e.target.value)} /></div></label>
      </div>
    </section>
  );
}

export function FinanceSettingsPanel({ value, onChange }: FinanceSettingsProps) {
  const update = <K extends keyof FinanceSettings>(key: K, fieldValue: FinanceSettings[K]) => {
    onChange({ ...value, [key]: fieldValue });
  };

  const toggleDay = (day: number) => {
    const next = value.allowedDueDays.includes(day)
      ? value.allowedDueDays.filter((item) => item !== day)
      : [...value.allowedDueDays, day].sort((a, b) => a - b);
    if (next.length) update("allowedDueDays", next);
  };

  return (
    <section className="card professional-settings-card">
      <SettingsHeader
        title="Regras financeiras"
        description="Configure vencimentos disponíveis, tolerância, multa e juros. O valor original da mensalidade continua preservado."
      />

      <div className="settings-block">
        <strong>Dias de vencimento que a escola oferece</strong>
        <p>O aluno poderá escolher um dos dias habilitados no cadastro. Dias 29, 30 e 31 usam o último dia quando o mês for menor.</p>
        <div className="due-day-grid">
          {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
            <button
              key={day}
              type="button"
              className={value.allowedDueDays.includes(day) ? "active" : ""}
              onClick={() => toggleDay(day)}
              aria-pressed={value.allowedDueDays.includes(day)}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-form-grid">
        <label>
          <span>Dias de tolerância</span>
          <input type="number" min={0} max={365} value={value.graceDays} onChange={(e) => update("graceDays", Math.max(0, Math.min(365, Math.trunc(Number(e.target.value) || 0))))} />
        </label>
        <label>
          <span>Tipo de multa</span>
          <select value={value.lateFeeMode} onChange={(e) => update("lateFeeMode", e.target.value as FinanceSettings["lateFeeMode"])}>
            <option value="none">Sem multa</option>
            <option value="fixed">Valor fixo</option>
            <option value="percent">Percentual</option>
          </select>
        </label>
        <label>
          <span>{value.lateFeeMode === "percent" ? "Multa (%)" : "Valor da multa"}</span>
          <input type="number" min={0} step="0.01" disabled={value.lateFeeMode === "none"} value={value.lateFeeValue} onChange={(e) => update("lateFeeValue", normalizeMoneyInput(e.target.value))} />
        </label>
        <label>
          <span>Tipo de juros</span>
          <select value={value.interestMode} onChange={(e) => update("interestMode", e.target.value as FinanceSettings["interestMode"])}>
            <option value="none">Sem juros</option>
            <option value="daily_percent">Percentual ao dia</option>
            <option value="monthly_percent">Percentual ao mês proporcional</option>
            <option value="fixed_daily">Valor fixo por dia</option>
          </select>
        </label>
        <label>
          <span>{value.interestMode.includes("percent") ? "Juros (%)" : "Valor do juro"}</span>
          <input type="number" min={0} step="0.01" disabled={value.interestMode === "none"} value={value.interestValue} onChange={(e) => update("interestValue", normalizeMoneyInput(e.target.value))} />
        </label>
        <label><span>Cor da cobrança</span><div className="color-field"><input type="color" value={value.boletoPrimaryColor} onChange={(e) => update("boletoPrimaryColor", e.target.value)} /><input value={value.boletoPrimaryColor} onChange={(e) => update("boletoPrimaryColor", e.target.value)} /></div></label>
        <label className="settings-span-2"><span>Texto sobre vencimento</span><textarea rows={3} maxLength={500} value={value.boletoDueText} onChange={(e) => update("boletoDueText", e.target.value)} /></label>
        <label className="settings-span-2"><span>Rodapé da cobrança</span><textarea rows={3} maxLength={500} value={value.boletoFooter} onChange={(e) => update("boletoFooter", e.target.value)} /></label>
      </div>
      <label className="settings-checkbox"><input type="checkbox" checked={value.boletoShowLogo} onChange={(e) => update("boletoShowLogo", e.target.checked)} /><span>Mostrar a logo da instituição nos documentos de cobrança personalizados</span></label>
    </section>
  );
}

export function DocumentSettingsPanel({ receipt, certificate, onReceiptChange, onCertificateChange }: DocumentSettingsProps) {
  const updateReceipt = <K extends keyof ReceiptSettings>(key: K, fieldValue: ReceiptSettings[K]) => onReceiptChange({ ...receipt, [key]: fieldValue });
  const updateCertificate = <K extends keyof CertificateSettings>(key: K, fieldValue: CertificateSettings[K]) => onCertificateChange({ ...certificate, [key]: fieldValue });

  return (
    <section className="card professional-settings-card">
      <SettingsHeader
        title="Recibos e certificados"
        description="Personalize os documentos emitidos sem alterar certificados antigos já formalizados."
      />

      <div className="settings-subsection">
        <h3>Recibo em duas vias</h3>
        <div className="settings-form-grid">
          <label><span>Título</span><input value={receipt.title} maxLength={120} onChange={(e) => updateReceipt("title", e.target.value)} /></label>
          <label><span>Rodapé</span><input value={receipt.footer} maxLength={300} onChange={(e) => updateReceipt("footer", e.target.value)} /></label>
          <label><span>Assinatura da escola</span><input value={receipt.schoolSignatureLabel} maxLength={160} onChange={(e) => updateReceipt("schoolSignatureLabel", e.target.value)} /></label>
          <label><span>Assinatura do pagador</span><input value={receipt.payerSignatureLabel} maxLength={160} onChange={(e) => updateReceipt("payerSignatureLabel", e.target.value)} /></label>
        </div>
      </div>

      <div className="settings-subsection">
        <h3>Certificado</h3>
        <div className="settings-form-grid">
          <label><span>Título</span><input value={certificate.title} maxLength={120} onChange={(e) => updateCertificate("title", e.target.value)} /></label>
          <label><span>Carga horária padrão</span><input type="number" min={0} max={100000} value={certificate.defaultWorkloadHours} onChange={(e) => updateCertificate("defaultWorkloadHours", Math.max(0, Number(e.target.value) || 0))} /></label>
          <label><span>Cor principal</span><div className="color-field"><input type="color" value={certificate.primaryColor} onChange={(e) => updateCertificate("primaryColor", e.target.value)} /><input value={certificate.primaryColor} onChange={(e) => updateCertificate("primaryColor", e.target.value)} /></div></label>
          <label><span>Cor secundária</span><div className="color-field"><input type="color" value={certificate.secondaryColor} onChange={(e) => updateCertificate("secondaryColor", e.target.value)} /><input value={certificate.secondaryColor} onChange={(e) => updateCertificate("secondaryColor", e.target.value)} /></div></label>
          <label className="settings-span-2"><span>Texto do certificado</span><textarea rows={5} maxLength={3000} value={certificate.bodyTemplate} onChange={(e) => updateCertificate("bodyTemplate", e.target.value)} /><small>Variáveis: {'{aluno}'}, {'{curso}'}, {'{carga_horaria}'}, {'{data}'}, {'{escola}'}</small></label>
          <label className="settings-span-2"><span>Rodapé</span><textarea rows={2} maxLength={500} value={certificate.footerText} onChange={(e) => updateCertificate("footerText", e.target.value)} /></label>
          <label className="settings-span-2"><span>Assinaturas (uma por linha, máximo 6)</span><textarea rows={4} value={certificate.signatures.join("\n")} onChange={(e) => updateCertificate("signatures", e.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 6))} placeholder={'Direção\nCoordenação\nProfessor'} /></label>
        </div>
      </div>
    </section>
  );
}
