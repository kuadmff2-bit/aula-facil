import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FileCheck2, Palette, Printer, ShieldCheck, X } from "lucide-react";
import { CertificateDocument } from "./certificate-document";
import { issueCertificate, listStudentCertificates, type IssuedCertificate } from "./certificate-service";
import {
  CERTIFICATE_VISUAL_STYLES,
  DEFAULT_CERTIFICATE_LAYOUT,
  normalizeCertificateLayout,
  normalizeCertificateVisualStyle,
  type CertificateLayout,
  type CertificateVisualStyle,
} from "./certificate-visuals";
import { getCloudSyncStatus, safePullFromCloud } from "./cloud-safe-sync";
import type { CertificateSettings, ClassItem, InstitutionSettings, SchoolDatabase, Student } from "./model";
import { exportElementToPdf } from "./pdf-export";
import "./certificate-manager.css";

const CERTIFICATE_LAYOUT_KEY = "aulafacil.certificate-layout.v1";

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

function loadPreferredLayout() {
  try {
    const raw = localStorage.getItem(CERTIFICATE_LAYOUT_KEY);
    return raw ? normalizeCertificateLayout(JSON.parse(raw)) : DEFAULT_CERTIFICATE_LAYOUT;
  } catch {
    return DEFAULT_CERTIFICATE_LAYOUT;
  }
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
  return {
    institution,
    settings,
    student: snapshotStudent,
    classItem: snapshotClass,
    visualStyle: normalizeCertificateVisualStyle(snapshot.visualStyle),
    layout: normalizeCertificateLayout(snapshot.layout),
  };
}

export function CertificateManager({ student, classItem, database, onClose, onCompleted }: Props) {
  const [certificates, setCertificates] = useState<IssuedCertificate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [visualStyle, setVisualStyle] = useState<CertificateVisualStyle>("classic");
  const [layout, setLayout] = useState<CertificateLayout>(() => loadPreferredLayout());
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const selected = useMemo(
    () => selectedId ? certificates.find((item) => item.id === selectedId) ?? null : null,
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

  useEffect(() => {
    localStorage.setItem(CERTIFICATE_LAYOUT_KEY, JSON.stringify(layout));
  }, [layout]);

  const emit = async () => {
    if (!armed) {
      setSelectedId("");
      setArmed(true);
      setMessage({ tone: "warning", text: "Confira a prévia, o modelo, tamanho do papel, orientação, espaçamento, nome, curso, carga horária, logo, cores, rodapé e assinaturas. Ao confirmar, essa aparência ficará preservada no histórico." });
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
        visualStyle,
        layout,
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

  const historicalPreview = selected ? snapshotValues(selected, student, classItem, database.settings.institution, database.settings.certificate) : null;
  const isDraftPreview = !selected;
  const activeLayout = historicalPreview?.layout ?? layout;

  const downloadPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setMessage(null);
    try {
      await exportElementToPdf(
        "certificate-print-area",
        `certificado-${student.name}-${selected?.certificateNumber ?? "previa"}`,
        activeLayout.orientation,
        activeLayout.paperSize,
      );
      setMessage({ tone: "success", text: "PDF gerado em uma única página com o tamanho e a orientação escolhidos." });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "Não foi possível gerar o PDF." });
    } finally {
      setPdfBusy(false);
    }
  };

  const updateLayout = (patch: Partial<CertificateLayout>) => {
    setLayout((current) => normalizeCertificateLayout({ ...current, ...patch }));
    setSelectedId("");
    setArmed(false);
    setMessage(null);
  };

  return <div className="modal-backdrop document-backdrop" role="presentation">
    <section className="certificate-manager">
      <div className="certificate-manager-toolbar">
        <div><span className="certificate-manager-eyebrow">CONCLUSÃO DO ALUNO</span><strong>Certificados</strong><small>{student.name} · {classItem?.name ?? "Curso"}</small></div>
        <div className="certificate-manager-actions">
          <button className="secondary-button" data-escape-close="true" onClick={onClose}><X size={17}/> Fechar</button>
          {(selected || isDraftPreview) && <><button className="secondary-button" disabled={pdfBusy} onClick={() => void downloadPdf()}><Download size={17}/>{pdfBusy ? "Gerando PDF..." : "Baixar PDF"}</button><button className="primary-button" onClick={() => window.print()} title="Imprimir certificado"><Printer size={17}/> Imprimir</button></>}
          <button className={armed ? "danger-button" : "primary-button"} disabled={busy || pdfBusy} onClick={() => void emit()}><FileCheck2 size={17}/>{busy ? "Emitindo..." : armed ? "Confirmar e emitir" : "Emitir novo certificado"}</button>
        </div>
      </div>

      {message && <div className={`certificate-manager-message ${message.tone}`} role="status">{message.tone === "success" ? <CheckCircle2/> : <ShieldCheck/>}<span>{message.text}</span></div>}

      <div className="certificate-style-picker">
        <div><Palette size={19}/><span><strong>Modelo visual do próximo certificado</strong><small>Escolha a arte e ajuste abaixo como ela ocupará a folha.</small></span></div>
        <div className="certificate-style-options">
          {CERTIFICATE_VISUAL_STYLES.map((style) => <button
            key={style.id}
            type="button"
            className={visualStyle === style.id ? "active" : ""}
            onClick={() => { setVisualStyle(style.id); setSelectedId(""); setArmed(false); setMessage(null); }}
          ><span className={`certificate-style-swatch swatch-${style.id}`}><i/><b/></span><strong>{style.name}</strong><small>{style.description}</small></button>)}
        </div>
        <div className="certificate-layout-editor">
          <label><span>Papel</span><select value={layout.paperSize} onChange={(event) => updateLayout({ paperSize: event.target.value as CertificateLayout["paperSize"] })}><option value="a4">A4</option><option value="letter">Carta</option></select></label>
          <label><span>Orientação</span><select value={layout.orientation} onChange={(event) => updateLayout({ orientation: event.target.value as CertificateLayout["orientation"] })}><option value="landscape">Paisagem</option><option value="portrait">Retrato</option></select></label>
          <label><span>Espaçamento</span><select value={layout.spacing} onChange={(event) => updateLayout({ spacing: event.target.value as CertificateLayout["spacing"] })}><option value="compact">Compacto</option><option value="normal">Normal</option><option value="wide">Amplo</option></select></label>
          <div className="certificate-layout-tip"><strong>Evite cortes</strong><span>Para textos longos, várias assinaturas ou logos grandes, use “Compacto”. A prévia abaixo já mostra o resultado real.</span></div>
        </div>
      </div>

      {certificates.length > 0 && <div className="certificate-history"><span>Histórico emitido</span>{certificates.map((certificate) => <button key={certificate.id} className={selected?.id === certificate.id ? "active" : ""} onClick={() => { setSelectedId(certificate.id); setArmed(false); setMessage(null); }}><strong>{certificate.certificateNumber}</strong><small>{certificate.courseName} · {new Date(`${certificate.issuedAt}T12:00:00`).toLocaleDateString("pt-BR")}</small></button>)}</div>}

      <div className="certificate-manager-preview">
        {selected && historicalPreview
          ? <CertificateDocument student={historicalPreview.student} classItem={historicalPreview.classItem} institution={historicalPreview.institution} settings={historicalPreview.settings} visualStyle={historicalPreview.visualStyle} layout={historicalPreview.layout} issuedAt={selected.issuedAt} certificateNumber={selected.certificateNumber} />
          : <div className="certificate-draft-preview"><div className="certificate-preview-label"><strong>PRÉVIA DO PRÓXIMO CERTIFICADO</strong><span>{CERTIFICATE_VISUAL_STYLES.find((item) => item.id === visualStyle)?.name} · {layout.paperSize.toUpperCase()} · {layout.orientation === "landscape" ? "Paisagem" : "Retrato"}</span></div><CertificateDocument student={student} classItem={classItem} institution={database.settings.institution} settings={database.settings.certificate} visualStyle={visualStyle} layout={layout} certificateNumber="PRÉVIA" /></div>}
      </div>
    </section>
  </div>;
}
