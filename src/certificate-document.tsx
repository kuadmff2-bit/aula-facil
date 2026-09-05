import type { CSSProperties } from "react";
import type { CertificateSettings, ClassItem, InstitutionSettings, Student } from "./model";
import {
  DEFAULT_CERTIFICATE_LAYOUT,
  normalizeCertificateLayout,
  normalizeCertificateVisualStyle,
  type CertificateLayout,
  type CertificateVisualStyle,
} from "./certificate-visuals";
import "./certificate-document.css";

type Props = {
  student: Student;
  classItem?: ClassItem;
  institution: InstitutionSettings;
  settings: CertificateSettings;
  issuedAt?: string;
  certificateNumber?: string | null;
  visualStyle?: CertificateVisualStyle;
  layout?: CertificateLayout;
};

function formatDate(value: string) {
  const normalized = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return value;
  return new Date(`${normalized}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function replaceTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.split(`{${key}}`).join(value),
    template,
  );
}

export function CertificateDocument({
  student,
  classItem,
  institution,
  settings,
  issuedAt = new Date().toISOString().slice(0, 10),
  certificateNumber,
  visualStyle = "classic",
  layout = DEFAULT_CERTIFICATE_LAYOUT,
}: Props) {
  const schoolName = institution.name || institution.legalName || "Instituição de ensino";
  const courseName = classItem?.name || "curso informado";
  const workload = classItem?.workloadHours ?? settings.defaultWorkloadHours;
  const resolvedStyle = normalizeCertificateVisualStyle(visualStyle);
  const resolvedLayout = normalizeCertificateLayout(layout);
  const body = replaceTemplate(settings.bodyTemplate, {
    aluno: student.name,
    curso: courseName,
    carga_horaria: String(workload || 0),
    data: formatDate(issuedAt),
    escola: schoolName,
  });

  return (
    <article
      id="certificate-print-area"
      className={`professional-certificate certificate-style-${resolvedStyle} certificate-paper-${resolvedLayout.paperSize} certificate-orientation-${resolvedLayout.orientation} certificate-spacing-${resolvedLayout.spacing}`}
      data-paper-size={resolvedLayout.paperSize}
      data-page-orientation={resolvedLayout.orientation}
      style={{
        "--certificate-primary": settings.primaryColor || institution.primaryColor,
        "--certificate-secondary": settings.secondaryColor || institution.secondaryColor,
      } as CSSProperties}
    >
      <div className="certificate-art certificate-art-top-left" aria-hidden="true" />
      <div className="certificate-art certificate-art-top-right" aria-hidden="true" />
      <div className="certificate-art certificate-art-bottom-left" aria-hidden="true" />
      <div className="certificate-art certificate-art-bottom-right" aria-hidden="true" />

      <div className="professional-certificate-frame">
        <header className="professional-certificate-header">
          <div className="professional-certificate-brand">
            {institution.logoDataUrl ? <img src={institution.logoDataUrl} alt={`Símbolo de ${schoolName}`} /> : <div className="professional-certificate-logo-fallback">AF</div>}
            <div>
              <strong>{schoolName}</strong>
              {institution.legalName && institution.legalName !== schoolName && <span>{institution.legalName}</span>}
            </div>
          </div>
          {certificateNumber && <span className="professional-certificate-number">Nº {certificateNumber}</span>}
        </header>

        <section className="professional-certificate-body">
          <span className="professional-certificate-kicker">Conclusão de curso</span>
          <h1>{settings.title || "Certificado"}</h1>
          <div className="professional-certificate-divider"><i /></div>
          <p className="certificate-awarded-to">Concedido a</p>
          <h2 className="certificate-student-name">{student.name}</h2>
          <p className="certificate-body-text">{body}</p>
          {workload > 0 && <div className="professional-certificate-workload">Carga horária: <strong>{workload} horas</strong></div>}
          <div className="professional-certificate-date">Emitido em {formatDate(issuedAt)}.</div>
        </section>

        <footer>
          <div className="professional-certificate-signatures">
            {settings.signatures.map((signature, index) => (
              <div className="professional-certificate-signature" key={`${signature}-${index}`}>
                <span />
                <strong>{signature}</strong>
              </div>
            ))}
          </div>

          <div className="professional-certificate-footer">
            <span>{settings.footerText}</span>
            <span>{[institution.city, institution.state].filter(Boolean).join(" - ")}</span>
          </div>
        </footer>

        <div className="professional-certificate-seal" aria-hidden="true">
          <span>{institution.logoDataUrl ? <img src={institution.logoDataUrl} alt="" /> : "AF"}</span>
        </div>
      </div>
    </article>
  );
}
