import type { Invoice, SchoolDatabase, Student } from "./model";
import { ageGroupFromBirthDate, phoneDigits, phoneError } from "./validation";
import { invoiceAmountDue } from "./finance-utils";

export type StudentContactKind = "student" | "guardian";
export type StudentContactTemplate = "general" | "pending" | "overdue";

export type StudentContactTarget = {
  kind: StudentContactKind;
  name: string;
  phone: string;
  normalizedPhone: string;
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function dateLabel(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function resolveStudentContact(student: Student): StudentContactTarget | null {
  const group = ageGroupFromBirthDate(student.birthDate);
  if (!group) return null;

  if (group === "minor") {
    if (phoneError(student.guardianPhone, true)) return null;
    return {
      kind: "guardian",
      name: student.guardianName.trim() || "responsável",
      phone: student.guardianPhone,
      normalizedPhone: phoneDigits(student.guardianPhone),
    };
  }

  if (phoneError(student.phone, true)) return null;
  return {
    kind: "student",
    name: student.name,
    phone: student.phone,
    normalizedPhone: phoneDigits(student.phone),
  };
}

export function messageForStudentContact(
  database: SchoolDatabase,
  student: Student,
  template: StudentContactTemplate,
  invoice?: Invoice | null,
) {
  const target = resolveStudentContact(student);
  if (!target) return "";
  const school = database.settings.institution.name || database.settings.institution.legalName || "a escola";
  const firstName = target.name.split(/\s+/)[0] || target.name;
  const studentFirstName = student.name.split(/\s+/)[0] || student.name;

  if (!invoice || template === "general") {
    return target.kind === "guardian"
      ? `Olá, ${firstName}! Aqui é da ${school}. Estamos entrando em contato sobre ${studentFirstName}. Como podemos ajudar?`
      : `Olá, ${studentFirstName}! Aqui é da ${school}. Estamos entrando em contato com você. Como podemos ajudar?`;
  }

  const breakdown = invoiceAmountDue(invoice, database.settings.finance);
  const amount = money(breakdown.totalDue);
  const due = dateLabel(invoice.dueDate);
  const reference = invoice.reference;

  if (template === "overdue") {
    return target.kind === "guardian"
      ? `Olá, ${firstName}! Aqui é da ${school}. A mensalidade de ${studentFirstName}, referente a ${reference}, venceu em ${due} e está em aberto. O valor atualizado é ${amount}. Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem.`
      : `Olá, ${studentFirstName}! Aqui é da ${school}. Sua mensalidade referente a ${reference} venceu em ${due} e está em aberto. O valor atualizado é ${amount}. Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem.`;
  }

  return target.kind === "guardian"
    ? `Olá, ${firstName}! Aqui é da ${school}. A mensalidade de ${studentFirstName}, referente a ${reference}, no valor de ${amount}, vence em ${due}. Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem.`
    : `Olá, ${studentFirstName}! Aqui é da ${school}. Sua mensalidade referente a ${reference}, no valor de ${amount}, vence em ${due}. Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem.`;
}

export function whatsappUrl(target: StudentContactTarget, message: string) {
  const phone = target.normalizedPhone.startsWith("55") ? target.normalizedPhone : `55${target.normalizedPhone}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function openStudentWhatsApp(database: SchoolDatabase, student: Student, template: StudentContactTemplate = "general", invoice?: Invoice | null) {
  const target = resolveStudentContact(student);
  if (!target) throw new Error(ageGroupFromBirthDate(student.birthDate) === "minor"
    ? "Cadastre um WhatsApp válido do responsável antes de entrar em contato."
    : "Cadastre um WhatsApp válido do aluno antes de entrar em contato.");
  const message = messageForStudentContact(database, student, template, invoice);
  window.open(whatsappUrl(target, message), "_blank", "noopener,noreferrer");
}
