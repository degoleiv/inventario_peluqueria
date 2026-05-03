import type { NavKey } from "../nav";

const STORAGE_PREFIX = "peluqueria_subnav_";

export const CITAS_TABS = ["calendario", "agenda", "nueva"] as const;
export type CitasTab = (typeof CITAS_TABS)[number];

export const INVENTARIO_TABS = ["productos", "movimientos", "alertas"] as const;
export type InventarioTab = (typeof INVENTARIO_TABS)[number];

export const CLIENTES_TABS = ["lista", "nuevo", "historial"] as const;
export type ClientesTab = (typeof CLIENTES_TABS)[number];

export const VENTAS_TABS = ["pos", "historial", "devoluciones"] as const;
export type VentasTab = (typeof VENTAS_TABS)[number];

export const CONFIG_TABS = ["general", "apariencia", "negocio", "sistema"] as const;
export type ConfigTab = (typeof CONFIG_TABS)[number];

export const EMPLEADOS_TABS = [
  "lista",
  "turnos",
  "comisiones",
  "movimientos",
  "auditoria",
  "roles",
] as const;
export type EmpleadosTab = (typeof EMPLEADOS_TABS)[number];

/** Migra pestaña antigua `nuevo` → `lista`. */
export function readEmpleadosTab(): EmpleadosTab {
  let t = readLastTab("empleados", "lista");
  if (t === "nuevo") return "lista";
  if (EMPLEADOS_TABS.includes(t as EmpleadosTab)) return t as EmpleadosTab;
  return "lista";
}

export function persistLastTab(moduleId: string, tab: string) {
  try {
    localStorage.setItem(STORAGE_PREFIX + moduleId, tab);
  } catch {
    /* ignore */
  }
}

export function readLastTab(moduleId: string, fallback: string): string {
  try {
    return localStorage.getItem(STORAGE_PREFIX + moduleId) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Migra pestaña antigua `lista` → `agenda`. */
export function readCitasTab(): CitasTab {
  let t = readLastTab("citas", "calendario");
  if (t === "lista") return "agenda";
  if (CITAS_TABS.includes(t as CitasTab)) return t as CitasTab;
  return "calendario";
}

/** Primera ruta al entrar a un módulo con sub-navegación (respeta última pestaña). */
export function getModuleEntryPath(key: NavKey): string {
  switch (key) {
    case "inicio":
      return "/inicio";
    case "citas":
      return `/citas/${readCitasTab()}`;
    case "ventas":
      return `/ventas/${readLastTab("ventas", "pos")}`;
    case "inventario":
      return `/inventario/${readLastTab("inventario", "productos")}`;
    case "clientes":
      return `/clientes/${readLastTab("clientes", "lista")}`;
    case "compras":
      return "/compras";
    case "finanzas":
      return "/finanzas";
    case "facturas":
      return "/facturas";
    case "reportes":
      return "/reportes";
    case "configuracion":
      return `/configuracion/${readLastTab("configuracion", "general")}`;
    case "empleados":
      return `/empleados/${readEmpleadosTab()}`;
    default:
      return "/inicio";
  }
}

/** Primer segmento de path → tecla de navegación lateral */
export function pathToNavKey(pathname: string): NavKey {
  let seg = pathname.replace(/^\//, "").split("/")[0] || "inicio";
  if (seg === "usuarios") seg = "empleados";
  const keys: NavKey[] = [
    "inicio",
    "ventas",
    "citas",
    "clientes",
    "inventario",
    "compras",
    "finanzas",
    "facturas",
    "reportes",
    "configuracion",
    "empleados",
  ];
  return (keys.includes(seg as NavKey) ? seg : "inicio") as NavKey;
}
