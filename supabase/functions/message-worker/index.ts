import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_SEND_PER_RUN = 40;
const LOOKBACK_MS = 2 * 60 * 60 * 1000;

type Vars = Record<string, string>;
type RecipientKind = "student" | "guardian";

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function localParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${map.year}-${map.month}-${map.day}`, hour: Number(map.hour) };
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDate(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : date;
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(parsed) ? parsed : 0);
}

function fill(template: string, vars: Vars) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key) => vars[key] ?? "");
}

function normalizePhone(value: unknown) {
  let phone = String(value ?? "").replace(/\D/g, "");
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  return phone.length >= 12 && phone.length <= 15 ? phone : "";
}

function ageOnDate(birthDate: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(birthDate) || !/^\d{4}-\d{2}-\d{2}/.test(today)) return null;
  const birth = new Date(`${birthDate.slice(0, 10)}T12:00:00Z`);
  const current = new Date(`${today.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(current.getTime()) || birth > current) return null;
  let age = current.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = current.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && current.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

function resolveRecipient(student: any, mode: string, today: string): { phone: string; kind: RecipientKind | null } {
  if (mode === "guardian") return { phone: normalizePhone(student.guardian_phone), kind: "guardian" };
  if (mode === "student") return { phone: normalizePhone(student.phone), kind: "student" };

  const age = ageOnDate(String(student.birth_date ?? ""), today);
  if (age === null) return { phone: "", kind: null };
  if (age < 18) return { phone: normalizePhone(student.guardian_phone), kind: "guardian" };
  return { phone: normalizePhone(student.phone), kind: "student" };
}

function contextFor(eventKey: string, kind: RecipientKind, studentName: string) {
  if (["invoice_before_due", "invoice_due", "invoice_overdue"].includes(eventKey)) {
    return kind === "guardian" ? `A mensalidade de ${studentName}` : "Sua mensalidade";
  }
  if (eventKey === "payment_confirmed") {
    return kind === "guardian" ? `o pagamento de ${studentName}` : "seu pagamento";
  }
  if (eventKey === "negotiation_due") {
    return kind === "guardian" ? `A parcela da negociação de ${studentName}` : "Sua parcela da negociação";
  }
  if (eventKey === "absence") {
    return kind === "guardian" ? `a ausência de ${studentName}` : "sua ausência";
  }
  return "";
}

function personalizedVars(student: any, eventKey: string, kind: RecipientKind, vars: Vars): Vars {
  const studentName = String(student.name ?? "").trim();
  const guardianName = String(student.guardian_name ?? "").trim();
  const recipientName = kind === "guardian" ? (guardianName || "responsável") : (studentName || "aluno");
  return {
    ...vars,
    aluno: studentName,
    responsavel: recipientName,
    destinatario: recipientName,
    contexto: contextFor(eventKey, kind, studentName),
  };
}

function providerPayload(template: any, vars: Vars) {
  const keys = Array.isArray(template.meta_parameter_keys) ? template.meta_parameter_keys.filter((item: unknown) => typeof item === "string") : [];
  return {
    templateName: String(template.meta_template_name ?? ""),
    language: String(template.meta_language ?? "pt_BR"),
    parameters: keys.map((key: string) => vars[key] ?? ""),
  };
}

Deno.serve(async (req: Request) => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(503, { error: "backend unavailable" });
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: expectedToken } = await db.rpc("service_get_system_secret", { target_name: "message_cron_token" });
  const receivedToken = req.headers.get("x-aulafacil-cron") ?? "";
  if (!expectedToken || receivedToken !== expectedToken) return reply(401, { error: "unauthorized" });

  const { data: automations, error: automationError } = await db
    .from("message_automations")
    .select("*, channel:message_channels(*), template:message_templates(*), school:schools(id,name,timezone)")
    .eq("enabled", true);
  if (automationError) return reply(500, { error: "automation query failed" });

  let generated = 0;
  const lookback = new Date(Date.now() - LOOKBACK_MS).toISOString();

  for (const automation of automations ?? []) {
    const channel: any = Array.isArray(automation.channel) ? automation.channel[0] : automation.channel;
    const template: any = Array.isArray(automation.template) ? automation.template[0] : automation.template;
    const school: any = Array.isArray(automation.school) ? automation.school[0] : automation.school;
    if (!channel?.enabled || channel.provider_key !== "meta" || !channel.credentials_configured || !template?.enabled || !school?.id) continue;

    const time = localParts(school.timezone || "America/Manaus");
    if (["invoice_before_due", "invoice_due", "invoice_overdue", "negotiation_due"].includes(automation.event_key) && Number(automation.send_hour) !== time.hour) continue;

    const queue = async (student: any, vars: Vars, dedupeKey: string, refs: Record<string, unknown> = {}) => {
      const target = resolveRecipient(student, automation.recipient_mode, time.date);
      if (!target.phone || !target.kind) return;
      const finalVars = personalizedVars(student, automation.event_key, target.kind, vars);
      const payload = providerPayload(template, finalVars);
      const skipped = !payload.templateName;
      const row = {
        school_id: school.id,
        automation_id: automation.id,
        channel_id: channel.id,
        student_id: student.id,
        recipient_phone: target.phone,
        message_body: fill(template.body, finalVars).slice(0, 4000),
        dedupe_key: dedupeKey,
        scheduled_for: new Date().toISOString(),
        status: skipped ? "skipped" : "queued",
        last_error: skipped ? "Template aprovado da Meta não configurado." : null,
        provider_payload: payload,
        ...refs,
      };
      const { error } = await db.from("message_outbox").upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true });
      if (!error) generated++;
    };

    if (["invoice_before_due", "invoice_due", "invoice_overdue"].includes(automation.event_key)) {
      const offset = Math.abs(Number(automation.days_offset ?? 0));
      const targetDate = automation.event_key === "invoice_before_due" ? addDays(time.date, offset || 1)
        : automation.event_key === "invoice_overdue" ? addDays(time.date, -(offset || 1)) : time.date;
      const { data: invoices } = await db.from("invoices").select("*, student:students(*)").eq("school_id", school.id).eq("due_date", targetDate).in("status", ["pending", "overdue"]).is("deleted_at", null);
      for (const invoice of invoices ?? []) {
        const student: any = Array.isArray((invoice as any).student) ? (invoice as any).student[0] : (invoice as any).student;
        if (!student?.id || !student.active) continue;
        const { data: dueData } = await db.rpc("invoice_amount_due", { target_invoice: invoice.id, as_of: time.date });
        const due = Array.isArray(dueData) ? dueData[0] : dueData;
        const vars: Vars = {
          aluno: student.name ?? "",
          responsavel: student.guardian_name || student.name || "",
          valor: money(due?.total_due ?? invoice.amount),
          vencimento: formatDate(invoice.due_date),
          referencia: invoice.reference ?? "",
          escola: school.name ?? "",
        };
        await queue(student, vars, `${automation.id}:invoice:${invoice.id}:${time.date}`, { invoice_id: invoice.id });
      }
    }

    if (automation.event_key === "negotiation_due") {
      const targetDate = addDays(time.date, Math.max(0, Number(automation.days_offset ?? 0)));
      const { data: installments } = await db.from("negotiation_installments").select("*, negotiation:debt_negotiations(student:students(*))").eq("school_id", school.id).eq("due_date", targetDate).in("status", ["pending", "overdue"]);
      for (const item of installments ?? []) {
        const negotiation: any = Array.isArray((item as any).negotiation) ? (item as any).negotiation[0] : (item as any).negotiation;
        const student: any = Array.isArray(negotiation?.student) ? negotiation.student[0] : negotiation?.student;
        if (!student?.id) continue;
        const vars: Vars = { aluno: student.name ?? "", responsavel: student.guardian_name || student.name || "", valor: money(item.amount), vencimento: formatDate(item.due_date), referencia: `Parcela ${item.installment_number}`, escola: school.name ?? "" };
        await queue(student, vars, `${automation.id}:negotiation:${item.id}:${time.date}`, { negotiation_installment_id: item.id });
      }
    }

    if (automation.event_key === "payment_confirmed") {
      const { data: payments } = await db.from("payments").select("*, student:students(*), invoice:invoices(reference)").eq("school_id", school.id).eq("status", "confirmed").gte("updated_at", lookback);
      for (const payment of payments ?? []) {
        const student: any = Array.isArray((payment as any).student) ? (payment as any).student[0] : (payment as any).student;
        const invoice: any = Array.isArray((payment as any).invoice) ? (payment as any).invoice[0] : (payment as any).invoice;
        if (!student?.id) continue;
        const vars: Vars = { aluno: student.name ?? "", responsavel: student.guardian_name || student.name || "", valor: money(payment.amount_received), vencimento: "", referencia: invoice?.reference ?? "Pagamento", escola: school.name ?? "" };
        await queue(student, vars, `${automation.id}:payment:${payment.id}`, { invoice_id: payment.invoice_id ?? null });
      }
    }

    if (automation.event_key === "absence") {
      const { data: absences } = await db.from("attendance").select("*, student:students(*), class:classes(name)").eq("school_id", school.id).eq("status", "absent").gte("updated_at", lookback).is("deleted_at", null);
      for (const absence of absences ?? []) {
        const student: any = Array.isArray((absence as any).student) ? (absence as any).student[0] : (absence as any).student;
        const klass: any = Array.isArray((absence as any).class) ? (absence as any).class[0] : (absence as any).class;
        if (!student?.id) continue;
        const vars: Vars = { aluno: student.name ?? "", responsavel: student.guardian_name || student.name || "", data: formatDate(absence.attendance_date), curso: klass?.name ?? "", escola: school.name ?? "", valor: "", vencimento: "", referencia: "Falta" };
        await queue(student, vars, `${automation.id}:absence:${absence.id}`);
      }
    }
  }

  const { data: pending, error: pendingError } = await db.from("message_outbox").select("*, channel:message_channels(*)").in("status", ["queued", "failed"]).lte("scheduled_for", new Date().toISOString()).lt("attempts", 5).order("scheduled_for", { ascending: true }).limit(MAX_SEND_PER_RUN);
  if (pendingError) return reply(500, { error: "outbox query failed", generated });

  let sent = 0;
  let failed = 0;
  for (const item of pending ?? []) {
    const channel: any = Array.isArray((item as any).channel) ? (item as any).channel[0] : (item as any).channel;
    if (!channel?.enabled || channel.provider_key !== "meta" || !channel.credentials_configured) continue;
    await db.from("message_outbox").update({ status: "sending", attempts: Number(item.attempts ?? 0) + 1 }).eq("id", item.id);
    try {
      const { data: secretText, error: secretError } = await db.rpc("service_get_message_channel_secret", { target_channel_id: channel.id });
      if (secretError || !secretText) throw new Error("missing credentials");
      const secret = JSON.parse(String(secretText));
      const accessToken = secret.credentials?.access_token;
      const phoneNumberId = secret.credentials?.phone_number_id;
      const payload: any = item.provider_payload ?? {};
      if (!accessToken || !phoneNumberId || !payload.templateName) throw new Error("meta configuration incomplete");
      const version = typeof channel.public_config?.graphVersion === "string" ? channel.public_config.graphVersion : "v23.0";
      const parameters = Array.isArray(payload.parameters) ? payload.parameters.map((text: unknown) => ({ type: "text", text: String(text ?? "") })) : [];
      const body: any = { messaging_product: "whatsapp", recipient_type: "individual", to: item.recipient_phone, type: "template", template: { name: payload.templateName, language: { code: payload.language || "pt_BR" } } };
      if (parameters.length) body.template.components = [{ type: "body", parameters }];
      const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`meta ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
      await db.from("message_outbox").update({ status: "sent", provider_message_id: String(data?.messages?.[0]?.id ?? "") || null, sent_at: new Date().toISOString(), last_error: null }).eq("id", item.id);
      sent++;
    } catch (error) {
      await db.from("message_outbox").update({ status: "failed", last_error: String(error instanceof Error ? error.message : error).slice(0, 1000) }).eq("id", item.id);
      failed++;
    }
  }

  return reply(200, { ok: true, generated, sent, failed, processed: (pending ?? []).length });
});