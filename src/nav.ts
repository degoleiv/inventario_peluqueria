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
  | "reportes";

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
};

export const NAV_GROUPS: { label: string; items: NavKey[] }[] = [
  { label: "Principal", items: ["inicio"] },
  { label: "Operación", items: ["ventas", "citas"] },
  { label: "Gestión", items: ["clientes", "inventario", "compras"] },
  { label: "Finanzas", items: ["finanzas", "facturas", "reportes"] },
];
