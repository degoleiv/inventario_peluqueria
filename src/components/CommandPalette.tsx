import { useEffect, useRef, useState, type ReactNode } from "react";

export type PaletteAction = {
  id: string;
  label: string;
  shortcut?: string;
  onSelect: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
  /** Resultados extra según texto (p. ej. clientes). */
  dynamicActions?: (query: string) => PaletteAction[];
  title?: ReactNode;
};

export function CommandPalette({
  open,
  onClose,
  actions,
  dynamicActions,
  title = "Comandos y búsqueda",
}: Props) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const dynamic = dynamicActions ? dynamicActions(q) : [];
  const qLower = q.trim().toLowerCase();
  const staticFiltered = actions.filter(
    (a) =>
      !qLower ||
      a.label.toLowerCase().includes(qLower) ||
      a.id.toLowerCase().includes(qLower)
  );
  const combined = [...staticFiltered, ...dynamic];

  useEffect(() => {
    if (open) {
      setQ("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, Math.max(0, combined.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && combined.length > 0) {
        e.preventDefault();
        const a = combined[selected];
        if (a) {
          a.onSelect();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, combined, selected]);

  if (!open) return null;

  return (
    <div className="palette-root" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
      <button type="button" className="palette-backdrop" onClick={onClose} aria-label="Cerrar" />
      <div className="palette-panel">
        <div className="palette-head">{title}</div>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Módulo, acción o nombre de cliente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        <ul className="palette-list" role="listbox" aria-activedescendant={combined[selected]?.id}>
          {combined.length === 0 ? (
            <li className="palette-empty muted">Sin resultados</li>
          ) : (
            combined.map((a, idx) => (
              <li key={`${a.id}-${idx}`} id={a.id} role="option" aria-selected={idx === selected}>
                <button
                  type="button"
                  className={`palette-item ${idx === selected ? "palette-item--active" : ""}`}
                  onClick={() => {
                    a.onSelect();
                    onClose();
                  }}
                  onMouseEnter={() => setSelected(idx)}
                >
                  <span>{a.label}</span>
                  {a.shortcut ? <kbd className="kbd-mini">{a.shortcut}</kbd> : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="palette-hint muted">
          <kbd className="kbd-mini">↑</kbd> <kbd className="kbd-mini">↓</kbd> seleccionar ·{" "}
          <kbd className="kbd-mini">Enter</kbd> abrir · <kbd className="kbd-mini">Esc</kbd> cerrar
        </p>
      </div>
    </div>
  );
}
