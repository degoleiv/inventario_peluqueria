import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowClockwise, DownloadSimple, LockSimple, Plus } from "@phosphor-icons/react";
import { ConfirmDialog } from "../ConfirmDialog";
import { SalesCard } from "./historial/SalesCard";
import { SalesDetailDrawer } from "./historial/SalesDetailDrawer";
import { SalesEmptyState } from "./historial/SalesEmptyState";
import { SalesFiltersBar } from "./historial/SalesFiltersBar";
import { SalesKpiCards } from "./historial/SalesKpiCards";
import { SalesPagination } from "./historial/SalesPagination";
import { SalesSkeleton } from "./historial/SalesSkeleton";
import { exportVentasCsv } from "./historial/utils";
import { useVentasHistorial } from "./historial/useVentasHistorial";
import { useToast } from "../../context/ToastContext";
import { useMediosPagoTransferencia } from "../../hooks/useMediosPagoTransferencia";

export function VentasHistorialSection() {
  useMediosPagoTransferencia();
  const toast = useToast();
  const h = useVentasHistorial();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const handleExport = useCallback(() => {
    if (h.ventasFiltradas.length === 0) {
      toast("No hay ventas para exportar con los filtros actuales", "info");
      return;
    }
    exportVentasCsv(h.ventasFiltradas);
    toast("Exportación CSV iniciada", "success");
  }, [h.ventasFiltradas, toast]);

  const handleReprint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="sales-history-page">
      <header className="sales-history-header">
        <div className="sales-history-header-text">
          <h1 className="sales-history-title">Historial de Ventas</h1>
          <p className="sales-history-subtitle muted">
            Consulta, filtra y analiza todas las transacciones registradas
          </p>
        </div>
        <div className="sales-history-header-actions">
          <Link to="/ventas/cierre" className="btn secondary">
            <LockSimple size={18} aria-hidden />
            Cerrar día
          </Link>
          <Link to="/ventas/ventas" className="btn primary">
            <Plus size={18} weight="bold" aria-hidden />
            Nueva venta
          </Link>
          <button type="button" className="btn secondary" onClick={handleExport}>
            <DownloadSimple size={18} aria-hidden />
            Exportar
          </button>
          <button type="button" className="btn ghost" onClick={() => void h.loadVentas()} disabled={h.loading}>
            <ArrowClockwise size={18} aria-hidden />
            Actualizar
          </button>
        </div>
      </header>

      {h.loading && h.ventas.length === 0 ? (
        <SalesSkeleton />
      ) : (
        <>
          <SalesKpiCards
            totalVentas={h.kpis.totalVentas}
            monto={h.kpis.monto}
            ticketProm={h.kpis.ticketProm}
            topMetodo={h.kpis.topMetodo}
            topVendedor={h.kpis.topVendedor}
            loading={h.loading}
          />

          <SalesFiltersBar
            filtros={h.filtros}
            onChange={h.setFiltros}
            onPreset={h.setPreset}
            onApplyDates={() => void h.loadVentas()}
            onClear={h.limpiarFiltros}
            onSaveView={h.guardarVista}
            onExport={handleExport}
            usuarios={h.usuariosOpciones}
            clientes={h.clientesOpciones}
            searchRef={h.searchRef}
            advancedOpen={advancedOpen}
            onToggleAdvanced={() => setAdvancedOpen((v) => !v)}
          />

          <div className="sales-history-list" aria-live="polite">
            {h.loading ? (
              <div className="sales-history-list-loading muted">Actualizando…</div>
            ) : null}
            {!h.loading && h.ventasFiltradas.length === 0 ? (
              <SalesEmptyState onClear={h.limpiarFiltros} hasVentasEnPeriodo={h.ventas.length > 0} />
            ) : (
              h.ventasPagina.map((v) => (
                <SalesCard
                  key={v.id}
                  venta={v}
                  selected={h.selectedId === v.id}
                  onOpen={() => void h.openDetalle(v.id)}
                  onReprint={handleReprint}
                  onCancel={() => h.setCancelTarget(v)}
                />
              ))
            )}
          </div>

          <SalesPagination
            from={h.rangeLabel.from}
            to={h.rangeLabel.to}
            total={h.rangeLabel.total}
            page={h.page}
            totalPages={h.totalPages}
            pageSize={h.pageSize}
            pageSizes={h.pageSizes}
            onPage={h.setPage}
            onPageSize={(n) => {
              h.setPageSize(n);
              h.setPage(1);
            }}
          />
        </>
      )}

      <SalesDetailDrawer
        open={h.selectedId != null}
        loading={h.detalleLoading}
        detalle={h.detalle}
        onClose={h.closeDetalle}
        onReprint={handleReprint}
        onCancel={() => {
          if (h.detalle) h.setCancelTarget(h.detalle);
        }}
      />

      <ConfirmDialog
        open={h.cancelTarget != null}
        title="Anular venta"
        description={
          h.cancelTarget ? (
            <>
              ¿Confirmás anular la venta <strong>#{h.cancelTarget.id}</strong> por{" "}
              {h.cancelTarget.total}? Se revertirá stock y comisiones asociadas.
            </>
          ) : null
        }
        confirmLabel="Anular venta"
        variant="danger"
        busy={h.cancelBusy}
        onConfirm={() => void h.confirmCancelar()}
        onCancel={() => h.setCancelTarget(null)}
      />
    </div>
  );
}
