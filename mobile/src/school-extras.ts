import { supabase } from "./api";

export type MobileClass = {
  id: string;
  name: string;
  groupName: string;
  teacher: string;
  schedule: string;
  room: string;
  monthlyFee: number;
  color: string;
};

export type StudentClassLink = { studentId: string; classId: string };
export type MobileSchoolBrand = { logoUrl: string; primaryColor: string; secondaryColor: string };

const asText = (value: unknown) => typeof value === "string" ? value : "";
const asNumber = (value: unknown) => Number.isFinite(Number(value ?? 0)) ? Number(value ?? 0) : 0;

export async function loadClasses(schoolId: string): Promise<MobileClass[]> {
  const { data, error } = await supabase.from("classes")
    .select("id,name,group_name,teacher,schedule,room,monthly_fee,color,active,deleted_at")
    .eq("school_id", schoolId).eq("active", true).is("deleted_at", null).order("name");
  if (error) throw new Error(`Não foi possível carregar as turmas: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: String(row.id), name: asText(row.name) || "Turma", groupName: asText(row.group_name),
    teacher: asText(row.teacher), schedule: asText(row.schedule), room: asText(row.room),
    monthlyFee: asNumber(row.monthly_fee), color: asText(row.color) || "#377bff",
  }));
}

export async function loadStudentClassLinks(schoolId: string): Promise<StudentClassLink[]> {
  const { data, error } = await supabase.from("students").select("id,class_id,deleted_at")
    .eq("school_id", schoolId).is("deleted_at", null);
  if (error) throw new Error(`Não foi possível relacionar alunos e turmas: ${error.message}`);
  return (data ?? []).flatMap((row: any) => row.class_id ? [{ studentId: String(row.id), classId: String(row.class_id) }] : []);
}

export async function loadSchoolBrand(schoolId: string): Promise<MobileSchoolBrand> {
  const { data, error } = await supabase.from("schools").select("logo_url,primary_color,secondary_color")
    .eq("id", schoolId).single();
  if (error) throw new Error(`Não foi possível carregar a identidade da escola: ${error.message}`);
  return {
    logoUrl: asText(data?.logo_url),
    primaryColor: asText(data?.primary_color) || "#377bff",
    secondaryColor: asText(data?.secondary_color) || "#f2b134",
  };
}
