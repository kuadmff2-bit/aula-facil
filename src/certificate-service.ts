import { cloud } from "./cloud";
import type { CertificateSettings, ClassItem, InstitutionSettings, Student } from "./model";

const SELECTED_SCHOOL_KEY = "aulafacil.cloud.selected-school";

export type IssuedCertificate = {
  id: string;
  certificateNumber: string;
  issuedAt: string;
  courseName: string;
  workloadHours: number | null;
  snapshot: Record<string, unknown>;
};

function makeCertificateNumber() {
  const year = new Date().getFullYear();
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
  return `AF-${year}-${random}`;
}

export async function issueCertificate(input: {
  student: Student;
  classItem?: ClassItem;
  institution: InstitutionSettings;
  settings: CertificateSettings;
}) {
  const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
  if (!schoolId) throw new Error("Selecione uma instituição no AulaFácil Cloud para formalizar o certificado.");
  const issuedAt = new Date().toISOString().slice(0, 10);
  const workloadHours = input.classItem?.workloadHours ?? input.settings.defaultWorkloadHours ?? null;
  const certificateNumber = makeCertificateNumber();
  const snapshot = {
    studentName: input.student.name,
    studentId: input.student.id,
    courseName: input.classItem?.name ?? "Curso informado pela instituição",
    workloadHours,
    institution: input.institution,
    certificate: input.settings,
    issuedAt,
    certificateNumber,
  };

  const { data: templateRows, error: templateError } = await cloud.from("certificate_templates")
    .select("id").eq("school_id", schoolId).eq("is_default", true).is("deleted_at", null).limit(1);
  if (templateError) throw new Error(`Não foi possível localizar o modelo do certificado: ${templateError.message}`);

  const { data, error } = await cloud.from("certificates").insert({
    school_id: schoolId,
    student_id: input.student.id,
    class_id: input.classItem?.id ?? null,
    template_id: templateRows?.[0]?.id ?? null,
    certificate_number: certificateNumber,
    course_name: input.classItem?.name ?? "Curso informado pela instituição",
    workload_hours: workloadHours,
    issued_at: issuedAt,
    snapshot,
  }).select("id,certificate_number,issued_at,course_name,workload_hours,snapshot").single();
  if (error) throw new Error(`Não foi possível emitir o certificado: ${error.message}`);

  const { error: studentError } = await cloud.from("students").update({ completed_at: issuedAt, active: false }).eq("school_id", schoolId).eq("id", input.student.id);
  if (studentError) throw new Error(`O certificado foi emitido, mas não foi possível registrar a conclusão do aluno: ${studentError.message}`);

  return {
    id: String(data.id), certificateNumber: String(data.certificate_number), issuedAt: String(data.issued_at),
    courseName: String(data.course_name), workloadHours: data.workload_hours == null ? null : Number(data.workload_hours),
    snapshot: data.snapshot && typeof data.snapshot === "object" ? data.snapshot : snapshot,
  } satisfies IssuedCertificate;
}

export async function listStudentCertificates(studentId: string): Promise<IssuedCertificate[]> {
  const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
  if (!schoolId) return [];
  const { data, error } = await cloud.from("certificates")
    .select("id,certificate_number,issued_at,course_name,workload_hours,snapshot")
    .eq("school_id", schoolId).eq("student_id", studentId).is("deleted_at", null).order("issued_at", { ascending: false });
  if (error) throw new Error(`Não foi possível carregar os certificados: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: String(row.id), certificateNumber: String(row.certificate_number), issuedAt: String(row.issued_at),
    courseName: String(row.course_name), workloadHours: row.workload_hours == null ? null : Number(row.workload_hours),
    snapshot: row.snapshot && typeof row.snapshot === "object" ? row.snapshot : {},
  }));
}
