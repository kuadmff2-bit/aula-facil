import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (
    env.VITE_SUPABASE_PUBLISHABLE_KEY &&
    !env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")
  ) {
    throw new Error(
      "Use somente uma chave sb_publishable_ no cliente; credenciais administrativas não podem entrar no build.",
    );
  }
  return {
    plugins: [react()],
    clearScreen: false,
    server: { host: "127.0.0.1", port: 1420, strictPort: true },
  };
});
