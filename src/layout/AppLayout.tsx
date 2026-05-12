import type { ReactNode } from "react";
import { resolveImageSrc } from "../api";
import { WorkspaceTabsBar } from "../components/WorkspaceTabsBar";
import {
  NAV_GROUPS,
  NAV_LABEL,
  puedeVerAdminShell,
  puedeVerModulo,
  type NavKey,
} from "../nav";

function IconDashboard() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function IconCart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
function IconTruck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}
function IconWallet() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <line x1="3" y1="10" x2="12" y2="10" />
    </svg>
  );
}
function IconFile() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

const ICONS: Partial<Record<NavKey, React.ReactElement>> = {
  inicio: <IconDashboard />,
  ventas: <IconCart />,
  citas: <IconCalendar />,
  clientes: <IconUsers />,
  inventario: <IconBox />,
  pedidos: <IconTruck />,
  finanzas: <IconWallet />,
  facturas: <IconFile />,
  reportes: <IconChart />,
  configuracion: <IconGear />,
  empleados: <IconShield />,
};

export type BreadcrumbItem = { label: string; onClick?: () => void };

type Props = {
  nav: NavKey;
  setNav: (n: NavKey) => void;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  userEmail: string | null;
  /** Foto del usuario actual (`/api/auth/me`). */
  userFotoUrl?: string | null;
  online: boolean;
  onLogout: () => void;
  onCommandPalette: () => void;
  onQuickSale: () => void;
  onQuickCita: () => void;
  /** Migas de pan opcionales (módulo activo). */
  breadcrumb?: BreadcrumbItem[];
  /** Si true, no se muestra el bloque superior (migas + título del módulo). */
  hideModuleHeader?: boolean;
  /** Permisos del usuario (`*` = acceso total). Filtra ítems del menú lateral. */
  permisos: string[];
  /** Texto de marca (configuración / branding). */
  brandTitle?: string;
  brandLogoSrc?: string | null;
  /** Pantalla secundaria al cliente: sin menú ni barra de app. */
  fullscreenContent?: boolean;
  children: ReactNode;
};

export function AppLayout({
  nav,
  setNav,
  theme,
  setTheme,
  collapsed,
  setCollapsed,
  userEmail,
  userFotoUrl,
  online,
  onLogout,
  onCommandPalette,
  onQuickSale,
  onQuickCita,
  breadcrumb,
  hideModuleHeader,
  permisos,
  brandTitle,
  brandLogoSrc,
  fullscreenContent,
  children,
}: Props) {
  const pageTitle = NAV_LABEL[nav];
  const displayBrand = brandTitle?.trim() || "Peluquería";

  if (fullscreenContent) {
    return <div className="app-root app-root--customer-display">{children}</div>;
  }

  const sidebarGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((id) =>
      id === "configuracion" || id === "empleados"
        ? puedeVerAdminShell(permisos)
        : puedeVerModulo(permisos, id)
    ),
  })).filter((g) => g.items.length > 0);

  const canVentas = puedeVerModulo(permisos, "ventas");
  const canCitas = puedeVerModulo(permisos, "citas");

  return (
    <div className={`app-root ${collapsed ? "app-root--collapsed" : ""}`}>
      <header className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="btn-icon topbar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
            aria-expanded={!collapsed}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="topbar-brand">
            {brandLogoSrc ? (
              <img
                src={resolveImageSrc(brandLogoSrc) ?? brandLogoSrc}
                alt=""
                className="topbar-brand-logo"
                width={28}
                height={28}
              />
            ) : null}
            {displayBrand}
          </span>
          <span className={`conn-badge ${online ? "conn-badge--on" : "conn-badge--off"}`}>
            {online ? "En línea" : "Local / sin sync"}
          </span>
        </div>
        <div className="topbar-actions">
          {canVentas ? (
            <button type="button" className="btn btn-quick btn-quick--accent" onClick={onQuickSale}>
              Nueva venta
            </button>
          ) : null}
          {canCitas ? (
            <button type="button" className="btn btn-quick btn-quick--ghost" onClick={onQuickCita}>
              Nueva cita
            </button>
          ) : null}
          <button
            type="button"
            className="btn ghost btn-compact"
            onClick={onCommandPalette}
            title="Paleta de comandos"
          >
            <kbd className="kbd-mini">Ctrl</kbd>
            <kbd className="kbd-mini">K</kbd>
          </button>
          <span className="topbar-user" title={userEmail ?? ""}>
            {userFotoUrl ? (
              <img
                src={resolveImageSrc(userFotoUrl) ?? userFotoUrl}
                alt=""
                className="topbar-user-avatar"
                width={32}
                height={32}
                decoding="async"
              />
            ) : (
              <span className="topbar-user-avatar topbar-user-avatar--ph" aria-hidden>
                {(userEmail ?? "?").slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="topbar-user-email">{userEmail ?? "Usuario"}</span>
          </span>
          <button type="button" className="btn ghost btn-compact" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="sidebar-pro" aria-label="Navegación principal">
          <nav className="sidebar-nav">
            {sidebarGroups.map((g) => (
              <div key={g.label} className="sidebar-group">
                {!collapsed ? (
                  <div className="sidebar-group-label">{g.label}</div>
                ) : null}
                {g.items.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={
                      nav === id ? "sidebar-link sidebar-link--active" : "sidebar-link"
                    }
                    onClick={() => setNav(id)}
                    title={NAV_LABEL[id]}
                  >
                    <span className="sidebar-icon">{ICONS[id]}</span>
                    {!collapsed ? <span className="sidebar-text">{NAV_LABEL[id]}</span> : null}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button
              type="button"
              className="sidebar-link sidebar-theme-toggle"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              <span className="sidebar-icon" aria-hidden>
                {theme === "dark" ? "☀️" : "🌙"}
              </span>
              {!collapsed ? (
                <span className="sidebar-text">{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
              ) : null}
            </button>
          </div>
        </aside>

        <main className={`main-pro${hideModuleHeader ? " main-pro--no-module-header" : ""}`}>
          {!hideModuleHeader ? (
            <header className="main-pro-header">
              {breadcrumb && breadcrumb.length > 0 ? (
                <nav className="breadcrumb" aria-label="Ubicación">
                  {breadcrumb.map((c, i) => (
                    <span key={`${c.label}-${i}`} className="breadcrumb-item">
                      {i > 0 ? <span className="breadcrumb-sep">/</span> : null}
                      {c.onClick ? (
                        <button type="button" className="breadcrumb-link" onClick={c.onClick}>
                          {c.label}
                        </button>
                      ) : (
                        <span className="breadcrumb-current">{c.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
              ) : null}
              <h1 className="main-pro-title">{pageTitle}</h1>
            </header>
          ) : null}
          <WorkspaceTabsBar />
          <div className="main-pro-content">{children}</div>
        </main>
      </div>
    </div>
  );
}
