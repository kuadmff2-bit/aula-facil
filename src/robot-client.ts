import { cloud } from "./cloud";

export type RobotSessionState = {
  status: "starting" | "qr" | "connecting" | "connected" | "disconnected" | "auth_failure" | "error" | string;
  qr: string | null;
  phone: string | null;
};

async function action(channelId: string, actionName: "start" | "status" | "disconnect") {
  const { data, error } = await cloud.functions.invoke("robot-session", { body: { channelId, action: actionName } });
  if (error) throw new Error(`O Robô AulaFácil não respondeu: ${error.message}`);
  if (data?.error) throw new Error(String(data.error));
  return {
    status: String(data?.status ?? "disconnected"),
    qr: typeof data?.qr === "string" ? data.qr : null,
    phone: typeof data?.phone === "string" ? data.phone : null,
  } satisfies RobotSessionState;
}

export const startRobotSession = (channelId: string) => action(channelId, "start");
export const getRobotSession = (channelId: string) => action(channelId, "status");
export const disconnectRobotSession = (channelId: string) => action(channelId, "disconnect");
