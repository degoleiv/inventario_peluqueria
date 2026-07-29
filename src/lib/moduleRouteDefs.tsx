import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { DashboardPage } from "../pages/DashboardPage";
import { InventarioPage } from "../pages/InventarioPage";
import { ClientesPage } from "../pages/ClientesPage";
import { CitasPage } from "../pages/CitasPage";
import { VentasPage } from "../pages/VentasPage";
import { VentaClienteDisplayPage } from "../pages/VentaClienteDisplayPage";
import { PedidosModulePage } from "../pages/PedidosModulePage";
import { ProveedoresPage } from "../pages/ProveedoresPage";
import { FinanzasPage } from "../pages/FinanzasPage";
import { ReportesPage } from "../pages/ReportesPage";
import { ConfiguracionPage } from "../pages/ConfiguracionPage";
import { EmpleadosPage } from "../pages/EmpleadosPage";
import {
  readCitasTab,
  readConfigTab,
  readEmpleadosTab,
  readInventarioTab,
  readVentasTab,
} from "./moduleRoutes";

export type ModuleRouteDef = {
  path: string;
  element: ReactNode;
  /** true = solo redirige (`<Navigate>`), no tiene estado propio que preservar. */
  redirect?: boolean;
};

/**
 * Fuente única de las rutas "de módulo" (todo lo que cuelga de `/` dentro de
 * AuthenticatedShell salvo `index`). La usan tanto el `<Routes>` real
 * (AuthenticatedShell.tsx, solo para que sigan disparando los `<Navigate>`
 * de rutas legacy/bare) como `TabbedOutlet` (que sí monta el contenido real,
 * una instancia de `<Routes location=.../>` independiente por pestaña).
 */
export const MODULE_ROUTE_DEFS: ModuleRouteDef[] = [
  { path: "inicio", element: <DashboardPage /> },
  { path: "citas", element: <Navigate to={`/citas/${readCitasTab()}`} replace />, redirect: true },
  { path: "citas/:tab", element: <CitasPage /> },
  { path: "ventas/pantalla-cliente", element: <VentaClienteDisplayPage /> },
  { path: "ventas", element: <Navigate to={`/ventas/${readVentasTab()}`} replace />, redirect: true },
  { path: "ventas/:tab", element: <VentasPage /> },
  {
    path: "inventario",
    element: <Navigate to={`/inventario/${readInventarioTab()}`} replace />,
    redirect: true,
  },
  { path: "inventario/:tab", element: <InventarioPage /> },
  { path: "clientes", element: <ClientesPage /> },
  { path: "clientes/:tab", element: <Navigate to="/clientes" replace />, redirect: true },
  { path: "compras", element: <Navigate to="/pedidos" replace />, redirect: true },
  { path: "proveedores", element: <ProveedoresPage /> },
  { path: "pedidos-proveedores", element: <Navigate to="/pedidos" replace />, redirect: true },
  { path: "pedidos", element: <PedidosModulePage /> },
  { path: "pedidos/:tab", element: <PedidosModulePage /> },
  { path: "finanzas", element: <FinanzasPage /> },
  { path: "facturas", element: <Navigate to="/finanzas" replace />, redirect: true },
  { path: "reportes", element: <ReportesPage /> },
  {
    path: "usuarios",
    element: <Navigate to={`/empleados/${readEmpleadosTab()}`} replace />,
    redirect: true,
  },
  {
    path: "configuracion",
    element: <Navigate to={`/configuracion/${readConfigTab()}`} replace />,
    redirect: true,
  },
  { path: "configuracion/:tab", element: <ConfiguracionPage /> },
  {
    path: "empleados",
    element: <Navigate to={`/empleados/${readEmpleadosTab()}`} replace />,
    redirect: true,
  },
  {
    path: "empleados/:tab",
    element: (
      <EmpleadosPage onChanged={() => window.dispatchEvent(new Event("peluqueria-auth-refresh"))} />
    ),
  },
];
