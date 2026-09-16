import { useEffect, useState, lazy, Suspense } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  GraduationCap,
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarDays,
  Wallet,
  Receipt,
  MessageCircle,
  CircleAlert,
  ChartNoAxesCombined,
  Settings2,
  History,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  Bell,
  Search,
  PanelLeftClose,
  UserRound,
} from "lucide-react";
import { client, schools, rpc, list, errorMessage, configured } from "./client";
import { Auth } from "./Auth";
import { type School, type Page, type Row, string } from "./types";
import {
  ActionForm,
  Empty,
  Failure,
  Field,
  Loading,
  Modal,
  useLoad,
} from "./ui";
const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const Catalog = lazy(() =>
  import("./pages/Catalog").then((m) => ({ default: m.Catalog })),
);
const Finance = lazy(() =>
  import("./pages/Finance").then((m) => ({ default: m.Finance })),
);
const Settings = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.Settings })),
);
import { day, money } from "./format";
const navigation: [Page, string, typeof Users][] = [
  ["dashboard", "Visão geral", LayoutDashboard],
  ["students", "Alunos", Users],
  ["guardians", "Responsáveis", UserRound],
  ["courses", "Cursos", BookOpen],
  ["classes", "Turmas", CalendarDays],
  ["enrollments", "Matrículas", BookOpen],
  ["invoices", "Mensalidades", Wallet],
  ["payments", "Pagamentos e recibos", Receipt],
  ["collections", "Cobranças", MessageCircle],
  ["debtors", "Inadimplentes", CircleAlert],
  ["reports", "Relatórios", ChartNoAxesCombined],
  ["audit", "Auditoria", History],
  ["settings", "Configurações", Settings2],
];
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [boot, setBoot] = useState(true),
    [authError, setAuthError] = useState<unknown>(null),
    [recovery, setRecovery] = useState(false);
  const [orgs, setOrgs] = useState<School[]>([]),
    [school, setSchool] = useState<School | null>(null),
    [orgBusy, setOrgBusy] = useState(false),
    [orgError, setOrgError] = useState<unknown>(null);
  const [page, setPage] = useState<Page>("dashboard"),
    [mobile, setMobile] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [dark, setDark] = useState(
      () => localStorage.getItem("af.theme") === "dark",
    );
  const [toast, setToast] = useState<{
      message: string;
      error: boolean;
    } | null>(null),
    [online, setOnline] = useState(navigator.onLine),
    [notifications, setNotifications] = useState(false),
    [search, setSearch] = useState<string | null>(null);
  const notify = (message: string, error = false) =>
    setToast({ message, error });
  useEffect(() => {
    let active = true;
    client.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          if (error) setAuthError(error);
          setSession(data.session);
          setBoot(false);
        }
      })
      .catch((e) => {
        if (active) {
          setAuthError(e);
          setBoot(false);
        }
      });
    const { data } = client.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") {
        setSchool(null);
        setOrgs([]);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (!session) {
      setSchool(null);
      setOrgs([]);
      return;
    }
    setOrgBusy(true);
    setOrgError(null);
    schools()
      .then((v) => {
        if (active) {
          setOrgs(v);
          setSchool(v[0] ?? null);
          setPage(v[0]?.role === "teacher" ? "students" : "dashboard");
        }
      })
      .catch((e) => {
        if (active) setOrgError(e);
      })
      .finally(() => {
        if (active) setOrgBusy(false);
      });
    return () => {
      active = false;
    };
  }, [session?.user.id]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("af.theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearch("");
      }
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("keydown", key);
    };
  }, []);
  if (!configured) return <Auth />;
  if (boot)
    return (
      <main className="boot">
        <Loading />
      </main>
    );
  if (authError)
    return <Failure error={authError} retry={() => location.reload()} />;
  if (!session || recovery)
    return <Auth recovery={recovery} onRecovered={() => setRecovery(false)} />;
  if (orgBusy)
    return (
      <main className="boot">
        <Loading />
      </main>
    );
  if (orgError)
    return <Failure error={orgError} retry={() => location.reload()} />;
  if (!school)
    return (
      <main className="onboarding">
        <div className="brand">
          <GraduationCap />
          AulaFácil
        </div>
        <h1>Vamos organizar sua instituição.</h1>
        <p>
          Comece pelo nome. Você poderá configurar PIX, cursos e equipe depois.
        </p>
        <ActionForm
          label="Criar instituição"
          onSubmit={async (f) => {
            await rpc("create_school", { school_name: String(f.get("name")) });
            const s = await schools();
            setOrgs(s);
            setSchool(s[0] ?? null);
          }}
        >
          <Field label="Nome da instituição" name="name" required />
        </ActionForm>
        <button onClick={() => void client.auth.signOut()}>
          Sair da conta
        </button>
      </main>
    );
  const visible = navigation.filter(([v]) =>
    school.role === "teacher"
      ? ["students", "classes", "settings"].includes(v)
      : v !== "audit" || ["owner", "admin"].includes(school.role),
  );
  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
      {mobile && (
        <button
          className="drawer-scrim"
          aria-label="Fechar menu"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <GraduationCap />
          <span>
            AulaFácil<small>GESTÃO EDUCACIONAL</small>
          </span>
          <button
            className="mobile-only"
            aria-label="Fechar menu"
            onClick={() => setMobile(false)}
          >
            <X />
          </button>
        </div>
        <label className="school-select">
          <span className="eyebrow">INSTITUIÇÃO</span>
          <select
            aria-label="Instituição"
            value={school.id}
            onChange={(e) => {
              const s = orgs.find((o) => o.id === e.target.value)!;
              setSchool(s);
              setPage(s.role === "teacher" ? "students" : "dashboard");
              setSearch(null);
              setNotifications(false);
            }}
          >
            {orgs.map((o) => (
              <option value={o.id} key={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Menu principal">
          {visible.map(([id, label, Icon], i) => (
            <button
              key={id}
              className={`${page === id ? "active" : ""} ${i === 6 || id === "settings" ? "nav-separator" : ""}`}
              title={label}
              aria-current={page === id ? "page" : undefined}
              onClick={() => {
                setPage(id);
                setMobile(false);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => setCollapsed((v) => !v)}>
            <PanelLeftClose size={17} />
            <span>{collapsed ? "Expandir menu" : "Recolher menu"}</span>
          </button>
          <small>AulaFácil · Gestão conectada</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-only"
            aria-label="Abrir menu"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <span className="breadcrumb">
            Gestão <span>/</span> {navigation.find(([v]) => v === page)?.[1]}
          </span>
          <div className="topbar-actions">
            <button aria-label="Busca global" onClick={() => setSearch("")}>
              <Search size={18} />
              <kbd>⌘ K</kbd>
            </button>
            <button
              aria-label={dark ? "Ativar modo claro" : "Ativar modo escuro"}
              onClick={() => setDark((v) => !v)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {school.role !== "teacher" && (
              <button
                aria-label="Notificações"
                onClick={() => setNotifications(true)}
              >
                <Bell size={18} />
              </button>
            )}
            <span className="avatar" title={session.user.email}>
              {(
                session.user.user_metadata.full_name ||
                session.user.email ||
                "A"
              )
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <button
              aria-label="Sair"
              onClick={() => {
                client.auth
                  .signOut()
                  .catch((e) => notify(errorMessage(e), true));
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {!online && (
          <div className="offline" role="status">
            Sem conexão. As operações serão liberadas quando a internet voltar.
          </div>
        )}
        <main className="content" key={school.id}>
          <div className="page-heading">
            <span className="eyebrow">{school.name}</span>
            <h1>{navigation.find(([v]) => v === page)?.[1]}</h1>
            <p>
              {page === "dashboard"
                ? "Acompanhe a rotina e saiba o que precisa da sua atenção."
                : page === "invoices"
                  ? "Consulte os vencimentos e registre os recebimentos com segurança."
                  : "Informações da sua instituição, organizadas em um só lugar."}
            </p>
          </div>
          <Suspense fallback={<Loading />}>
            <div key={page}>
              {page === "dashboard" || page === "reports" ? (
                <Dashboard
                  school={school}
                  reports={page === "reports"}
                  notify={notify}
                />
              ) : [
                  "students",
                  "guardians",
                  "courses",
                  "classes",
                  "enrollments",
                ].includes(page) ? (
                <Catalog school={school} resource={page} notify={notify} />
              ) : ["invoices", "payments", "collections", "debtors"].includes(
                  page,
                ) ? (
                <Finance school={school} resource={page} notify={notify} />
              ) : page === "settings" ? (
                <Settings school={school} notify={notify} />
              ) : (
                <Audit school={school.id} />
              )}
            </div>
          </Suspense>
        </main>
        <footer className="app-footer">
          {school.name}
          <span>Dados consultados diretamente na instituição</span>
        </footer>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.message}
          <button aria-label="Fechar aviso" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {notifications && (
        <Modal title="Notificações" onClose={() => setNotifications(false)}>
          <Notifications school={school.id} />
        </Modal>
      )}
      {search !== null && (
        <Modal title="Busca global" onClose={() => setSearch(null)}>
          <input
            autoFocus
            aria-label="Buscar aluno, CPF, telefone, responsável ou recibo"
            placeholder="Aluno, CPF, telefone, responsável ou recibo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <GlobalSearch
            school={school}
            query={search}
            open={(p) => {
              setPage(p);
              setSearch(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
function GlobalSearch({
  school,
  query,
  open,
}: {
  school: School;
  query: string;
  open: (p: Page) => void;
}) {
  const resources: Page[] =
    school.role === "teacher"
      ? ["students"]
      : ["students", "guardians", "payments"];
  const { data, loading } = useLoad(
    async () =>
      query.length < 2
        ? []
        : Promise.all(
            resources.map(async (resource) => ({
              resource,
              ...(await list(school.id, resource, query)),
            })),
          ),
    [school.id, query],
  );
  return query.length < 2 ? (
    <p className="hint">Digite pelo menos dois caracteres.</p>
  ) : loading ? (
    <Loading />
  ) : (
    <div className="search-results">
      {data?.map((g) => (
        <section key={g.resource}>
          <h3>
            {navigation.find(([v]) => v === g.resource)?.[1]} · {g.total}
          </h3>
          {g.rows.slice(0, 8).map((r) => (
            <button key={r.id} onClick={() => open(g.resource)}>
              {string(r, "name")}
              <small>
                {string(r, "registration") ||
                  string(r, "receipt_number") ||
                  string(r, "phone")}
              </small>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
function Notifications({ school }: { school: string }) {
  const { data, error, loading, reload } = useLoad(async () => {
    const a = await list(school, "collections");
    const { data: reads, error } = await client
      .from("af_notification_reads")
      .select("notification_id")
      .eq("school_id", school);
    if (error) throw error;
    return a.rows.filter(
      (r) => !reads?.some((x) => x.notification_id === r.id),
    );
  }, [school]);
  return loading ? (
    <Loading />
  ) : error ? (
    <Failure error={error} retry={reload} />
  ) : data?.length ? (
    <>
      {data.map((r) => (
        <div className="line-item" key={r.id}>
          <span>
            {string(r, "name")}
            <small>
              Mensalidade · {day(r.due_date)} · {money(r.balance)}
            </small>
          </span>
          <button
            onClick={() => {
              rpc("af_action", {
                p_school: school,
                p_action: "read",
                p_id: r.id,
                p_data: {},
              }).then(reload);
            }}
          >
            Marcar lida
          </button>
        </div>
      ))}
    </>
  ) : (
    <Empty text="Nenhuma notificação pendente." />
  );
}
function Audit({ school }: { school: string }) {
  const { data, error, loading, reload } = useLoad(
    () => list(school, "audit"),
    [school],
  );
  return loading ? (
    <Loading />
  ) : error ? (
    <Failure error={error} retry={reload} />
  ) : (
    <section className="panel">
      {data?.rows.map((r: Row) => (
        <div className="line-item" key={r.id}>
          <span>
            {string(r, "action")}
            <small>
              {string(r, "entity_type")} · {string(r, "entity_id")} · Usuário{" "}
              {string(r, "actor_user_id")}
            </small>
          </span>
          <time>{day(r.created_at)}</time>
        </div>
      ))}
      {!data?.rows.length && <Empty />}
      <p className="hint">
        25 eventos mais recentes. Os registros não podem ser alterados pela
        interface.
      </p>
    </section>
  );
}
