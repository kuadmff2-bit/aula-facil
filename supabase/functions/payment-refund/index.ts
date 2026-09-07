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
function clean(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function money(value: unknown) { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function positive(value: unknown) { const n = money(value); return n > 0 ? n : 0; }
function decodeSecret(value: unknown) {
  if (typeof value !== "string" || !value) throw new Error("Credenciais do provedor não encontradas.");
  const parsed = JSON.parse(value);
  if (!parsed?.credentials || typeof parsed.credentials !== "object") throw new Error("Credenciais do provedor estão inválidas.");
  return parsed.credentials as Record<string, string>;
}
async function jsonFetch(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Provedor respondeu ${response.status}: ${JSON.stringify(data).slice(0, 700)}`);
  return data;
}

type ProviderState = {
  refundedAmount: number;
  refundState: "none" | "pending" | "partial" | "full" | "chargeback";
  status: string;
  metadata: Record<string, unknown>;
};

function asaasRefundState(payment: any, originalAmount: number): ProviderState {
  const refunds = Array.isArray(payment?.refunds) ? payment.refunds : [];
  const done = refunds.filter((item: any) => String(item?.status ?? "").toUpperCase() === "DONE");
  const pending = refunds.some((item: any) => String(item?.status ?? "").toUpperCase() === "PENDING");
  let refundedAmount = money(done.reduce((sum: number, item: any) => sum + positive(item?.value), 0));
  const status = String(payment?.status ?? "").toUpperCase();
  let refundState: ProviderState["refundState"] = "none";
  if (status === "REFUNDED") { refundState = "full"; refundedAmount = originalAmount; }
  else if (refundedAmount >= originalAmount && originalAmount > 0) { refundState = "full"; refundedAmount = originalAmount; }
  else if (refundedAmount > 0) refundState = "partial";
  else if (pending) refundState = "pending";
  return {
    refundedAmount,
    refundState,
    status,
    metadata: { refunds: refunds.slice(0, 20).map((r: any) => ({ status: r?.status, value: r?.value, dateCreated: r?.dateCreated, transactionReceiptUrl: r?.transactionReceiptUrl ?? null })) },
  };
}

function mercadoPagoRefundState(payment: any, originalAmount: number): ProviderState {
  const status = String(payment?.status ?? "").toLowerCase();
  let refundedAmount = money(payment?.transaction_amount_refunded ?? 0);
  let refundState: ProviderState["refundState"] = "none";
  if (status === "refunded") { refundState = "full"; refundedAmount = originalAmount; }
  else if (status === "charged_back") { refundState = "chargeback"; refundedAmount = originalAmount; }
  else if (refundedAmount >= originalAmount && originalAmount > 0) { refundState = "full"; refundedAmount = originalAmount; }
  else if (refundedAmount > 0) refundState = "partial";
  return { refundedAmount, refundState, status, metadata: { status_detail: payment?.status_detail ?? null, transaction_amount_refunded: refundedAmount } };
}

function pagarmeRefundState(charge: any, originalAmount: number): ProviderState {
  const status = String(charge?.status ?? charge?.last_transaction?.status ?? "").toLowerCase();
  let refundedAmount = money(Number(charge?.refunded_amount ?? charge?.amount_refunded ?? charge?.last_transaction?.refunded_amount ?? 0) / 100);
  let refundState: ProviderState["refundState"] = "none";
  if (status === "chargedback") { refundState = "chargeback"; refundedAmount = originalAmount; }
  else if (status === "refunded") { refundState = "full"; refundedAmount = originalAmount; }
  else if (status === "partial_refunded") refundState = "partial";
  else if (status === "waiting_cancellation") refundState = "pending";
  else if (refundedAmount >= originalAmount && originalAmount > 0) { refundState = "full"; refundedAmount = originalAmount; }
  else if (refundedAmount > 0) refundState = "partial";
  return { refundedAmount, refundState, status, metadata: { charge_status: status, last_transaction_status: charge?.last_transaction?.status ?? null, refunded_amount: refundedAmount } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Método não permitido." });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return reply(401, { error: "Sessão ausente." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return reply(503, { error: "Backend financeiro indisponível." });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return reply(401, { error: "Sessão inválida ou expirada." });

  let body: any;
  try { body = await req.json(); } catch { return reply(400, { error: "JSON inválido." }); }
  const paymentId = clean(body?.paymentId, 80);
  const reason = clean(body?.reason, 500);
  const requestedAmount = body?.amount == null || body?.amount === "" ? null : money(body.amount);
  if (!paymentId) return reply(400, { error: "Pagamento é obrigatório." });
  if (reason.length < 4) return reply(400, { error: "Informe o motivo do estorno." });
  if (requestedAmount !== null && requestedAmount <= 0) return reply(400, { error: "O valor do estorno precisa ser maior que zero." });

  const { data: payment, error: paymentError } = await admin.from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (paymentError) return reply(500, { error: "Não foi possível carregar o pagamento." });
  if (!payment) return reply(404, { error: "Pagamento não encontrado." });
  if (!payment.invoice_id) return reply(409, { error: "Este pagamento não está vinculado a uma mensalidade." });
  if (!payment.provider || !payment.provider_payment_id) return reply(409, { error: "Este pagamento não foi confirmado por um provedor bancário. Use a reabertura de pagamento manual." });
  if (!["asaas", "mercado_pago", "pagarme"].includes(String(payment.provider))) return reply(409, { error: "Este provedor ainda não possui estorno automático seguro." });

  const { data: invoice, error: invoiceError } = await admin.from("invoices").select("*").eq("id", payment.invoice_id).maybeSingle();
  if (invoiceError || !invoice) return reply(404, { error: "Mensalidade do pagamento não encontrada." });
  const { data: member } = await admin.from("school_members").select("role,active").eq("school_id", payment.school_id).eq("user_id", userData.user.id).eq("active", true).maybeSingle();
  if (!member || !["owner", "admin", "finance"].includes(member.role)) return reply(403, { error: "Seu usuário não possui permissão financeira para estornar pagamentos." });

  const originalAmount = money(payment.amount_received);
  const alreadyRefunded = money(payment.refunded_amount ?? 0);
  const remaining = money(originalAmount - alreadyRefunded);
  if (remaining <= 0 || payment.refund_status === "full" || payment.status === "refunded") return reply(409, { error: "Este pagamento já foi estornado integralmente." });
  const amountToRefund = requestedAmount === null ? remaining : requestedAmount;
  if (amountToRefund > remaining) return reply(409, { error: `O valor máximo disponível para estorno é R$ ${remaining.toFixed(2)}.` });
  const targetTotal = money(alreadyRefunded + amountToRefund);

  const metadata = invoice.provider_metadata && typeof invoice.provider_metadata === "object" ? invoice.provider_metadata as Record<string, unknown> : {};
  const connectionId = clean(metadata.connectionId, 80);
  if (!connectionId) return reply(409, { error: "A conexão usada neste pagamento não pôde ser identificada." });
  if (payment.provider === "pagarme" && String(metadata.method ?? "").toLowerCase() === "boleto") {
    return reply(409, { error: "Boleto Pagar.me não será estornado automaticamente pelo AulaFácil porque a devolução pode exigir dados bancários do pagador. Registre esse estorno pelo provedor e o AulaFácil reconhecerá a devolução pelo webhook/reconciliador." });
  }

  const { data: connection } = await admin.from("payment_connections").select("*").eq("id", connectionId).eq("school_id", payment.school_id).maybeSingle();
  if (!connection || !connection.credentials_configured) return reply(409, { error: "A conexão bancária usada no pagamento não está mais disponível." });
  const { data: secretText, error: secretError } = await admin.rpc("service_get_payment_connection_secret", { target_connection_id: connection.id });
  if (secretError || !secretText) return reply(503, { error: "As credenciais do provedor não estão disponíveis." });
  const credentials = decodeSecret(secretText);

  const { data: claimData, error: claimError } = await admin.rpc("service_claim_payment_refund_attempt", { target_payment: payment.id, target_requested_total: targetTotal });
  if (claimError) return reply(422, { error: "Não foi possível reservar o estorno com segurança." });
  const claim: any = claimData ?? {};
  if (claim.action === "busy") return reply(409, { error: "Já existe um estorno deste pagamento em andamento. Aguarde alguns instantes e atualize o financeiro." });
  if (claim.action === "already_applied") return reply(200, { ok: true, reused: true, provider: payment.provider, requestedAmount: amountToRefund, refundedAmount: Number(claim.refundedAmount ?? alreadyRefunded), refundState: claim.refundStatus ?? payment.refund_status });
  const leaseToken = String(claim.leaseToken ?? "");

  const applyState = async (state: ProviderState, source: string) => {
    const normalizedAmount = money(Math.max(alreadyRefunded, state.refundedAmount));
    let normalizedState = state.refundState;
    if (normalizedState === "none" && normalizedAmount > 0) normalizedState = normalizedAmount >= originalAmount ? "full" : "partial";
    if (normalizedState === "none") normalizedState = "pending";
    const { data, error } = await admin.rpc("service_apply_provider_refund", {
      target_provider: payment.provider,
      target_provider_payment_id: payment.provider_payment_id,
      target_refunded_amount: normalizedAmount,
      target_refund_state: normalizedState,
      target_source: source,
      target_reason: reason,
      target_metadata: { ...state.metadata, requestedAmount: amountToRefund, requestedTotal: targetTotal, requestedBy: userData.user.id },
    });
    if (error) throw error;
    return { row: Array.isArray(data) ? data[0] : data, normalizedAmount, normalizedState };
  };

  try {
    let before: ProviderState;
    let after: ProviderState;

    if (payment.provider === "asaas") {
      const apiKey = credentials.api_key;
      if (!apiKey) throw new Error("API Key do Asaas não configurada.");
      const base = connection.environment === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
      const headers = { access_token: apiKey, "Content-Type": "application/json" };
      const current = await jsonFetch(`${base}/payments/${encodeURIComponent(payment.provider_payment_id)}`, { headers });
      before = asaasRefundState(current, originalAmount);
      if (before.refundedAmount < targetTotal) {
        const delta = money(targetTotal - before.refundedAmount);
        await jsonFetch(`${base}/payments/${encodeURIComponent(payment.provider_payment_id)}/refund`, {
          method: "POST", headers, body: JSON.stringify({ value: delta, description: reason }),
        });
      }
      const checked = await jsonFetch(`${base}/payments/${encodeURIComponent(payment.provider_payment_id)}`, { headers });
      after = asaasRefundState(checked, originalAmount);
    } else if (payment.provider === "mercado_pago") {
      const accessToken = credentials.access_token;
      if (!accessToken) throw new Error("Access Token do Mercado Pago não configurado.");
      const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
      const current = await jsonFetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(payment.provider_payment_id)}`, { headers });
      before = mercadoPagoRefundState(current, originalAmount);
      if (before.refundedAmount < targetTotal) {
        const delta = money(targetTotal - before.refundedAmount);
        await jsonFetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(payment.provider_payment_id)}/refunds`, {
          method: "POST",
          headers: { ...headers, "X-Idempotency-Key": `aulafacil-refund-${payment.id}-${Math.round(targetTotal * 100)}` },
          body: JSON.stringify({ amount: delta }),
        });
      }
      const checked = await jsonFetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(payment.provider_payment_id)}`, { headers });
      after = mercadoPagoRefundState(checked, originalAmount);
    } else {
      const secretKey = credentials.secret_key;
      if (!secretKey) throw new Error("Secret Key do Pagar.me não configurada.");
      const headers = { Authorization: `Basic ${btoa(`${secretKey}:`)}`, "Content-Type": "application/json" };
      const current = await jsonFetch(`https://api.pagar.me/core/v5/charges/${encodeURIComponent(payment.provider_payment_id)}`, { headers });
      before = pagarmeRefundState(current, originalAmount);
      if (before.refundedAmount < targetTotal) {
        const deltaCents = Math.round(money(targetTotal - before.refundedAmount) * 100);
        await jsonFetch(`https://api.pagar.me/core/v5/charges/${encodeURIComponent(payment.provider_payment_id)}`, {
          method: "DELETE", headers, body: JSON.stringify({ amount: deltaCents }),
        });
      }
      const checked = await jsonFetch(`https://api.pagar.me/core/v5/charges/${encodeURIComponent(payment.provider_payment_id)}`, { headers });
      after = pagarmeRefundState(checked, originalAmount);
    }

    const providerReachedTarget = after.refundedAmount >= targetTotal || ["full", "chargeback"].includes(after.refundState);
    const stateToApply: ProviderState = providerReachedTarget ? after : { ...after, refundState: after.refundState === "none" ? "pending" : after.refundState };
    const applied = await applyState(stateToApply, "user:payment-refund");
    if (leaseToken) await admin.rpc("service_complete_payment_refund_attempt", { target_payment: payment.id, target_lease_token: leaseToken, target_requested_total: targetTotal });
    await admin.from("audit_logs").insert({
      school_id: payment.school_id, actor_user_id: userData.user.id, action: "payment_refund_requested", entity_type: "payment", entity_id: payment.id,
      metadata: { provider: payment.provider, provider_payment_id: payment.provider_payment_id, requested_amount: amountToRefund, requested_total: targetTotal, provider_refunded_amount: after.refundedAmount, provider_refund_state: after.refundState, reason },
    });
    return reply(200, {
      ok: true,
      reused: before.refundedAmount >= targetTotal,
      provider: payment.provider,
      requestedAmount: amountToRefund,
      refundedAmount: Number(applied.row?.refunded_amount ?? applied.normalizedAmount),
      refundState: applied.row?.refund_status ?? applied.normalizedState,
      completed: providerReachedTarget,
      message: providerReachedTarget ? "Estorno confirmado pelo provedor." : "Estorno solicitado ao provedor e aguardando confirmação.",
    });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 700);
    if (leaseToken) {
      try {
        await admin.rpc("service_fail_payment_refund_attempt", { target_payment: payment.id, target_lease_token: leaseToken, target_error: message });
      } catch {
        // Falha ao registrar a tentativa nunca deve esconder o erro original do provedor.
      }
    }
    await admin.from("audit_logs").insert({ school_id: payment.school_id, actor_user_id: userData.user.id, action: "payment_refund_failed", entity_type: "payment", entity_id: payment.id, metadata: { provider: payment.provider, requested_amount: amountToRefund, requested_total: targetTotal, error: message } });
    return reply(422, { error: message || "O provedor não conseguiu iniciar o estorno." });
  }
});
