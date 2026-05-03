import { useEffect, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { persistLastTab } from "../lib/moduleRoutes";

export type SubNavItem = {
  id: string;
  label: string;
  to: string;
};

type Props = {
  items: SubNavItem[];
  moduleId: string;
  /** Si false, no registra Ctrl+1…3 (p. ej. otro modal tiene foco) */
  enableNumberShortcuts?: boolean;
  variant?: "tabs" | "pills";
  /** Acciones rápidas a la derecha (opcional) */
  quickActions?: ReactNode;
};

export function SubNav({
  items,
  moduleId,
  enableNumberShortcuts = true,
  variant = "tabs",
  quickActions,
}: Props) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enableNumberShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.altKey || e.shiftKey) return;
      const n = Number(e.key);
      if (n < 1 || n > 9 || n > items.length) return;
      const item = items[n - 1];
      if (!item) return;
      e.preventDefault();
      persistLastTab(moduleId, item.id);
      navigate(item.to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enableNumberShortcuts, items, moduleId, navigate]);

  const rootClass =
    variant === "pills" ? "subnav subnav--pills" : "subnav subnav--tabs";

  return (
    <div className="subnav-wrap">
      <nav className={rootClass} aria-label="Subsecciones del módulo">
        {items.map((it, idx) => (
          <NavLink
            key={it.id}
            to={it.to}
            end={false}
            className={({ isActive }) =>
              isActive ? "subnav-link subnav-link--active" : "subnav-link"
            }
            onClick={() => persistLastTab(moduleId, it.id)}
          >
            <span className="subnav-label">{it.label}</span>
            {idx < 3 ? (
              <kbd className="subnav-kbd" title={`Ctrl+${idx + 1}`}>
                {idx + 1}
              </kbd>
            ) : null}
          </NavLink>
        ))}
      </nav>
      {quickActions ? <div className="subnav-quick">{quickActions}</div> : null}
    </div>
  );
}
