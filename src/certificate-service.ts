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

export async function issueCertificate(input: {
  student: Student;
  classItem?: ClassItem;
  institution: InstitutionSettings;
  settings: CertificateSettings;
}) {
  const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
  if (!schoolId) throw new Error("Selecione uma instituição no AulaFácil Cloud para formalizar o certificado.");

  const workloadHours = input.classItem?.workloadHours ?? input.settings.defaultWorkloadHours ?? null;
  const courseName = input.classItem?.name ?? "Curso informado pela instituição";
  const snapshot = {
    studentName: input.student.name,
    studentId: input.student.id,
    courseName,
    workloadHours,
    institution: input.institution,
    certificate: input.settings,
  };

  const { data: templateRows, error: templateError } = await cloud.from("certificate_templates")
    .select("id")
    .eq("school_id", schoolId)
    .eq("is_default", true)
    .is("deleted_at", null)
    .limit(1);
  if (templateError) throw new Error(`Não foi possível localizar o modelo do certificado: ${templateError.message}`);

  const { data, error } = await cloud.rpc("issue_certificate", {
    target_school: schoolId,
    target_student: input.student.id,
    target_class: input.classItem?.id ?? null,
    target_template: templateRows?.[0]?.id ?? null,
    target_course_name: courseName,
    target_workload_hours: workloadHours,
    target_snapshot: snapshot,
  });
  if (error) throw new Error(`Não foi possível emitir o certificado: ${error.message}`);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.certificate_id || !row?.certificate_number) throw new Error("O servidor não retornou o certificado emitido.");

  return {
    id: String(row.certificate_id),
    certificateNumber: String(row.certificate_number),
    issuedAt: String(row.issued_at),
    courseName: String(row.course_name),
    workloadHours: row.workload_hours == null ? null : Number(row.workload_hours),
    snapshot: row.snapshot && typeof row.snapshot === "object" ? row.snapshot : snapshot,
  } satisfies IssuedCertificate;
}

export async function listStudentCertificates(studentId: string): Promise<IssuedCertificate[]> {
  const schoolId = localStorage.getItem(SELECTED_SCHOOL_KEY) ?? "";
  if (!schoolId) return [];
  const { data, error } = await cloud.from("certificates")
    .select("id,certificate_number,issued_at,course_name,workload_hours,snapshot")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .is("deleted_at", null)
    .order("issued_at", { ascending: false });
  if (error) throw new Error(`Não foi possível carregar os certificados: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    certificateNumber: String(row.certificate_number),
    issuedAt: String(row.issued_at),
    courseName: String(row.course_name),
    workloadHours: row.workload_hours == null ? null : Number(row.workload_hours),
    snapshot: row.snapshot && typeof row.snapshot === "object" ? row.snapshot : {},
  }));
}
