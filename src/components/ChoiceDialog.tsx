import { useEffect, type ReactNode } from "react";

export type ChoiceDialogOption = {
  label: string;
  variant?: "primary" | "danger" | "ghost";
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
};

type Props = {
  open: boolean;
  title: string;
  description?: ReactNode;
  choices: ChoiceDialogOption[];
  busy?: boolean;
  /** Texto del botón que solo cierra (equivale a backdrop). */
  dismissLabel?: string;
  onDismiss: () => void;
};

function btnClass(variant: ChoiceDialogOption["variant"]): string {
  if (variant === "danger") return "btn confirm-dialog-confirm--danger";
  if (variant === "ghost") return "btn ghost";
  return "btn primary";
}

/**
 * Modal con varias acciones en columna (p. ej. guardar / descartar / seguir editando).
 */
export function ChoiceDialog({
  open,
  title,
  description,
  choices,
  busy = false,
  dismissLabel = "Cancelar",
  onDismiss,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onDismiss]);

  if (!open) return null;

  return (
    <div className="confirm-dialog-root" role="dialog" aria-modal="true" aria-labelledby="choice-dialog-title">
      <button type="button" className="confirm-dialog-backdrop" onClick={() => !busy && onDismiss()} aria-hidden />
      <div className="confirm-dialog-panel card-pro" onClick={(e) => e.stopPropagation()}>
        <h2 id="choice-dialog-title" className="card-pro-title confirm-dialog-title">
          {title}
        </h2>
        {description ? <div className="confirm-dialog-body muted">{description}</div> : null}
        <div className="confirm-dialog-actions confirm-dialog-actions--stack">
          {choices.map((c, i) => (
            <button
              key={`${c.label}-${i}`}
              type="button"
              className={btnClass(c.variant)}
              disabled={busy || c.disabled}
              onClick={() => void c.onSelect()}
            >
              {c.label}
            </button>
          ))}
          <button type="button" className="btn ghost" disabled={busy} onClick={onDismiss}>
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
