import type { ReactNode } from "react";
import { fieldInputName, studentFieldValue } from "./student-fields";
import type { Student, StudentFieldDefinition } from "./model";
import { ageGroupFromBirthDate } from "./validation";

function visible(field: StudentFieldDefinition, birthDate: string) {
  if (field.visibility === "always") return true;
  return ageGroupFromBirthDate(birthDate) === field.visibility;
}

function FieldShell({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? "field wide" : "field"}><span>{label}</span>{children}</label>;
}

function EditInput({ field, value }: { field: StudentFieldDefinition; value: string }) {
  const common = {
    name: fieldInputName(field),
    required: field.required,
    placeholder: field.placeholder,
    maxLength: 2000,
    defaultValue: value,
  };
  if (field.type === "textarea") return <textarea {...common} rows={4} />;
  if (field.type === "tel") return <input {...common} type="tel" inputMode="tel" />;
  if (field.type === "email") return <input {...common} type="email" inputMode="email" />;
  if (field.type === "date") return <input {...common} type="date" />;
  if (field.type === "number") return <input {...common} type="number" />;
  return <input {...common} type="text" />;
}

export function StudentEditExtraFields({ student, fields, birthDate }: { student: Student; fields: StudentFieldDefinition[]; birthDate: string }) {
  const items = fields.filter((field) => visible(field, birthDate));
  if (!items.length) return null;
  return <>
    {items.map((field) => <FieldShell key={field.id} label={`${field.label}${field.required ? " *" : ""}`} wide={field.type === "textarea"}>
      <EditInput field={field} value={studentFieldValue(student, field)} />
    </FieldShell>)}
  </>;
}
