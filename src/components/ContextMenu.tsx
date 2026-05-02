import { useEffect, type ReactNode } from "react";

export type ContextMenuItem = {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
};

type Props = {
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
};

export function ContextMenu({ open, x, y, items, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || items.length === 0) return null;

  return (
    <div className="context-menu-root">
      <button type="button" className="context-menu-backdrop" onClick={onClose} aria-label="Cerrar menú" />
      <ul
        className="context-menu-panel"
        role="menu"
        style={{
          left: Math.min(x, typeof window !== "undefined" ? window.innerWidth - 200 : x),
          top: Math.min(y, typeof window !== "undefined" ? window.innerHeight - 220 : y),
        }}
      >
        {items.map((item) => (
          <li key={item.label} role="none">
            <button
              type="button"
              role="menuitem"
              className={`context-menu-item ${item.danger ? "context-menu-item--danger" : ""}`}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
            >
              {item.icon ? <span className="context-menu-icon">{item.icon}</span> : null}
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
