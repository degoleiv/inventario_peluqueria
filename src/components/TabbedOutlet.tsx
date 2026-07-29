import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Route, Routes, useLocation, type Location } from "react-router-dom";
import { useWorkspaceTabs } from "../context/WorkspaceTabsContext";
import { MODULE_ROUTE_DEFS } from "../lib/moduleRouteDefs";

const CONTENT_ROUTES = (
  <>
    {MODULE_ROUTE_DEFS.map((d) => (
      <Route key={d.path} path={d.path} element={d.element} />
    ))}
  </>
);

/** Crea (una vez) un contenedor fuera del flujo visual donde viven las pestañas inactivas. */
function useGraveyardHost(): HTMLDivElement | null {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.className = "tab-pane-graveyard";
    el.style.display = "none";
    document.body.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
    };
  }, []);
  return host;
}

/** Nodo propio (dentro del cementerio) para una pestaña puntual mientras esté inactiva. */
function useGraveyardSlot(graveyard: HTMLDivElement | null): HTMLDivElement | null {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!graveyard) return;
    const el = document.createElement("div");
    graveyard.appendChild(el);
    setSlot(el);
    return () => {
      el.remove();
    };
  }, [graveyard]);
  return slot;
}

type TabPaneProps = {
  path: string;
  active: boolean;
  realLocation: Location;
  mountNode: HTMLDivElement | null;
  graveyard: HTMLDivElement | null;
};

/**
 * Mantiene montada una pestaña de trabajo aunque no esté visible: el contenido
 * vive siempre dentro de un `createPortal`, solo cambia el contenedor de
 * destino (activa → `mountNode`, inactiva → su propio slot en el cementerio).
 * Alternar entre "con portal" y "sin portal" desmontaría el árbol; mover el
 * contenedor de un portal ya existente no.
 */
function TabPane({ path, active, realLocation, mountNode, graveyard }: TabPaneProps) {
  const slot = useGraveyardSlot(graveyard);
  const container = active ? mountNode : slot;
  if (!container) return null;
  return createPortal(
    <Routes location={active ? realLocation : path}>{CONTENT_ROUTES}</Routes>,
    container
  );
}

/**
 * Reemplaza a `<Outlet/>` para el contenido de módulo: en vez de desmontar la
 * pestaña anterior al cambiar de pestaña de trabajo, mantiene una instancia
 * por cada pestaña abierta (`useWorkspaceTabs().store.tabs`) y solo cambia
 * cuál está "enchufada" al área visible.
 */
export function TabbedOutlet(): ReactNode {
  const { store } = useWorkspaceTabs();
  const realLocation = useLocation();
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null);
  const graveyard = useGraveyardHost();

  return (
    <>
      <div className="tab-pane-mount" ref={setMountNode} />
      {store?.tabs.map((tab) => (
        <TabPane
          key={tab.id}
          path={tab.path}
          active={tab.id === store.activeTabId}
          realLocation={realLocation}
          mountNode={mountNode}
          graveyard={graveyard}
        />
      ))}
    </>
  );
}
