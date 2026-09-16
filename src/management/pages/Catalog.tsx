import { Upload, MediaImage } from "../Upload";
import { useState } from "react";
import { Plus, Pencil, ArrowUpRight } from "lucide-react";
import { list, save, rpc } from "../client";
import { type Row, type School, type Notify, canWrite, string } from "../types";
import {
  ActionForm,
  Empty,
  Failure,
  Field,
  Loading,
  Modal,
  Pager,
  SearchBox,
  useLoad,
} from "../ui";
import { cents, decimal, day, money, maskCpf, today } from "../format";
type Spec = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[];
};
const specs: Record<string, Spec[]> = {
  students: [
    { key: "name", label: "Nome completo", required: true },
    { key: "birth_date", label: "Nascimento", type: "date", required: true },
    { key: "document_number", label: "CPF" },
    { key: "rg", label: "RG" },
    { key: "phone", label: "Telefone / WhatsApp", type: "tel" },
    { key: "email", label: "E-mail", type: "email" },
    { key: "registration", label: "Número de matrícula (automático se vazio)" },
    { key: "street_name", label: "Rua" },
    { key: "street_number", label: "Número" },
    { key: "neighborhood", label: "Bairro" },
    { key: "city", label: "Cidade" },
    { key: "state", label: "UF" },
    { key: "postal_code", label: "CEP" },
    {
      key: "situation",
      label: "Situação",
      options: ["active", "inactive", "completed", "cancelled", "paused"],
    },
    { key: "notes", label: "Observações", type: "textarea" },
  ],
  guardians: [
    { key: "name", label: "Nome completo", required: true },
    { key: "cpf", label: "CPF" },
    { key: "rg", label: "RG" },
    { key: "phone", label: "Telefone", type: "tel" },
    { key: "whatsapp", label: "WhatsApp", type: "tel" },
    { key: "email", label: "E-mail", type: "email" },
    { key: "address", label: "Endereço" },
    { key: "active", label: "Situação", options: ["true", "false"] },
  ],
  courses: [
    { key: "name", label: "Nome do curso", required: true },
    { key: "description", label: "Descrição", type: "textarea" },
    { key: "duration", label: "Duração" },
    { key: "amount", label: "Mensalidade padrão (R$)", required: true },
    {
      key: "modality",
      label: "Modalidade",
      options: ["Presencial", "EAD", "Híbrido"],
    },
    { key: "active", label: "Situação", options: ["true", "false"] },
    { key: "notes", label: "Observações", type: "textarea" },
  ],
  classes: [
    { key: "name", label: "Nome da turma", required: true },
    { key: "teacher", label: "Nome do professor" },
    { key: "teacher_user_id", label: "ID da conta do professor (na equipe)" },
    { key: "room", label: "Sala" },
    { key: "schedule", label: "Dias e horários" },
    { key: "capacity", label: "Limite de alunos", type: "number" },
    {
      key: "shift",
      label: "Turno",
      options: ["Matutino", "Vespertino", "Noturno", "Integral"],
    },
    { key: "active", label: "Situação", options: ["true", "false"] },
  ],
};
export const labels: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  completed: "Concluído",
  cancelled: "Cancelado",
  paused: "Trancado",
  true: "Ativo",
  false: "Inativo",
  pending: "Pendente",
  overdue: "Vencida",
  partial: "Parcial",
  paid: "Paga",
  negotiated: "Renegociada",
  confirmed: "Confirmado",
  refunded: "Estornado",
};
export function Lookup({
  school,
  resource,
  name,
  label,
  required = false,
  value = "",
}: {
  school: string;
  resource: string;
  name: string;
  label: string;
  required?: boolean;
  value?: string;
}) {
  const [q, setQ] = useState("");
  const { data } = useLoad(
    () => list(school, resource, q),
    [school, resource, q],
  );
  return (
    <div className="field">
      <label>
        {label}
        <input
          aria-label={`Buscar ${label}`}
          placeholder="Digite para buscar…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select name={name} required={required} defaultValue={value}>
          <option value="">Selecione</option>
          {value && !data?.rows.some((r) => r.id === value) && (
            <option value={value}>Manter seleção atual</option>
          )}
          {data?.rows.map((r) => (
            <option key={r.id} value={r.id}>
              {string(r, "name")}
            </option>
          ))}
        </select>
      </label>
      <small>Até 25 resultados. Digite para localizar outros.</small>
    </div>
  );
}
export function Catalog({
  school,
  resource,
  notify,
}: {
  school: School;
  resource: string;
  notify: Notify;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [filter, setFilter] = useState(""),
    [edit, setEdit] = useState<Row | null | undefined>(undefined),
    [detail, setDetail] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad(
    () => list(school.id, resource, search, page, filter),
    [school.id, resource, search, page, filter],
  );
  return (
    <>
      <div className="toolbar">
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(0);
          }}
        />
        {resource === "students" && (
          <select
            aria-label="Filtrar situação"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas as situações</option>
            {["active", "inactive", "completed", "cancelled", "paused"].map(
              (v) => (
                <option key={v} value={v}>
                  {labels[v]}
                </option>
              ),
            )}
          </select>
        )}
        {canWrite(school.role, resource) && (
          <button className="primary" onClick={() => setEdit(null)}>
            <Plus size={16} />
            {resource === "enrollments" ? "Nova matrícula" : "Novo cadastro"}
          </button>
        )}
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <Failure error={error} retry={reload} />
      ) : !data?.rows.length ? (
        <Empty />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>
                  {resource === "courses"
                    ? "Mensalidade"
                    : resource === "classes"
                      ? "Curso / Horário"
                      : resource === "enrollments"
                        ? "Turma"
                        : "Contato"}
                </th>
                <th>
                  {resource === "enrollments"
                    ? "Valor / Parcelas"
                    : resource === "classes"
                      ? "Alunos"
                      : "Situação"}
                </th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{string(r, "name")}</strong>
                    <small>
                      {resource === "students"
                        ? `${string(r, "registration")} · ${maskCpf(r.document_number)}`
                        : resource === "guardians"
                          ? maskCpf(r.cpf)
                          : string(r, "description")}
                    </small>
                  </td>
                  <td data-label="Informações">
                    {resource === "courses"
                      ? money(r.amount)
                      : resource === "classes"
                        ? `${string(r, "course_name")} · ${string(r, "schedule")}`
                        : resource === "enrollments"
                          ? string(r, "class_name")
                          : string(r, "phone") || "—"}
                  </td>
                  <td data-label="Situação">
                    {resource === "enrollments" ? (
                      `${money(Number(r.original_amount) - Number(r.discount))} · ${r.installments} parcelas`
                    ) : resource === "classes" ? (
                      `${r.student_count} / ${r.capacity ?? "sem limite"}`
                    ) : (
                      <span className="badge">
                        {labels[String(r.situation ?? r.active)] || "Ativo"}
                      </span>
                    )}
                  </td>
                  <td className="row-actions">
                    {resource === "students" && school.role !== "teacher" && (
                      <button
                        title="Detalhes e histórico"
                        onClick={() => setDetail(r.id)}
                      >
                        <ArrowUpRight size={17} />
                        <span className="sr-only">
                          Detalhes de {string(r, "name")}
                        </span>
                      </button>
                    )}
                    {resource !== "enrollments" &&
                      canWrite(school.role, resource) && (
                        <button title="Editar" onClick={() => setEdit(r)}>
                          <Pencil size={15} />
                          <span className="sr-only">
                            Editar {string(r, "name")}
                          </span>
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={page} total={data.total} onChange={setPage} />
        </div>
      )}
      {edit !== undefined && (
        <Modal
          title={
            resource === "enrollments"
              ? "Nova matrícula"
              : edit
                ? "Editar cadastro"
                : "Novo cadastro"
          }
          onClose={() => setEdit(undefined)}
        >
          {resource === "enrollments" ? (
            <Enrollment
              school={school}
              done={() => {
                setEdit(undefined);
                reload();
                notify("Matrícula e mensalidades criadas.");
              }}
            />
          ) : (
            <ActionForm
              onSubmit={async (f) => {
                const values: Record<string, unknown> = Object.fromEntries(f);
                if (resource === "courses")
                  values.amount = decimal(cents(String(values.amount)));
                if (!values.situation && resource === "students")
                  values.situation = "active";
                await save(school.id, resource, values, edit?.id ?? null);
              }}
              onDone={() => {
                setEdit(undefined);
                reload();
                notify("Cadastro salvo.");
              }}
            >
              {resource === "students" && edit && (
                <Upload school={school.id} student={edit.id} notify={notify} />
              )}
              <div className="form-grid">
                {specs[resource]?.map((s) => (
                  <Field
                    key={s.key}
                    name={s.key}
                    label={s.label}
                    type={s.type}
                    required={s.required}
                    value={
                      edit
                        ? string(edit, s.key)
                        : s.key === "active"
                          ? "true"
                          : s.key === "situation"
                            ? "active"
                            : s.key === "modality"
                              ? "Presencial"
                              : ""
                    }
                    options={s.options?.map((v) => ({
                      value: v,
                      label: labels[v] || v,
                    }))}
                  />
                ))}
                {resource === "classes" && (
                  <Lookup
                    school={school.id}
                    resource="courses"
                    name="course_id"
                    label="Curso"
                    required
                    value={edit ? string(edit, "course_id") : ""}
                  />
                )}{" "}
                {resource === "students" && (
                  <>
                    <Lookup
                      school={school.id}
                      resource="guardians"
                      name="guardian_id"
                      label="Vincular responsável"
                    />
                    <Field label="Parentesco" name="relationship" />
                  </>
                )}
              </div>
            </ActionForm>
          )}
        </Modal>
      )}
      {detail && (
        <StudentDetail
          school={school.id}
          id={detail}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}
function Enrollment({ school, done }: { school: School; done: () => void }) {
  const [key] = useState(() => crypto.randomUUID());
  return (
    <ActionForm
      label="Matricular e gerar mensalidades"
      onDone={done}
      onSubmit={async (f) => {
        const d = Object.fromEntries(f);
        await rpc("af_enroll", {
          p_school: school.id,
          p_data: {
            ...d,
            original_amount: decimal(cents(String(d.original_amount))),
            discount: decimal(cents(String(d.discount || "0"))),
          },
          p_key: key,
        });
      }}
    >
      <div className="form-grid">
        <Lookup
          school={school.id}
          resource="students"
          label="Aluno"
          name="student_id"
          required
        />
        <Lookup
          school={school.id}
          resource="classes"
          label="Turma"
          name="class_id"
          required
        />
        <Field label="Valor original (R$)" name="original_amount" required />
        <Field label="Desconto por parcela (R$)" name="discount" value="0" />
        <Field
          label="Dia de vencimento (1–31)"
          name="due_day"
          type="number"
          value="10"
          required
        />
        <Field
          label="Primeira competência"
          name="start_date"
          type="date"
          value={today()}
          required
        />
        <Field
          label="Quantidade de parcelas (1–120)"
          name="installments"
          type="number"
          value="12"
          required
        />
        <Field
          label="Forma de pagamento"
          name="method"
          value="PIX"
          options={["PIX", "Dinheiro", "Cartão", "Transferência", "Outros"].map(
            (v) => ({ value: v, label: v }),
          )}
        />
        <Field label="Observações" name="notes" type="textarea" />
      </div>
      <p className="hint">
        Se o mês não tiver o dia escolhido, o vencimento será no último dia do
        mês.
      </p>
    </ActionForm>
  );
}
function StudentDetail({
  school,
  id,
  onClose,
}: {
  school: string;
  id: string;
  onClose: () => void;
}) {
  const { data, error, loading, reload } = useLoad(
    () =>
      rpc<{ student: Row; guardians: Row[]; invoices: Row[]; history: Row[] }>(
        "af_detail",
        { p_school: school, p_resource: "students", p_id: id },
      ),
    [school, id],
  );
  return (
    <Modal title="Cadastro e histórico financeiro" onClose={onClose}>
      {loading ? (
        <Loading />
      ) : error ? (
        <Failure error={error} retry={reload} />
      ) : (
        data && (
          <div className="detail">
            <MediaImage
              path={string(data.student, "photo_path")}
              alt="Foto do aluno"
            />
            <h3>{string(data.student, "name")}</h3>
            <p>
              {string(data.student, "registration")} ·{" "}
              {day(data.student.birth_date)} · {string(data.student, "phone")}
            </p>
            <h3>Responsáveis</h3>
            {data.guardians.map((g) => (
              <p key={g.id}>
                {string(g, "name")} · {string(g, "relationship")} ·{" "}
                {string(g, "phone")}
              </p>
            ))}
            {!data.guardians.length && <p>Nenhum responsável vinculado.</p>}
            <h3>Mensalidades</h3>
            {data.invoices.map((i) => (
              <div className="line-item" key={i.id}>
                <span>
                  {string(i, "reference")}
                  <small>
                    {day(i.due_date)} · {labels[string(i, "effective_status")]}
                  </small>
                </span>
                <strong>{money(i.amount)}</strong>
              </div>
            ))}
            <h3>Histórico de alterações</h3>
            {data.history.map((h, j) => (
              <div className="line-item" key={j}>
                <span>
                  {string(h, "action")}
                  <small>{day(h.created_at)}</small>
                </span>
              </div>
            ))}
            <p className="hint">Até 100 mensalidades e 100 eventos recentes.</p>
          </div>
        )
      )}
    </Modal>
  );
}
