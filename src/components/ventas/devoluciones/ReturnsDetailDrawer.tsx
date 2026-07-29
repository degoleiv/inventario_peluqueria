import type { DevolucionDetalle, DevolucionEstado } from "../../../api";
import { ESTADO_CSS_CLASS, ESTADO_LABELS, formatCurrency, formatDateShort } from "./utils";
import { Drawer } from "../../Drawer";

type Props = {
  detalle: DevolucionDetalle | null;
  loading: boolean;
  open: boolean;
  onClose: () => void;
  /** Los handlers ausentes ocultan su botón (sin permiso). */
  onAprobar?: () => void;
  onProcesar?: () => void;
  onRechazar?: () => void;
  onAnular?: () => void;
};

function actionButtons(
  estado: DevolucionEstado,
  handlers: Pick<Props, "onAprobar" | "onProcesar" | "onRechazar" | "onAnular">,
) {
  switch (estado) {
    case "pendiente":
      return (
        <>
          {handlers.onAprobar ? (
            <button type="button" className="btn primary" onClick={handlers.onAprobar}>
              Aprobar
            </button>
          ) : null}
          {handlers.onRechazar ? (
            <button type="button" className="btn ghost danger-text" onClick={handlers.onRechazar}>
              Rechazar
            </button>
          ) : null}
        </>
      );
    case "aprobada":
      return (
        <>
          {handlers.onProcesar ? (
            <button type="button" className="btn primary" onClick={handlers.onProcesar}>
              Procesar reembolso
            </button>
          ) : null}
          {handlers.onAnular ? (
            <button type="button" className="btn ghost danger-text" onClick={handlers.onAnular}>
              Anular
            </button>
          ) : null}
        </>
      );
    default:
      return null;
  }
}

export function ReturnsDetailDrawer({
  detalle,
  loading,
  open,
  onClose,
  onAprobar,
  onProcesar,
  onRechazar,
  onAnular,
}: Props) {
  const footer =
    detalle && !loading
      ? actionButtons(detalle.estado, { onAprobar, onProcesar, onRechazar, onAnular })
      : undefined;

  return (
    <Drawer open={open} title="Detalle de devolución" onClose={onClose} footer={footer} wide>
      {loading && <p className="returns-detail-loading">Cargando...</p>}

      {!loading && detalle && (
        <div className="returns-detail-content">
          {/* ── Header ── */}
          <header className="returns-detail-header">
            <span className={`returns-badge ${ESTADO_CSS_CLASS[detalle.estado]}`}>
              {ESTADO_LABELS[detalle.estado]}
            </span>
            <h3 className="returns-detail-title">Devolución #{detalle.id}</h3>
          </header>

          {/* ── Info grid ── */}
          <dl className="returns-detail-dl">
            <dt>Estado</dt>
            <dd>{ESTADO_LABELS[detalle.estado]}</dd>

            <dt>Fecha</dt>
            <dd>{formatDateShort(detalle.fecha)}</dd>

            <dt>Cliente</dt>
            <dd>{detalle.cliente_nombre ?? "Sin cliente"}</dd>

            <dt>Creado por</dt>
            <dd>{detalle.vendedor_nombre ?? <span className="muted">—</span>}</dd>

            <dt>Motivo</dt>
            <dd>{detalle.motivo}</dd>

            <dt>Notas</dt>
            <dd>{detalle.notas ?? <span className="muted">Sin notas</span>}</dd>

            <dt>Venta origen</dt>
            <dd>
              #{detalle.venta_id}{" "}
              <span className="muted">({formatCurrency(detalle.venta_total)} total original)</span>
            </dd>

            {detalle.estado === "procesada" && detalle.metodo_reembolso && (
              <>
                <dt>Método reembolso</dt>
                <dd>{detalle.metodo_reembolso}</dd>
              </>
            )}
          </dl>

          {/* ── Rechazado banner ── */}
          {detalle.estado === "rechazada" && detalle.rechazado_motivo && (
            <div className="returns-detail-banner returns-detail-banner--rechazada">
              <strong>Motivo del rechazo:</strong> {detalle.rechazado_motivo}
              {detalle.rechazado_por_nombre && (
                <span className="muted"> — {detalle.rechazado_por_nombre}</span>
              )}
            </div>
          )}

          {/* ── Anulado banner ── */}
          {detalle.estado === "anulada" && detalle.anulado_motivo && (
            <div className="returns-detail-banner returns-detail-banner--anulada">
              <strong>Motivo de anulación:</strong> {detalle.anulado_motivo}
              {detalle.anulado_por_nombre && (
                <span className="muted"> — {detalle.anulado_por_nombre}</span>
              )}
            </div>
          )}

          {/* ── Productos devueltos ── */}
          <section className="returns-detail-section">
            <h4 className="returns-detail-section-title">Productos devueltos</h4>
            {detalle.productos.length === 0 ? (
              <p className="muted">Sin productos devueltos</p>
            ) : (
              <ul className="returns-detail-lines">
                {detalle.productos.map((p) => (
                  <li key={p.id} className="returns-detail-line">
                    <span className="returns-detail-line__name">{p.producto_nombre}</span>
                    <span className="returns-detail-line__qty muted">
                      {p.cantidad} × {formatCurrency(p.precio_unitario)}
                    </span>
                    <span className="returns-detail-line__subtotal">
                      {formatCurrency(p.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Servicios devueltos ── */}
          {detalle.servicios.length > 0 && (
            <section className="returns-detail-section">
              <h4 className="returns-detail-section-title">Servicios devueltos</h4>
              <ul className="returns-detail-lines">
                {detalle.servicios.map((s) => (
                  <li key={s.id} className="returns-detail-line">
                    <span className="returns-detail-line__name">{s.servicio_nombre}</span>
                    <span className="returns-detail-line__qty muted">
                      {s.cantidad} × {formatCurrency(s.valor_unitario)}
                    </span>
                    <span className="returns-detail-line__subtotal">
                      {formatCurrency(s.subtotal)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Total devolución ── */}
          <section className="returns-detail-section returns-detail-total">
            <h4 className="returns-detail-section-title">Total devolución</h4>
            <strong className="returns-detail-total-amount">
              {formatCurrency(detalle.total_devolucion)}
            </strong>
          </section>

          {/* ── Historial ── */}
          <section className="returns-detail-section">
            <h4 className="returns-detail-section-title">Historial</h4>
            {detalle.auditoria.length === 0 ? (
              <p className="muted">Sin historial</p>
            ) : (
              <ol className="returns-audit-timeline">
                {detalle.auditoria.map((entry) => (
                  <li key={entry.id} className="returns-audit-timeline__item">
                    <span className="returns-audit-timeline__user">
                      {entry.usuario_nombre ?? <span className="muted">Sistema</span>}
                    </span>
                    <span className="returns-audit-timeline__action">{entry.accion}</span>
                    <time className="returns-audit-timeline__time muted">
                      {formatDateShort(entry.created_at)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
