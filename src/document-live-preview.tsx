import type { CertificateSettings, FinanceSettings, InstitutionSettings, ReceiptSettings } from "./model";

function replaceSample(template: string, institution: InstitutionSettings) {
  const sample: Record<string, string> = {
    aluno: "João da Silva",
    valor: "R$ 150,00",
    referencia: "Setembro/2026",
    data: "10/09/2026",
    responsavel: "Maria da Silva",
    turma: "Informática · Turma A",
    curso: "Informática",
    carga_horaria: "120 horas",
    escola: institution.name || "Sua instituição",
  };
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => sample[key] ?? `{${key}}`);
}

function Brand({ institution, showLogo = true }: { institution: InstitutionSettings; showLogo?: boolean }) {
  return <div className="live-doc-brand">
    {showLogo && (institution.logoDataUrl ? <img src={institution.logoDataUrl} alt=""/> : <b>{(institution.name || "AF").slice(0, 2).toUpperCase()}</b>)}
    <span><strong>{institution.name || "Sua instituição"}</strong><small>{[institution.city, institution.state].filter(Boolean).join(" · ") || institution.address || "Dados da instituição"}</small></span>
  </div>;
}

export function ReceiptSettingsPreview({ institution, receipt }: { institution: InstitutionSettings; receipt: ReceiptSettings }) {
  const fields = receipt.fields.filter((field) => field.visible).slice(0, 7);
  return <div className="live-doc-paper receipt-live-preview">
    <div className="live-doc-copy">
      <Brand institution={institution} showLogo={receipt.showLogo}/>
      <h3>{receipt.title || "Recibo de pagamento"}</h3>
      <div className="live-doc-grid"><span><small>Nº</small><strong>AF-2026-00125</strong></span><span><small>Aluno</small><strong>João da Silva</strong></span><span><small>Total</small><strong>R$ 150,00</strong></span>{fields.map((field) => <span key={field.id}><small>{field.label}</small><strong>{field.id.toLowerCase().includes("data") ? "10/09/2026" : field.id.toLowerCase().includes("forma") ? "Pix" : "Setembro/2026"}</strong></span>)}</div>
      {receipt.observation && <p>{replaceSample(receipt.observation, institution)}</p>}
      <div className="live-doc-signatures"><span>{receipt.schoolSignatureLabel || "Assinatura da escola"}</span><span>{receipt.payerSignatureLabel || "Assinatura do pagador"}</span></div>
      <footer>{receipt.footer || "Emitido pelo AulaFácil"}</footer>
    </div>
    <div className="live-doc-cut">✂</div>
    <div className="live-doc-copy compact"><Brand institution={institution} showLogo={receipt.showLogo}/><h3>{receipt.title || "Recibo de pagamento"}</h3><p>Via da escola · João da Silva · R$ 150,00</p></div>
  </div>;
}

export function FinanceSettingsPreview({ institution, finance }: { institution: InstitutionSettings; finance: FinanceSettings }) {
  return <div className="live-doc-paper boleto-live-preview" style={{ "--preview-primary": finance.boletoPrimaryColor } as React.CSSProperties}>
    <Brand institution={institution} showLogo={finance.boletoShowLogo}/>
    <div className="boleto-preview-heading"><span>COBRANÇA</span><strong>R$ 150,00</strong></div>
    <div className="live-doc-grid"><span><small>Aluno</small><strong>João da Silva</strong></span><span><small>Vencimento</small><strong>10/09/2026</strong></span><span><small>Referência</small><strong>Setembro/2026</strong></span><span><small>Status</small><strong>Pendente</strong></span></div>
    {finance.boletoDueText && <p>{finance.boletoDueText}</p>}
    <div className="fake-barcode" aria-hidden="true"/>
    <footer>{finance.boletoFooter || "Pagamento sujeito às regras da instituição."}</footer>
  </div>;
}

export function CertificateSettingsPreview({ institution, certificate }: { institution: InstitutionSettings; certificate: CertificateSettings }) {
  return <div className="live-doc-paper certificate-live-preview" style={{ "--preview-primary": certificate.primaryColor, "--preview-secondary": certificate.secondaryColor } as React.CSSProperties}>
    <Brand institution={institution}/>
    <div className="certificate-preview-inner">
      <span className="certificate-preview-kicker">CERTIFICADO</span>
      <h2>{certificate.title || "Certificado de conclusão"}</h2>
      <p>{replaceSample(certificate.bodyTemplate || "Certificamos que {aluno} concluiu o curso {curso}, com carga horária de {carga_horaria}.", institution)}</p>
      <div className="certificate-preview-signatures">{(certificate.signatures.length ? certificate.signatures : ["Direção", "Coordenação"]).slice(0, 3).map((signature) => <span key={signature}><i/>{signature}</span>)}</div>
      <footer>{certificate.footerText || institution.name || "Sua instituição"}</footer>
    </div>
  </div>;
}
