import { ArrowClockwise, Plus } from "@phosphor-icons/react";
import { useDevolucionesHistorial } from "./devoluciones/useDevolucionesHistorial";
import { ReturnsKpiCards } from "./devoluciones/ReturnsKpiCards";
import { ReturnsFiltersBar } from "./devoluciones/ReturnsFiltersBar";
import { ReturnsCard } from "./devoluciones/ReturnsCard";
import { ReturnsEmptyState } from "./devoluciones/ReturnsEmptyState";
import { ReturnsSkeleton } from "./devoluciones/ReturnsSkeleton";
import { ReturnsDetailDrawer } from "./devoluciones/ReturnsDetailDrawer";
import { ReturnsCreateModal } from "./devoluciones/ReturnsCreateModal";

export function DevolucionesSection() {
  const h = useDevolucionesHistorial();

  return (
    <div className="returns-page">
      <header className="returns-header">
        <div className="returns-header-text">
          <h1 className="returns-title">Devoluciones</h1>
          <p className="returns-subtitle muted">
            Gestioná devoluciones de productos y servicios
          </p>
        </div>
        <div className="returns-header-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => h.setCreateOpen(true)}
          >
            <Plus size={18} weight="bold" aria-hidden />
            Nueva devolución
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => void h.reload()}
            disabled={h.loading}
          >
            <ArrowClockwise size={18} aria-hidden />
            Actualizar
          </button>
        </div>
      </header>

      {h.loading && h.devoluciones.length === 0 ? (
        <ReturnsSkeleton />
      ) : (
        <>
          <ReturnsKpiCards kpis={h.kpis} loading={h.kpisLoading} />

          <ReturnsFiltersBar
            busqueda={h.busqueda}
            onBusquedaChange={h.setBusqueda}
            estadoFiltro={h.estadoFiltro}
            onEstadoChange={h.setEstadoFiltro}
            desde={h.desde}
            hasta={h.hasta}
            onDesdeChange={h.setDesde}
            onHastaChange={h.setHasta}
          />

          <div className="returns-list" aria-live="polite">
            {h.loading ? (
              <div className="returns-list-loading muted">Actualizando…</div>
            ) : null}
            {!h.loading && h.devoluciones.length === 0 ? (
              <ReturnsEmptyState />
            ) : (
              h.devolucionesPagina.map((d) => (
                <ReturnsCard
                  key={d.id}
                  devolucion={d}
                  selected={h.selectedId === d.id}
                  onClick={() => void h.openDetalle(d.id)}
                />
              ))
            )}
          </div>

          {h.totalPages > 1 && (
            <div className="returns-pagination">
              <span className="muted">
                {h.rangeLabel.from}–{h.rangeLabel.to} de {h.rangeLabel.total}
              </span>
              <div className="returns-pagination__buttons">
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={h.page <= 1}
                  onClick={() => h.setPage(h.page - 1)}
                >
                  Anterior
                </button>
                <span>
                  {h.page} / {h.totalPages}
                </span>
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={h.page >= h.totalPages}
                  onClick={() => h.setPage(h.page + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <ReturnsDetailDrawer
        open={h.selectedId != null}
        loading={h.detalleLoading}
        detalle={h.detalle}
        onClose={h.closeDetalle}
        onAprobar={() => void h.handleAprobar()}
        onProcesar={() => void h.handleProcesar()}
        onRechazar={() => void h.handleRechazar()}
        onAnular={() => void h.handleAnular()}
      />

      <ReturnsCreateModal
        open={h.createOpen}
        onClose={() => h.setCreateOpen(false)}
        onCreated={() => void h.reload()}
      />
    </div>
  );
}
