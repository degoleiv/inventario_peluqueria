import { Navigate, useParams } from "react-router-dom";
import { SubNav } from "../components/SubNav";
import { PEDIDOS_TABS, readPedidosTab, type PedidosTab } from "../lib/moduleRoutes";
import { PedidosProveedoresPage } from "./PedidosProveedoresPage";
import { ProveedoresPage } from "./ProveedoresPage";

export function PedidosModulePage() {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const tabOk = tabParam != null && PEDIDOS_TABS.includes(tabParam as PedidosTab);
  if (!tabOk) {
    return <Navigate to={`/pedidos/${readPedidosTab()}`} replace />;
  }
  const tab = tabParam as PedidosTab;

  return (
    <>
      <SubNav
        moduleId="pedidos"
        items={[
          { id: "proveedores", label: "Proveedores", to: "/pedidos/proveedores" },
          {
            id: "pedidos-proveedores",
            label: "Pedidos a proveedores",
            to: "/pedidos/pedidos-proveedores",
          },
        ]}
      />
      {tab === "proveedores" ? <ProveedoresPage /> : <PedidosProveedoresPage />}
    </>
  );
}
