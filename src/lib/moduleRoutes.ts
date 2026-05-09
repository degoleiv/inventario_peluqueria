import type { NavKey } from "../nav";

const STORAGE_PREFIX = "peluqueria_subnav_";

export const CITAS_TABS = ["calendario", "agenda", "nueva"] as const;
export type CitasTab = (typeof CITAS_TABS)[number];

export const INVENTARIO_TABS = ["productos", "alertas"] as const;
export type InventarioTab = (typeof INVENTARIO_TABS)[number];

/** Migra pestaña antigua `movimientos` → `productos`. */
export function readInventarioTab(): InventarioTab {
  const t = readLastTab("inventario", "productos");
  if (t === "movimientos") return "productos";
  if (INVENTARIO_TABS.includes(t as InventarioTab)) return t as InventarioTab;
  return "productos";
}

export const VENTAS_TABS = ["ventas", "historial", "devoluciones"] as const;
export type VentasTab = (typeof VENTAS_TABS)[number];

/** Migra ruta/pestaña antigua `pos` → `ventas`. */
export function readVentasTab(): VentasTab {
  let t = readLastTab("ventas", "ventas");
  if (t === "pos") return "ventas";
  if (VENTAS_TABS.includes(t as VentasTab)) return t as VentasTab;
  return "ventas";
}

export const PEDIDOS_TABS = ["pedidos-proveedores"] as const;
export type PedidosTab = (typeof PEDIDOS_TABS)[number];

/** Compatibilidad histórica: normaliza tabs antiguas hacia pedidos principales. */
export function readPedidosTab(): PedidosTab {
  let t = readLastTab("pedidos", "pedidos-proveedores");
  if (t === "compras" || t === "pedidos_proveedores" || t === "proveedores") {
    return "pedidos-proveedores";
  }
  if (PEDIDOS_TABS.includes(t as PedidosTab)) return t as PedidosTab;
  return "pedidos-proveedores";
}

export const CONFIG_TABS = ["parametros", "apariencia", "sistema"] as const;
export type ConfigTab = (typeof CONFIG_TABS)[number];

/** Última pestaña de configuración; migra rutas antiguas `general` / `negocio`. */
export function readConfigTab(): ConfigTab {
  const raw = readLastTab("configuracion", "parametros");
  if (raw === "negocio" || raw === "general") return "parametros";
  if (CONFIG_TABS.includes(raw as ConfigTab)) return raw as ConfigTab;
  return "parametros";
}

export const EMPLEADOS_TABS = ["lista", "turnos", "movimientos", "roles"] as const;
export type EmpleadosTab = (typeof EMPLEADOS_TABS)[number];

/** Migra pestañas antiguas (`nuevo`, `comisiones`, `auditoria`) → válidas. */
export function readEmpleadosTab(): EmpleadosTab {
  let t = readLastTab("empleados", "lista");
  if (t === "nuevo" || t === "comisiones" || t === "auditoria") return "lista";
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
      return `/ventas/${readVentasTab()}`;
    case "inventario":
      return `/inventario/${readInventarioTab()}`;
    case "clientes":
      return "/clientes";
    case "pedidos":
      return "/pedidos";
    case "finanzas":
      return "/finanzas";
    case "facturas":
      return "/facturas";
    case "reportes":
      return "/reportes";
    case "configuracion":
      return `/configuracion/${readConfigTab()}`;
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
  if (seg === "pedidos-proveedores" || seg === "proveedores" || seg === "compras") seg = "pedidos";
  const keys: NavKey[] = [
    "inicio",
    "ventas",
    "citas",
    "clientes",
    "inventario",
    "pedidos",
    "finanzas",
    "facturas",
    "reportes",
    "configuracion",
    "empleados",
  ];
  return (keys.includes(seg as NavKey) ? seg : "inicio") as NavKey;
}
