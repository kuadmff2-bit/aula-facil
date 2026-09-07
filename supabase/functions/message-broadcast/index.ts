import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function phone(value: unknown) {
  let result = String(value ?? "").replace(/\D/g, "");
  if (result.length === 10 || result.length === 11) result = `55${result}`;
  return result.length >= 12 && result.length <= 15 ? result : "";
}

function age(birth: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(birth)) return null;
  const b = new Date(`${birth.slice(0, 10)}T12:00:00Z`);
  const n = new Date();
  let a = n.getUTCFullYear() - b.getUTCFullYear();
  const m = n.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && n.getUTCDate() < b.getUTCDate())) a--;
  return a;
}

function recipient(student: any, mode: string) {
  if (mode === "student") return phone(student.phone);
  if (mode === "guardian") return phone(student.guardian_phone);
  const studentAge = age(String(student.birth_date ?? ""));
  return studentAge !== null && studentAge < 18 ? phone(student.guardian_phone) : phone(student.phone);
}

async function triggerWorker(db: any, url: string, providerKey: string) {
  const { data: cronToken } = await db.rpc("service_get_system_secret", { target_name: "message_cron_token" });
  if (!cronToken) return { ok: false, error: "Token interno do processador de mensagens não configurado." };
  const worker = providerKey === "robot_webhook" ? "robot-worker" : "message-worker";
  try {
    const response = await fetch(`${url}/functions/v1/${worker}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-aulafacil-cron": String(cronToken),
      },
      body: JSON.stringify({ source: "notice_broadcast" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: String(data?.error ?? `worker ${response.status}`), data };
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao chamar o processador de mensagens." };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Método não permitido." });

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return reply(401, { error: "Sessão ausente." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(503, { error: "Backend indisponível." });

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData } = await db.auth.getUser(token);
  if (!userData.user) return reply(401, { error: "Sessão inválida." });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "JSON inválido." });
  }

  const schoolId = String(body?.schoolId ?? "");
  const channelId = String(body?.channelId ?? "");
  const title = String(body?.title ?? "").trim().slice(0, 100);
  const message = String(body?.message ?? "").trim().slice(0, 2000);
  const audience = String(body?.audience ?? "all");
  const recipientMode = String(body?.recipientMode ?? "auto");
  const classId = String(body?.classId ?? "");
  const selectedIds = Array.isArray(body?.studentIds) ? body.studentIds.map(String).slice(0, 1000) : [];

  if (!schoolId || !channelId || !title || !message) {
    return reply(400, { error: "Instituição, canal, título e mensagem são obrigatórios." });
  }

  const { data: member } = await db
    .from("school_members")
    .select("role,active")
    .eq("school_id", schoolId)
    .eq("user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (!member || !["owner", "admin", "finance", "teacher"].includes(member.role)) {
    return reply(403, { error: "Seu usuário não pode enviar comunicados." });
  }

  const { data: channel } = await db
    .from("message_channels")
    .select("*")
    .eq("id", channelId)
    .eq("school_id", schoolId)
    .eq("enabled", true)
    .maybeSingle();
  if (!channel || !channel.credentials_configured) {
    return reply(409, { error: "Escolha um canal de WhatsApp conectado." });
  }

  let query = db
    .from("students")
    .select("id,name,birth_date,phone,guardian_name,guardian_phone,class_id,active,enrollment_status")
    .eq("school_id", schoolId)
    .eq("active", true)
    .is("deleted_at", null);

  if (audience === "class") {
    if (!classId) return reply(400, { error: "Escolha a turma." });
    query = query.eq("class_id", classId);
  } else if (audience === "selected") {
    if (!selectedIds.length) return reply(400, { error: "Selecione pelo menos um aluno." });
    query = query.in("id", selectedIds);
  }

  const { data: students, error: studentsError } = await query;
  if (studentsError) return reply(500, { error: "Não foi possível carregar os destinatários." });

  let template: any = null;
  if (channel.provider_key === "meta") {
    const { data } = await db
      .from("message_templates")
      .select("*")
      .eq("school_id", schoolId)
      .eq("event_key", "notice")
      .eq("enabled", true)
      .not("meta_template_name", "is", null)
      .limit(1)
      .maybeSingle();
    template = data;
    if (!template?.meta_template_name) {
      return reply(409, { error: "Para a Meta, configure primeiro um template aprovado do tipo Novo comunicado." });
    }
  }

  const { data: school } = await db.from("schools").select("name").eq("id", schoolId).maybeSingle();
  let queued = 0;
  let skipped = 0;

  for (const student of students ?? []) {
    let mode = recipientMode;
    if (audience === "guardians") mode = "guardian";
    else if (audience === "students") mode = "student";

    const to = recipient(student, mode);
    if (!to) {
      skipped++;
      continue;
    }

    const bodyText = `${title}\n\n${message}`.slice(0, 4000);
    const dedupe = `broadcast:${crypto.randomUUID()}:${student.id}`;
    const providerPayload = channel.provider_key === "meta"
      ? {
          templateName: String(template.meta_template_name),
          language: String(template.meta_language ?? "pt_BR"),
          parameters: (Array.isArray(template.meta_parameter_keys) ? template.meta_parameter_keys : []).map((key: string) => ({
            escola: school?.name ?? "",
            titulo: title,
            aviso: message,
            aluno: student.name ?? "",
            responsavel: student.guardian_name || student.name || "",
          } as any)[key] ?? ""),
        }
      : { kind: "robot_raw" };

    const { error } = await db.from("message_outbox").insert({
      school_id: schoolId,
      channel_id: channelId,
      student_id: student.id,
      recipient_phone: to,
      message_body: bodyText,
      dedupe_key: dedupe,
      scheduled_for: new Date().toISOString(),
      status: "queued",
      provider_payload: providerPayload,
    });
    if (!error) queued++;
    else skipped++;
  }

  await db.from("audit_logs").insert({
    school_id: schoolId,
    actor_user_id: userData.user.id,
    action: "notice_broadcast_queued",
    entity_type: "notice",
    entity_id: null,
    metadata: { channel_id: channelId, audience, queued, skipped, title },
  });

  if (queued === 0) {
    const error = (students ?? []).length === 0
      ? "Nenhum aluno sincronizado e ativo foi encontrado para este público. Sincronize os cadastros e tente novamente."
      : "Nenhum destinatário possui telefone válido para este envio.";
    return reply(422, { error, queued, skipped, recipientsFound: (students ?? []).length });
  }

  const dispatch = await triggerWorker(db, url, String(channel.provider_key));
  if (!dispatch.ok) {
    return reply(502, {
      error: "As mensagens entraram na fila, mas o envio imediato não pôde ser processado. Elas continuarão na fila para nova tentativa automática.",
      queued,
      skipped,
      workerError: dispatch.error,
    });
  }

  return reply(200, {
    ok: true,
    queued,
    skipped,
    immediate: true,
    sent: Number((dispatch.data as any)?.sent ?? 0),
    failed: Number((dispatch.data as any)?.failed ?? 0),
  });
});
