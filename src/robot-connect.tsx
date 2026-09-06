import { CheckCircle2, Link2, LogOut, QrCode, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MessageChannel } from "./message-automations";
import { disconnectRobotSession, getRobotSession, startRobotSession, type RobotSessionState } from "./robot-client";

type Props = {
  channel: MessageChannel;
  disabled?: boolean;
  onChanged?: () => void | Promise<void>;
};

function initialState(channel: MessageChannel): RobotSessionState {
  const status = typeof channel.publicConfig.robotStatus === "string"
    ? String(channel.publicConfig.robotStatus)
    : channel.credentialsConfigured ? "connected" : "disconnected";
  return {
    status,
    qr: null,
    phone: typeof channel.publicConfig.phone === "string" ? String(channel.publicConfig.phone) : null,
    sessionError: typeof channel.publicConfig.lastRobotError === "string" ? String(channel.publicConfig.lastRobotError) : null,
  };
}

export function RobotConnectBox({ channel, disabled, onChanged }: Props) {
  const [state, setState] = useState<RobotSessionState>(() => initialState(channel));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const refresh = async () => {
    const next = await getRobotSession(channel.id);
    setState(next);
    if (next.sessionError) setError(next.sessionError);
    if (next.status === "connected") {
      setError("");
      stopPolling();
      await onChanged?.();
    } else if (next.status === "error" || next.status === "auth_failure") {
      stopPolling();
      setError(next.sessionError || (next.status === "auth_failure" ? "O WhatsApp recusou a autenticação. Tente conectar novamente." : "O servidor não conseguiu iniciar o WhatsApp. Tente novamente."));
    }
    return next;
  };

  const beginPolling = () => {
    stopPolling();
    pollRef.current = window.setInterval(() => {
      void refresh().catch((cause) => {
        stopPolling();
        setError(cause instanceof Error ? cause.message : "Não foi possível conferir o WhatsApp.");
      });
    }, 3000);
    window.setTimeout(stopPolling, 120000);
  };

  useEffect(() => {
    setState(initialState(channel));
    return stopPolling;
  }, [channel.id, channel.credentialsConfigured]);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const next = await startRobotSession(channel.id);
      setState(next);
      if (next.status === "connected") await onChanged?.();
      else if (next.status === "error" || next.status === "auth_failure") setError(next.sessionError || "Não foi possível iniciar o WhatsApp.");
      else beginPolling();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar o Robô AulaFácil.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError("");
    stopPolling();
    try {
      setState(await disconnectRobotSession(channel.id));
      await onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível desconectar o WhatsApp.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="robot-connect-box">
      {state.status === "connected" ? (
        <>
          <span className="robot-connected"><CheckCircle2 size={16} /> WhatsApp conectado{state.phone ? ` · +${state.phone}` : ""}</span>
          <button type="button" className="secondary-button small" disabled={disabled || busy} onClick={() => void refresh()}><RefreshCw size={15} /> Verificar</button>
          <button type="button" className="secondary-button small" disabled={disabled || busy} onClick={() => void disconnect()}><LogOut size={15} /> Desconectar</button>
        </>
      ) : (
        <>
          <button type="button" className="secondary-button small" disabled={disabled || busy} onClick={() => void start()}><Link2 size={15} /> {busy ? "Preparando..." : "Conectar WhatsApp"}</button>
          {state.status === "starting" && <span className="robot-status"><RefreshCw size={15} /> Abrindo WhatsApp...</span>}
          {state.status === "connecting" && <span className="robot-status"><RefreshCw size={15} /> Finalizando conexão...</span>}
        </>
      )}
      {state.qr && <div className="robot-qr"><div><QrCode size={18}/><strong>Leia este QR Code no WhatsApp</strong><span>WhatsApp → Aparelhos conectados → Conectar aparelho</span></div><img src={state.qr} alt="QR Code para conectar o WhatsApp ao Robô AulaFácil" /></div>}
      {error && <span className="robot-error">{error}</span>}
    </div>
  );
}
