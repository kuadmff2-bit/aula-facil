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
  try { body = await req.json(); } catch { return reply(400, { error: "JSON inválido." }); }
  const channelId = typeof body?.channelId === "string" ? body.channelId : "";
  const action = typeof body?.action === "string" ? body.action : "status";
  if (!channelId || !["start", "status", "disconnect"].includes(action)) return reply(400, { error: "Canal ou ação inválida." });

  const { data: channel } = await db.from("message_channels").select("id,school_id,provider_key,public_config").eq("id", channelId).maybeSingle();
  if (!channel || channel.provider_key !== "robot_webhook") return reply(404, { error: "Canal Robô AulaFácil não encontrado." });

  const { data: member } = await db.from("school_members").select("role,active").eq("school_id", channel.school_id).eq("user_id", userData.user.id).eq("active", true).maybeSingle();
  if (!member || !["owner", "admin"].includes(member.role)) return reply(403, { error: "Somente proprietário ou administrador pode conectar o WhatsApp." });

  const { data: gatewayUrl } = await db.rpc("service_get_system_secret", { target_name: "robot_gateway_url" });
  const { data: gatewayToken } = await db.rpc("service_get_system_secret", { target_name: "robot_gateway_token" });
  if (!gatewayUrl || !gatewayToken) return reply(503, { error: "O servidor do Robô AulaFácil ainda não foi ativado para esta instalação." });

  const path = action === "start" ? "sessions/start" : action === "disconnect" ? "sessions/disconnect" : "sessions/status";
  const res = await fetch(`${String(gatewayUrl).replace(/\/$/, "")}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-aulafacil-robot-token": String(gatewayToken) },
    body: JSON.stringify({ channelId, schoolId: channel.school_id }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return reply(res.status, { error: data?.error || "O Robô AulaFácil não respondeu." });

  const state = String(data?.status ?? "disconnected");
  const connected = state === "connected";
  const sessionError = typeof data?.sessionError === "string" && data.sessionError.trim() ? data.sessionError.trim().slice(0, 500) : null;
  await db.from("message_channels").update({
    credentials_configured: connected,
    public_config: {
      ...(channel.public_config ?? {}),
      robotStatus: state,
      phone: data?.phone || null,
      lastRobotError: sessionError,
      lastRobotCheck: new Date().toISOString(),
    },
  }).eq("id", channelId);

  return reply(200, { ok: true, status: state, qr: data?.qr || null, phone: data?.phone || null, sessionError });
});
