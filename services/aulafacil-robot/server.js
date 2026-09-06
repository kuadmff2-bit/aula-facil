import crypto from "node:crypto";
import express from "express";
import QRCode from "qrcode";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth } = pkg;
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

const PORT = Number(process.env.PORT || 3000);
const TOKEN = String(process.env.AULAFACIL_ROBOT_TOKEN || "");
const DATA_PATH = process.env.AULAFACIL_ROBOT_DATA_PATH || "/data/whatsapp";
const MAX_SESSIONS = Math.max(1, Number(process.env.AULAFACIL_ROBOT_MAX_SESSIONS || 100));
const MIN_SEND_INTERVAL_MS = Math.max(800, Number(process.env.AULAFACIL_ROBOT_SEND_INTERVAL_MS || 1800));

if (TOKEN.length < 32) {
  console.error("AULAFACIL_ROBOT_TOKEN precisa ter pelo menos 32 caracteres.");
  process.exit(1);
}

const sessions = new Map();

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function auth(req, res, next) {
  if (!safeEqual(req.get("x-aulafacil-robot-token"), TOKEN)) return res.status(401).json({ error: "unauthorized" });
  next();
}

function channelId(value) {
  const id = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new Error("channelId inválido");
  return id;
}

function phone(value) {
  let result = String(value || "").replace(/\D/g, "");
  if (result.length === 10 || result.length === 11) result = `55${result}`;
  if (result.length < 12 || result.length > 15) throw new Error("telefone inválido");
  return result;
}

function publicState(state) {
  return { status: state.status, qr: state.qr || null, phone: state.phone || null, sessionError: state.error || null, updatedAt: state.updatedAt };
}

async function destroySession(state) {
  if (!state?.client) return;
  await state.client.destroy().catch(() => undefined);
}

async function createSession(id, forceRestart = false) {
  const existing = sessions.get(id);
  if (existing && !forceRestart) return existing;
  if (existing && forceRestart) {
    await destroySession(existing);
    sessions.delete(id);
  }
  if (sessions.size >= MAX_SESSIONS) throw new Error("limite de sessões atingido");
  const state = {
    id,
    status: "starting",
    qr: null,
    phone: null,
    updatedAt: new Date().toISOString(),
    queue: Promise.resolve(),
    lastSendAt: 0,
    client: null,
    error: null,
  };
  const client = new Client({
    authStrategy: new LocalAuth({ clientId: id, dataPath: DATA_PATH }),
    authTimeoutMs: 120000,
    qrMaxRetries: 8,
    puppeteer: {
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      protocolTimeout: 120000,
      timeout: 120000,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--metrics-recording-only",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    },
  });
  state.client = client;
  sessions.set(id, state);

  client.on("qr", async (qr) => {
    state.status = "qr";
    state.qr = await QRCode.toDataURL(qr, { margin: 1, width: 360 });
    state.error = null;
    state.updatedAt = new Date().toISOString();
  });
  client.on("authenticated", () => {
    state.status = "connecting";
    state.qr = null;
    state.error = null;
    state.updatedAt = new Date().toISOString();
  });
  client.on("ready", () => {
    state.status = "connected";
    state.qr = null;
    state.error = null;
    state.phone = client.info?.wid?.user || null;
    state.updatedAt = new Date().toISOString();
  });
  client.on("auth_failure", () => {
    state.status = "auth_failure";
    state.qr = null;
    state.error = "Falha de autenticação do WhatsApp. Gere um novo QR Code.";
    state.phone = null;
    state.updatedAt = new Date().toISOString();
  });
  client.on("disconnected", () => {
    state.status = "disconnected";
    state.qr = null;
    state.error = null;
    state.phone = null;
    state.updatedAt = new Date().toISOString();
  });
  // Não há listener de mensagens recebidas: o Robô AulaFácil não atende nem responde usuários.
  client.initialize().catch((error) => {
    state.status = "error";
    state.error = String(error?.message || "Falha ao abrir o WhatsApp no servidor.");
    state.updatedAt = new Date().toISOString();
    console.error("Falha ao iniciar sessão", id, state.error);
  });
  return state;
}

async function enqueueSend(state, to, message) {
  state.queue = state.queue.then(async () => {
    const wait = Math.max(0, MIN_SEND_INTERVAL_MS - (Date.now() - state.lastSendAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    const chatId = `${to}@c.us`;
    const registered = await state.client.isRegisteredUser(chatId);
    if (!registered) throw new Error("número não registrado no WhatsApp");
    const result = await state.client.sendMessage(chatId, message);
    state.lastSendAt = Date.now();
    return result?.id?._serialized || "";
  });
  return state.queue;
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "aulafacil-robot", sessions: sessions.size }));
app.use(auth);

app.post("/sessions/start", async (req, res) => {
  try {
    const id = channelId(req.body?.channelId);
    const current = sessions.get(id);
    const restart = Boolean(current && ["error", "auth_failure", "disconnected"].includes(current.status));
    const state = await createSession(id, restart);
    res.json({ ok: true, ...publicState(state) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "não foi possível iniciar" });
  }
});

app.post("/sessions/status", async (req, res) => {
  try {
    const id = channelId(req.body?.channelId);
    const state = sessions.get(id) || await createSession(id);
    res.json({ ok: true, ...publicState(state) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "não foi possível consultar" });
  }
});

app.post("/sessions/disconnect", async (req, res) => {
  try {
    const id = channelId(req.body?.channelId);
    const state = sessions.get(id);
    if (state?.client) {
      await state.client.logout().catch(() => undefined);
      await state.client.destroy().catch(() => undefined);
      sessions.delete(id);
    }
    res.json({ ok: true, status: "disconnected", qr: null, phone: null });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "não foi possível desconectar" });
  }
});

app.post("/send", async (req, res) => {
  try {
    const id = channelId(req.body?.channelId);
    const to = phone(req.body?.to);
    const message = String(req.body?.message || "").trim().slice(0, 4000);
    if (!message) throw new Error("mensagem vazia");
    const state = sessions.get(id) || await createSession(id);
    if (state.status !== "connected") return res.status(409).json({ error: "WhatsApp não conectado", status: state.status });
    const messageId = await enqueueSend(state, to, message);
    res.json({ ok: true, messageId });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "envio falhou" });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`AulaFácil Robot ativo na porta ${PORT}`));
