import { Upload, MediaImage } from "../Upload";
import { useState } from "react";
import { rpc, client } from "../client";
import { type Row, type School, type Notify, string } from "../types";
import { ActionForm, Failure, Field, Loading, Modal, useLoad } from "../ui";
export function Settings({
  school,
  notify,
}: {
  school: School;
  notify: Notify;
}) {
  const [tab, setTab] = useState(
      school.role === "teacher" ? "account" : "institution",
    ),
    [remove, setRemove] = useState<Row | null>(null);
  const { data, error, loading, reload } = useLoad(
    () => rpc<Row>("af_settings", { p_school: school.id, p_data: null }),
    [school.id],
  );
  const team = useLoad(async () => {
    const { data, error } = await client
      .from("school_members")
      .select("*")
      .eq("school_id", school.id)
      .eq("active", true);
    if (error) throw error;
    return data as Row[];
  }, [school.id]);
  const admin = ["owner", "admin"].includes(school.role);
  return (
    <>
      <div className="tabs">
        {[
          ...(school.role !== "teacher"
            ? [["institution", "Instituição e financeiro"]]
            : []),
          ["account", "Minha conta"],
          ...(school.role === "owner" ? [["team", "Equipe"]] : []),
        ].map(([v, t]) => (
          <button
            className={tab === v ? "active" : ""}
            key={v}
            onClick={() => setTab(v)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "institution" ? (
        loading ? (
          <Loading />
        ) : error ? (
          <Failure error={error} retry={reload} />
        ) : (
          data && (
            <section className="panel settings">
              <h2>Dados da instituição</h2>
              <MediaImage
                path={string(data, "logo_url")}
                alt="Logotipo da instituição"
              />
              {admin && <Upload school={school.id} notify={notify} />}
              <ActionForm
                disabled={!admin}
                onSubmit={async (f) => {
                  await rpc("af_settings", {
                    p_school: school.id,
                    p_data: Object.fromEntries(f),
                  });
                  notify("Configurações salvas.");
                  reload();
                }}
              >
                <fieldset disabled={!admin}>
                  <div className="form-grid">
                    {[
                      ["name", "Nome da instituição"],
                      ["legal_name", "Razão social"],
                      ["document_number", "CPF / CNPJ"],
                      ["responsible", "Responsável"],
                      ["phone", "Telefone"],
                      ["whatsapp", "WhatsApp"],
                      ["email", "E-mail"],
                      ["address", "Endereço"],
                      ["city", "Cidade"],
                      ["state", "UF"],
                    ].map(([key, label]) => (
                      <Field
                        key={key}
                        name={key}
                        label={label}
                        value={string(data, key)}
                        required={key === "name"}
                      />
                    ))}
                  </div>
                  <h3>PIX</h3>
                  <p>
                    Chave de recebimento da instituição. Não informe senhas ou
                    tokens de banco.
                  </p>
                  <div className="form-grid">
                    {[
                      ["pix_key", "Chave PIX"],
                      ["pix_name", "Nome do recebedor"],
                      ["pix_city", "Cidade do recebedor"],
                      ["pix_bank", "Banco"],
                    ].map(([key, label]) => (
                      <Field
                        key={key}
                        name={key}
                        label={label}
                        value={string(data, key)}
                      />
                    ))}
                  </div>
                  <h3>Regras financeiras</h3>
                  <div className="form-grid">
                    <Field
                      label="Vencimento padrão (1–31)"
                      name="default_due_day"
                      type="number"
                      value={string(data, "default_due_day") || "10"}
                    />
                    <Field
                      label="Multa (%)"
                      name="late_fee_value"
                      type="number"
                      value={string(data, "late_fee_value")}
                    />
                    <Field
                      label="Juros mensais (%)"
                      name="interest_value"
                      type="number"
                      value={string(data, "interest_value")}
                    />
                    <Field
                      label="Texto dos recibos"
                      name="receipt_text"
                      type="textarea"
                      value={string(data, "receipt_text")}
                    />
                  </div>
                </fieldset>
              </ActionForm>
              {!admin && (
                <p className="hint">
                  Somente administradores podem alterar configurações.
                </p>
              )}
            </section>
          )
        )
      ) : tab === "account" ? (
        <section className="panel settings">
          <h2>Minha conta</h2>
          <ActionForm
            label="Atualizar perfil"
            onSubmit={async (f) => {
              const { error } = await client.auth.updateUser({
                data: { full_name: String(f.get("name")) },
              });
              if (error) throw error;
              notify("Perfil atualizado.");
            }}
          >
            <Field label="Nome" name="name" required />
          </ActionForm>
          <h3>Alterar e-mail</h3>
          <ActionForm
            label="Solicitar alteração"
            onSubmit={async (f) => {
              const { error } = await client.auth.updateUser(
                { email: String(f.get("email")).trim() },
                { emailRedirectTo: location.origin },
              );
              if (error) throw error;
              notify(
                "Confira os e-mails de confirmação para concluir a alteração.",
              );
            }}
          >
            <Field label="Novo e-mail" name="email" type="email" required />
          </ActionForm>
          <h3>Alterar senha</h3>
          <ActionForm
            label="Atualizar senha"
            onSubmit={async (f) => {
              const old = String(f.get("old")),
                password = String(f.get("password"));
              if (password.length < 12)
                throw new Error(
                  "A nova senha precisa ter ao menos 12 caracteres.",
                );
              const { data } = await client.auth.getUser();
              const check = await client.auth.signInWithPassword({
                email: data.user?.email || "",
                password: old,
              });
              if (check.error) throw new Error("Senha atual incorreta.");
              const { error } = await client.auth.updateUser({ password });
              if (error) throw error;
              notify("Senha atualizada.");
            }}
          >
            <Field label="Senha atual" name="old" type="password" required />
            <Field
              label="Nova senha"
              name="password"
              type="password"
              required
            />
          </ActionForm>
          <button onClick={() => void client.auth.signOut({ scope: "global" })}>
            Sair de todos os dispositivos
          </button>
        </section>
      ) : (
        <section className="panel settings">
          <h2>Equipe e permissões</h2>
          <p>
            O profissional deve criar a própria conta. Depois, vincule o e-mail
            e selecione seu perfil.
          </p>
          <ActionForm
            label="Adicionar / atualizar acesso"
            onSubmit={async (f) => {
              await rpc("af_action", {
                p_school: school.id,
                p_action: "team",
                p_id: school.id,
                p_data: Object.fromEntries(f),
              });
              team.reload();
              notify("Acesso da equipe atualizado.");
            }}
          >
            <div className="form-grid">
              <Field
                label="E-mail da conta"
                name="email"
                type="email"
                required
              />
              <Field
                label="Perfil"
                name="role"
                required
                options={[
                  { value: "admin", label: "Administrador" },
                  { value: "finance", label: "Financeiro" },
                  { value: "staff", label: "Secretaria" },
                  { value: "teacher", label: "Professor" },
                ]}
              />
            </div>
          </ActionForm>
          {team.loading ? (
            <Loading />
          ) : team.error ? (
            <Failure error={team.error} retry={team.reload} />
          ) : (
            team.data?.map((r) => (
              <div className="line-item" key={String(r.user_id)}>
                <span>
                  {String(r.role)}
                  <small>ID: {String(r.user_id)}</small>
                </span>
                {r.role !== "owner" && (
                  <button onClick={() => setRemove(r)}>Desativar</button>
                )}
              </div>
            ))
          )}
        </section>
      )}
      {remove && (
        <Modal title="Desativar acesso?" onClose={() => setRemove(null)}>
          <ActionForm
            label="Confirmar desativação"
            onSubmit={async () => {
              await rpc("af_action", {
                p_school: school.id,
                p_action: "remove_member",
                p_id: remove.user_id,
                p_data: {},
              });
              setRemove(null);
              team.reload();
              notify("Acesso desativado.");
            }}
          >
            <p>
              Este membro perderá acesso à instituição. O histórico será
              preservado.
            </p>
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
