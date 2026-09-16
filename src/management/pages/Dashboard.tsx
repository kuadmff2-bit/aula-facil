import { useState } from "react";
import {
  ArrowUpRight,
  Users,
  Wallet,
  Clock,
  CircleAlert,
  Download,
  Printer,
} from "lucide-react";
import { rpc, errorMessage } from "../client";
import { type Row, type School, type Notify, string } from "../types";
import { Empty, Failure, Loading, useLoad } from "../ui";
import { today, day, money, downloadCsv } from "../format";
type Summary = {
  students: number;
  active: number;
  new_students: number;
  received: number;
  pending: number;
  overdue: number;
  invoices: number;
  paid: number;
  methods: Row[];
  recent: Row[];
  upcoming: Row[];
};
export function Dashboard({
  school,
  reports = false,
  notify,
}: {
  school: School;
  reports?: boolean;
  notify: Notify;
}) {
  const [from, setFrom] = useState(() => today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today),
    [period, setPeriod] = useState("month");
  const { data, error, loading, reload } = useLoad(
    () =>
      rpc<Summary>("af_dashboard", {
        p_school: school.id,
        p_from: from,
        p_to: to,
      }),
    [school.id, from, to],
  );
  function preset(value: string) {
    setPeriod(value);
    const d = today();
    setTo(d);
    if (value === "today") setFrom(d);
    if (value === "month") setFrom(d.slice(0, 7) + "-01");
    if (value === "week") {
      const n = new Date(d + "T12:00:00Z");
      n.setUTCDate(n.getUTCDate() - 6);
      setFrom(n.toISOString().slice(0, 10));
    }
  }
  return (
    <>
      <div className="toolbar">
        <select
          aria-label="Período"
          value={period}
          onChange={(e) => preset(e.target.value)}
        >
          <option value="today">Hoje</option>
          <option value="week">Últimos 7 dias</option>
          <option value="month">Este mês</option>
          <option value="custom">Personalizado</option>
        </select>
        <label className="inline-field">
          De
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPeriod("custom");
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
              setPeriod("custom");
            }}
          />
        </label>
        {reports && (
          <>
            <button
              disabled={!data}
              onClick={() => {
                try {
                  downloadCsv("aulafacil-resumo-financeiro.csv", [
                    {
                      Instituicao: school.name,
                      De: from,
                      Ate: to,
                      Recebido: data!.received,
                      Pendente: data!.pending,
                      TotalVencido: data!.overdue,
                      AlunosAtivos: data!.active,
                      Mensalidades: data!.invoices,
                      Pagas: data!.paid,
                    },
                  ]);
                } catch (e) {
                  notify(errorMessage(e), true);
                }
              }}
            >
              <Download size={16} />
              CSV
            </button>
            <button onClick={() => window.print()}>
              <Printer size={16} />
              Imprimir / PDF
            </button>
          </>
        )}
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <Failure error={error} retry={reload} />
      ) : (
        data && (
          <div className={reports ? "printable" : ""}>
            <div className="metrics">
              <Metric
                title="Alunos ativos"
                value={String(data.active)}
                detail={`${data.students - data.active} inativos · ${data.new_students} novos no período`}
                icon={<Users />}
              />
              <Metric
                title="Recebido no período"
                value={money(data.received)}
                detail="Pagamentos confirmados"
                icon={<Wallet />}
              />
              <Metric
                title="A receber no período"
                value={money(data.pending)}
                detail={`${data.paid} de ${data.invoices} mensalidades pagas`}
                icon={<Clock />}
              />
              <Metric
                title="Total em atraso"
                value={money(data.overdue)}
                detail="Todos os vencimentos anteriores a hoje"
                icon={<CircleAlert />}
              />
            </div>
            <div className="dashboard-grid">
              <section className="panel">
                <header>
                  <div>
                    <h2>Recebimentos por forma</h2>
                    <p>Composição do valor recebido no período</p>
                  </div>
                  <ArrowUpRight size={18} />
                </header>
                {data.methods.length ? (
                  <div className="bars">
                    {data.methods.map((m, i) => (
                      <div key={i}>
                        <div>
                          <span>{string(m, "name")}</span>
                          <strong>{money(m.amount)}</strong>
                        </div>
                        <progress
                          max={Math.max(1, Number(data.received))}
                          value={Number(m.amount)}
                          aria-label={string(m, "name")}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty text="Ainda não há recebimentos neste período." />
                )}
              </section>
              <section className="panel">
                <header>
                  <div>
                    <h2>Próximos vencimentos</h2>
                    <p>Até oito mensalidades mais próximas</p>
                  </div>
                </header>
                {data.upcoming.length ? (
                  data.upcoming.map((r) => (
                    <div className="line-item" key={r.id}>
                      <span>
                        {string(r, "name")}
                        <small>{day(r.due_date)}</small>
                      </span>
                      <strong>{money(r.balance)}</strong>
                    </div>
                  ))
                ) : (
                  <Empty text="Nenhum vencimento próximo." />
                )}
              </section>
            </div>
            <section className="panel">
              <header>
                <div>
                  <h2>Pagamentos recentes</h2>
                  <p>Últimos recebimentos confirmados no período</p>
                </div>
              </header>
              {data.recent.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Aluno</th>
                        <th>Data</th>
                        <th>Forma</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <strong>{string(r, "name")}</strong>
                          </td>
                          <td data-label="Data">{day(r.paid_at)}</td>
                          <td data-label="Forma">
                            {string(r, "payment_method")}
                          </td>
                          <td data-label="Valor">{money(r.amount_received)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty text="Nenhum pagamento registrado." />
              )}
            </section>
          </div>
        )
      )}
    </>
  );
}
function Metric({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="metric">
      <div>
        <span>{title}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
