import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getModuleEntryPath, pathToNavKey } from "../lib/moduleRoutes";
import {
  NAV_GROUPS,
  NAV_LABEL,
  puedeVerModulo,
  puedeVerUsuariosAdmin,
} from "../nav";

const STORAGE_KEY = "peluqueria_workspace_tabs_v1";

export type WorkspaceTab = {
  id: string;
  /** pathname + search (HashRouter) */
  path: string;
  title: string;
};

type Store = { tabs: WorkspaceTab[]; activeTabId: string };

function pathKey(loc: Pick<Location, "pathname" | "search">): string {
  return loc.pathname + (loc.search || "");
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function titleForWorkspacePath(pathname: string): string {
  const key = pathToNavKey(pathname);
  const base = NAV_LABEL[key];
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length >= 2) {
    const sub = segs[1];
    if (
      key === "citas" ||
      key === "ventas" ||
      key === "inventario" ||
      key === "empleados" ||
      key === "configuracion" ||
      key === "pedidos"
    ) {
      return `${base} · ${sub}`;
    }
  }
  return base;
}

function tabAllowed(path: string, permisos: string[]): boolean {
  const pathname = path.split("?")[0] || path;
  if (pathname.startsWith("/ventas/pantalla-cliente")) return puedeVerModulo(permisos, "ventas");
  const key = pathToNavKey(pathname);
  if (key === "configuracion" || key === "empleados") return puedeVerUsuariosAdmin(permisos);
  return puedeVerModulo(permisos, key);
}

function pruneTabs(tabs: WorkspaceTab[], permisos: string[]): WorkspaceTab[] {
  return tabs.filter((t) => tabAllowed(t.path, permisos));
}

function loadStored(): Store | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return null;
    const tabs = (p as { tabs?: unknown }).tabs;
    const activeTabId = (p as { activeTabId?: unknown }).activeTabId;
    if (!Array.isArray(tabs) || typeof activeTabId !== "string") return null;
    const norm: WorkspaceTab[] = [];
    for (const row of tabs) {
      if (!row || typeof row !== "object") continue;
      const id = (row as { id?: unknown }).id;
      const path = (row as { path?: unknown }).path;
      const title = (row as { title?: unknown }).title;
      if (typeof id !== "string" || typeof path !== "string" || typeof title !== "string") continue;
      norm.push({ id, path, title });
    }
    if (norm.length === 0) return null;
    const activeOk = norm.some((t) => t.id === activeTabId);
    return { tabs: norm, activeTabId: activeOk ? activeTabId : norm[0].id };
  } catch {
    return null;
  }
}

function persistStore(s: Store): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function clearWorkspaceTabsStorage(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

type Ctx = {
  store: Store | null;
  menuEntries: { path: string; label: string }[];
  addTab: (path: string) => void;
  selectTab: (id: string) => void;
  closeTab: (id: string) => void;
};

const WorkspaceTabsContext = createContext<Ctx | null>(null);

export function WorkspaceTabsProvider({
  permisos,
  children,
}: {
  permisos: string[];
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [store, setStore] = useState<Store | null>(null);
  const didInit = useRef(false);

  const permisosKey = permisos.join("|");

  const menuEntries = useMemo(() => {
    const items: { path: string; label: string }[] = [];
    for (const g of NAV_GROUPS) {
      for (const id of g.items) {
        if (id === "configuracion" || id === "empleados") {
          if (!puedeVerUsuariosAdmin(permisos)) continue;
        } else if (!puedeVerModulo(permisos, id)) continue;
        items.push({ path: getModuleEntryPath(id), label: NAV_LABEL[id] });
      }
    }
    return items;
  }, [permisos]);

  useLayoutEffect(() => {
    if (!permisos.length) return;
    const pk = pathKey(location);

    if (!didInit.current) {
      didInit.current = true;
      let next: Store;
      const stored = loadStored();
      if (stored) {
        const pruned = pruneTabs(stored.tabs, permisos);
        if (pruned.length === 0) {
          const id = newId();
          next = { tabs: [{ id, path: pk, title: titleForWorkspacePath(location.pathname) }], activeTabId: id };
        } else {
          const hit = pruned.find((t) => t.path === pk);
          if (hit) next = { tabs: pruned, activeTabId: hit.id };
          else {
            const activeStill = pruned.find((t) => t.id === stored.activeTabId);
            const activeId = activeStill?.id ?? pruned[0].id;
            next = {
              tabs: pruned.map((t) =>
                t.id === activeId ? { ...t, path: pk, title: titleForWorkspacePath(location.pathname) } : t
              ),
              activeTabId: activeId,
            };
          }
        }
      } else {
        const id = newId();
        next = { tabs: [{ id, path: pk, title: titleForWorkspacePath(location.pathname) }], activeTabId: id };
      }
      setStore(next);
      persistStore(next);
      return;
    }

    setStore((prev) => {
      if (!prev) return prev;

      let tabs = pruneTabs(prev.tabs, permisos);
      let activeTabId = prev.activeTabId;
      if (tabs.length === 0) {
        const id = newId();
        const fresh: Store = {
          tabs: [{ id, path: pk, title: titleForWorkspacePath(location.pathname) }],
          activeTabId: id,
        };
        persistStore(fresh);
        return fresh;
      }
      if (!tabs.some((t) => t.id === activeTabId)) {
        activeTabId = tabs[0].id;
      }

      const hit = tabs.find((t) => t.path === pk);
      let next: Store;
      if (hit) {
        next = hit.id === activeTabId ? { tabs, activeTabId } : { tabs, activeTabId: hit.id };
      } else {
        next = {
          tabs: tabs.map((t) =>
            t.id === activeTabId ? { ...t, path: pk, title: titleForWorkspacePath(location.pathname) } : t
          ),
          activeTabId,
        };
      }

      if (
        next.activeTabId === prev.activeTabId &&
        next.tabs.length === prev.tabs.length &&
        next.tabs.every((t, i) => {
          const o = prev.tabs[i];
          return o && t.id === o.id && t.path === o.path && t.title === o.title;
        })
      ) {
        return prev;
      }
      persistStore(next);
      return next;
    });
  }, [location.pathname, location.search, permisosKey, permisos]);

  const addTab = useCallback(
    (path: string) => {
      if (!permisos.length) return;
      const full = path.startsWith("/") ? path : `/${path}`;
      const pathname = full.split("?")[0] || full;
      const search = full.includes("?") ? `?${full.split("?").slice(1).join("?")}` : "";
      const key = pathname + search;
      if (!tabAllowed(key, permisos)) return;

      setStore((prev) => {
        if (!prev) return prev;
        const exist = prev.tabs.find((t) => t.path === key);
        if (exist) {
          const s2 = { ...prev, activeTabId: exist.id };
          persistStore(s2);
          return s2;
        }
        const id = newId();
        const tab: WorkspaceTab = { id, path: key, title: titleForWorkspacePath(pathname) };
        const s2 = { tabs: [...prev.tabs, tab], activeTabId: id };
        persistStore(s2);
        return s2;
      });
      navigate(full);
    },
    [navigate, permisos]
  );

  const selectTab = useCallback(
    (id: string) => {
      let target: string | undefined;
      setStore((prev) => {
        if (!prev) return prev;
        const t = prev.tabs.find((x) => x.id === id);
        if (!t || t.id === prev.activeTabId) return prev;
        target = t.path;
        const s2 = { ...prev, activeTabId: t.id };
        persistStore(s2);
        return s2;
      });
      if (target) navigate(target);
    },
    [navigate]
  );

  const closeTab = useCallback(
    (id: string) => {
      let navPath: string | undefined;
      setStore((prev) => {
        if (!prev) return prev;
        if (prev.tabs.length <= 1) return prev;
        const idx = prev.tabs.findIndex((t) => t.id === id);
        if (idx < 0) return prev;
        const nextTabs = prev.tabs.filter((t) => t.id !== id);
        let activeTabId = prev.activeTabId;
        if (activeTabId === id) {
          const pick = nextTabs[Math.max(0, idx - 1)] ?? nextTabs[0];
          activeTabId = pick.id;
          navPath = pick.path;
        }
        const s2 = { tabs: nextTabs, activeTabId };
        persistStore(s2);
        return s2;
      });
      if (navPath) navigate(navPath);
    },
    [navigate]
  );

  const value = useMemo<Ctx>(
    () => ({
      store,
      menuEntries,
      addTab,
      selectTab,
      closeTab,
    }),
    [store, menuEntries, addTab, selectTab, closeTab]
  );

  return <WorkspaceTabsContext.Provider value={value}>{children}</WorkspaceTabsContext.Provider>;
}

export function useWorkspaceTabs(): Ctx {
  const c = useContext(WorkspaceTabsContext);
  if (!c) throw new Error("useWorkspaceTabs fuera de WorkspaceTabsProvider");
  return c;
}

export function useWorkspaceTabsOptional(): Ctx | null {
  return useContext(WorkspaceTabsContext);
}
