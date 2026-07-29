import { useId, useMemo, useRef, useState, useEffect, type ReactNode } from "react";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Si se define, se usa en la lista / trigger; `label` sigue sirviendo para filtrar. */
  labelNode?: ReactNode;
};

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
  /** `combobox`: escribir en el campo filtra la lista sin abrir un panel aparte primero. */
  variant?: "button" | "combobox";
  /** Solo combobox: permite texto libre además de elegir de la lista. */
  allowCustom?: boolean;
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
  variant = "button",
  allowCustom = false,
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

  const selectedLabelNode = useMemo(() => {
    const hit = options.find((o) => o.value === value);
    return hit?.labelNode ?? hit?.label ?? "";
  }, [options, value]);

  const comboboxClosedDisplay = useMemo(() => {
    if (!value) return "";
    return selectedLabel || value;
  }, [selectedLabel, value]);

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
  const isCombobox = variant === "combobox";

  function openPanel() {
    if (disabled) return;
    setOpen(true);
    onPanelOpen?.();
  }

  function selectOption(next: string) {
    onChange(next);
    setOpen(false);
    setQ("");
  }

  function renderOptions() {
    return (
      <ul id={listboxId} className="searchable-select__list" role="listbox">
        {filtered.map((o) => (
          <li key={o.value} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`searchable-select__opt ${o.value === value ? "is-active" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectOption(o.value)}
            >
              {o.labelNode ?? o.label}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      className={`field searchable-select ${disabled ? "searchable-select--disabled" : ""} ${isCombobox ? "searchable-select--combobox" : ""}`}
      ref={wrapRef}
    >
      <span className="searchable-select__label">{label}</span>
      {isCombobox ? (
        <div className="searchable-select__combobox-wrap">
          <input
            ref={inputRef}
            id={`${baseId}-q`}
            className="searchable-select__trigger searchable-select__combobox-input"
            type="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
            disabled={disabled}
            placeholder={idleTextWhenEmpty}
            value={open ? q : allowCustom ? comboboxClosedDisplay : selectedLabel}
            onFocus={() => {
              openPanel();
              setQ(allowCustom ? value : "");
            }}
            onChange={(e) => {
              setQ(e.target.value);
              if (allowCustom) onChange(e.target.value);
              openPanel();
            }}
            onBlur={() => {
              window.setTimeout(() => {
                if (!wrapRef.current?.contains(document.activeElement)) {
                  setOpen(false);
                  setQ("");
                }
              }, 120);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setOpen(false);
                setQ("");
                inputRef.current?.blur();
              } else if (e.key === "Enter" && filtered[0]) {
                e.preventDefault();
                selectOption(filtered[0]!.value);
              }
            }}
          />
          <span className="searchable-select__chevron searchable-select__chevron--combobox" aria-hidden>
            ▾
          </span>
        </div>
      ) : (
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
      )}
      {showList ? (
        <div className="searchable-select__panel card inner-line" role="presentation">
          {noOptions ? (
            <div className="searchable-select__empty">{emptySlot}</div>
          ) : (
            <>
              {!isCombobox ? (
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
              ) : null}
              {renderOptions()}
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
