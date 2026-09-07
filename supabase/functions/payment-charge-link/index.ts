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
function normalizePhone(value: unknown) {
  let phone = String(value ?? "").replace(/\D/g, "");
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  return phone.length >= 12 && phone.length <= 15 ? phone : "";
}
function money(value: unknown) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0); }
function dateLabel(value: unknown) {
  const date = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Método não permitido." });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return reply(401, { error: "Sessão ausente." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(503, { error: "Backend financeiro indisponível." });

  let body: any;
  try { body = await req.json(); } catch { return reply(400, { error: "JSON inválido." }); }
  const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId : "";
  if (!invoiceId) return reply(400, { error: "Cobrança não informada." });

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = auth.slice(7);
  const { data: userData } = await db.auth.getUser(token);
  if (!userData.user) return reply(401, { error: "Sessão inválida ou expirada." });

  let resolvedInvoiceId = invoiceId;
  const { data: directInvoice, error: directInvoiceError } = await db
    .from("invoices")
    .select("id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (directInvoiceError) return reply(500, { error: `Não foi possível validar a cobrança: ${directInvoiceError.message}` });

  if (!directInvoice?.id) {
    const { data: memberships, error: membershipError } = await db
      .from("school_members")
      .select("school_id")
      .eq("user_id", userData.user.id)
      .eq("active", true);
    if (membershipError) return reply(500, { error: "Não foi possível validar as instituições da sua conta." });

    const schoolIds = (memberships ?? []).map((item: any) => String(item.school_id)).filter(Boolean);
    if (schoolIds.length) {
      const { data: aliases, error: aliasError } = await db
        .from("invoice_sync_aliases")
        .select("school_id,canonical_invoice_id")
        .eq("local_invoice_id", invoiceId)
        .in("school_id", schoolIds)
        .limit(2);
      if (aliasError) return reply(500, { error: "Não foi possível reconciliar o identificador antigo da cobrança." });
      if ((aliases ?? []).length > 1) return reply(409, { error: "Esta cobrança possui mais de um identificador reconciliado. Sincronize novamente antes de emitir." });
      const canonicalId = String(aliases?.[0]?.canonical_invoice_id ?? "");
      if (canonicalId) resolvedInvoiceId = canonicalId;
    }
  }

  const chargeBody = { ...body, invoiceId: resolvedInvoiceId };
  const chargeRes = await fetch(`${url}/functions/v1/payment-charge`, {
    method: "POST",
    headers: { Authorization: auth, apikey: serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify(chargeBody),
  });
  const chargeData = await chargeRes.json().catch(() => ({}));
  if (!chargeRes.ok) return reply(chargeRes.status, { error: chargeData?.error || chargeData?.detail || "Não foi possível gerar a cobrança." });

  const { data: invoice, error: invoiceError } = await db
    .from("invoices")
    .select("id,school_id,student_id,status,reference,due_date,amount,provider_metadata")
    .eq("id", resolvedInvoiceId)
    .maybeSingle();
  if (invoiceError || !invoice) {
    return reply(200, { ...chargeData, publicPaymentUrl:"", delivery:{attempted:false,status:"warning",recipient:"",message:"Cobrança criada no provedor, mas o AulaFácil não conseguiu preparar o link do aluno. A cobrança permanece válida."}, secondaryWarning: invoiceError?.message || "Cobrança não encontrada após emissão." });
  }

  const { data: member } = await db.from("school_members").select("role,active").eq("school_id", invoice.school_id).eq("user_id", userData.user.id).eq("active", true).maybeSingle();
  if (!member || !["owner", "admin", "finance"].includes(member.role)) return reply(200, { ...chargeData, publicPaymentUrl:"", delivery:{attempted:false,status:"warning",recipient:"",message:"Cobrança criada, mas seu usuário não possui permissão para preparar o envio ao aluno."} });

  const { data: student, error: studentError } = await db.from("students").select("id,name,phone,guardian_phone").eq("id",invoice.student_id).eq("school_id",invoice.school_id).maybeSingle();
  if(studentError||!student){
    return reply(200,{...chargeData,publicPaymentUrl:"",delivery:{attempted:false,status:"warning",recipient:"",message:"Cobrança criada, mas os dados do aluno não puderam ser carregados para preparar o envio."},secondaryWarning:studentError?.message||"Aluno não encontrado."});
  }

  let environment = "production";
  const chargeMetadata = chargeData?.metadata && typeof chargeData.metadata === "object" ? chargeData.metadata : invoice.provider_metadata && typeof invoice.provider_metadata === "object" ? invoice.provider_metadata : {};
  const connectionId = String(chargeMetadata?.connectionId ?? "");
  if (connectionId) {
    const { data: connection } = await db.from("payment_connections").select("environment").eq("id", connectionId).eq("school_id", invoice.school_id).maybeSingle();
    if (connection?.environment === "sandbox") environment = "sandbox";
  }

  const method = body?.method === "boleto" ? "boleto" : "pix";
  const { data: existing } = await db.from("payment_links").select("token,revoked_at").eq("invoice_id", invoice.id).maybeSingle();

  let link: any = existing;
  let publicPaymentUrl="";
  let linkWarning="";
  try{
    if (!link || link.revoked_at) {
      if (link?.revoked_at) await db.from("payment_links").delete().eq("invoice_id", invoice.id);
      const { data: created, error: createError } = await db.from("payment_links").insert({ school_id: invoice.school_id, invoice_id: invoice.id, method }).select("token").single();
      if (createError) throw createError;
      link = created;
    } else {
      await db.from("payment_links").update({ method }).eq("invoice_id", invoice.id);
    }
    publicPaymentUrl = `${url}/functions/v1/payment-page?t=${encodeURIComponent(link.token)}`;
  }catch(error){linkWarning=String(error instanceof Error?error.message:error).slice(0,400)}

  const delivery: Record<string, unknown> = { attempted: false, status: "not_configured", recipient: null, message: linkWarning ? "Cobrança criada, mas o link do aluno não pôde ser preparado. O Pix/boleto do provedor continua válido." : "Cobrança criada. Nenhum canal automático de WhatsApp foi encontrado." };

  if(publicPaymentUrl){
    try {
      const billingPhone = normalizePhone(body?.billingProfile?.phone);
      const recipient = billingPhone || normalizePhone(student?.phone) || normalizePhone(student?.guardian_phone);
      const { data: channel } = await db.from("message_channels").select("id").eq("school_id", invoice.school_id).eq("provider_key", "robot_webhook").eq("enabled", true).eq("credentials_configured", true).order("created_at", { ascending: true }).limit(1).maybeSingle();

      if (!recipient) {
        delivery.status = "missing_phone";
        delivery.message = "Cobrança criada, mas o aluno não possui telefone válido para envio automático.";
      } else if (!channel?.id) {
        delivery.status = "not_configured";
        delivery.recipient = recipient;
        delivery.message = "Cobrança criada, mas o Robô WhatsApp não está configurado.";
      } else {
        const studentName = String(student?.name ?? "aluno").trim() || "aluno";
        const reference = String(invoice.reference ?? "mensalidade").trim() || "mensalidade";
        const due = dateLabel(invoice.due_date);
        const amount = money(chargeData?.amount ?? invoice.amount);
        const sandbox = environment === "sandbox";
        const message = [
          sandbox ? "🧪 TESTE DO AULAFÁCIL — ESTA COBRANÇA NÃO É REAL" : `Olá, ${studentName}!`,
          sandbox ? `Aluno: ${studentName}` : "", "",
          sandbox ? `Foi gerada uma cobrança de teste referente a ${reference}.` : `Foi gerada uma cobrança referente a ${reference}.`,
          `Valor: ${amount}`, due ? `Vencimento: ${due}` : "", "",
          `${sandbox ? "Link de teste" : "Pague pelo link seguro do AulaFácil"}: ${publicPaymentUrl}`, "",
          sandbox ? "Este link usa o ambiente SANDBOX do provedor e não representa uma cobrança real." : "Se você já realizou o pagamento, desconsidere esta mensagem.",
        ].filter(Boolean).join("\n").slice(0, 4000);

        const providerChargeId = String(chargeData?.providerChargeId ?? "");
        const dedupeKey = `charge_created:${invoice.id}:${providerChargeId || link.token}`.slice(0, 300);
        let { data: outbox } = await db.from("message_outbox").select("id,status,attempts,last_error,sent_at").eq("dedupe_key", dedupeKey).maybeSingle();
        if (!outbox) {
          const inserted = await db.from("message_outbox").insert({ school_id: invoice.school_id, channel_id: channel.id, student_id: invoice.student_id, invoice_id: invoice.id, recipient_phone: recipient, message_body: message, dedupe_key: dedupeKey, scheduled_for: new Date().toISOString(), status: "queued", provider_payload: { kind: "robot_raw", source: "payment_charge_created", publicPaymentUrl, environment } }).select("id,status,attempts,last_error,sent_at").single();
          if (inserted.error) throw inserted.error;
          outbox = inserted.data;
        }

        delivery.attempted = true; delivery.recipient = recipient; delivery.status = outbox?.status ?? "queued";
        delivery.message = sandbox ? "Cobrança de teste colocada na fila do WhatsApp." : "Cobrança colocada na fila de envio do WhatsApp.";

        const { data: cronToken } = await db.rpc("service_get_system_secret", { target_name: "message_cron_token" });
        if (cronToken) await fetch(`${url}/functions/v1/robot-worker`, { method: "POST", headers: { "Content-Type": "application/json", "x-aulafacil-cron": String(cronToken) }, body: JSON.stringify({ source: "payment-charge-link", outboxId: outbox?.id ?? null }) }).catch(() => undefined);

        if (outbox?.id) {
          const { data: refreshed } = await db.from("message_outbox").select("status,attempts,last_error,sent_at,provider_message_id").eq("id", outbox.id).maybeSingle();
          if (refreshed) {
            delivery.status = refreshed.status; delivery.attempts = refreshed.attempts; delivery.sentAt = refreshed.sent_at; delivery.providerMessageId = refreshed.provider_message_id; delivery.error = refreshed.last_error;
            delivery.message = refreshed.status === "sent" ? sandbox ? "Cobrança de TESTE enviada ao WhatsApp do aluno." : "Cobrança enviada ao WhatsApp do aluno." : refreshed.status === "failed" ? "Cobrança criada, mas o envio pelo WhatsApp falhou e ficará disponível para nova tentativa." : "Cobrança criada e aguardando envio pelo WhatsApp.";
          }
        }
      }
    } catch (error) {
      delivery.attempted = true; delivery.status = "failed"; delivery.message = "Cobrança criada, mas não foi possível preparar o envio automático pelo WhatsApp."; delivery.error = String(error instanceof Error ? error.message : error).slice(0, 500);
    }
  }

  return reply(200, { ...chargeData, metadata: chargeMetadata, publicPaymentUrl, environment, delivery, secondaryWarning:linkWarning||undefined });
});
