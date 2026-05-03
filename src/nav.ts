/** Navegación principal — usada por App y command palette. */

export type NavKey =
  | "inicio"
  | "ventas"
  | "citas"
  | "clientes"
  | "inventario"
  | "compras"
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
  "compras",
  "finanzas",
  "facturas",
  "reportes",
];

export const NAV_LABEL: Record<NavKey, string> = {
  inicio: "Dashboard",
  ventas: "Ventas (POS)",
  citas: "Agenda",
  clientes: "Clientes",
  inventario: "Inventario",
  compras: "Compras",
  finanzas: "Finanzas",
  facturas: "Facturas",
  reportes: "Reportes",
  configuracion: "Configuración",
  empleados: "Equipo",
};

export const NAV_GROUPS: { label: string; items: NavKey[] }[] = [
  { label: "Principal", items: ["inicio"] },
  { label: "Operación", items: ["ventas", "citas"] },
  { label: "Gestión", items: ["clientes", "inventario", "compras"] },
  { label: "Finanzas", items: ["finanzas", "facturas", "reportes"] },
  { label: "Administración", items: ["configuracion", "empleados"] },
];

export function puedeVerModulo(permisos: string[] | undefined, key: NavKey): boolean {
  if (!permisos?.length) return false;
  if (permisos.includes("*")) return true;
  if (key === "configuracion" || key === "empleados") return false;
  return permisos.includes(key);
}

export function puedeVerUsuariosAdmin(permisos: string[] | undefined): boolean {
  return !!permisos?.includes("*");
}

/** Acceso a configuración y equipo (solo rol con permiso total). */
export function puedeVerAdminShell(permisos: string[] | undefined): boolean {
  return puedeVerUsuariosAdmin(permisos);
}
