import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function cleanString(value: unknown, max = 8000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return response(405, { error: "Método não permitido." });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return response(401, { error: "Sessão ausente." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return response(503, { error: "Backend de mensagens indisponível." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return response(401, { error: "Sessão inválida ou expirada." });

  let body: any;
  try { body = await req.json(); } catch { return response(400, { error: "JSON inválido." }); }
  const channelId = cleanString(body?.channelId, 80);
  const action = cleanString(body?.action, 30) || "configure";
  if (!channelId) return response(400, { error: "Canal não informado." });

  const { data: channel, error: channelError } = await admin.from("message_channels").select("id,school_id,provider_key").eq("id", channelId).maybeSingle();
  if (channelError) return response(500, { error: "Não foi possível validar o canal." });
  if (!channel) return response(404, { error: "Canal não encontrado." });

  const { data: member } = await admin.from("school_members").select("role,active").eq("school_id", channel.school_id).eq("user_id", userData.user.id).eq("active", true).maybeSingle();
  if (!member || !["owner", "admin"].includes(member.role)) return response(403, { error: "Somente proprietário ou administrador pode alterar credenciais de mensagens." });

  try {
    if (action === "configure") {
      const raw = body?.credentials && typeof body.credentials === "object" ? body.credentials : {};
      let credentials: Record<string, string>;
      if (channel.provider_key === "meta") {
        const accessToken = cleanString(raw.access_token, 12000);
        const phoneNumberId = cleanString(raw.phone_number_id, 200);
        const businessAccountId = cleanString(raw.business_account_id, 200);
        if (!accessToken || !phoneNumberId) return response(400, { error: "Token de acesso e Phone Number ID são obrigatórios." });
        credentials = { access_token: accessToken, phone_number_id: phoneNumberId, business_account_id: businessAccountId };
      } else if (channel.provider_key === "robot_webhook") {
        const webhookUrl = cleanString(raw.webhook_url, 2000);
        const authToken = cleanString(raw.auth_token, 8000);
        if (!webhookUrl || !/^https:\/\//i.test(webhookUrl)) return response(400, { error: "Informe uma URL HTTPS válida para o robô." });
        credentials = { webhook_url: webhookUrl, auth_token: authToken };
      } else {
        return response(400, { error: "Provedor de mensagens desconhecido." });
      }
      const payload = JSON.stringify({ provider: channel.provider_key, credentials, updatedAt: new Date().toISOString() });
      const { error } = await admin.rpc("service_set_message_channel_secret", { target_channel_id: channelId, secret_payload: payload });
      if (error) throw error;
      return response(200, { ok: true, credentialsConfigured: true });
    }

    if (action === "clear") {
      const { error } = await admin.rpc("service_clear_message_channel_secret", { target_channel_id: channelId });
      if (error) throw error;
      return response(200, { ok: true, credentialsConfigured: false });
    }

    if (action === "delete") {
      const { error: clearError } = await admin.rpc("service_clear_message_channel_secret", { target_channel_id: channelId });
      if (clearError) throw clearError;
      const { error: deleteError } = await admin.from("message_channels").delete().eq("id", channelId);
      if (deleteError) throw deleteError;
      return response(200, { ok: true, deleted: true });
    }

    return response(400, { error: "Ação desconhecida." });
  } catch {
    return response(500, { error: "Não foi possível atualizar a configuração do canal. Nenhum segredo foi devolvido ao aplicativo." });
  }
});