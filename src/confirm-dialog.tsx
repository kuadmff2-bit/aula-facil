import { AlertTriangle, Check, ShieldAlert, Trash2, X } from "lucide-react";
import "./confirm-dialog.css";

export type ConfirmTone = "danger" | "warning" | "primary";

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  detail?: string;
};

type ConfirmDialogProps = ConfirmRequest & {
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  message,
  detail,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "primary",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const Icon = tone === "danger" ? Trash2 : tone === "warning" ? AlertTriangle : ShieldAlert;

  return (
    <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className={`confirm-dialog confirm-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <button className="confirm-close" type="button" onClick={onCancel} aria-label="Fechar">
          <X size={20} />
        </button>

        <div className="confirm-icon"><Icon size={28} strokeWidth={2.1} /></div>

        <div className="confirm-copy">
          <h2 id="confirm-title">{title}</h2>
          <p id="confirm-message">{message}</p>
          {detail && <div className="confirm-detail">{detail}</div>}
        </div>

        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="confirm-submit" onClick={onConfirm} autoFocus>
            {tone === "danger" ? <Trash2 size={17} /> : <Check size={17} />}
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
