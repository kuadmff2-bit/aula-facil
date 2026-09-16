import { MediaImage } from "../Upload";
import { useState } from "react";
import {
  Check,
  Printer,
  QrCode,
  MessageCircle,
  Ban,
  Download,
  Undo2,
  Pencil,
} from "lucide-react";
import QRCode from "qrcode";
import { rpc, list, errorMessage } from "../client";
import { type Row, type School, type Notify, string, canWrite } from "../types";
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
import { cents, decimal, day, money, whatsapp, downloadCsv } from "../format";
import { labels } from "./Catalog";
import { pixPayload } from "../pix";
export function Finance({
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
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [modal, setModal] = useState<{ kind: string; row: Row } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const { data, error, loading, reload } = useLoad(
    () => list(school.id, resource, search, page, filter, from, to),
    [school.id, resource, search, page, filter, from, to],
  );
  const write = canWrite(school.role, "payments");
  async function collect(r: Row) {
    try {
      const phone = string(r, "guardian_phone") || string(r, "phone");
      const text = `Olá, ${string(r, "guardian_name") || "responsável"}. A mensalidade de ${string(r, "name")}, referente a ${string(r, "reference") || "parcelas em aberto"}, está pendente. Valor: ${money(r.balance)}.${r.due_date ? " Vencimento: " + day(r.due_date) + "." : ""} Caso já tenha realizado o pagamento, desconsidere esta mensagem.`;
      const url = whatsapp(phone, text);
      window.open(url, "_blank", "noopener,noreferrer");
      await rpc("af_action", {
        p_school: school.id,
        p_action: "collection",
        p_id: r.student_id || r.id,
        p_data: {},
      });
      notify("WhatsApp aberto. Confira a mensagem antes de enviar.");
    } catch (e) {
      notify(errorMessage(e), true);
    }
  }
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
        {resource !== "payments" && (
          <select
            aria-label="Situação"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas</option>
            {(resource === "debtors"
              ? ["1", "2", "3"]
              : [
                  "pending",
                  "overdue",
                  "partial",
                  "paid",
                  "cancelled",
                  "negotiated",
                ]
            ).map((v) => (
              <option key={v} value={v}>
                {resource === "debtors"
                  ? v + (v === "3" ? "+" : "") + " mensalidade(s)"
                  : labels[v]}
              </option>
            ))}
          </select>
        )}
        {resource !== "debtors" && (
          <>
            <label className="inline-field">
              De
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="inline-field">
              Até
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          </>
        )}
        <button
          disabled={!data?.rows.length}
          onClick={() => {
            try {
              downloadCsv(
                `aulafacil-${resource}-pagina-${page + 1}.csv`,
                data!.rows.map((r) => ({
                  Aluno: r.name,
                  Referencia: r.reference,
                  Vencimento: day(r.due_date),
                  Valor: r.balance ?? r.amount_received,
                  Situacao: r.effective_status ?? r.status,
                })),
              );
            } catch (e) {
              notify(errorMessage(e), true);
            }
          }}
        >
          <Download size={16} />
          Exportar página
        </button>
      </div>
      {selected.length > 0 && (
        <p className="hint">
          {selected.length} selecionados. Abra cada mensagem para revisar e
          enviar pelo WhatsApp.
        </p>
      )}
      {loading ? (
        <Loading />
      ) : error ? (
        <Failure error={error} retry={reload} />
      ) : !data?.rows.length ? (
        <Empty
          text={
            resource === "debtors"
              ? "Nenhuma inadimplência encontrada."
              : "Nenhum lançamento encontrado."
          }
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {resource === "collections" && <th>Selecionar</th>}
                <th>Aluno</th>
                <th>
                  {resource === "payments"
                    ? "Pagamento"
                    : resource === "debtors"
                      ? "Atraso"
                      : "Vencimento"}
                </th>
                <th>{resource === "payments" ? "Recebido" : "Saldo"}</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  {resource === "collections" && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${string(r, "name")}`}
                        checked={selected.includes(r.id)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked
                              ? [...s, r.id]
                              : s.filter((v) => v !== r.id),
                          )
                        }
                      />
                    </td>
                  )}
                  <td>
                    <strong>{string(r, "name")}</strong>
                    <small>
                      {string(r, "reference") || string(r, "guardian_name")}
                      {resource === "payments"
                        ? " · " + string(r, "receipt_number")
                        : ""}
                    </small>
                  </td>
                  <td data-label="Data">
                    {resource === "payments"
                      ? day(r.paid_at)
                      : resource === "debtors"
                        ? `${r.days} dias · ${r.count} parcelas`
                        : day(r.due_date)}
                  </td>
                  <td data-label="Valor">
                    <strong>
                      {money(
                        resource === "payments" ? r.amount_received : r.balance,
                      )}
                    </strong>
                  </td>
                  <td data-label="Situação">
                    <span
                      className={`badge ${r.effective_status === "overdue" || resource === "debtors" ? "danger" : r.status === "confirmed" || r.status === "paid" ? "good" : ""}`}
                    >
                      {resource === "debtors"
                        ? "Em atraso"
                        : labels[
                            string(r, "effective_status") || string(r, "status")
                          ]}
                    </span>
                  </td>
                  <td className="row-actions">
                    {resource === "payments" ? (
                      <>
                        <button
                          onClick={() => setModal({ kind: "receipt", row: r })}
                        >
                          <Printer size={16} />
                          Recibo
                        </button>
                        {write && r.status === "confirmed" && !r.provider && (
                          <button
                            title="Estornar pagamento"
                            onClick={() =>
                              setModal({ kind: "reverse", row: r })
                            }
                          >
                            <Undo2 size={16} />
                            <span className="sr-only">Estornar</span>
                          </button>
                        )}
                      </>
                    ) : resource === "debtors" || resource === "collections" ? (
                      write && (
                        <button onClick={() => void collect(r)}>
                          <MessageCircle size={16} />
                          Cobrar
                        </button>
                      )
                    ) : (
                      ["pending", "overdue"].includes(string(r, "status")) && (
                        <>
                          {write && (
                            <button
                              className="primary small"
                              onClick={() => setModal({ kind: "pay", row: r })}
                            >
                              <Check size={15} />
                              Receber
                            </button>
                          )}
                          <button
                            title="PIX"
                            onClick={() => setModal({ kind: "pix", row: r })}
                          >
                            <QrCode size={16} />
                            <span className="sr-only">Gerar PIX</span>
                          </button>
                          {write && (
                            <button
                              title="Ajustar valor e vencimento"
                              onClick={() =>
                                setModal({ kind: "adjust", row: r })
                              }
                            >
                              <Pencil size={16} />
                              <span className="sr-only">
                                Ajustar mensalidade
                              </span>
                            </button>
                          )}
                          {write && (
                            <button
                              title="Cancelar"
                              onClick={() =>
                                setModal({ kind: "cancel", row: r })
                              }
                            >
                              <Ban size={16} />
                              <span className="sr-only">
                                Cancelar mensalidade
                              </span>
                            </button>
                          )}
                        </>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={page} total={data.total} onChange={setPage} />
        </div>
      )}
      {modal && (
        <Modal
          title={
            {
              pay: "Registrar pagamento",
              receipt: "Recibo de pagamento",
              pix: "Pagar com PIX",
              cancel: "Cancelar mensalidade",
              reverse: "Estornar pagamento",
              adjust: "Ajustar mensalidade",
            }[modal.kind] || ""
          }
          onClose={() => setModal(null)}
        >
          {modal.kind === "pay" ? (
            <PaymentForm
              school={school.id}
              invoice={modal.row}
              done={() => {
                setModal(null);
                reload();
                notify(
                  "Pagamento registrado. O recibo está no histórico de pagamentos.",
                );
              }}
            />
          ) : modal.kind === "receipt" ? (
            <Receipt school={school.id} id={modal.row.id} />
          ) : modal.kind === "pix" ? (
            <Pix school={school.id} row={modal.row} notify={notify} />
          ) : (
            <ActionForm
              label="Confirmar alteração"
              onSubmit={async (f) => {
                await rpc("af_action", {
                  p_school: school.id,
                  p_action:
                    modal.kind === "reverse"
                      ? "reverse_payment"
                      : modal.kind === "adjust"
                        ? "adjust_invoice"
                        : "cancel_invoice",
                  p_id: modal.row.id,
                  p_data: {
                    reason: String(f.get("reason")),
                    amount:
                      modal.kind === "adjust"
                        ? decimal(cents(String(f.get("amount"))))
                        : undefined,
                    due_date: f.get("due_date"),
                  },
                });
              }}
              onDone={() => {
                setModal(null);
                reload();
                notify("Alteração registrada; histórico preservado.");
              }}
            >
              <p>
                Confirme a alteração de{" "}
                <strong>{string(modal.row, "name")}</strong>. O histórico será
                preservado.
              </p>
              {modal.kind === "adjust" && (
                <>
                  <Field
                    label="Novo valor (R$)"
                    name="amount"
                    value={String(modal.row.amount)}
                    required
                  />
                  <Field
                    label="Novo vencimento"
                    name="due_date"
                    type="date"
                    value={string(modal.row, "due_date")}
                    required
                  />
                </>
              )}
              <Field label="Motivo" name="reason" required />
            </ActionForm>
          )}
        </Modal>
      )}
    </>
  );
}
function PaymentForm({
  school,
  invoice,
  done,
}: {
  school: string;
  invoice: Row;
  done: () => void;
}) {
  const [key] = useState(() => crypto.randomUUID());
  return (
    <ActionForm
      label="Confirmar pagamento"
      onDone={done}
      onSubmit={async (f) => {
        await rpc("af_pay", {
          p_school: school,
          p_invoice: invoice.id,
          p_amount: decimal(cents(String(f.get("amount")))),
          p_method: String(f.get("method")),
          p_key: key,
          p_notes: String(f.get("notes") || ""),
        });
      }}
    >
      <p>
        <strong>{string(invoice, "name")}</strong> ·{" "}
        {string(invoice, "reference")}
      </p>
      <div className="amount-banner">
        <span>Saldo atual</span>
        <strong>{money(invoice.balance)}</strong>
      </div>
      <div className="form-grid">
        <Field
          label="Valor recebido (R$)"
          name="amount"
          value={String(invoice.balance)}
          required
        />
        <Field
          label="Forma de pagamento"
          name="method"
          value="PIX"
          required
          options={["PIX", "Dinheiro", "Cartão", "Transferência", "Outros"].map(
            (v) => ({ value: v, label: v }),
          )}
        />
        <Field label="Observações" name="notes" type="textarea" />
      </div>
      <p className="hint">
        Confirme somente depois de verificar o recebimento. Valores menores que
        o saldo serão registrados como pagamento parcial.
      </p>
    </ActionForm>
  );
}
function Receipt({ school, id }: { school: string; id: string }) {
  const { data, error, loading, reload } = useLoad(
    () =>
      rpc<Row>("af_detail", {
        p_school: school,
        p_resource: "receipt",
        p_id: id,
      }),
    [school, id],
  );
  return loading ? (
    <Loading />
  ) : error ? (
    <Failure error={error} retry={reload} />
  ) : data ? (
    <>
      <article className="receipt printable">
        <span className="eyebrow">RECIBO DE PAGAMENTO</span>
        <MediaImage
          path={string(data, "logo_path")}
          alt="Logotipo da instituição"
        />
        <h1>{string(data, "institution")}</h1>
        <p>
          {string(data, "legal_name")} · {string(data, "document")}
        </p>
        <p>
          {string(data, "address")} · {string(data, "phone")}
        </p>
        <hr />
        <h2>{money(data.amount)}</h2>
        <p>
          Recebemos o valor de <strong>{money(data.amount)}</strong>, referente
          à mensalidade de <strong>{string(data, "student")}</strong>.
        </p>
        <dl>
          <dt>Competência</dt>
          <dd>{string(data, "reference")}</dd>
          <dt>Data do recebimento</dt>
          <dd>{day(data.paid_at)}</dd>
          <dt>Forma de pagamento</dt>
          <dd>{string(data, "method")}</dd>
          <dt>Número</dt>
          <dd>{string(data, "number")}</dd>
          <dt>Identificador</dt>
          <dd>{data.id}</dd>
        </dl>
        {data.status !== "confirmed" && (
          <p className="form-error">
            Pagamento {labels[string(data, "status")] || string(data, "status")}
            . Este recibo não comprova quitação atual.
          </p>
        )}
        <p>{string(data, "text")}</p>
        <footer>
          Documento emitido pelo AulaFácil · Segunda via disponível no
          histórico.
        </footer>
      </article>
      <button className="primary" onClick={() => window.print()}>
        <Printer size={16} />
        Imprimir / salvar PDF
      </button>
    </>
  ) : null;
}
function Pix({
  school,
  row,
  notify,
}: {
  school: string;
  row: Row;
  notify: Notify;
}) {
  const { data, error, loading, reload } = useLoad(async () => {
    const s = await rpc<Row>("af_settings", { p_school: school, p_data: null });
    const payload =
      string(row, "pix_copy_paste") ||
      pixPayload(
        string(s, "pix_key"),
        string(s, "pix_name"),
        string(s, "pix_city"),
        String(row.balance),
        row.id,
      );
    return {
      payload,
      image: await QRCode.toDataURL(payload, {
        width: 256,
        margin: 2,
        errorCorrectionLevel: "M",
      }),
    };
  }, [school, row.id]);
  return loading ? (
    <Loading />
  ) : error ? (
    <Failure error={error} retry={reload} />
  ) : data ? (
    <div className="pix">
      <img src={data.image} alt="QR Code para pagamento PIX" />
      <h3>{money(row.balance)}</h3>
      <textarea
        readOnly
        aria-label="Código PIX copia e cola"
        value={data.payload}
      />
      <button
        className="primary"
        onClick={() => {
          navigator.clipboard
            .writeText(data.payload)
            .then(() => notify("Código PIX copiado."))
            .catch(() =>
              notify("Selecione e copie o código manualmente.", true),
            );
        }}
      >
        Copiar código PIX
      </button>
      <p className="hint">
        Confira o recebedor no aplicativo do banco. Um PIX gerado aqui não
        confirma pagamento automaticamente.
      </p>
    </div>
  ) : null;
}
