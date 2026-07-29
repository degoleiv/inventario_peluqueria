import type { ReactNode } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { useWorkspaceTabs } from "../context/WorkspaceTabsContext";
import { MODULE_ROUTE_DEFS } from "../lib/moduleRouteDefs";

const CONTENT_ROUTES = (
  <>
    {MODULE_ROUTE_DEFS.map((d) => (
      <Route key={d.path} path={d.path} element={d.element} />
    ))}
  </>
);

/**
 * Reemplaza a `<Outlet/>` para el contenido de módulo: mantiene una instancia
 * montada por cada pestaña abierta y solo alterna visibilidad.
 *
 * Importante: el contenedor DOM de cada pestaña es estable. Cambiar el destino
 * de `createPortal` entre montajes remonta el árbol y pierde el estado
 * (carrito, wizard de pedidos, etc.).
 */
export function TabbedOutlet(): ReactNode {
  const { store } = useWorkspaceTabs();
  const realLocation = useLocation();

  return (
    <div className="tab-pane-mount">
      {store?.tabs.map((tab) => {
        const active = tab.id === store.activeTabId;
        return (
          <div
            key={tab.id}
            className={`tab-pane-host${active ? " tab-pane-host--active" : ""}`}
            aria-hidden={!active}
            // React 19: evita foco / interacción en pestañas ocultas
            inert={!active ? true : undefined}
          >
            <Routes location={active ? realLocation : tab.path}>{CONTENT_ROUTES}</Routes>
          </div>
        );
      })}
    </div>
  );
}
