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
import { DashboardPage } from "./pages/DashboardPage";
import { InventarioPage } from "./pages/InventarioPage";
import { ClientesPage } from "./pages/ClientesPage";
import { CitasPage } from "./pages/CitasPage";
import { VentasPage } from "./pages/VentasPage";
import { VentaClienteDisplayPage } from "./pages/VentaClienteDisplayPage";
import { PedidosModulePage } from "./pages/PedidosModulePage";
import { ProveedoresPage } from "./pages/ProveedoresPage";
import { FinanzasPage } from "./pages/FinanzasPage";
import { ReportesPage } from "./pages/ReportesPage";
import { ConfiguracionPage } from "./pages/ConfiguracionPage";
import { EmpleadosPage } from "./pages/EmpleadosPage";
import { AppLayout } from "./layout/AppLayout";
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
import {
  getModuleEntryPath,
  pathToNavKey,
  readCitasTab,
  readConfigTab,
  readEmpleadosTab,
  readInventarioTab,
  readVentasTab,
} from "./lib/moduleRoutes";
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
      .catch(() => {
        /* offline / sin permiso */
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
      } catch {
        if (!cancel) {
          setUserEmail(null);
          setPermisos([]);
          setUserFotoUrl(null);
        }
      }
      try {
        await fetchSyncEstado();
        if (!cancel) setOnline(true);
      } catch {
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
      .catch(() => {
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
          clearAccessToken();
          setPermisos([]);
          window.location.reload();
        }}
        onCommandPalette={() => setPaletteOpen(true)}
        onQuickSale={() => navigate(getModuleEntryPath("ventas"))}
        onQuickCita={() => navigate(getModuleEntryPath("citas"))}
        breadcrumb={[
          { label: "Inicio", onClick: () => navigate("/inicio") },
          { label: NAV_LABEL[nav] },
        ]}
        hideModuleHeader={nav === "ventas" || nav === "clientes"}
      >
        <Outlet />
      </AppLayout>
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
        <Route path="inicio" element={<DashboardPage />} />
        <Route path="citas" element={<Navigate to={`/citas/${readCitasTab()}`} replace />} />
        <Route path="citas/:tab" element={<CitasPage />} />
        <Route path="ventas/pantalla-cliente" element={<VentaClienteDisplayPage />} />
        <Route
          path="ventas"
          element={<Navigate to={`/ventas/${readVentasTab()}`} replace />}
        />
        <Route path="ventas/:tab" element={<VentasPage />} />
        <Route
          path="inventario"
          element={
            <Navigate to={`/inventario/${readInventarioTab()}`} replace />
          }
        />
        <Route path="inventario/:tab" element={<InventarioPage />} />
        <Route path="clientes" element={<ClientesPage />} />
        <Route path="clientes/:tab" element={<Navigate to="/clientes" replace />} />
        <Route path="compras" element={<Navigate to="/pedidos" replace />} />
        <Route path="proveedores" element={<ProveedoresPage />} />
        <Route
          path="pedidos-proveedores"
          element={<Navigate to="/pedidos" replace />}
        />
        <Route path="pedidos" element={<PedidosModulePage />} />
        <Route path="pedidos/:tab" element={<PedidosModulePage />} />
        <Route path="finanzas" element={<FinanzasPage />} />
        <Route path="facturas" element={<Navigate to="/finanzas" replace />} />
        <Route path="reportes" element={<ReportesPage />} />
        <Route path="usuarios" element={<Navigate to={`/empleados/${readEmpleadosTab()}`} replace />} />
        <Route
          path="configuracion"
          element={<Navigate to={`/configuracion/${readConfigTab()}`} replace />}
        />
        <Route path="configuracion/:tab" element={<ConfiguracionPage />} />
        <Route
          path="empleados"
          element={<Navigate to={`/empleados/${readEmpleadosTab()}`} replace />}
        />
        <Route
          path="empleados/:tab"
          element={
            <EmpleadosPage
              onChanged={() => window.dispatchEvent(new Event("peluqueria-auth-refresh"))}
            />
          }
        />
      </Route>
    </Routes>
  );
}
