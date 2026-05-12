import { useEffect, useId, useState, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** Texto sobre el campo (accesible). */
  inputLabel?: string;
  defaultValue?: string;
  inputType?: "text" | "number";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  /** Si devuelve string, se muestra como error y no se cierra. */
  validate?: (trimmed: string) => string | null;
  onConfirm: (trimmed: string) => void | Promise<void>;
  onCancel: () => void;
};

export function PromptDialog({
  open,
  title,
  description,
  inputLabel,
  defaultValue = "",
  inputType = "text",
  inputMode,
  placeholder,
  confirmLabel = "Aceptar",
  cancelLabel = "Cancelar",
  busy = false,
  validate,
  onConfirm,
  onCancel,
}: Props) {
  const fieldId = useId();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    setError(null);
  }, [open, defaultValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  async function submit() {
    const trimmed = value.trim();
    if (validate) {
      const err = validate(trimmed);
      if (err) {
        setError(err);
        return;
      }
    }
    setError(null);
    await onConfirm(trimmed);
  }

  return (
    <div className="confirm-dialog-root" role="dialog" aria-modal="true" aria-labelledby={`${fieldId}-title`}>
      <button type="button" className="confirm-dialog-backdrop" onClick={() => !busy && onCancel()} aria-hidden />
      <div className="confirm-dialog-panel card-pro" onClick={(e) => e.stopPropagation()}>
        <h2 id={`${fieldId}-title`} className="card-pro-title confirm-dialog-title">
          {title}
        </h2>
        {description ? <div className="confirm-dialog-body muted">{description}</div> : null}
        <label className="field" style={{ marginBottom: error ? "0.35rem" : "1rem" }}>
          {inputLabel ? <span>{inputLabel}</span> : null}
          <input
            id={`${fieldId}-input`}
            type={inputType}
            inputMode={inputMode}
            value={value}
            placeholder={placeholder}
            disabled={busy}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </label>
        {error ? (
          <p className="banner banner-error" role="status" style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
            {error}
          </p>
        ) : null}
        <div className="confirm-dialog-actions">
          <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
