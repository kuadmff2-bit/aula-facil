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
  Cloud,
  DatabaseBackup,
  FileCheck2,
  FileText,
  HardDrive,
  LayoutDashboard,
  Download,
  Megaphone,
  Menu,
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
  Zap,
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
import { ClassOverviewPanel } from "./class-overview-panel";
import { StudentDetailsPanel } from "./student-details-panel";
import {
  buildFixedCoursePlan,
  ensureOpenEndedInvoiceForMonth,
  ensureContinuousInvoicesDue,
  pauseEnrollment,
  rescheduleFutureInvoices,
  resumeEnrollment,
} from "./enrollment-plan";
import { confirmManualInvoicePayment, reopenInvoicePayment } from "./manual-payment";
import { getCloudSyncStatus, safePullFromCloud } from "./cloud-safe-sync";
import { birthDateError, genericDateError, localTodayIso, MIN_REASONABLE_DATE, phoneError } from "./validation";
import { exportElementToPdf } from "./pdf-export";
import { DateField } from "./date-field";
import { NoticesCenter } from "./notices-center";
import { exportStudentsWorkbook } from "./spreadsheet-export";
import "./app-next.css";
import "./didactic-ux.css";

type ModalKind = "student" | "student-edit" | "class" | "invoice" | "notice" | "pause" | null;
type Toast = { message: string; tone: "success" | "warning" | "danger" };
type Printable = { type: "Declaração" | "Recibo"; student: Student; invoice?: Invoice; payment?: Payment } | null;
type BatchPayment = { studentId: string; invoiceIds: string[] } | null;


const navItems = [
  { id: "dashboard" as View, label: "Início", icon: LayoutDashboard },
  { id: "students" as View, label: "Alunos", icon: Users },
  { id: "classes" as View, label: "Turmas", icon: BookOpen },
  { id: "attendance" as View, label: "Chamada", icon: ClipboardCheck },
  { id: "finance" as View, label: "Mensalidades", icon: WalletCards },
  { id: "notices" as View, label: "Avisos", icon: Megaphone },
  { id: "automations" as View, label: "Automações", icon: Zap },
  { id: "cloud" as View, label: "Conta e sincronização", icon: Cloud },
  { id: "backup" as View, label: "Backup e segurança", icon: DatabaseBackup },
  { id: "settings" as View, label: "Ajustes da escola", icon: Settings2 },
];

const viewCopy: Record<View, { title: string; description: string }> = {
  dashboard: { title: "Início", description: "Veja rapidamente o que precisa da sua atenção." },
  students: { title: "Alunos", description: "Cadastre, consulte e acompanhe cada aluno." },
  classes: { title: "Turmas", description: "Organize cursos, horários, alunos e data de conclusão." },
  attendance: { title: "Chamada", description: "Marque presença sem abrir turma por turma." },
  finance: { title: "Mensalidades", description: "Veja quem pagou, quem está devendo e receba pagamentos." },
  notices: { title: "Avisos", description: "Envie comunicados para alunos e responsáveis." },
  automations: { title: "Automações", description: "Deixe o AulaFácil enviar lembretes e confirmações sozinho." },
  backup: { title: "Backup e segurança", description: "Proteja seus dados e restaure uma cópia quando precisar." },
  cloud: { title: "Conta e sincronização", description: "Entre na conta e mantenha os dados deste computador alinhados com a nuvem." },
  settings: { title: "Ajustes da escola", description: "Mude dados, aparência, cobranças, documentos e integrações." },
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
  if ((item.durationType ?? "open_ended") !== "fixed") return "Sem data de término";
  if (item.endDate) return `Até ${dateLabel(item.endDate)}`;
  return item.durationMonths ? `${item.durationMonths} meses` : "Data final não informada";
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
  const [attendanceDate, setAttendanceDate] = useState(localTodayIso());
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmation, setConfirmation] = useState<(ConfirmRequest & { onConfirm: () => void }) | null>(null);
  const [printable, setPrintable] = useState<Printable>(null);
  const [certificateStudentId, setCertificateStudentId] = useState("");
  const [studentBirthDate, setStudentBirthDate] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [studentClassPreset, setStudentClassPreset] = useState("");
  const [classDurationType, setClassDurationType] = useState<"fixed" | "open_ended">("open_ended");
  const [batchPayment, setBatchPayment] = useState<BatchPayment>(null);
  const [batchMethod, setBatchMethod] = useState("dinheiro");
  const [busy, setBusy] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => saveDatabase(database), [database]);
  useEffect(() => {
    setDatabase((current) => {
      const next = structuredClone(current);
      const created = ensureContinuousInvoicesDue(next);
      if (!created) return current;
      next.updatedAt = new Date().toISOString();
      return next;
    });
  }, []);
  useEffect(() => {
    const downloaded = (event: Event) => {
      const detail = (event as CustomEvent<{ filename?: string }>).detail;
      setToast({ message: `${detail?.filename || "Arquivo"} baixado com sucesso.`, tone: "success" });
    };
    window.addEventListener("aulafacil:download-success", downloaded);
    return () => window.removeEventListener("aulafacil:download-success", downloaded);
  }, []);
  useEffect(() => {
    document.title = `${viewCopy[view].title} | AulaFácil`;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (meta) meta.content = `${viewCopy[view].description} AulaFácil.`.slice(0, 155);
  }, [view]);
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
    setMobileMenuOpen(false);
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
    setStudentClassPreset("");
    setModal("student");
  };

  const openStudentFormForClass = (classId: string) => {
    if (!classById.has(classId)) {
      notify("Esta turma não está mais disponível.", "warning");
      return;
    }
    setStudentBirthDate("");
    setStudentClassPreset(classId);
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
    const endDate = classDurationType === "fixed" ? formValue(form, "endDate") : "";
    const workloadHours = Number(formValue(form, "workloadHours")) || null;
    if (name.length < 2 || teacher.length < 2 || !startTime || !endTime || startTime >= endTime || !meetingDays.length || !Number.isFinite(monthlyFee) || monthlyFee < 0) {
      notify("Revise nome, professor, dias, horário e mensalidade da turma.", "danger");
      return;
    }
    if (classDurationType === "fixed" && (genericDateError(endDate) || endDate < localTodayIso())) {
      notify("Informe uma data de conclusão válida, igual ou posterior a hoje.", "danger");
      return;
    }
    updateDatabase((draft) => draft.classes.push({
      id: makeId("turma"), name, groupName, teacher, room, meetingDays, startTime, endTime,
      schedule: scheduleText(meetingDays, startTime, endTime), monthlyFee,
      durationType: classDurationType, durationMonths: null, endDate: classDurationType === "fixed" ? endDate : null,
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
    const selectedClassForEnrollment = classById.get(classId);
    const birthError = birthDateError(birthDate);
    const studentPhoneError = phoneError(extraFields.phone, false);
    const guardianPhoneError = phoneError(extraFields.guardianPhone, false);
    if (name.length < 3 || birthError || studentPhoneError || guardianPhoneError || !classById.has(classId) || !Number.isInteger(dueDay) || !database.settings.finance.allowedDueDays.includes(dueDay) || genericDateError(enrollmentStartDate)) {
      notify(birthError || studentPhoneError || guardianPhoneError || "Preencha os dados obrigatórios com valores válidos.", "danger");
      return;
    }
    if (selectedClassForEnrollment?.durationType === "fixed" && selectedClassForEnrollment.endDate && enrollmentStartDate > selectedClassForEnrollment.endDate) {
      notify("A matrícula não pode começar depois da data de conclusão da turma.", "danger");
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
    setStudentClassPreset("");
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
    let generatedForNewClass = 0;
    let cancelledFromOldClass = 0;
    const classChanged = classId !== selectedStudent.classId;
    updateDatabase((draft) => {
      const target = draft.students.find((item) => item.id === selectedStudent.id);
      if (!target) return;
      const oldDueDay = target.dueDay;
      const today = localTodayIso();
      if (classChanged) {
        for (const invoice of draft.invoices) {
          if (invoice.studentId !== target.id) continue;
          if (invoice.status !== "pending" && invoice.status !== "overdue") continue;
          if (invoice.dueDate <= today) continue;
          invoice.status = "cancelled";
          invoice.cancelledAt = new Date().toISOString();
          invoice.cancellationReason = "Aluno transferido para outra turma";
          cancelledFromOldClass += 1;
        }
      }
      Object.assign(target, { name, birthDate, documentNumber, classId, ...extraFields });
      if (oldDueDay !== dueDay) rescheduled = rescheduleFutureInvoices(draft, target.id, dueDay);
      else target.dueDay = dueDay;

      if (classChanged && (target.enrollmentStatus ?? (target.active ? "active" : "paused")) === "active") {
        const nextClass = draft.classes.find((item) => item.id === classId);
        if (nextClass?.durationType === "fixed") {
          const plan = buildFixedCoursePlan(draft, target, nextClass, { startDate: today });
          draft.invoices.push(...plan);
          generatedForNewClass = plan.length;
        } else if (nextClass) {
          const invoice = ensureOpenEndedInvoiceForMonth(draft, target, nextClass, today.slice(0, 7));
          if (invoice) { draft.invoices.push(invoice); generatedForNewClass = 1; }
        }
      }
    });
    setModal(null);
    notify(classChanged
      ? `Aluno movido para a nova turma. ${cancelledFromOldClass} cobrança${cancelledFromOldClass === 1 ? "" : "s"} futura${cancelledFromOldClass === 1 ? "" : "s"} da turma anterior foi${cancelledFromOldClass === 1 ? "" : "ram"} cancelada${cancelledFromOldClass === 1 ? "" : "s"} e ${generatedForNewClass} nova${generatedForNewClass === 1 ? "" : "s"} mensalidade${generatedForNewClass === 1 ? "" : "s"} foi${generatedForNewClass === 1 ? "" : "ram"} preparada${generatedForNewClass === 1 ? "" : "s"}.`
      : `Cadastro atualizado${rescheduled ? ` e ${rescheduled} mensalidade${rescheduled === 1 ? "" : "s"} futura${rescheduled === 1 ? "" : "s"} foi${rescheduled === 1 ? "" : "ram"} para o novo vencimento` : ""}.`);
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
        if (syncStatus !== "synced") throw new Error("Abra “Conta e nuvem” e sincronize este computador antes de receber várias mensalidades.");
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


  const moveStudentsToClass = (targetClassId: string, studentIds: string[]) => {
    const selected = new Set(studentIds);
    const targetClass = classById.get(targetClassId);
    if (!targetClass || !selected.size) return;
    const today = localTodayIso();
    let moved = 0;
    let cancelled = 0;
    let generated = 0;

    updateDatabase((draft) => {
      const destination = draft.classes.find((item) => item.id === targetClassId);
      if (!destination) return;
      for (const student of draft.students) {
        if (!selected.has(student.id) || student.classId === targetClassId) continue;

        for (const invoice of draft.invoices) {
          if (invoice.studentId !== student.id) continue;
          if (invoice.status !== "pending" && invoice.status !== "overdue") continue;
          if (invoice.dueDate <= today) continue;
          invoice.status = "cancelled";
          invoice.cancelledAt = new Date().toISOString();
          invoice.cancellationReason = "Aluno transferido para outra turma";
          cancelled += 1;
        }

        student.classId = targetClassId;
        moved += 1;
        if ((student.enrollmentStatus ?? (student.active ? "active" : "paused")) !== "active" || !student.active) continue;

        if ((destination.durationType ?? "open_ended") === "fixed") {
          const plan = buildFixedCoursePlan(draft, student, destination, { startDate: today });
          draft.invoices.push(...plan);
          generated += plan.length;
        } else {
          const invoice = ensureOpenEndedInvoiceForMonth(draft, student, destination, today.slice(0, 7));
          if (invoice) { draft.invoices.push(invoice); generated += 1; }
        }
      }
    });

    notify(`${moved} aluno${moved === 1 ? "" : "s"} movido${moved === 1 ? "" : "s"}. ${cancelled} cobrança${cancelled === 1 ? "" : "s"} futura${cancelled === 1 ? "" : "s"} da turma anterior foi${cancelled === 1 ? "" : "ram"} cancelada${cancelled === 1 ? "" : "s"}; ${generated} nova${generated === 1 ? "" : "s"} mensalidade${generated === 1 ? "" : "s"} foi${generated === 1 ? "" : "ram"} preparada${generated === 1 ? "" : "s"}.`);
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

  return <div className={`app-shell ${mobileMenuOpen ? "mobile-menu-open" : ""}`}>
    <aside className="sidebar">
      <button className="mobile-menu-close" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}><X size={20}/></button>
      {view !== "dashboard" ? <button className="brand" onClick={() => changeView("dashboard")} aria-label="Ir para o início"><SchoolBrand institution={database.settings.institution}/></button> : <div className="dashboard-sidebar-placeholder" aria-hidden="true"/>}
      <div className="nav-label">MENU</div>
      <nav className="main-nav">{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => changeView(item.id)}><item.icon size={20}/><span>{item.label}</span>{item.id === "finance" && overdueInvoices.length > 0 && <b>{overdueInvoices.length}</b>}</button>)}</nav>
      <div className="sidebar-foot"><div className="local-status"><HardDrive size={18}/><span><strong>Cópia local protegida</strong><small>Criptografada no Windows</small></span><CheckCircle2 size={17}/></div><div className="version">AulaFácil Desktop <span>v0.4.4</span></div></div>
    </aside>
    <button className="mobile-menu-scrim" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}/>

    <main className="workspace">
      <header className="topbar"><div className="topbar-title-wrap"><button className="mobile-menu-button icon-button" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(true)}><Menu size={20}/></button><div><h1>{viewCopy[view].title}</h1><p>{viewCopy[view].description}</p></div></div><div className="top-actions"><span className="offline-pill"><ShieldCheck size={16}/> Dados protegidos</span><button className="icon-button" onClick={() => changeView("notices")} aria-label="Abrir avisos"><Bell size={20}/>{database.notices.length > 0 && <i/>}</button></div></header>
      <div className="page-content">
        {view === "dashboard" && <section className="stack">
          <div className="metric-grid"><Metric label="Alunos ativos" value={String(activeStudents.length)} helper={`${database.classes.length} turma${database.classes.length === 1 ? "" : "s"}`} icon={Users} tone="blue"/><Metric label="Recebido" value={money(receivedTotal)} helper="Pagamentos confirmados" icon={CircleDollarSign} tone="green"/><Metric label="Em aberto" value={money(pendingTotal)} helper={`${overdueInvoices.length} atrasada${overdueInvoices.length === 1 ? "" : "s"}`} icon={Clock3} tone={overdueInvoices.length ? "red" : "amber"}/><Metric label="Presença hoje" value={attendanceRate === null ? "—" : `${attendanceRate}%`} helper="Chamadas registradas" icon={CalendarCheck2} tone="violet"/></div>
          <div className="dashboard-home-grid"><div className="dashboard-grid"><div className="card quick-card"><div className="section-heading"><div><h2>Ações rápidas</h2><p>Atalhos da secretaria.</p></div></div><div className="quick-actions"><button onClick={openStudentForm}><span className="blue"><UserPlus/></span><div><strong>Novo aluno</strong><small>Matricular e gerar plano</small></div><ChevronRight/></button><button onClick={() => changeView("attendance")}><span className="violet"><ClipboardCheck/></span><div><strong>Fazer chamada</strong><small>Planilha de todas as turmas</small></div><ChevronRight/></button><button onClick={() => changeView("finance")}><span className="green"><WalletCards/></span><div><strong>Mensalidades</strong><small>Receber e negociar</small></div><ChevronRight/></button><button onClick={() => { setClassDurationType("open_ended"); setModal("class"); }}><span className="amber"><BookOpen/></span><div><strong>Nova turma</strong><small>Curso, horário e conclusão</small></div><ChevronRight/></button></div></div><div className="card attention-card"><div className="section-heading"><div><h2>Precisa de atenção</h2><p>Mensalidades atrasadas.</p></div>{overdueInvoices.length > 0 && <span className="count-badge">{overdueInvoices.length}</span>}</div>{overdueInvoices.slice(0,5).map((invoice) => <button key={invoice.id} onClick={() => openStudent(invoice.studentId)}><span className="warning-icon"><AlertTriangle size={18}/></span><div><strong>{studentById.get(invoice.studentId)?.name ?? "Aluno"}</strong><small>{invoice.reference} · venceu {dateLabel(invoice.dueDate)}</small></div><b>{money(invoiceAmountDue(invoice,database.settings.finance).totalDue)}</b></button>)}{!overdueInvoices.length && <div className="compact-empty"><CheckCircle2/><strong>Nenhuma cobrança atrasada</strong><span>As pendências aparecerão aqui.</span></div>}</div></div><div className="dashboard-brand-hero"><div><SchoolBrand institution={database.settings.institution}/></div></div></div>
        </section>}

        {view === "students" && <section className="stack">
          <PageHeader title={`${database.students.length} aluno${database.students.length === 1 ? "" : "s"}`} subtitle="Clique em um aluno para editar cadastro, mensalidades, trancamento e contato." action="Novo aluno" icon={UserPlus} onAction={openStudentForm}/>
          <div className="toolbar card"><label className="search-box"><Search size={19}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por aluno, CPF, telefone ou turma"/></label><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="all">Todas as turmas</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.groupName ? ` · ${item.groupName}` : ""}</option>)}</select><button className="secondary-button" type="button" onClick={() => void exportStudentsWorkbook(database)}><Download size={17}/> Baixar alunos</button></div>
          {filteredStudents.length ? <div className="card table-card"><table><thead><tr><th>Aluno</th><th>Turma</th><th>Contato</th><th>Vencimento</th><th>Situação</th><th/></tr></thead><tbody>{filteredStudents.map((student) => {
            const classItem = classById.get(student.classId); const enrollment = student.enrollmentStatus ?? (student.active ? "active" : "paused");
            return <tr key={student.id} onClick={() => openStudent(student.id)}><td><div className="person"><span>{initials(student.name)}</span><div><strong>{student.name}</strong><small>{student.documentNumber || `Nascimento: ${dateLabel(student.birthDate)}`}</small></div></div></td><td>{classItem?.name ?? "Sem turma"}{classItem?.groupName ? <small className="table-sub">{classItem.groupName}</small> : null}</td><td>{student.phone || student.guardianPhone || "Não informado"}</td><td>{student.dueDay ? `Dia ${student.dueDay}` : "Padrão"}</td><td><span className={`status ${enrollment === "active" ? "active" : enrollment === "completed" ? "paid" : "cancelled"}`}>{enrollment === "active" ? "Ativo" : enrollment === "completed" ? "Concluído" : "Trancado"}</span></td><td><ChevronRight size={19}/></td></tr>;
          })}</tbody></table></div> : <EmptyState icon={Users} title={database.students.length ? "Nenhum resultado" : "Nenhum aluno cadastrado"} text={database.students.length ? "Tente outra busca." : "Cadastre o primeiro aluno para começar."} action={database.students.length ? undefined : "Cadastrar primeiro aluno"} onAction={openStudentForm}/>} 
        </section>}

        {view === "classes" && <ClassOverviewPanel
          database={database}
          onNewClass={() => { setClassDurationType("open_ended"); setModal("class"); }}
          onAddStudent={openStudentFormForClass}
          onMoveStudents={moveStudentsToClass}
          onDeleteClass={deleteClass}
          onAttendance={() => { setAttendanceDate(localTodayIso()); changeView("attendance"); }}
        />}

        {view === "attendance" && <ClassRosterBoard database={database} date={attendanceDate} onDateChange={setAttendanceDate} onSaveAttendance={saveClassAttendance}/>} 
        {view === "finance" && <FinanceUltimate database={database} onChange={setDatabase} onReceipt={(student,invoice,payment) => setPrintable({ type:"Recibo", student, invoice, payment })}/>} 
        {view === "notices" && <NoticesCenter database={database} onChange={setDatabase} notify={notify}/>} 
        {view === "cloud" && <section className="stack cloud-hub-page"><CloudAccountPanel database={database} onReplaceDatabase={setDatabase}/><CloudSyncPanel database={database} onReplaceDatabase={setDatabase}/></section>}
        {view === "automations" && <section className="stack automation-hub-page">
          <div className="card didactic-guide"><div><span className="didactic-eyebrow">AUTOMAÇÕES</span><h2>Escolha o que o AulaFácil deve fazer sozinho</h2><p>Conecte o WhatsApp uma vez, escreva a mensagem e escolha quando ela deve ser enviada.</p></div><div className="didactic-steps"><span><b>1</b><strong>Conectar WhatsApp</strong><small>Leia o QR Code do Robô AulaFácil.</small></span><span><b>2</b><strong>Escolher a mensagem</strong><small>Ex.: lembrar mensalidade antes de vencer.</small></span><span><b>3</b><strong>Escolher quando enviar</strong><small>Defina o dia e o horário. O servidor cuida do resto.</small></span></div></div>
          <MessageAutomationsPanel/>
        </section>}
        {view === "settings" && <section className="stack settings-page"><div className="card didactic-guide compact"><div><span className="didactic-eyebrow">AJUSTES DA ESCOLA</span><h2>Mude só o que você precisar</h2><p>Os recursos automáticos agora ficam em “Automações”. Aqui ficam dados da escola, aparência, cadastro, cobranças, documentos e formas de pagamento.</p></div></div><InstitutionSettingsPanel value={database.settings.institution} onChange={(institution) => updateDatabase((draft) => { draft.settings.institution = institution; })}/><AppearanceSettings value={database.settings.appearance} onChange={(appearance) => updateDatabase((draft) => { draft.settings.appearance = appearance; })}/><StudentFieldsSettings fields={database.settings.studentFields} onChange={(fields) => updateDatabase((draft) => { draft.settings.studentFields = fields; })}/><FinanceSettingsPanel institution={database.settings.institution} value={database.settings.finance} onChange={(finance) => updateDatabase((draft) => { draft.settings.finance = finance; })}/><DocumentSettingsPanel institution={database.settings.institution} receipt={database.settings.receipt} certificate={database.settings.certificate} onReceiptChange={(receipt) => updateDatabase((draft) => { draft.settings.receipt = receipt; })} onCertificateChange={(certificate) => updateDatabase((draft) => { draft.settings.certificate = certificate; })}/><PaymentConnectionsPanel/></section>}
        {view === "backup" && <BackupPanel database={database} onRestoreCandidate={(restored) => confirmAction({ title:"Restaurar este backup?", message:"Os dados locais atuais serão substituídos pelo arquivo validado.", confirmLabel:"Restaurar backup", tone:"warning" }, () => { setDatabase(restored); setSelectedStudentId(""); notify("Backup restaurado."); })} onReset={() => confirmAction({ title:"Limpar todos os dados locais?", message:"Alunos, turmas, cobranças e registros desta instalação serão removidos.", confirmLabel:"Limpar sistema", tone:"danger" }, () => { setDatabase(emptyDatabase()); setSelectedStudentId(""); notify("Sistema limpo.","warning"); })} onNotify={notify}/>} 
      </div>
    </main>

    {selectedStudent && !modal && <StudentDetailsPanel student={selectedStudent} classItem={classById.get(selectedStudent.classId)} database={database} onClose={() => setSelectedStudentId("")} onEdit={openStudentEdit} onPause={() => setModal("pause")} onResume={reactivateStudent} onNewInvoice={() => setModal("invoice")} onDocument={() => setPrintable({ type:"Declaração", student:selectedStudent })} onCertificate={() => { setCertificateStudentId(selectedStudent.id); setSelectedStudentId(""); }} onPay={(invoiceIds) => { setBatchMethod("dinheiro"); setBatchPayment({ studentId:selectedStudent.id, invoiceIds }); }} onCancelInvoice={cancelInvoice} onReopenInvoice={reopenPayment} onReceipt={(invoice) => { const payment = paymentForInvoice(database,invoice.id); if (payment) setPrintable({ type:"Recibo",student:selectedStudent,invoice,payment }); else notify("O pagamento histórico desta mensalidade não foi encontrado.","warning"); }}/>} 

    {modal === "class" && <Modal title="Cadastrar turma" description="Cadastre o curso e informe até quando essa turma vai funcionar." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addClass}><Field label="Curso" wide><input name="name" maxLength={160} placeholder="Ex.: Informática" autoFocus required/></Field><Field label="Nome da turma"><input name="groupName" maxLength={120} placeholder="Ex.: Segunda 08h"/></Field><Field label="Professor"><input name="teacher" maxLength={120} required/></Field><Field label="Sala"><input name="room" maxLength={80} placeholder="Sala 1"/></Field><div className="field wide"><span>Dias da semana</span><div className="weekday-picker">{WEEKDAYS.map((day) => <label key={day.id}><input type="checkbox" name={`day-${day.id}`}/><span>{day.label}</span></label>)}</div></div><Field label="Começa às"><input name="startTime" type="time" required/></Field><Field label="Termina às"><input name="endTime" type="time" required/></Field><Field label="Valor da mensalidade"><input name="monthlyFee" type="number" min="0" step="0.01" required/></Field><Field label="Carga horária"><input name="workloadHours" type="number" min="0" max="100000" step="1"/></Field><Field label="A turma tem data para terminar?" wide><select value={classDurationType} onChange={(event) => setClassDurationType(event.target.value as "fixed"|"open_ended")}><option value="fixed">Sim, tem data de conclusão</option><option value="open_ended">Não, ainda não tem data de término</option></select></Field>{classDurationType === "fixed" && <Field label="Data de conclusão da turma" wide><DateField name="endDate" min={localTodayIso()} max="2100-12-31" required/></Field>}<div className="form-note wide"><BookOpen size={19}/><span>{classDurationType === "fixed" ? "Ao matricular um aluno, o AulaFácil cria todas as mensalidades desde o início da matrícula até essa data. Nenhuma cobrança será criada depois da conclusão da turma." : "O AulaFácil cria a mensalidade atual e continua gerando as próximas enquanto o aluno permanecer ativo."}</span></div><FormActions onCancel={() => setModal(null)} submit="Cadastrar turma"/></form></Modal>}

    {modal === "student" && <Modal title="Matricular aluno" description="O AulaFácil criará o plano financeiro conforme a duração da turma escolhida." onClose={() => setModal(null)}><form className="form-grid" onSubmit={addStudent}><Field label="Nome completo" wide><input name="name" maxLength={160} autoFocus required/></Field><Field label="Data de nascimento"><DateField name="birthDate" min={MIN_REASONABLE_DATE} max={localTodayIso()} required onIsoChange={setStudentBirthDate}/></Field><Field label="CPF / documento"><input name="documentNumber" maxLength={40} inputMode="numeric" placeholder="CPF ou documento"/></Field><Field label="Turma"><select name="classId" required defaultValue={studentClassPreset}><option value="" disabled>Escolha a turma</option>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.groupName ? ` · ${item.groupName}` : ""} · {item.schedule}</option>)}</select></Field><Field label="Início da matrícula"><DateField name="enrollmentStartDate" min={MIN_REASONABLE_DATE} max="2100-12-31" initialIso={localTodayIso()} required/></Field><Field label="Vencimento"><select name="dueDay" required defaultValue={String(database.settings.finance.allowedDueDays[0] ?? 10)}>{database.settings.finance.allowedDueDays.map((day) => <option key={day} value={day}>Dia {day}</option>)}</select></Field><StudentExtraFieldsForm fields={database.settings.studentFields} birthDate={studentBirthDate}/><FormActions onCancel={() => setModal(null)} submit="Matricular aluno"/></form></Modal>}

    {modal === "student-edit" && selectedStudent && <Modal title="Editar aluno" description="Dados pagos e históricos não são apagados. Alterar o vencimento ajusta somente mensalidades futuras em aberto." onClose={() => setModal(null)}><form className="form-grid" onSubmit={editStudent}><Field label="Nome completo" wide><input name="name" maxLength={160} defaultValue={selectedStudent.name} required/></Field><Field label="Data de nascimento"><DateField name="birthDate" min={MIN_REASONABLE_DATE} max={localTodayIso()} initialIso={selectedStudent.birthDate} required onIsoChange={setEditBirthDate}/></Field><Field label="CPF / documento"><input name="documentNumber" maxLength={40} inputMode="numeric" defaultValue={selectedStudent.documentNumber ?? ""}/></Field><Field label="Turma"><select name="classId" defaultValue={selectedStudent.classId} required>{database.classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.groupName ? ` · ${item.groupName}` : ""}</option>)}</select></Field><Field label="Vencimento"><select name="dueDay" defaultValue={String(selectedStudent.dueDay ?? database.settings.finance.allowedDueDays[0] ?? 10)} required>{database.settings.finance.allowedDueDays.map((day) => <option key={day} value={day}>Dia {day}</option>)}</select></Field><StudentEditExtraFields student={selectedStudent} fields={database.settings.studentFields} birthDate={editBirthDate}/><FormActions onCancel={() => setModal(null)} submit="Salvar alterações"/></form></Modal>}

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
  const filename = `${value.type}-${value.student.name}`;
  const downloadPdf = () => void exportElementToPdf("print-area", filename, "portrait");
  return <div className="modal-backdrop document-backdrop"><section className="document-dialog"><div className="document-toolbar"><div><strong>{value.type}</strong><span>Confira antes de imprimir ou baixar em PDF.</span></div><button className="secondary-button" onClick={onClose}>Fechar</button><button className="secondary-button" onClick={downloadPdf}><Download size={18}/> Baixar PDF</button><button className="primary-button" onClick={() => window.print()}><Printer size={18}/> Imprimir</button></div>{value.type === "Recibo" && value.invoice ? <ReceiptDocument student={value.student} invoice={value.invoice} payment={value.payment} institution={institution} settings={database.settings.receipt} classItem={classItem}/> : <article id="print-area" className="printable-declaration"><header><div><strong>{schoolName}</strong><span>{[institution.city,institution.state].filter(Boolean).join(" — ") || institution.address}</span></div><b>AF</b></header><h1>Declaração</h1><p>Declaramos, para os devidos fins, que <strong>{value.student.name}</strong> encontra-se regularmente matriculado(a) no curso <strong>{classItem?.name ?? "informado pela instituição"}</strong>, na turma <strong>{classItem?.groupName || classItem?.schedule || "registrada pela secretaria"}</strong>.</p><div className="document-date">{institution.city ? `${institution.city}, ` : ""}{today}.</div><footer><span/><p>Secretaria<br/>{schoolName}</p></footer></article>}</section></div>;
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal"><header><div><h2>{title}</h2><p>{description}</p></div><button className="modal-close" onClick={onClose}><X/></button></header>{children}</section></div>;
}

function Field({ label, children, wide=false }: { label: string; children: ReactNode; wide?: boolean }) { return <label className={wide ? "field wide" : "field"}><span>{label}</span>{children}</label>; }
function FormActions({ onCancel, submit }: { onCancel: () => void; submit: string }) { return <div className="form-actions wide"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button type="submit" className="primary-button"><Check size={18}/>{submit}</button></div>; }
function PageHeader({ title, subtitle, action, icon: Icon, onAction }: { title: string; subtitle: string; action: string; icon: typeof Plus; onAction: () => void }) { return <div className="page-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><div><button className="primary-button" onClick={onAction}><Icon size={18}/>{action}</button></div></div>; }
function EmptyState({ icon: Icon, title, text, action, onAction }: { icon: typeof Users; title: string; text: string; action?: string; onAction?: () => void }) { return <div className="card empty-state"><span><Icon/></span><h2>{title}</h2><p>{text}</p>{action && <button className="primary-button" onClick={onAction}><Plus size={18}/>{action}</button>}</div>; }
function Metric({ label, value, helper, icon: Icon, tone }: { label: string; value: string; helper: string; icon: typeof Users; tone: string }) { return <article className="metric card"><span className={tone}><Icon/></span><div><small>{label}</small><strong>{value}</strong><p>{helper}</p></div></article>; }
