import { useEffect, type ReactNode } from "react";

export type DrawerVariant = "overlay" | "split";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** `split`: solo el panel (sin backdrop ni capa fija); va dentro del modal de horas a la derecha. */
  variant?: DrawerVariant;
  /** En `split`, el modal padre puede ofrecer un único cierre y ocultar este botón. */
  hideHeaderClose?: boolean;
};

export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
  variant = "overlay",
  hideHeaderClose = false,
}: Props) {
  useEffect(() => {
    if (!open || variant === "split") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, variant]);

  if (!open) return null;

  if (variant === "split") {
    return (
      <aside
        className={`drawer-panel drawer-panel--modal-split ${wide ? "drawer-panel--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title-split"
      >
        <header className={`drawer-header${hideHeaderClose ? " drawer-header--no-close" : ""}`}>
          <h2 id="drawer-title-split" className="drawer-title">
            {title}
          </h2>
          {hideHeaderClose ? null : (
            <button type="button" className="drawer-close btn ghost" onClick={onClose}>
              Cerrar <kbd className="kbd-mini">Esc</kbd>
            </button>
          )}
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </aside>
    );
  }

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
