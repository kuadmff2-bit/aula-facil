import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileCheck2, Printer, ShieldCheck, X } from "lucide-react";
import { CertificateDocument } from "./certificate-document";
import { issueCertificate, listStudentCertificates, type IssuedCertificate } from "./certificate-service";
import { getCloudSyncStatus, safePullFromCloud } from "./cloud-safe-sync";
import type { CertificateSettings, ClassItem, InstitutionSettings, SchoolDatabase, Student } from "./model";
import "./certificate-manager.css";

type Props = {
  student: Student;
  classItem?: ClassItem;
  database: SchoolDatabase;
  onClose: () => void;
  onCompleted: (database: SchoolDatabase) => void;
};

type Message = { tone: "success" | "warning" | "danger"; text: string } | null;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function snapshotValues(
  certificate: IssuedCertificate,
  student: Student,
  classItem: ClassItem | undefined,
  fallbackInstitution: InstitutionSettings,
  fallbackSettings: CertificateSettings,
) {
  const snapshot = certificate.snapshot && typeof certificate.snapshot === "object" ? certificate.snapshot as Record<string, unknown> : {};
  const rawInstitution = snapshot.institution && typeof snapshot.institution === "object" && !Array.isArray(snapshot.institution)
    ? snapshot.institution as Partial<InstitutionSettings> : {};
  const rawSettings = snapshot.certificate && typeof snapshot.certificate === "object" && !Array.isArray(snapshot.certificate)
    ? snapshot.certificate as Partial<CertificateSettings> : {};

  const institution: InstitutionSettings = { ...fallbackInstitution, ...rawInstitution };
  const settings: CertificateSettings = {
    ...fallbackSettings,
    ...rawSettings,
    signatures: Array.isArray(rawSettings.signatures)
      ? rawSettings.signatures.filter((item): item is string => typeof item === "string").slice(0, 8)
      : fallbackSettings.signatures,
  };
  const snapshotStudent: Student = { ...student, name: text(snapshot.studentName, student.name) };
  const workloadHours = numberValue(snapshot.workloadHours, certificate.workloadHours);
  const snapshotClass: ClassItem | undefined = classItem
    ? { ...classItem, name: text(snapshot.courseName, certificate.courseName), workloadHours }
    : {
        id: "certificate-snapshot", name: text(snapshot.courseName, certificate.courseName), teacher: "", schedule: "", room: "",
        monthlyFee: 0, workloadHours, color: institution.primaryColor, createdAt: certificate.issuedAt,
      };
  return { institution, settings, student: snapshotStudent, classItem: snapshotClass };
}

export function CertificateManager({ student, classItem, database, onClose, onCompleted }: Props) {
  const [certificates, setCertificates] = useState<IssuedCertificate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const selected = useMemo(
    () => certificates.find((item) => item.id === selectedId) ?? certificates[0] ?? null,
    [certificates, selectedId],
  );

  const refresh = async () => {
    const items = await listStudentCertificates(student.id);
    setCertificates(items);
    setSelectedId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? "");
  };

  useEffect(() => {
    void refresh().catch((error) => setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível carregar os certificados." }));
  }, [student.id]);

  const emit = async () => {
    if (!armed) {
      setArmed(true);
      setMessage({ tone: "warning", text: "A emissão registra a conclusão do curso e cria um documento histórico. Confira nome, curso, carga horária e assinaturas antes de confirmar." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const schoolId = localStorage.getItem("aulafacil.cloud.selected-school") ?? "";
      if (!schoolId) throw new Error("Selecione uma instituição no AulaFácil Cloud para emitir o certificado.");
      const syncStatus = await getCloudSyncStatus(schoolId, database);
      if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de emitir o certificado. A conclusão não será registrada sobre uma cópia antiga.");
      const certificate = await issueCertificate({
        student,
        classItem,
        institution: database.settings.institution,
        settings: database.settings.certificate,
      });
      setCertificates((current) => [certificate, ...current.filter((item) => item.id !== certificate.id)]);
      setSelectedId(certificate.id);
      setArmed(false);
      try {
        const restored = await safePullFromCloud(schoolId, database.settings.appearance);
        onCompleted(restored);
        setMessage({ tone: "success", text: `Certificado ${certificate.certificateNumber} emitido, salvo no histórico e sincronizado.` });
      } catch (syncError) {
        setMessage({ tone: "warning", text: `O certificado ${certificate.certificateNumber} foi emitido, mas a cópia local não pôde ser atualizada agora: ${syncError instanceof Error ? syncError.message : "sincronização indisponível"}.` });
      }
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível emitir o certificado." });
    } finally {
      setBusy(false);
    }
  };

  const preview = selected ? snapshotValues(selected, student, classItem, database.settings.institution, database.settings.certificate) : null;

  return <div className="modal-backdrop document-backdrop" role="presentation">
    <section className="certificate-manager">
      <div className="certificate-manager-toolbar">
        <div><span className="certificate-manager-eyebrow">CONCLUSÃO DO ALUNO</span><strong>Certificados</strong><small>{student.name} · {classItem?.name ?? "Curso"}</small></div>
        <div className="certificate-manager-actions">
          <button className="secondary-button" onClick={onClose}><X size={17}/> Fechar</button>
          {selected && <button className="secondary-button" onClick={() => window.print()}><Printer size={17}/> Imprimir / PDF</button>}
          <button className={armed ? "danger-button" : "primary-button"} disabled={busy} onClick={() => void emit()}><FileCheck2 size={17}/>{busy ? "Emitindo..." : armed ? "Confirmar conclusão" : "Emitir novo certificado"}</button>
        </div>
      </div>

      {message && <div className={`certificate-manager-message ${message.tone}`} role="status">{message.tone === "success" ? <CheckCircle2/> : <ShieldCheck/>}<span>{message.text}</span></div>}

      {certificates.length > 0 && <div className="certificate-history"><span>Histórico</span>{certificates.map((certificate) => <button key={certificate.id} className={selected?.id === certificate.id ? "active" : ""} onClick={() => { setSelectedId(certificate.id); setArmed(false); }}><strong>{certificate.certificateNumber}</strong><small>{certificate.courseName} · {new Date(`${certificate.issuedAt}T12:00:00`).toLocaleDateString("pt-BR")}</small></button>)}</div>}

      <div className="certificate-manager-preview">
        {selected && preview
          ? <CertificateDocument student={preview.student} classItem={preview.classItem} institution={preview.institution} settings={preview.settings} issuedAt={selected.issuedAt} certificateNumber={selected.certificateNumber} />
          : <div className="certificate-no-issued"><FileCheck2/><h3>Nenhum certificado emitido</h3><p>O modelo configurado pela escola será usado quando a conclusão for confirmada.</p><CertificateDocument student={student} classItem={classItem} institution={database.settings.institution} settings={database.settings.certificate} certificateNumber="PRÉVIA" /></div>}
      </div>
    </section>
  </div>;
}
