import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette";
import { TabbedOutlet } from "./components/TabbedOutlet";
import { AppLayout } from "./layout/AppLayout";
import { WorkspaceTabsProvider, clearWorkspaceTabsStorage } from "./context/WorkspaceTabsContext";
import { PosFocusProvider } from "./context/PosFocusContext";
import {
  NAV_LABEL,
  puedeVerModulo,
  puedeVerUsuariosAdmin,
  type NavKey,
} from "./nav";
import {
  fetchAuthMe,
  fetchBranding,
  fetchClientes,
  fetchSyncEstado,
  type Cliente,
} from "./api";
import { clearAccessToken } from "./auth/token";
import { applyBrandingToDocument } from "./lib/brandingDocument";
import { getModuleEntryPath, pathToNavKey } from "./lib/moduleRoutes";
import { MODULE_ROUTE_DEFS } from "./lib/moduleRouteDefs";
export function AuthenticatedShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const nav = pathToNavKey(location.pathname);
  const customerDisplay = location.pathname === "/ventas/pantalla-cliente";

  const [authTick, setAuthTick] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const s = localStorage.getItem("peluqueria_theme");
      return s === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("peluqueria_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteClientes, setPaletteClientes] = useState<Cliente[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userFotoUrl, setUserFotoUrl] = useState<string | null>(null);
  const [permisos, setPermisos] = useState<string[]>([]);
  const [online, setOnline] = useState(true);
  const [brandTitle, setBrandTitle] = useState<string | undefined>(undefined);
  const [brandLogo, setBrandLogo] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("peluqueria_theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("peluqueria_sidebar_collapsed", collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    let cancel = false;
    void fetchBranding()
      .then((b) => {
        if (cancel) return;
        setBrandTitle(b.nombre_negocio);
        setBrandLogo(b.logo_data_url);
        applyBrandingToDocument(b);
      })
      .catch((e: unknown) => {
        console.warn("[shell] fetchBranding no disponible (offline / sin permiso):", e);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const me = await fetchAuthMe();
        if (!cancel) {
          setUserEmail(me.user.email);
          setPermisos(me.user.permisos ?? []);
          const f = me.user.foto_url?.trim();
          setUserFotoUrl(f && f.length > 0 ? f : null);
        }
      } catch (e) {
        console.warn("[shell] fetchAuthMe falló:", e);
        if (!cancel) {
          setUserEmail(null);
          setPermisos([]);
          setUserFotoUrl(null);
        }
      }
      try {
        await fetchSyncEstado();
        if (!cancel) setOnline(true);
      } catch (e) {
        console.warn("[shell] fetchSyncEstado falló (modo offline):", e);
        if (!cancel) setOnline(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [authTick]);

  useEffect(() => {
    if (!paletteOpen) return;
    if (!puedeVerModulo(permisos, "clientes")) {
      setPaletteClientes([]);
      return;
    }
    let cancel = false;
    void fetchClientes()
      .then((list) => {
        if (!cancel) setPaletteClientes(list);
      })
      .catch((e: unknown) => {
        console.warn("[shell] fetchClientes para palette falló:", e);
        if (!cancel) setPaletteClientes([]);
      });
    return () => {
      cancel = true;
    };
  }, [paletteOpen, permisos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const fn = () => setAuthTick((t) => t + 1);
    window.addEventListener("peluqueria-auth-refresh", fn);
    return () => window.removeEventListener("peluqueria-auth-refresh", fn);
  }, []);

  const primeraVistaPermitida = useMemo((): NavKey => {
    const orden: NavKey[] = [
      "inicio",
      "ventas",
      "citas",
      "clientes",
      "inventario",
      "pedidos",
      "finanzas",
      "reportes",
      "configuracion",
      "empleados",
    ];
    for (const k of orden) {
      if (k === "configuracion" || k === "empleados") {
        if (puedeVerUsuariosAdmin(permisos)) return k;
      } else if (puedeVerModulo(permisos, k)) {
        return k;
      }
    }
    return "inicio";
  }, [permisos]);

  useEffect(() => {
    if (permisos.length === 0) return;
    const key = pathToNavKey(location.pathname);
    const ok =
      key === "configuracion" || key === "empleados"
        ? puedeVerUsuariosAdmin(permisos)
        : puedeVerModulo(permisos, key);
    if (!ok) {
      navigate(getModuleEntryPath(primeraVistaPermitida), { replace: true });
    }
  }, [permisos, location.pathname, navigate, primeraVistaPermitida]);

  const paletteActions: PaletteAction[] = useMemo(() => {
    const quick: PaletteAction[] = [];
    if (puedeVerModulo(permisos, "ventas")) {
      quick.push({
        id: "palette-ventas",
        label: "Abrir ventas",
        shortcut: "V",
        onSelect: () => navigate(getModuleEntryPath("ventas")),
      });
    }
    if (puedeVerModulo(permisos, "citas")) {
      quick.push({
        id: "palette-citas",
        label: "Abrir agenda",
        onSelect: () => navigate(getModuleEntryPath("citas")),
      });
    }
    const navItems = (Object.keys(NAV_LABEL) as NavKey[])
      .filter((id) =>
        id === "configuracion" || id === "empleados"
          ? puedeVerUsuariosAdmin(permisos)
          : puedeVerModulo(permisos, id)
      )
      .map((id) => ({
        id: `nav-${id}`,
        label: NAV_LABEL[id],
        onSelect: () => navigate(getModuleEntryPath(id)),
      }));
    return [...quick, ...navItems];
  }, [permisos, navigate]);

  const paletteDynamic = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (q.length < 1) return [];
      return paletteClientes
        .filter(
          (c) =>
            c.nombre.toLowerCase().includes(q) ||
            (c.telefono && String(c.telefono).includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q))
        )
        .slice(0, 18)
        .map((c) => ({
          id: `palette-cli-${c.id}`,
          label: `${c.nombre}${c.telefono ? ` · ${c.telefono}` : ""}`,
          onSelect: () => {
            try {
              sessionStorage.setItem("peluqueria_focus_cliente_id", String(c.id));
            } catch {
              /* ignore */
            }
            navigate("/clientes");
          },
        }));
    },
    [paletteClientes, navigate]
  );

  const setNav = useCallback(
    (k: NavKey) => {
      navigate(getModuleEntryPath(k));
    },
    [navigate]
  );

  return (
    <>
      <WorkspaceTabsProvider permisos={permisos}>
        <PosFocusProvider>
        <AppLayout
          nav={nav}
          setNav={setNav}
          theme={theme}
          setTheme={setTheme}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          userEmail={userEmail}
          userFotoUrl={userFotoUrl}
          permisos={permisos}
          brandTitle={brandTitle}
          brandLogoSrc={brandLogo}
          fullscreenContent={customerDisplay}
          online={online}
          onLogout={() => {
            clearWorkspaceTabsStorage();
            clearAccessToken();
            setPermisos([]);
            window.location.reload();
          }}
          onCommandPalette={() => setPaletteOpen(true)}
          onQuickSale={() => navigate(getModuleEntryPath("ventas"))}
          onQuickCita={() => navigate(getModuleEntryPath("citas"))}
          hideModuleHeader
        >
          <Outlet />
          <TabbedOutlet />
        </AppLayout>
        </PosFocusProvider>
      </WorkspaceTabsProvider>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
        dynamicActions={paletteDynamic}
      />
    </>
  );
}

export function AuthenticatedRoutes() {
  return (
    <Routes>
      <Route path="/" element={<AuthenticatedShell />}>
        <Route index element={<Navigate to="inicio" replace />} />
        {MODULE_ROUTE_DEFS.map((d) => (
          // El contenido real lo pinta <TabbedOutlet/> (una instancia por pestaña
          // de trabajo abierta); este <Routes> real solo se conserva para que
          // sigan disparando los <Navigate> de rutas legacy/bare (element=null
          // en las de contenido evita montarlas dos veces).
          <Route key={d.path} path={d.path} element={d.redirect ? d.element : null} />
        ))}
      </Route>
    </Routes>
  );
}
