import { useEffect, useRef, useState } from "react";
import { useWorkspaceTabsOptional } from "../context/WorkspaceTabsContext";

export function WorkspaceTabsBar() {
  const ctx = useWorkspaceTabsOptional();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  if (!ctx?.store) return null;

  const { store, menuEntries, addTab, selectTab, closeTab } = ctx;

  return (
    <div className="workspace-tabs" ref={menuRef}>
      <div className="workspace-tabs-scroll" role="tablist" aria-label="Vistas abiertas">
        {store.tabs.map((t) => {
          const active = t.id === store.activeTabId;
          return (
            <div
              key={t.id}
              className={`workspace-tabs-item${active ? " workspace-tabs-item--active" : ""}`}
              role="tab"
              aria-selected={active}
            >
              <button
                type="button"
                className="workspace-tabs-item-label"
                onClick={() => selectTab(t.id)}
                title={t.path}
              >
                {t.title}
              </button>
              {store.tabs.length > 1 ? (
                <button
                  type="button"
                  className="workspace-tabs-item-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  aria-label={`Cerrar ${t.title}`}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="workspace-tabs-add-wrap">
        <button
          type="button"
          className="workspace-tabs-add"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title="Abrir otra vista en una pestaña nueva"
        >
          + Nueva pestaña
        </button>
        {menuOpen ? (
          <div className="workspace-tabs-menu" role="menu">
            {menuEntries.length === 0 ? (
              <div className="workspace-tabs-menu-empty">Sin vistas disponibles</div>
            ) : (
              menuEntries.map((e) => (
                <button
                  key={e.path}
                  type="button"
                  role="menuitem"
                  className="workspace-tabs-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    addTab(e.path);
                  }}
                >
                  {e.label}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
