import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = botón principal rojo (p. ej. eliminar) */
  variant?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

/**
 * Diálogo modal accesible (backdrop, Escape, aria-modal).
 * z-index por encima del drawer (100) para confirmar acciones destructivas.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="confirm-dialog-root" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <button type="button" className="confirm-dialog-backdrop" onClick={() => !busy && onCancel()} aria-hidden />
      <div className="confirm-dialog-panel card-pro" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-dialog-title" className="card-pro-title confirm-dialog-title">
          {title}
        </h2>
        {description ? <div className="confirm-dialog-body muted">{description}</div> : null}
        <div className="confirm-dialog-actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              variant === "danger" ? "btn confirm-dialog-confirm--danger" : "btn primary"
            }
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
