/** Navegación principal — usada por App y command palette. */

/** En `false` se oculta Facturas (menú, permisos asignables y acceso por ruta). */
export const MODULO_FACTURACION_ACTIVO = false;

export type NavKey =
  | "inicio"
  | "ventas"
  | "citas"
  | "clientes"
  | "inventario"
  | "pedidos"
  | "finanzas"
  | "facturas"
  | "reportes"
  | "configuracion"
  | "empleados";

/** Módulos que se asignan por rol de aplicación (no incluye pantallas solo-admin). */
export type PermisoModulo = Exclude<NavKey, "configuracion" | "empleados">;

export const PERMISO_MODULOS: PermisoModulo[] = [
  "inicio",
  "ventas",
  "citas",
  "clientes",
  "inventario",
  "pedidos",
  "finanzas",
  ...(MODULO_FACTURACION_ACTIVO ? (["facturas"] as const) : []),
  "reportes",
];

/** Acciones granulares admitidas junto a un módulo (formato "modulo:accion"). */
export const PERMISO_ACCIONES = ["ver", "crear", "editar", "eliminar"] as const;
export type PermisoAccion = (typeof PERMISO_ACCIONES)[number];

/** Alias legacy de módulos (mismos que server/services/roles.service.ts). */
const MODULO_ALIAS: Record<string, PermisoModulo> = {
  compras: "pedidos",
  proveedores: "pedidos",
  pedidos_proveedores: "pedidos",
};

function normalizarModuloClient(m: string): string {
  return MODULO_ALIAS[m] ?? m;
}

export const NAV_LABEL: Record<NavKey, string> = {
  inicio: "Dashboard",
  ventas: "Ventas",
  citas: "Agenda",
  clientes: "Clientes",
  inventario: "Inventario",
  pedidos: "Pedidos",
  finanzas: "Finanzas",
  facturas: "Facturas",
  reportes: "Reportes",
  configuracion: "Configuración",
  empleados: "Equipo",
};

export const NAV_GROUPS: { label: string; items: NavKey[] }[] = [
  { label: "Principal", items: ["inicio"] },
  { label: "Operación", items: ["ventas", "citas"] },
  { label: "Gestión", items: ["clientes", "inventario", "pedidos"] },
  {
    label: "Finanzas",
    items: MODULO_FACTURACION_ACTIVO ? ["finanzas", "facturas", "reportes"] : ["finanzas", "reportes"],
  },
  { label: "Administración", items: ["configuracion", "empleados"] },
];

export function puedeVerModulo(permisos: string[] | undefined, key: NavKey): boolean {
  if (key === "facturas" && !MODULO_FACTURACION_ACTIVO) return false;
  if (!permisos?.length) return false;
  if (permisos.includes("*")) return true;
  if (key === "configuracion" || key === "empleados") return false;
  for (const p of permisos) {
    const [rawMod] = p.split(":");
    if (rawMod && normalizarModuloClient(rawMod) === key) return true;
  }
  return false;
}

/**
 * ¿El usuario puede ejecutar `accion` sobre `modulo`? Espejo de
 * `server/middleware/auth.ts::hasAccion` — reglas:
 *  - "*" → toda acción sobre todo módulo.
 *  - "modulo" (sin `:accion`) → todas las acciones del módulo (compat legacy).
 *  - "modulo:accion" → sólo esa acción.
 *  - Alias legacy (`compras`, `proveedores`, `pedidos_proveedores`) → mapean a `pedidos`.
 */
export function hasAccionPermiso(
  permisos: string[] | undefined,
  modulo: string,
  accion: PermisoAccion
): boolean {
  if (!permisos?.length) return false;
  if (permisos.includes("*")) return true;
  const target = normalizarModuloClient(modulo);
  for (const p of permisos) {
    if (p === "*") return true;
    const [rawMod, rawAcc] = p.split(":");
    if (!rawMod) continue;
    if (normalizarModuloClient(rawMod) !== target) continue;
    if (rawAcc == null) return true;
    if (rawAcc === accion) return true;
  }
  return false;
}

export function puedeVerUsuariosAdmin(permisos: string[] | undefined): boolean {
  return !!permisos?.includes("*");
}

/** Acceso a configuración y equipo (solo rol con permiso total). */
export function puedeVerAdminShell(permisos: string[] | undefined): boolean {
  return puedeVerUsuariosAdmin(permisos);
}
