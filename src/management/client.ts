import { publicConfig } from "./public-config";
import { createClient } from "@supabase/supabase-js";
import { secureAuthStorage } from "../secure-auth-storage";
import type { ListResult, Row, School } from "./types";
const url = import.meta.env.VITE_SUPABASE_URL || publicConfig.url;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || publicConfig.key;
export const apiUrl = url;
export const publishableKey = key;
export const configured = Boolean(
  url && key && key.startsWith("sb_publishable_"),
);
export const client = createClient(
  url || "https://unconfigured.supabase.co",
  key || "unconfigured",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
      storage: secureAuthStorage,
    },
  },
);
export function errorMessage(e: unknown) {
  const x = e as { code?: string; message?: string };
  if (x.code === "42501") return "Você não tem permissão para esta ação.";
  if (x.code === "23505")
    return "Este registro já existe. Confira os dados antes de tentar novamente.";
  if (x.code === "23503")
    return "O registro está vinculado a outros dados ou a seleção não pertence à instituição.";
  if (x.code === "23514" || x.code === "22P02")
    return "Confira os campos informados. Um dos valores é inválido.";
  if (x.code === "P0001")
    return x.message || "Não foi possível concluir a operação.";
  if (/fetch|network/i.test(x.message || ""))
    return "Não foi possível conectar. Confira sua internet e tente novamente.";
  if (x.code?.startsWith("PGRST"))
    return "O serviço de dados está indisponível ou precisa ser atualizado.";
  return x.message && !x.code
    ? x.message
    : "Não foi possível concluir. Tente novamente ou procure o administrador.";
}
export async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (!navigator.onLine)
    throw new Error("Sem conexão. Conecte-se à internet para continuar.");
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data as T;
}
export async function schools(): Promise<School[]> {
  const { data, error } = await client
    .from("school_members")
    .select("role,school:schools(*)")
    .eq("user_id", (await client.auth.getUser()).data.user?.id ?? "")
    .eq("active", true);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...(r.school as unknown as School),
    role: r.role,
  }));
}
export const list = (
  school: string,
  resource: string,
  search = "",
  page = 0,
  filter = "",
  from = "",
  to = "",
) =>
  rpc<ListResult>("af_list", {
    p_school: school,
    p_resource: resource,
    p_search: search,
    p_page: page,
    p_filter: filter,
    p_from: from || null,
    p_to: to || null,
  });
export const save = (
  school: string,
  resource: string,
  values: Record<string, unknown>,
  id: string | null = null,
) =>
  rpc<Row>("af_save", {
    p_school: school,
    p_resource: resource,
    p_data: values,
    p_id: id,
  });
