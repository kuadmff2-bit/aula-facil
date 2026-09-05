import type { CSSProperties } from "react";
import type { CertificateSettings, ClassItem, InstitutionSettings, Student } from "./model";
import "./certificate-document.css";

type Props = {
  student: Student;
  classItem?: ClassItem;
  institution: InstitutionSettings;
  settings: CertificateSettings;
  issuedAt?: string;
  certificateNumber?: string | null;
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
}: Props) {
  const schoolName = institution.name || institution.legalName || "Instituição de ensino";
  const courseName = classItem?.name || "curso informado";
  const workload = classItem?.workloadHours ?? settings.defaultWorkloadHours;
  const body = replaceTemplate(settings.bodyTemplate, {
    aluno: student.name,
    curso: courseName,
    carga_horaria: String(workload || 0),
    data: formatDate(issuedAt),
    escola: schoolName,
  });

  return (
    <article
      className="professional-certificate"
      style={{
        "--certificate-primary": settings.primaryColor,
        "--certificate-secondary": settings.secondaryColor,
      } as CSSProperties}
    >
      <div className="professional-certificate-frame">
        <header className="professional-certificate-header">
          <div className="professional-certificate-brand">
            {institution.logoDataUrl ? <img src={institution.logoDataUrl} alt="" /> : <div className="professional-certificate-logo-fallback">AF</div>}
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
          <div className="professional-certificate-divider" />
          <p>{body}</p>
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
      </div>
    </article>
  );
}
