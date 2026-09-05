import { type FormEvent, type ReactNode } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  makeId,
  type Student,
  type StudentFieldDefinition,
  type StudentFieldSource,
  type StudentFieldType,
  type StudentFieldVisibility,
} from "./model";

const fieldTypes: Array<{ value: StudentFieldType; label: string }> = [
  { value: "text", label: "Texto" },
  { value: "tel", label: "Telefone / WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "date", label: "Data" },
  { value: "number", label: "Número" },
  { value: "textarea", label: "Texto longo / observação" },
];

const visibilityOptions: Array<{ value: StudentFieldVisibility; label: string }> = [
  { value: "always", label: "Sempre mostrar" },
  { value: "minor", label: "Somente se o aluno for menor de 18 anos" },
  { value: "adult", label: "Somente se o aluno tiver 18 anos ou mais" },
];

function ageGroup(birthDate: string): "minor" | "adult" | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const month = today.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age < 18 ? "minor" : "adult";
}

function isVisible(field: StudentFieldDefinition, birthDate: string) {
  if (field.visibility === "always") return true;
  return ageGroup(birthDate) === field.visibility;
}

export function fieldInputName(field: StudentFieldDefinition) {
  return `student-field-${field.id}`;
}

function sourceValue(student: Student, source?: StudentFieldSource) {
  if (!source) return "";
  return student[source] ?? "";
}

export function studentFieldValue(student: Student, field: StudentFieldDefinition) {
  return field.source ? sourceValue(student, field.source) : student.customFields?.[field.id] ?? "";
}

export function collectStudentFields(form: FormData, fields: StudentFieldDefinition[]) {
  const customFields: Record<string, string> = {};
  const sourceValues: Record<StudentFieldSource, string> = {
    phone: "",
    guardianName: "",
    guardianPhone: "",
  };

  for (const field of fields) {
    const value = String(form.get(fieldInputName(field)) ?? "").trim().slice(0, 2000);
    if (field.source) sourceValues[field.source] = value;
    else if (value) customFields[field.id] = value;
  }

  return {
    phone: sourceValues.phone,
    guardianName: sourceValues.guardianName,
    guardianPhone: sourceValues.guardianPhone,
    customFields,
  };
}

function InputForField({ field }: { field: StudentFieldDefinition }) {
  const common = {
    name: fieldInputName(field),
    required: field.required,
    placeholder: field.placeholder,
    maxLength: 2000,
  };

  if (field.type === "textarea") return <textarea {...common} rows={4} />;
  if (field.type === "tel") return <input {...common} type="tel" inputMode="tel" />;
  if (field.type === "email") return <input {...common} type="email" inputMode="email" />;
  if (field.type === "date") return <input {...common} type="date" />;
  if (field.type === "number") return <input {...common} type="number" />;
  return <input {...common} type="text" />;
}

function FieldShell({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "field wide" : "field"}><span>{label}</span>{children}</label>;
}

export function StudentExtraFieldsForm({ fields, birthDate }: { fields: StudentFieldDefinition[]; birthDate: string }) {
  const visible = fields.filter((field) => isVisible(field, birthDate));
  if (!visible.length) return null;

  return <>
    {visible.map((field) => (
      <FieldShell key={field.id} label={`${field.label}${field.required ? " *" : ""}`} wide={field.type === "textarea"}>
        <InputForField field={field} />
      </FieldShell>
    ))}
  </>;
}

export function StudentExtraInfo({ student, fields }: { student: Student; fields: StudentFieldDefinition[] }) {
  const visible = fields.filter((field) => isVisible(field, student.birthDate));
  return <>
    {visible.map((field) => {
      const value = studentFieldValue(student, field);
      return <div className="info-box" key={field.id}><small>{field.label}</small><strong>{value || "Não informado"}</strong></div>;
    })}
  </>;
}

function typeLabel(type: StudentFieldType) {
  return fieldTypes.find((item) => item.value === type)?.label ?? type;
}

function visibilityLabel(visibility: StudentFieldVisibility) {
  return visibilityOptions.find((item) => item.value === visibility)?.label ?? visibility;
}

export function StudentFieldsSettings({
  fields,
  onChange,
}: {
  fields: StudentFieldDefinition[];
  onChange: (fields: StudentFieldDefinition[]) => void;
}) {
  const addField = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const label = String(form.get("label") ?? "").trim().slice(0, 80);
    if (!label) return;

    const type = String(form.get("type") ?? "text") as StudentFieldType;
    const visibility = String(form.get("visibility") ?? "always") as StudentFieldVisibility;
    const placeholder = String(form.get("placeholder") ?? "").trim().slice(0, 120);
    const required = form.get("required") === "on";

    onChange([...fields, {
      id: makeId("campo"),
      label,
      type: fieldTypes.some((item) => item.value === type) ? type : "text",
      required,
      visibility: visibilityOptions.some((item) => item.value === visibility) ? visibility : "always",
      placeholder,
    }]);
    event.currentTarget.reset();
  };

  const updateField = (id: string, change: Partial<StudentFieldDefinition>) => {
    onChange(fields.map((field) => field.id === id ? { ...field, ...change } : field));
  };

  const removeField = (field: StudentFieldDefinition) => {
    if (!window.confirm(`Remover “${field.label}” do formulário? Valores antigos já cadastrados serão preservados no banco.`)) return;
    onChange(fields.filter((item) => item.id !== field.id));
  };

  return <section className="stack">
    <div className="security-hero card">
      <span><ShieldCheck size={30} /></span>
      <div>
        <h2>Cadastro montado pela própria escola</h2>
        <p>Nome do aluno, nascimento e turma permanecem como base do sistema. Todos os demais campos podem ser criados, renomeados, tornados obrigatórios ou removidos.</p>
      </div>
    </div>

    <div className="card" style={{ padding: 24 }}>
      <div className="section-heading">
        <div><h2>Campos atuais</h2><p>As alterações valem imediatamente para os próximos cadastros.</p></div>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {fields.length === 0 && <p className="inline-empty">Nenhum campo extra configurado. O cadastro pedirá apenas nome, nascimento e turma.</p>}
        {fields.map((field) => (
          <div key={field.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1.3fr) minmax(150px, .8fr) minmax(220px, 1fr) auto auto", gap: 10, alignItems: "center", padding: 14, border: "1px solid #e5e7eb", borderRadius: 14 }}>
            <input value={field.label} maxLength={80} aria-label="Nome do campo" onChange={(event) => updateField(field.id, { label: event.target.value })} />
            <select value={field.type} aria-label={`Tipo de ${field.label}`} onChange={(event) => updateField(field.id, { type: event.target.value as StudentFieldType })}>
              {fieldTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={field.visibility} aria-label={`Quando mostrar ${field.label}`} onChange={(event) => updateField(field.id, { visibility: event.target.value as StudentFieldVisibility })}>
              {visibilityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <label style={{ display: "flex", gap: 7, alignItems: "center", whiteSpace: "nowrap" }}><input type="checkbox" checked={field.required} onChange={(event) => updateField(field.id, { required: event.target.checked })} /> Obrigatório</label>
            <button className="quiet-danger" onClick={() => removeField(field)} title={`Remover ${field.label}`}><Trash2 size={17} /></button>
            <input style={{ gridColumn: "1 / 4" }} value={field.placeholder} maxLength={120} placeholder="Exemplo ou orientação exibida dentro do campo" aria-label={`Exemplo de ${field.label}`} onChange={(event) => updateField(field.id, { placeholder: event.target.value })} />
            <small style={{ gridColumn: "4 / 6", color: "#64748b" }}>{typeLabel(field.type)} · {visibilityLabel(field.visibility)}</small>
          </div>
        ))}
      </div>
    </div>

    <div className="card" style={{ padding: 24 }}>
      <div className="section-heading"><div><h2>Adicionar nova informação</h2><p>Ex.: RG do responsável, CPF, endereço, alergias, nome da mãe ou observações.</p></div></div>
      <form className="form-grid" onSubmit={addField}>
        <FieldShell label="Nome do campo" wide><input name="label" maxLength={80} placeholder="Ex.: RG do responsável" required /></FieldShell>
        <FieldShell label="Tipo"><select name="type" defaultValue="text">{fieldTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></FieldShell>
        <FieldShell label="Quando mostrar"><select name="visibility" defaultValue="always">{visibilityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></FieldShell>
        <FieldShell label="Exemplo / dica" wide><input name="placeholder" maxLength={120} placeholder="Ex.: 123456-7" /></FieldShell>
        <label className="field" style={{ justifyContent: "center" }}><span>Validação</span><label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44 }}><input type="checkbox" name="required" /> Campo obrigatório</label></label>
        <div className="form-actions wide"><button className="primary-button" type="submit"><Plus size={18} /> Adicionar campo</button></div>
      </form>
    </div>
  </section>;
}
