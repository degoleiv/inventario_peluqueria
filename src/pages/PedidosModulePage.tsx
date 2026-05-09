import { Navigate, useParams } from "react-router-dom";
import { PedidosProveedoresPage } from "./PedidosProveedoresPage";

export function PedidosModulePage() {
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const normalized = (tabParam ?? "").trim().toLowerCase();

  if (normalized === "proveedores") {
    return <Navigate to="/proveedores" replace />;
  }
  if (normalized === "pedidos_proveedores" || normalized === "compras") {
    return <Navigate to="/pedidos" replace />;
  }
  if (normalized !== "" && normalized !== "pedidos-proveedores") {
    return <Navigate to="/pedidos" replace />;
  }

  return (
    <div className="page-pedidos">
      <PedidosProveedoresPage />
    </div>
  );
}
