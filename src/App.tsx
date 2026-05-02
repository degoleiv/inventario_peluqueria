import { useCallback, useEffect, useMemo, useState } from "react";
import { getAccessToken, clearAccessToken } from "./auth/token";
import { CommandPalette, type PaletteAction } from "./components/CommandPalette";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InventarioPage } from "./pages/InventarioPage";
import { ClientesPage } from "./pages/ClientesPage";
import { CitasPage } from "./pages/CitasPage";
import { VentasPage } from "./pages/VentasPage";
import { ComprasPage } from "./pages/ComprasPage";
import { FacturasPage } from "./pages/FacturasPage";
import { FinanzasPage } from "./pages/FinanzasPage";
import { ReportesPage } from "./pages/ReportesPage";
import { AppLayout } from "./layout/AppLayout";
import { NAV_LABEL, type NavKey } from "./nav";
import { fetchAuthMe, fetchClientes, fetchSyncEstado, type Cliente } from "./api";
import "./App.css";

function App() {
  const [nav, setNav] = useState<NavKey>("inicio");
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
  const [online, setOnline] = useState(true);

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
    if (!getAccessToken()) return;
    let cancel = false;
    (async () => {
      try {
        const me = await fetchAuthMe();
        if (!cancel) setUserEmail(me.user.email);
      } catch {
        if (!cancel) setUserEmail(null);
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
  }, [paletteOpen]);

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

  const paletteActions: PaletteAction[] = useMemo(() => {
    const quick: PaletteAction[] = [
      {
        id: "palette-pos",
        label: "Abrir ventas (POS)",
        shortcut: "POS",
        onSelect: () => setNav("ventas"),
      },
      {
        id: "palette-citas",
        label: "Abrir agenda",
        onSelect: () => setNav("citas"),
      },
    ];
    const navItems = (Object.keys(NAV_LABEL) as NavKey[]).map((id) => ({
      id: `nav-${id}`,
      label: NAV_LABEL[id],
      onSelect: () => setNav(id),
    }));
    return [...quick, ...navItems];
  }, []);

  const paletteDynamic = useCallback((query: string) => {
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
          setNav("clientes");
        },
      }));
  }, [paletteClientes]);

  const onLoggedIn = useCallback(() => setAuthTick((t) => t + 1), []);

  if (!getAccessToken()) {
    return <LoginPage onLoggedIn={onLoggedIn} key={authTick} />;
  }

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
        online={online}
        onLogout={() => {
          clearAccessToken();
          setAuthTick((t) => t + 1);
        }}
        onCommandPalette={() => setPaletteOpen(true)}
        onQuickSale={() => setNav("ventas")}
        onQuickCita={() => setNav("citas")}
        breadcrumb={[
          { label: "Inicio", onClick: () => setNav("inicio") },
          { label: NAV_LABEL[nav] },
        ]}
      >
        {nav === "inicio" ? <DashboardPage /> : null}
        {nav === "inventario" ? <InventarioPage /> : null}
        {nav === "clientes" ? <ClientesPage /> : null}
        {nav === "citas" ? <CitasPage /> : null}
        {nav === "compras" ? <ComprasPage /> : null}
        {nav === "ventas" ? <VentasPage /> : null}
        {nav === "facturas" ? <FacturasPage /> : null}
        {nav === "finanzas" ? <FinanzasPage /> : null}
        {nav === "reportes" ? <ReportesPage /> : null}
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

export default App;
export type { NavKey } from "./nav";
