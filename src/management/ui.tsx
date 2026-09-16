import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { errorMessage } from "./client";
export function Empty({
  text = "Nenhum registro encontrado.",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <h3>{text}</h3>
      <p>Os registros aparecerão aqui quando forem cadastrados.</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="skeleton" role="status" aria-label="Carregando">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div className="failure" role="alert">
      <AlertCircle />
      <p>{errorMessage(error)}</p>
      <button onClick={retry}>Tentar novamente</button>
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="search">
      <Search size={17} />
      <input
        aria-label="Pesquisar registros"
        placeholder="Pesquisar…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="pager">
      <span>
        {total} registros · Página {page + 1} de{" "}
        {Math.max(1, Math.ceil(total / 25))}
      </span>
      <button
        aria-label="Página anterior"
        disabled={!page}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        aria-label="Próxima página"
        disabled={(page + 1) * 25 >= total}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const d = ref.current!;
    d.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      close.current();
    };
    d.addEventListener("cancel", cancel);
    return () => {
      d.removeEventListener("cancel", cancel);
      d.close();
      prior?.focus();
    };
  }, []);
  return (
    <dialog ref={ref} className="dialog">
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label="Fechar" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function ActionForm({
  children,
  onSubmit,
  label = "Salvar",
  onDone,
  disabled = false,
}: {
  children: ReactNode;
  onSubmit: (f: FormData) => Promise<void>;
  label?: string;
  onDone?: () => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current || disabled) return;
    const f = new FormData(e.currentTarget);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await onSubmit(f);
      onDone?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy || disabled}>{children}</fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <footer>
        <button className="primary" disabled={busy || disabled} type="submit">
          {busy ? "Salvando…" : label}
        </button>
      </footer>
    </form>
  );
}
export function Field({
  label,
  name,
  type = "text",
  value = "",
  required = false,
  options,
  maxLength = 250,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  maxLength?: number;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      {options ? (
        <select name={name} defaultValue={value} required={required}>
          <option value="">Selecione</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea name={name} defaultValue={value} maxLength={2000} />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={value}
          required={required}
          maxLength={maxLength}
          step={type === "number" ? "0.01" : undefined}
        />
      )}
    </label>
  );
}
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [rev, setRev] = useState(0);
  const current = useRef(loader);
  current.current = loader;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    const timer = setTimeout(() => {
      current
        .current()
        .then((v) => {
          if (active) setData(v);
        })
        .catch((e) => {
          if (active) setError(e);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [...deps, rev]);
  return { data, error, loading, reload: () => setRev((v) => v + 1) };
}
