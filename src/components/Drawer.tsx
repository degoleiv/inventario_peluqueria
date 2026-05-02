import { useEffect, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

export function Drawer({ open, title, onClose, children, footer, wide }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-root" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <button type="button" className="drawer-backdrop" onClick={onClose} aria-label="Cerrar" />
      <aside className={`drawer-panel ${wide ? "drawer-panel--wide" : ""}`}>
        <header className="drawer-header">
          <h2 id="drawer-title" className="drawer-title">
            {title}
          </h2>
          <button type="button" className="drawer-close btn ghost" onClick={onClose}>
            Cerrar <kbd className="kbd-mini">Esc</kbd>
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}
