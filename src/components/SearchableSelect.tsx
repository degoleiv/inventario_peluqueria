import { useId, useMemo, useRef, useState, useEffect, type ReactNode } from "react";

export type SearchableSelectOption = { value: string; label: string };

type Props = {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  hint?: string | null;
  /** Se llama al abrir el panel (p. ej. recargar catálogo en segundo plano). */
  onPanelOpen?: () => void;
  emptySlot?: ReactNode;
  /** Texto del botón que abre/cierra el panel */
  idleTextWhenEmpty?: string;
};

export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Buscar…",
  disabled = false,
  hint,
  onPanelOpen,
  emptySlot,
  idleTextWhenEmpty = "Elegir…",
}: Props) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? "",
    [options, value]
  );

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(n) || o.value.toLowerCase().includes(n)
    );
  }, [options, q]);

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const showList = open && !disabled;
  const noOptions = options.length === 0;

  return (
    <div className={`field searchable-select ${disabled ? "searchable-select--disabled" : ""}`} ref={wrapRef}>
      <span className="searchable-select__label">{label}</span>
      <button
        type="button"
        className="searchable-select__trigger"
        aria-expanded={showList}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => {
            const next = !prev;
            if (!prev && next) onPanelOpen?.();
            return next;
          });
        }}
      >
        <span className={selectedLabel ? "searchable-select__trigger-value" : "muted"}>
          {selectedLabel || idleTextWhenEmpty}
        </span>
        <span className="searchable-select__chevron" aria-hidden>
          ▾
        </span>
      </button>
      {showList ? (
        <div className="searchable-select__panel card inner-line" role="presentation">
          {noOptions ? (
            <div className="searchable-select__empty">{emptySlot}</div>
          ) : (
            <>
              <input
                ref={inputRef}
                id={`${baseId}-q`}
                className="searchable-select__filter"
                type="search"
                autoComplete="off"
                placeholder={placeholder}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setOpen(false);
                  }
                }}
              />
              <ul id={listboxId} className="searchable-select__list" role="listbox">
                {filtered.map((o) => (
                  <li key={o.value} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={o.value === value}
                      className={`searchable-select__opt ${o.value === value ? "is-active" : ""}`}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                    >
                      {o.label}
                    </button>
                  </li>
                ))}
              </ul>
              {filtered.length === 0 ? (
                <p className="muted small searchable-select__no-hit">Sin coincidencias</p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}
