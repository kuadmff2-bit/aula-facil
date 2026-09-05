import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  DatabaseBackup,
  FileCheck2,
  FileText,
  HardDrive,
  LayoutDashboard,
  List,
  Megaphone,
  PanelsTopLeft,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import {
  emptyDatabase,
  makeId,
  type ClassItem,
  type Invoice,
  type InvoiceStatus,
  type Payment,
  type SchoolDatabase,
  type Student,
  type View,
  type Weekday,
} from "./model";
import { loadDatabase, saveDatabase } from "./storage";
import { collectStudentFields, StudentExtraFieldsForm, StudentFieldsSettings } from "./student-fields";
import { StudentEditExtraFields } from "./student-edit-fields";
import { ReceiptDocument } from "./receipt-document";
import { AppearanceSettings } from "./appearance-settings";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { InstitutionSettingsPanel, FinanceSettingsPanel, DocumentSettingsPanel } from "./professional-settings";
import { CloudAccountPanel } from "./cloud-account";
import { PaymentConnectionsPanel } from "./payment-connections-panel";
import { FinanceUltimate } from "./finance-ultimate";
import { CloudSyncPanel } from "./cloud-sync-panel";
import { MessageAutomationsPanel } from "./message-automations-panel";
import { invoiceAmountDue } from "./finance-utils";
import { CertificateManager } from "./certificate-manager";
import { BackupPanel } from "./backup-panel";
import { SchoolBrand } from "./school-brand";
import { ClassRosterBoard } from "./class-roster-board";
import { StudentDetailsPanel } from "./student-details-panel";
import {
  buildFixedCoursePlan,
  ensureOpenEndedInvoiceForMonth,
  pauseEnrollment,
  rescheduleFutureInvoices,
  resumeEnrollment,
} from "./enrollment-plan";
import { confirmManualInvoicePayment, reopenInvoicePayment } from "./manual-payment";
import { getCloudSyncStatus, safePullFromCloud } from "./cloud-safe-sync";
import { birthDateError, genericDateError, localTodayIso, MIN_REASONABLE_DATE, phoneError } from "./validation";
import "./app-next.css";

type ModalKind = "student" | "student-edit" | "class" | "invoice" | "notice" | "pause" | null;
type Toast = { message: string; tone: "success" | "warning" | "danger" };
type Printable = { type: "Declaração" | "Recibo"; student: Student; invoice?: Invoice; payment?: Payment } | null;
type BatchPayment = { studentId: string; invoiceIds: string[] } | null;

type ClassLayout = "cards" | "table";

const navItems = [
  { id: "dashboard" as View, label: "Início", icon: LayoutDashboard },
  { id: "students" as View, label: "Alunos", icon: Users },
  { id: "classes" as View, label: "Turmas", icon: BookOpen },
  { id: "attendance" as View, label: "Chamada", icon: ClipboardCheck },
  { id: "finance" as View, label: "Financeiro", icon: WalletCards },
  { id: "notices" as View, label: "Avisos", icon: Megaphone },
  { id: "backup" as View, label: "Backup", icon: DatabaseBackup },
  { id: "settings" as View, label: "Configurações", icon: Settings2 },
];

const viewCopy: Record<View, { title: string; description: string }> = {
  dashboard: { title: "Visão geral", description: "O que precisa da sua atenção hoje." },
  students: { title: "Alunos", description: "Cadastro, curso e financeiro em um só lugar." },
  classes: { title: "Turmas", description: "Cursos, horários, duração e distribuição de alunos." },
  attendance: { title: "Chamada geral", description: "Veja as turmas do dia como uma planilha e marque a presença." },
  finance: { title: "Financeiro", description: "Acompanhe mensalidades, pagamentos e atrasos." },
  notices: { title: "Avisos", description: "Organize comunicados para alunos e responsáveis." },
  backup: { title: "Proteção dos dados", description: "Faça cópias e restaure o sistema com segurança." },
  settings: { title: "Personalização", description: "Adapte o AulaFácil à realidade da sua instituição." },
};

const classColors = ["#1649b8", "#8b5cf6", "#d97706", "#059669", "#e11d48", "#0891b2"];
const WEEKDAYS: Array<{ id: Weekday; label: string }> = [
  { id: "monday", label: "Seg" }, { id: "tuesday", label: "Ter" }, { id: "wednesday", label: "Qua" },
  { id: "thursday", label: "Qui" }, { id: "friday", label: "Sex" }, { id: "saturday", label: "Sáb" }, { id: "sunday", label: "Dom" },
];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function localReceiptNumber() {
  return `LOCAL-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function effectiveStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.status === "paid" || invoice.status === "cancelled" || invoice.status === "negotiated") return invoice.status;
  return invoice.dueDate < localTodayIso() ? "overdue" : "pending";
}

function statusLabel(status: InvoiceStatus) {
  if (status === "paid") return "Pago";
  if (status === "overdue") return "Atrasado";
  if (status === "cancelled") return "Cancelado";
  if (status === "negotiated") return "Renegociado";
  return "Pendente";
}

function formValue(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function scheduleText(days: Weekday[], startTime: string, endTime: string) {
  const labels = days.map((day) => WEEKDAYS.find((item) => item.id === day)?.label).filter(Boolean).join(", ");
  const time = startTime && endTime ? `${startTime}–${endTime}` : startTime || endTime;
  return [labels, time].filter(Boolean).join(" · ") || "Horário não informado";
}

function classDurationLabel(item: ClassItem) {
  return (item.durationType ?? "open_ended") === "fixed" ? `${item.durationMonths ?? "—"} meses` : "Sem prazo definido";
}

function paymentForInvoice(database: SchoolDatabase, invoiceId: string) {
  return database.payments
    .filter((item) => item.invoiceId === invoiceId && item.status === "confirmed")
    .sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt))[0] ?? null;
}

export default function AppNext() {
  const [database, setDatabase] = useState<SchoolDatabase>(() => loadDatabase());
  const [view, setView] = useState<View>("dashboard");
  const [modal, setModal] = useState<ModalKind>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [classLayout, setClassLayout] = useState<ClassLayout>("table");
  const [attendanceDate, setAttendanceDate] = useState(localTodayIso());
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmation, setConfirmation] = useState<(ConfirmRequest & { onConfirm: () => void }) | null>(null);
  const [printable, setPrintable] = useState<Printable>(null);
  const [certificateStudentId, setCertificateStudentId] = useState("");
  const [studentBirthDate, setStudentBirthDate] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [classDurationType, setClassDurationType] = useState<"fixed" | "open_ended">("open_ended");
  const [batchPayment, setBatchPayment] = useState<BatchPayment>(null);
  const [batchMethod, setBatchMethod] = useState("dinheiro");
  const [busy, setBusy] = useState(false);

  useEffect(() => saveDatabase(database), [database]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const appearance = database.settings.appearance ?? "system";
      const resolved = appearance === "system" ? (media.matches ? "dark" : "light") : appearance;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [database.settings.appearance]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const storageFailure = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setConfirmation({ title: "Falha ao salvar os dados", message: detail?.message ?? "O armazenamento protegido não respondeu.", detail: "Faça um backup antes de fechar o aplicativo.", confirmLabel: "Entendi", cancelLabel: "Fechar", tone: "warning", onConfirm: () => undefined });
    };
    const contactError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setToast({ message: detail?.message ?? "Contato indisponível.", tone: "warning" });
    };
    window.addEventListener("aulafacil:storage-failure", storageFailure);
    window.addEventListener("aulafacil:contact-error", contactError);
    return () => {
      window.removeEventListener("aulafacil:storage-failure", storageFailure);
      window.removeEventListener("aulafacil:contact-error", contactError);
    };
  }, []);

  const classById = useMemo(() => new Map(database.classes.map((item) => [item.id, item])), [database.classes]);
  const studentById = useMemo(() => new Map(database.students.map((item) => [item.id, item])), [database.students]);
  const selectedStudent = selectedStudentId ? studentById.get(selectedStudentId) ?? null : null;

  const notify = (message: string, tone: Toast["tone"] = "success") => setToast({ message, tone });
  const updateDatabase = (change: (draft: SchoolDatabase) => void) => setDatabase((current) => {
    const next = structuredClone(current);
    change(next);
    next.updatedAt = new Date().toISOString();
    return next;
  });
  const confirmAction = (request: ConfirmRequest, action: () => void) => setConfirmation({ ...request, onConfirm: action });

  const changeView = (next: View) => {
    setView(next);
    setModal(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openStudent = (studentId: string) => {
    setSelectedStudentId(studentId);
    setModal(null);
  };

  const openStudentForm = () => {
    if (!database.classes.length) {
      notify("Cadastre uma turma antes do primeiro aluno.", "warning");
      setClassDurationType("open_ended");
      setModal("class");
      return;
    }
    setStudentBirthDate("");
    setModal("student");
  };

  const openStudentEdit = () => {
    if (!selectedStudent) return;
    setEditBirthDate(selectedStudent.birthDate);
    setModal("student-edit");
  };

  const addClass = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = formValue(form, "name");
    const groupName = formValue(form, "groupName");
    const teacher = formValue(form, "teacher");
    const room = formValue(form, "room") || "Sala 1";
    const startTime = formValue(form, "startTime");
    const endTime = formValue(form, "endTime");
    const meetingDays = WEEKDAYS.filter((day) => form.get(`day-${day.id}`) === "on").map((day) => day.id);
    const monthlyFee = Number(formValue(form, "monthlyFee"));
    const durationMonths = classDurationType === "fixed" ? Number(formValue(form, "durationMonths")) : null;
    const workloadHours = Number(formValue(form, "workloadHours")) || null;
    if (name.length < 2 || teacher.length < 2 || !startTime || !endTime || startTime >= endTime || !meetingDays.length || !Number.isFinite(monthlyFee) || monthlyFee < 0) {
      notify("Revise nome, professor, dias, horário e mensalidade da turma.", "danger");
      return;
    }
    if (classDurationType === "fixed" && (!Number.isInteger(durationMonths) || Number(durationMonths) < 1 || Number(durationMonths) > 240)) {
      notify("Informe uma duração entre 1 e 240 meses.", "danger");
      return;
    }
    updateDatabase((draft) => draft.classes.push({
      id: makeId("turma"), name, groupName, teacher, room, meetingDays, startTime, endTime,
      schedule: scheduleText(meetingDays, startTime, endTime), monthlyFee,
      durationType: classDurationType, durationMonths: classDurationType === "fixed" ? Number(durationMonths) : null,
      workloadHours, color: classColors[draft.classes.length % classColors.length], createdAt: new Date().toISOString(),
    }));
    setModal(null);
    notify("Turma cadastrada com horário e duração definidos.");
  };

  const addStudent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = formValue(form, "name");
    const birthDate = formValue(form, "birthDate");
    const documentNumber = formValue(form, "documentNumber");
    const classId = formValue(form, "classId");
    const dueDay = Number(formValue(form, "dueDay"));
    const enrollmentStartDate = formValue(form, "enrollmentStartDate") || localTodayIso();
    const extraFields = collectStudentFields(form, database.settings.studentFields);
    const birthError = birthDateError(birthDate);
    const studentPhoneError = phoneError(extraFields.phone, false);
    const guardianPhoneError = phoneError(extraFields.guardianPhone, false);
    if (name.length < 3 || birthError || studentPhoneError || guardianPhoneError || !classById.has(classId) || !Number.isInteger(dueDay) || !database.settings.finance.allowedDueDays.includes(dueDay) || genericDateError(enrollmentStartDate)) {
      notify(birthError || studentPhoneError || guardianPhoneError || "Preencha os dados obrigatórios com valores válidos.", "danger");
      return;
    }
    let generated = 0;
    updateDatabase((draft) => {
      const student: Student = {
        id: makeId("aluno"), name, birthDate, documentNumber, classId, dueDay, enrollmentStartDate,
        enrollmentStatus: "active", pausedAt: null, pauseReason: "", ...extraFields,
        active: true, completedAt: null, createdAt: new Date().toISOString(),
      };
      draft.students.push(student);
      const classItem = draft.classes.find((item) => item.id === classId);
      if (!classItem) return;
      if ((classItem.durationType ?? "open_ended") === "fixed") {
        const plan = buildFixedCoursePlan(draft, student, classItem);
        draft.invoices.push(...plan);
        generated = plan.length;
      } else {
        const firstInvoice = ensureOpenEndedInvoiceForMonth(draft, student, classItem, enrollmentStartDate.slice(0, 7));
        if (firstInvoice) { draft.invoices.push(firstInvoice); generated = 1; }
      }
    });
    setModal(null);
    notify(generated > 1 ? `Aluno matriculado. As ${generated} mensalidades do curso já foram criadas.` : "Aluno matriculado e primeira mensalidade preparada.");
  };

  const editStudent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStudent) return;
    const form = new FormData(event.currentTarget);
    const name = formValue(form, "name");
    const birthDate = formValue(form, "birthDate");
    const documentNumber = formValue(form, "documentNumber");
    const classId = formValue(form, "classId");
    const dueDay = Number(formValue(form, "dueDay"));
    const extraFields = collectStudentFields(form, database.settings.studentFields);
    const birthError = birthDateError(birthDate);
    const studentPhoneError = phoneError(extraFields.phone, false);
    const guardianPhoneError = phoneError(extraFields.guardianPhone, false);
    if (name.length < 3 || birthError || studentPhoneError || guardianPhoneError || !classById.has(classId) || !Number.isInteger(dueDay) || !database.settings.finance.allowedDueDays.includes(dueDay)) {
      notify(birthError || studentPhoneError || guardianPhoneError || "Revise os dados do aluno.", "danger");
      return;
    }
    let rescheduled = 0;
    const classChanged = classId !== selectedStudent.classId;
    updateDatabase((draft) => {
      const target = draft.students.find((item) => item.id === selectedStudent.id);
      if (!target) return;
      const oldDueDay = target.dueDay;
      Object.assign(target, { name, birthDate, documentNumber, classId, ...extraFields });
      if (oldDueDay !== dueDay) rescheduled = rescheduleFutureInvoices(draft, target.id, dueDay);
      else target.dueDay = dueDay;
    });
    setModal(null);
    notify(classChanged ? `Cadastro atualizado. As cobranças antigas foram preservadas; ${rescheduled} vencimento${rescheduled === 1 ? "" : "s"} futuro${rescheduled === 1 ? "" : "s"} foi ajustado.` : `Cadastro atualizado${rescheduled ? ` e ${rescheduled} mensalidade${rescheduled === 1 ? "" : "s"} futura${rescheduled === 1 ? "" : "s"} foi${rescheduled === 1 ? "" : "ram"} para o novo vencimento` : ""}.`);
  };

  const addInvoice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const studentId = formValue(form, "studentId");
    const reference = formValue(form, "reference");
    const dueDate = formValue(form, "dueDate");
    const amount = Number(formValue(form, "amount"));
    const dateError = genericDateError(dueDate);
    if (!studentById.has(studentId) || !reference || dateError || !Number.isFinite(amount) || amount <= 0) {
      notify(dateError || "Revise os dados da cobrança.", "danger");
      return;
    }
    if (database.invoices.some((item) => item.studentId === studentId && item.reference.toLowerCase() === reference.toLowerCase() && item.status !== "cancelled")) {
      notify("Já existe uma cobrança ativa com essa referência para este aluno.", "warning");
      return;
    }
    updateDatabase((draft) => draft.invoices.push({
      id: makeId("cobranca"), studentId, reference, dueDate, amount,
      status: dueDate < localTodayIso() ? "overdue" : "pending", paidAt: null,
      installmentNumber: null, planGenerated: false, cancelledAt: null, cancellationReason: "", createdAt: new Date().toISOString(),
    }));
    setModal(null);
    notify("Cobrança criada.");
  };

  const savePause = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStudent) return;
    const reason = formValue(new FormData(event.currentTarget), "reason");
    let cancelled = 0;
    updateDatabase((draft) => { cancelled = pauseEnrollment(draft, selectedStudent.id, reason || "Matrícula trancada a pedido do aluno/responsável"); });
    setModal(null);
    notify(`Matrícula trancada. ${cancelled} mensalidade${cancelled === 1 ? "" : "s"} futura${cancelled === 1 ? "" : "s"} foi${cancelled === 1 ? "" : "ram"} cancelada${cancelled === 1 ? "" : "s"}; débitos anteriores foram preservados.`, "warning");
  };

  const reactivateStudent = () => {
    if (!selectedStudent) return;
    updateDatabase((draft) => { resumeEnrollment(draft, selectedStudent.id); });
    notify("Matrícula reativada. Mensalidades canceladas durante o trancamento continuam preservadas no histórico.");
  };

  const cancelInvoice = (invoice: Invoice) => {
    if (invoice.status === "paid") return;
    confirmAction({ title: "Cancelar mensalidade?", message: `${invoice.reference} será cancelada, mas continuará visível no histórico.`, confirmLabel: "Cancelar mensalidade", tone: "warning" }, () => {
      updateDatabase((draft) => {
        const target = draft.invoices.find((item) => item.id === invoice.id);
        if (!target || target.status === "paid") return;
        target.status = "cancelled";
        target.cancelledAt = new Date().toISOString();
        target.cancellationReason = "Cancelada manualmente pela escola";
      });
      notify("Mensalidade cancelada sem apagar o histórico.", "warning");
    });
  };

  const reopenPayment = (invoice: Invoice) => {
    confirmAction({ title: "Reabrir este pagamento?", message: `A mensalidade ${invoice.reference} voltará a ficar em aberto.`, detail: "A baixa anterior será preservada no histórico como cancelada para auditoria.", confirmLabel: "Reabrir pagamento", tone: "warning" }, () => void (async () => {
      const schoolId = localStorage.getItem("aulafacil.cloud.selected-school") ?? "";
      setBusy(true);
      try {
        if (schoolId) {
          const status = await getCloudSyncStatus(schoolId, database);
          if (status !== "synced") throw new Error("Sincronize este computador antes de reabrir o pagamento.");
          await reopenInvoicePayment({ schoolId, invoiceId: invoice.id, reason: "Pagamento marcado como pago por engano" });
          setDatabase(await safePullFromCloud(schoolId, database.settings.appearance));
        } else {
          updateDatabase((draft) => {
            const target = draft.invoices.find((item) => item.id === invoice.id);
            if (!target) return;
            const payment = draft.payments.filter((item) => item.invoiceId === invoice.id && item.status === "confirmed").sort((a, b) => (b.paidAt ?? b.createdAt).localeCompare(a.paidAt ?? a.createdAt))[0];
            if (payment) {
              payment.status = "cancelled";
              payment.reversedAt = new Date().toISOString();
              payment.reversalReason = "Pagamento marcado como pago por engano";
              payment.notes = `${payment.notes ? `${payment.notes} | ` : ""}Baixa reaberta; histórico preservado.`;
            }
            target.status = target.dueDate < localTodayIso() ? "overdue" : "pending";
            target.paidAt = null;
          });
        }
        notify("Pagamento reaberto. A baixa anterior continua registrada no histórico.", "warning");
      } catch (error) {
        notify(error instanceof Error ? error.message : "Não foi possível reabrir o pagamento.", "danger");
      } finally { setBusy(false); }
    })());
  };

  const confirmBatchPayment = () => void (async () => {
    if (!batchPayment || busy) return;
    const invoices = batchPayment.invoiceIds.map((id) => database.invoices.find((item) => item.id === id)).filter((item): item is Invoice => Boolean(item)).filter((item) => ["pending", "overdue"].includes(effectiveStatus(item)));
    if (!invoices.length) { setBatchPayment(null); return; }
    const schoolId = localStorage.getItem("aulafacil.cloud.selected-school") ?? "";
    setBusy(true);
    try {
      if (schoolId) {
        const syncStatus = await getCloudSyncStatus(schoolId, database);
        if (syncStatus !== "synced") throw new Error("Sincronize este computador antes de receber várias mensalidades.");
        for (const invoice of invoices) await confirmManualInvoicePayment({ schoolId, invoiceId: invoice.id, method: batchMethod, discount: 0, notes: invoices.length > 1 ? "Pagamento em lote pelo cadastro do aluno" : undefined });
        setDatabase(await safePullFromCloud(schoolId, database.settings.appearance));
      } else {
        const now = new Date().toISOString();
        updateDatabase((draft) => {
          for (const source of invoices) {
            const target = draft.invoices.find((item) => item.id === source.id);
            if (!target || target.status === "paid" || target.status === "cancelled" || target.status === "negotiated") continue;
            const breakdown = invoiceAmountDue(target, draft.settings.finance);
            target.status = "paid";
            target.paidAt = now;
            draft.payments.push({
              id: makeId("pagamento"), studentId: target.studentId, invoiceId: target.id, negotiationInstallmentId: null,
              amountReceived: breakdown.totalDue, principalAmount: breakdown.baseAmount, lateFeeAmount: breakdown.lateFee, interestAmount: breakdown.interest,
              discountAmount: 0, paymentMethod: batchMethod, provider: null, providerPaymentId: null, status: "confirmed", paidAt: now,
              receiptNumber: localReceiptNumber(), notes: invoices.length > 1 ? "Pagamento em lote registrado em modo local/offline." : "Pagamento local/offline.",
              reversedAt: null, reversalReason: "", createdAt: now,
            });
          }
        });
      }
      const total = invoices.reduce((sum, invoice) => sum + invoiceAmountDue(invoice, database.settings.finance).totalDue, 0);
      setBatchPayment(null);
      notify(`${invoices.length} mensalidade${invoices.length === 1 ? "" : "s"} recebida${invoices.length === 1 ? "" : "s"}. Total: ${money(total)}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível registrar o pagamento em lote.", "danger");
    } finally { setBusy(false); }
  })();

  const saveClassAttendance = (classId: string, date: string, marks: Record<string, "present" | "absent">) => {
    updateDatabase((draft) => {
      const ids = new Set(Object.keys(marks));
      draft.attendance = draft.attendance.filter((item) => !(item.classId === classId && item.date === date && ids.has(item.studentId)));
      for (const [studentId, status] of Object.entries(marks)) draft.attendance.push({ id: makeId("presenca"), studentId, classId, date, status });
    });
    notify("Chamada salva.");
  };

  const deleteStudent = (student: Student) => confirmAction({ title: "Excluir aluno?", message: `O cadastro de ${student.name} e os registros locais vinculados serão removidos.`, detail: "Prefira trancar a matrícula quando precisar preservar o histórico.", confirmLabel: "Excluir definitivamente", tone: "danger" }, () => {
    updateDatabase((draft) => {
      draft.students = draft.students.filter((item) => item.id !== student.id);
      draft.invoices = draft.invoices.filter((item) => item.studentId !== student.id);
      draft.attendance = draft.attendance.filter((item) => item.studentId !== student.id);
      draft.grades = draft.grades.filter((item) => item.studentId !== student.id);
    });
    setSelectedStudentId("");
    notify("Aluno removido.", "warning");
  });

  const deleteClass = (classItem: ClassItem) => {
    if (database.students.some((student) => student.classId === classItem.id)) { notify("Mova ou remova os alunos desta turma antes de excluí-la.", "warning"); return; }
    confirmAction({ title: "Excluir turma?", message: `${classItem.name}${classItem.groupName ? ` · ${classItem.groupName}` : ""} será removida.`, confirmLabel: "Excluir turma", tone: "danger" }, () => updateDatabase((draft) => { draft.classes = draft.classes.filter((item) => item.id !== classItem.id); }));
  };

  const addNotice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = formValue(form, "title");
    const message = formValue(form, "message");
    if (!title || !message) { notify("Escreva o título e a mensagem.", "danger"); return; }
    updateDatabase((draft) => draft.notices.unshift({ id: makeId("aviso"), title, message, audience: formValue(form, "audience") || "Todos", publishedAt: new Date().toISOString() }));
    setModal(null);
    notify("Aviso salvo.");
  };

  const activeStudents = database.students.filter((item) => (item.enrollmentStatus ?? (item.active ? "active" : "paused")) === "active");
  const openInvoices = database.invoices.filter((item) => { const status = effectiveStatus(item); return status === "pending" || status === "overdue"; });
  const overdueInvoices = database.invoices.filter((item) => effectiveStatus(item) === "overdue");
  const confirmedPayments = database.payments.filter((item) => item.status === "confirmed");
  const receivedTotal = confirmedPayments.reduce((sum, item) => sum + item.amountReceived, 0);
  const pendingTotal = openInvoices.reduce((sum, item) => sum + invoiceAmountDue(item, database.settings.finance).totalDue, 0);
  const todayAttendance = database.attendance.filter((item) => item.date === localTodayIso());
  const attendanceRate = todayAttendance.length ? Math.round(todayAttendance.filter((item) => item.status === "present").length / todayAttendance.length * 100) : null;

  const filteredStudents = database.students.filter((student) => {
    const classItem = classById.get(student.classId);
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return (classFilter === "all" || student.classId === classFilter) && (!query || `${student.name} ${student.documentNumber ?? ""} ${student.phone} ${student.guardianName} ${student.guardianPhone} ${classItem?.name ?? ""} ${classItem?.groupName ?? ""}`.toLocaleLowerCase("pt-BR").includes(query));
  });

  const currentPaymentInvoices = batchPayment?.invoiceIds.map((id) => database.invoices.find((item) => item.id === id)).filter((item): item is Invoice => Boolean(item)) ?? [];
  const currentPaymentTotal = currentPaymentInvoices.reduce((sum, item) => sum + invoiceAmountDue(item, database.settings.finance).totalDue, 0);

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => changeView("dashboard")} aria-label="Ir para o início"><SchoolBrand institution={database.settings.institution}/></button>
      <div className="nav-label">GESTÃO</div>
      <nav className="main-nav">{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => changeView(item.id)}><item.icon size={20}/><span>{item.label}</span>{item.id === "finance" && overdueInvoices.length > 0 && <b>{overdueInvoices.length}</b>}</button>)}</nav>
      <div className="sidebar-foot"><div className="local-status"><HardDrive size={18}/><span><strong>Cópia local protegida</strong><small>Criptografada no Windows</small></span><CheckCircle2 size={17}/></div><div className="version">AulaFácil Desktop <span>v0.3.0</span></div></div>
    </aside>

    <main className="workspace">
      <header className="topbar"><div><h1>{viewCopy[view].title}</h1><p>{viewCopy[view].description}</p></div><div className="top-actions"><span className="offline-pill"><ShieldCheck size={16}/> Dados protegidos</span><button className="icon-button" onClick={() => changeView("notices")} aria-label="Abrir avisos"><Bell size={20}/>{database.notices.length > 0 && <i/>}</button></div></header>
      <div className="page-content">
        {view === "dashboard" && <section className="stack">
          <div className="metric-grid"><Metric label="Alunos ativos" value={String(activeStudents.length)} helper={`${database.classes.length} turma${database.classes.length === 1 ? "" : "s"}`} icon={Users} tone="blue"/><Metric label="Recebido" value={money(receivedTotal)} helper="Pagamentos confirmados" icon={CircleDollarSign} tone="green"/><Metric label="Em aberto" value={money(pendingTotal)} helper={`${overdueInvoices.length} atrasada${overdueInvoices.length === 1 ? "" : "s"}`} icon={Clock3} tone={overdueInvoices.length ? "red" : "amber"}/><Metric label="Presença hoje" value={attendanceRate === null ? "—" : `${attendanceRate}%`} helper="Chamadas registradas" icon={CalendarCheck2} tone="violet"/></div>
          <div className="dashboard-grid"><div className="card quick-card"><div className="section-heading"><div><h2>Ações rápidas</h2><p>Atalhos da secretaria.</p></div></div><div className="quick-actions"><button onClick={openStudentForm}><span className="blue"><UserPlus/></span><div><strong>Novo aluno</strong><small>Matricular e gerar plano</small></div><ChevronRight/></button><button onClick={() => changeView("attendance")}><span className="violet"><ClipboardCheck/></span><div><strong>Fazer chamada</strong><small>Planilha de todas as turmas</small></div><ChevronRight/></button><button onClick={() => changeView("finance")}><span className="green"><WalletCards/></span><div><strong>Mensalidades</strong><small>Receber e negociar</small></div><ChevronRight/></button><button onClick={() => { setClassDurationType("open_ended"); setModal("class"); }}><span className="amber"><BookOpen/></span><div><strong>Nova turma</strong><small>Curso e horário</small></div><ChevronRight/></button></div></div><div className="card attention-card"><div className="section-heading"><div><h2>Precisa de atenção</h2><p>Mensalidades atrasadas.</p></div>{overdueInvoices.length > 0 && <span className="count-badge">{overdueInvoices.length}</span>}</div>{overdueInvoices.slice(0,5).map((invoice) => <button key={invoice.id} onClick={() => openStudent(invoice.studentId)}><span className="warning-icon"><AlertTriangle size={18}/></span><div><strong>{studentById.get(invoice.studentId)?.name ?? "Aluno"}</strong><small>{invoice.reference} · venceu {dateLabel(invoice.dueDate)}</small></div><b>{money(invoiceAmountDue(invoice,database.settings.finance).totalDue)}</b></button>)}{!overdueInvoices.length && <div className="compact-empty"><CheckCircle2/><strong>Nenhuma cobrança atrasada</strong><span>As pendências aparecerão aqui.</span></div>}</div></div>
        </section>}

        {view === "students" && <section className="stack">
          <PageHeader title={`${database.students.length} aluno${database.students.length === 1 ? "" : "s"}`} subtitle="Clique em um aluno para editar cadastro, mensalidades, trancamento e contato." action="Novo aluno" icon={UserPlus} onAction={openStudentForm}/>
          <div className="toolbar card"><label className="search-box"><Search size={19}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por aluno, CPF, telefone ou turma"/></label><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="all">Todas as turmas</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.groupName ? ` · ${item.groupName}` : ""}</option>)}</select></div>
          {filteredStudents.length ? <div className="card table-card"><table><thead><tr><th>Aluno</th><th>Turma</th><th>Contato</th><th>Vencimento</th><th>Situação</th><th/></tr></thead><tbody>{filteredStudents.map((student) => {
            const classItem = classById.get(student.classId); const enrollment = student.enrollmentStatus ?? (student.active ? "active" : "paused");
            return <tr key={student.id} onClick={() => openStudent(student.id)}><td><div className="person"><span>{initials(student.name)}</span><div><strong>{student.name}</strong><small>{student.documentNumber || `Nascimento: ${dateLabel(student.birthDate)}`}</small></div></div></td><td>{classItem?.name ?? "Sem turma"}{classItem?.groupName ? <small className="table-sub">{classItem.groupName}</small> : null}</td><td>{student.phone || student.guardianPhone || "Não informado"}</td><td>{student.dueDay ? `Dia ${student.dueDay}` : "Padrão"}</td><td><span className={`status ${enrollment === "active" ? "active" : enrollment === "completed" ? "paid" : "cancelled"}`}>{enrollment === "active" ? "Ativo" : enrollment === "completed" ? "Concluído" : "Trancado"}</span></td><td><ChevronRight size={19}/></td></tr>;
          })}</tbody></table></div> : <EmptyState icon={Users} title={database.students.length ? "Nenhum resultado" : "Nenhum aluno cadastrado"} text={database.students.length ? "Tente outra busca." : "Cadastre o primeiro aluno para começar."} action={database.students.length ? undefined : "Cadastrar primeiro aluno"} onAction={openStudentForm}/>} 
        </section>}

        {view === "classes" && <section className="stack">
          <PageHeader title={`${database.classes.length} turma${database.classes.length === 1 ? "" : "s"}`} subtitle="Organize várias turmas do mesmo curso por dias e horários." action="Nova turma" icon={Plus} onAction={() => { setClassDurationType("open_ended"); setModal("class"); }} secondaryAction={classLayout === "table" ? "Ver cartões" : "Ver planilha"} onSecondary={() => setClassLayout((current) => current === "table" ? "cards" : "table")}/>
          {database.classes.length ? classLayout === "table" ? <div className="card table-card class-sheet"><table><thead><tr><th>Curso / turma</th><th>Dias</th><th>Horário</th><th>Professor</th><th>Alunos</th><th>Duração</th><th>Mensalidade</th><th/></tr></thead><tbody>{database.classes.slice().sort((a,b) => `${a.startTime ?? "99:99"}${a.name}`.localeCompare(`${b.startTime ?? "99:99"}${b.name}`)).map((item) => {
            const count = database.students.filter((student) => student.classId === item.id && student.active).length;
            return <tr key={item.id}><td><strong>{item.name}</strong><small className="table-sub">{item.groupName || item.room}</small></td><td>{(item.meetingDays ?? []).map((day) => WEEKDAYS.find((d) => d.id === day)?.label).filter(Boolean).join(", ") || "—"}</td><td>{item.startTime && item.endTime ? `${item.startTime}–${item.endTime}` : item.schedule}</td><td>{item.teacher}</td><td>{count}</td><td>{classDurationLabel(item)}</td><td>{money(item.monthlyFee)}</td><td><button className="quiet-danger" onClick={() => deleteClass(item)} title="Excluir turma"><Trash2 size={16}/></button></td></tr>;
          })}</tbody></table></div> : <div className="class-grid">{database.classes.map((item) => { const count = database.students.filter((student) => student.classId === item.id && student.active).length; return <article className="class-card card" key={item.id}><div className="class-stripe" style={{ background:item.color }}/><div className="class-top"><span className="class-icon" style={{ color:item.color,background:`${item.color}12` }}><BookOpen size={22}/></span><button className="quiet-danger" onClick={() => deleteClass(item)}><Trash2 size={17}/></button></div><h3>{item.name}</h3><p>{item.groupName || item.teacher}</p><dl><div><dt>Horário</dt><dd>{item.schedule}</dd></div><div><dt>Alunos</dt><dd>{count}</dd></div><div><dt>Duração</dt><dd>{classDurationLabel(item)}</dd></div><div><dt>Mensalidade</dt><dd>{money(item.monthlyFee)}</dd></div></dl><button className="card-link" onClick={() => { setAttendanceDate(localTodayIso()); changeView("attendance"); }}>Abrir chamada <ChevronRight size={17}/></button></article>; })}</div> : <EmptyState icon={BookOpen} title="Nenhuma turma" text="Cadastre curso, horário, duração e mensalidade." action="Cadastrar primeira turma" onAction={() => setModal("class")}/>} 
        </section>}

        {view === "attendance" && <ClassRosterBoard database={database} date={attendanceDate} onDateChange={setAttendanceDate} onSaveAttendance={saveClassAttendance}/>} 
        {view === "finance" && <FinanceUltimate database={database} onChange={setDatabase} onReceipt={(student,invoice,payment) => setPrintable({ type:"Recibo", student, invoice, payment })}/>} 
        {view === "notices" && <section className="stack"><PageHeader title="Mural de avisos" subtitle="Comunicados preparados pela secretaria." action="Novo aviso" icon={Plus} onAction={() => setModal("notice")}/>{database.notices.length ? <div className="notice-grid">{database.notices.map((notice) => <article className="card notice-card" key={notice.id}><div><span className="audience">{notice.audience}</span><time>{new Date(notice.publishedAt).toLocaleDateString("pt-BR")}</time></div><h3>{notice.title}</h3><p>{notice.message}</p><button className="quiet-danger" onClick={() => confirmAction({ title:"Excluir aviso?", message:`O aviso “${notice.title}” será removido.`, confirmLabel:"Excluir aviso", tone:"danger" }, () => updateDatabase((draft) => { draft.notices = draft.notices.filter((item) => item.id !== notice.id); }))}><Trash2 size={16}/> Excluir</button></article>)}</div> : <EmptyState icon={Megaphone} title="Nenhum aviso" text="O mural está vazio." action="Criar primeiro aviso" onAction={() => setModal("notice")}/>}</section>}
        {view === "settings" && <section className="stack"><InstitutionSettingsPanel value={database.settings.institution} onChange={(institution) => updateDatabase((draft) => { draft.settings.institution = institution; })}/><AppearanceSettings value={database.settings.appearance} onChange={(appearance) => updateDatabase((draft) => { draft.settings.appearance = appearance; })}/><StudentFieldsSettings fields={database.settings.studentFields} onChange={(fields) => updateDatabase((draft) => { draft.settings.studentFields = fields; })}/><FinanceSettingsPanel value={database.settings.finance} onChange={(finance) => updateDatabase((draft) => { draft.settings.finance = finance; })}/><DocumentSettingsPanel receipt={database.settings.receipt} certificate={database.settings.certificate} onReceiptChange={(receipt) => updateDatabase((draft) => { draft.settings.receipt = receipt; })} onCertificateChange={(certificate) => updateDatabase((draft) => { draft.settings.certificate = certificate; })}/><CloudAccountPanel database={database} onReplaceDatabase={setDatabase}/><CloudSyncPanel database={database} onReplaceDatabase={setDatabase}/><PaymentConnectionsPanel/><MessageAutomationsPanel/></section>}
        {view === "backup" && <BackupPanel database={database} onRestoreCandidate={(restored) => confirmAction({ title:"Restaurar este backup?", message:"Os dados locais atuais serão substituídos pelo arquivo validado.", confirmLabel:"Restaurar backup", tone:"warning" }, () => { setDatabase(restored); setSelectedStudentId(""); notify("Backup restaurado."); })} onReset={() => confirmAction({ title:"Limpar todos os dados locais?", message:"Alunos, turmas, cobranças e registros desta instalação serão removidos.", confirmLabel:"Limpar sistema", tone:"danger" }, () => { setDatabase(emptyDatabase()); setSelectedStudentId(""); notify("Sistema limpo.","warning"); })} onNotify={notify}/>} 
      </div>
    </main>

    {selectedStudent && !modal && <StudentDetailsPanel student={selectedStudent} classItem={classById.get(selectedStudent.classId)} database={database} onClose={() => setSelectedStudentId("")} onEdit={openStudentEdit} onPause={() => setModal("pause")} onResume={reactivateStudent} onNewInvoice={() => setModal("invoice")} onDocument={() => setPrintable({ type:"Declaração", student:selectedStudent })} onCertificate={() => { setCertificateStudentId(selectedStudent.id); setSelectedStudentId(""); }} onPay={(invoiceIds) => { setBatchMethod("dinheiro"); setBatchPayment({ studentId:selectedStudent.id, invoiceIds }); }} onCancelInvoice={cancelInvoice} onReopenInvoice={reopenPayment} onReceipt={(invoice) => { const payment = paymentForInvoice(database,invoice.id); if (payment) setPrintable({ type:"Recibo",student:selectedStudent,invoice,payment }); else notify("O pagamento histórico desta mensalidade não foi encontrado.","warning"); }}/>} 

    {modal === "class" && <Modal title="Cadastrar turma" description="Defina curso, horário e duração. Cursos com prazo fixo terão o plano completo gerado na matrícula." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addClass}><Field label="Curso" wide><input name="name" maxLength={160} placeholder="Ex.: Informática" autoFocus required/></Field><Field label="Nome da turma"><input name="groupName" maxLength={120} placeholder="Ex.: Segunda 08h"/></Field><Field label="Professor"><input name="teacher" maxLength={120} required/></Field><Field label="Sala"><input name="room" maxLength={80} placeholder="Sala 1"/></Field><div className="field wide"><span>Dias da semana</span><div className="weekday-picker">{WEEKDAYS.map((day) => <label key={day.id}><input type="checkbox" name={`day-${day.id}`}/><span>{day.label}</span></label>)}</div></div><Field label="Início"><input name="startTime" type="time" required/></Field><Field label="Fim"><input name="endTime" type="time" required/></Field><Field label="Mensalidade"><input name="monthlyFee" type="number" min="0" step="0.01" required/></Field><Field label="Carga horária"><input name="workloadHours" type="number" min="0" max="100000" step="1"/></Field><Field label="Duração do curso" wide><select value={classDurationType} onChange={(event) => setClassDurationType(event.target.value as "fixed"|"open_ended")}><option value="fixed">Duração definida</option><option value="open_ended">Sem previsão de término</option></select></Field>{classDurationType === "fixed" && <Field label="Quantidade de meses" wide><input name="durationMonths" type="number" min="1" max="240" step="1" placeholder="Ex.: 15" required/></Field>}<div className="form-note wide"><BookOpen size={19}/><span>{classDurationType === "fixed" ? "Ao matricular, todas as mensalidades serão criadas de uma vez." : "Será criada somente a mensalidade atual; as próximas serão geradas conforme o aluno continuar."}</span></div><FormActions onCancel={() => setModal(null)} submit="Cadastrar turma"/></form></Modal>}

    {modal === "student" && <Modal title="Matricular aluno" description="O AulaFácil criará o plano financeiro conforme a duração da turma escolhida." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addStudent}><Field label="Nome completo" wide><input name="name" maxLength={160} autoFocus required/></Field><Field label="Data de nascimento"><input name="birthDate" type="date" min={MIN_REASONABLE_DATE} max={localTodayIso()} value={studentBirthDate} onChange={(event) => setStudentBirthDate(event.target.value)} required/></Field><Field label="CPF / documento"><input name="documentNumber" maxLength={40} inputMode="numeric" placeholder="CPF ou documento"/></Field><Field label="Turma"><select name="classId" required defaultValue=""><option value="" disabled>Escolha a turma</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.groupName ? ` · ${item.groupName}` : ""} · {item.schedule}</option>)}</select></Field><Field label="Início da matrícula"><input name="enrollmentStartDate" type="date" min={MIN_REASONABLE_DATE} max="2100-12-31" defaultValue={localTodayIso()} required/></Field><Field label="Vencimento"><select name="dueDay" required defaultValue={String(database.settings.finance.allowedDueDays[0] ?? 10)}>{database.settings.finance.allowedDueDays.map((day) => <option key={day} value={day}>Dia {day}</option>)}</select></Field><StudentExtraFieldsForm fields={database.settings.studentFields} birthDate={studentBirthDate}/><FormActions onCancel={() => setModal(null)} submit="Matricular aluno"/></form></Modal>}

    {modal === "student-edit" && selectedStudent && <Modal title="Editar aluno" description="Dados pagos e históricos não são apagados. Alterar o vencimento ajusta somente mensalidades futuras em aberto." onClose={() => setModal(null)}><form className="form-grid" onSubmit={editStudent}><Field label="Nome completo" wide><input name="name" maxLength={160} defaultValue={selectedStudent.name} required/></Field><Field label="Data de nascimento"><input name="birthDate" type="date" min={MIN_REASONABLE_DATE} max={localTodayIso()} value={editBirthDate} onChange={(event) => setEditBirthDate(event.target.value)} required/></Field><Field label="CPF / documento"><input name="documentNumber" maxLength={40} inputMode="numeric" defaultValue={selectedStudent.documentNumber ?? ""}/></Field><Field label="Turma"><select name="classId" defaultValue={selectedStudent.classId} required>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.groupName ? ` · ${item.groupName}` : ""}</option>)}</select></Field><Field label="Vencimento"><select name="dueDay" defaultValue={String(selectedStudent.dueDay ?? database.settings.finance.allowedDueDays[0] ?? 10)} required>{database.settings.finance.allowedDueDays.map((day) => <option key={day} value={day}>Dia {day}</option>)}</select></Field><StudentEditExtraFields student={selectedStudent} fields={database.settings.studentFields} birthDate={editBirthDate}/><FormActions onCancel={() => setModal(null)} submit="Salvar alterações"/></form></Modal>}

    {modal === "invoice" && selectedStudent && <Modal title="Nova cobrança" description={`Cobrança avulsa para ${selectedStudent.name}.`} onClose={() => setModal(null)}><form className="form-grid" onSubmit={addInvoice}><input type="hidden" name="studentId" value={selectedStudent.id}/><Field label="Referência" wide><input name="reference" maxLength={120} placeholder="Ex.: Material didático" required/></Field><Field label="Vencimento"><input name="dueDate" type="date" min={MIN_REASONABLE_DATE} max="2100-12-31" defaultValue={localTodayIso()} required/></Field><Field label="Valor"><input name="amount" type="number" min="0.01" step="0.01" required/></Field><FormActions onCancel={() => setModal(null)} submit="Criar cobrança"/></form></Modal>}

    {modal === "pause" && selectedStudent && <Modal title="Trancar matrícula" description="Débitos vencidos continuam em aberto. Mensalidades futuras ainda não devidas serão canceladas e o sistema deixará de gerar novas cobranças." onClose={() => setModal(null)}><form className="form-grid" onSubmit={savePause}><Field label="Motivo do trancamento" wide><textarea name="reason" maxLength={500} rows={4} placeholder="Ex.: Solicitação do responsável"/></Field><div className="form-note wide"><AlertTriangle size={19}/><span>O histórico financeiro e acadêmico não será apagado.</span></div><FormActions onCancel={() => setModal(null)} submit="Confirmar trancamento"/></form></Modal>}

    {modal === "notice" && <Modal title="Novo aviso" description="Prepare o texto do comunicado." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addNotice}><Field label="Título" wide><input name="title" maxLength={100} required/></Field><Field label="Público"><select name="audience" defaultValue="Todos"><option>Todos</option><option>Alunos</option><option>Responsáveis</option></select></Field><Field label="Mensagem" wide><textarea name="message" maxLength={700} rows={6} required/></Field><FormActions onCancel={() => setModal(null)} submit="Salvar aviso"/></form></Modal>}

    {batchPayment && studentById.get(batchPayment.studentId) && <div className="modal-backdrop"><section className="modal batch-payment-modal"><header><div><h2>{currentPaymentInvoices.length > 1 ? "Receber mensalidades" : "Registrar pagamento"}</h2><p>{studentById.get(batchPayment.studentId)?.name} · {currentPaymentInvoices.length} mensalidade{currentPaymentInvoices.length === 1 ? "" : "s"}</p></div><button className="modal-close" onClick={() => setBatchPayment(null)}><X/></button></header><div className="batch-payment-body"><div className="batch-payment-list">{currentPaymentInvoices.map((invoice) => <div key={invoice.id}><span>{invoice.reference}<small>Vence {dateLabel(invoice.dueDate)}</small></span><strong>{money(invoiceAmountDue(invoice,database.settings.finance).totalDue)}</strong></div>)}</div><div className="batch-total"><span>Total a receber</span><strong>{money(currentPaymentTotal)}</strong></div><label><span>Forma de pagamento</span><select value={batchMethod} onChange={(event) => setBatchMethod(event.target.value)}><option value="dinheiro">Dinheiro</option><option value="pix_manual">Pix manual</option><option value="cartao">Cartão / maquininha</option><option value="transferencia">Transferência</option><option value="outro">Outro</option></select></label><div className="form-actions"><button className="secondary-button" onClick={() => setBatchPayment(null)}>Cancelar</button><button className="primary-button" disabled={busy} onClick={confirmBatchPayment}>{busy ? "Registrando..." : "Confirmar pagamento"}</button></div></div></section></div>}

    {printable && <DocumentModal value={printable} database={database} classItem={classById.get(printable.student.classId)} onClose={() => setPrintable(null)}/>} 
    {certificateStudentId && studentById.get(certificateStudentId) && <CertificateManager student={studentById.get(certificateStudentId)!} classItem={classById.get(studentById.get(certificateStudentId)!.classId)} database={database} onClose={() => setCertificateStudentId("")} onCompleted={(restored) => { setDatabase(restored); notify("Conclusão do aluno atualizada."); }}/>} 
    {confirmation && <ConfirmDialog {...confirmation} onCancel={() => setConfirmation(null)} onConfirm={() => { const action = confirmation.onConfirm; setConfirmation(null); action(); }}/>} 
    {toast && <div className={`toast ${toast.tone}`}>{toast.tone === "success" ? <CheckCircle2/> : <AlertTriangle/>}<span>{toast.message}</span><button onClick={() => setToast(null)}><X size={16}/></button></div>}
  </div>;
}

function DocumentModal({ value, database, classItem, onClose }: { value: NonNullable<Printable>; database: SchoolDatabase; classItem?: ClassItem; onClose: () => void }) {
  const institution = database.settings.institution;
  const schoolName = institution.name || institution.legalName || "Instituição de ensino";
  const today = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());
  return <div className="modal-backdrop document-backdrop"><section className="document-dialog"><div className="document-toolbar"><div><strong>{value.type}</strong><span>Confira antes de imprimir ou salvar em PDF.</span></div><button className="secondary-button" onClick={onClose}>Fechar</button><button className="primary-button" onClick={() => window.print()}><Printer size={18}/> Imprimir ou PDF</button></div>{value.type === "Recibo" && value.invoice ? <ReceiptDocument student={value.student} invoice={value.invoice} payment={value.payment} institution={institution} settings={database.settings.receipt} classItem={classItem}/> : <article id="print-area"><header><div><strong>{schoolName}</strong><span>{[institution.city,institution.state].filter(Boolean).join(" — ") || institution.address}</span></div><b>AF</b></header><h1>Declaração</h1><p>Declaramos, para os devidos fins, que <strong>{value.student.name}</strong> encontra-se regularmente matriculado(a) no curso <strong>{classItem?.name ?? "informado pela instituição"}</strong>, na turma <strong>{classItem?.groupName || classItem?.schedule || "registrada pela secretaria"}</strong>.</p><div className="document-date">{institution.city ? `${institution.city}, ` : ""}{today}.</div><footer><span/><p>Secretaria<br/>{schoolName}</p></footer></article>}</section></div>;
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal"><header><div><h2>{title}</h2><p>{description}</p></div><button className="modal-close" onClick={onClose}><X/></button></header>{children}</section></div>;
}

function Field({ label, children, wide=false }: { label: string; children: ReactNode; wide?: boolean }) { return <label className={wide ? "field wide" : "field"}><span>{label}</span>{children}</label>; }
function FormActions({ onCancel, submit }: { onCancel: () => void; submit: string }) { return <div className="form-actions wide"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button type="submit" className="primary-button"><Check size={18}/>{submit}</button></div>; }
function PageHeader({ title, subtitle, action, icon: Icon, onAction, secondaryAction, onSecondary }: { title: string; subtitle: string; action: string; icon: typeof Plus; onAction: () => void; secondaryAction?: string; onSecondary?: () => void }) { return <div className="page-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><div>{secondaryAction && <button className="secondary-button" onClick={onSecondary}>{secondaryAction === "Ver planilha" ? <List size={17}/> : <PanelsTopLeft size={17}/>} {secondaryAction}</button>}<button className="primary-button" onClick={onAction}><Icon size={18}/>{action}</button></div></div>; }
function EmptyState({ icon: Icon, title, text, action, onAction }: { icon: typeof Users; title: string; text: string; action?: string; onAction?: () => void }) { return <div className="card empty-state"><span><Icon/></span><h2>{title}</h2><p>{text}</p>{action && <button className="primary-button" onClick={onAction}><Plus size={18}/>{action}</button>}</div>; }
function Metric({ label, value, helper, icon: Icon, tone }: { label: string; value: string; helper: string; icon: typeof Users; tone: string }) { return <article className="metric card"><span className={tone}><Icon/></span><div><small>{label}</small><strong>{value}</strong><p>{helper}</p></div></article>; }
