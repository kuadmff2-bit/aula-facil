import { useState } from "react";
import { GraduationCap, ArrowRight, ShieldCheck } from "lucide-react";
import { client, configured } from "./client";
import { ActionForm, Field } from "./ui";
export function Auth({
  recovery = false,
  onRecovered,
}: {
  recovery?: boolean;
  onRecovered?: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [message, setMessage] = useState("");
  return (
    <main className="auth-page">
      <aside>
        <div className="brand">
          <GraduationCap />
          AulaFácil
        </div>
        <div>
          <span className="eyebrow">GESTÃO EDUCACIONAL</span>
          <h1>
            Mais tempo para
            <br />
            quem aprende.
          </h1>
          <p>
            Alunos, matrículas e financeiro.
            <br />A rotina da sua instituição em um só lugar.
          </p>
        </div>
        <small>
          <ShieldCheck size={16} /> Acesso individual · Dados por instituição
        </small>
      </aside>
      <section>
        <div className="auth-form">
          <div className="brand mobile-brand">
            <GraduationCap />
            AulaFácil
          </div>
          <h2>
            {recovery
              ? "Defina uma nova senha"
              : mode === "login"
                ? "Bem-vindo de volta"
                : mode === "signup"
                  ? "Crie sua conta"
                  : "Recupere seu acesso"}
          </h2>
          <p>
            {mode === "signup"
              ? "Depois, vamos configurar sua instituição."
              : "Entre para continuar sua rotina."}
          </p>
          {!configured ? (
            <p className="form-error">
              A conexão ainda não foi configurada. Informe VITE_SUPABASE_URL e
              VITE_SUPABASE_PUBLISHABLE_KEY no ambiente de publicação.
            </p>
          ) : (
            <ActionForm
              label={
                recovery
                  ? "Atualizar senha"
                  : mode === "login"
                    ? "Entrar"
                    : mode === "signup"
                      ? "Criar conta"
                      : "Enviar link"
              }
              onSubmit={async (f) => {
                const email = String(f.get("email") || "")
                    .trim()
                    .toLowerCase(),
                  password = String(f.get("password") || "");
                setMessage("");
                if (recovery) {
                  if (password.length < 12)
                    throw new Error(
                      "Use uma senha com pelo menos 12 caracteres.",
                    );
                  const { error } = await client.auth.updateUser({ password });
                  if (error) throw error;
                  onRecovered?.();
                  return;
                }
                if (mode === "login") {
                  const { error } = await client.auth.signInWithPassword({
                    email,
                    password,
                  });
                  if (error)
                    throw new Error(
                      "Não foi possível entrar. Confira o e-mail, a senha e a confirmação da conta.",
                    );
                }
                if (mode === "signup") {
                  if (password.length < 12)
                    throw new Error(
                      "Use uma senha com pelo menos 12 caracteres.",
                    );
                  const { error } = await client.auth.signUp({
                    email,
                    password,
                    options: {
                      data: { full_name: String(f.get("name")) },
                      emailRedirectTo: location.origin,
                    },
                  });
                  if (error)
                    throw new Error(
                      "Não foi possível criar a conta. Confira os dados ou tente mais tarde.",
                    );
                  setMessage(
                    "Confira seu e-mail para confirmar a conta antes de entrar.",
                  );
                }
                if (mode === "reset") {
                  const { error } = await client.auth.resetPasswordForEmail(
                    email,
                    { redirectTo: location.origin },
                  );
                  if (error)
                    throw new Error(
                      "Não foi possível enviar agora. Aguarde e tente novamente.",
                    );
                  setMessage(
                    "Se houver uma conta com este e-mail, você receberá o link de recuperação.",
                  );
                }
              }}
            >
              {mode === "signup" && !recovery && (
                <Field label="Seu nome" name="name" required />
              )}
              {!recovery && (
                <Field label="E-mail" name="email" type="email" required />
              )}
              {(mode !== "reset" || recovery) && (
                <Field
                  label={
                    recovery || mode === "signup"
                      ? "Senha (mínimo de 12 caracteres)"
                      : "Senha"
                  }
                  name="password"
                  type="password"
                  required
                />
              )}
            </ActionForm>
          )}
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
          {!recovery && (
            <div className="auth-links">
              <button
                onClick={() => {
                  setMode(mode === "signup" ? "login" : "signup");
                  setMessage("");
                }}
              >
                {mode === "signup" ? "Já tenho conta" : "Criar uma conta"}
                <ArrowRight size={14} />
              </button>
              <button
                onClick={() => {
                  setMode(mode === "reset" ? "login" : "reset");
                  setMessage("");
                }}
              >
                {mode === "reset" ? "Voltar ao login" : "Esqueci minha senha"}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
