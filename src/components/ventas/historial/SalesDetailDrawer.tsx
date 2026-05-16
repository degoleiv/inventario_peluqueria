import { Printer, Prohibit } from "@phosphor-icons/react";
import type { VentaDetalle } from "../../../api";
import { Drawer } from "../../Drawer";
import {
  fmtFechaHora,
  labelMetodoPago,
  moneyEsAr,
  ventaActiva,
  ventaEstadoUi,
} from "./utils";

type Props = {
  open: boolean;
  loading: boolean;
  detalle: VentaDetalle | null;
  onClose: () => void;
  onReprint: () => void;
  onCancel: () => void;
};

export function SalesDetailDrawer({
  open,
  loading,
  detalle,
  onClose,
  onReprint,
  onCancel,
}: Props) {
  const activa = detalle ? ventaActiva(detalle) : false;
  const subtotalProd =
    detalle?.lineas?.reduce((s, l) => s + Number(l.subtotal), 0) ?? 0;
  const subtotalSvc =
    detalle?.servicios?.reduce((s, l) => s + Number(l.subtotal), 0) ?? 0;
  const subtotal = subtotalProd + subtotalSvc;
  const descuentoPuntos = Number(detalle?.descuento_puntos ?? 0);

  return (
    <Drawer
      open={open}
      title={detalle ? `Venta #${detalle.id}` : "Detalle de venta"}
      onClose={onClose}
      wide
      footer={
        detalle ? (
          <div className="sales-history-drawer-footer">
            <button type="button" className="btn ghost small" onClick={onReprint}>
              <Printer size={18} aria-hidden />
              Reimprimir
            </button>
            {activa ? (
              <button type="button" className="btn danger small" onClick={onCancel}>
                <Prohibit size={18} aria-hidden />
                Anular
              </button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <div className="sales-history-drawer-skeleton">
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
          <div className="skeleton-line" />
        </div>
      ) : !detalle ? (
        <p className="muted">Seleccioná una venta para ver el detalle.</p>
      ) : (
        <div className="sales-history-drawer-body">
          <section className="sales-history-drawer-section">
            <h3 className="sales-history-drawer-h">Información general</h3>
            <dl className="sales-history-dl">
              <dt>Estado</dt>
              <dd>
                <span className={`sales-history-badge sales-history-badge--${ventaEstadoUi(detalle)}`}>
                  {ventaEstadoUi(detalle) === "anulada" ? "Anulada" : ventaEstadoUi(detalle) === "completada" ? "Completada" : "Pendiente"}
                </span>
              </dd>
              <dt>Fecha</dt>
              <dd>{fmtFechaHora(detalle.fecha)}</dd>
              <dt>Cliente</dt>
              <dd>{detalle.cliente_nombre?.trim() || "Cliente ocasional"}</dd>
              <dt>Cajero</dt>
              <dd>{detalle.vendedor_nombre?.trim() || "—"}</dd>
              <dt>Pago</dt>
              <dd>{labelMetodoPago(detalle.metodo_pago)}</dd>
              {detalle.notas?.trim() ? (
                <>
                  <dt>Notas</dt>
                  <dd>{detalle.notas}</dd>
                </>
              ) : null}
            </dl>
          </section>

          {detalle.lineas?.length ? (
            <section className="sales-history-drawer-section">
              <h3 className="sales-history-drawer-h">Productos</h3>
              <ul className="sales-history-lines">
                {detalle.lineas.map((l) => (
                  <li key={l.id}>
                    <span>
                      {l.producto_nombre} × {l.cantidad}
                    </span>
                    <span>{moneyEsAr.format(Number(l.subtotal))}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {detalle.servicios?.length ? (
            <section className="sales-history-drawer-section">
              <h3 className="sales-history-drawer-h">Servicios</h3>
              <ul className="sales-history-lines">
                {detalle.servicios.map((s) => (
                  <li key={s.id}>
                    <span>
                      {s.servicio_nombre}
                      {s.profesional_nombre ? ` · ${s.profesional_nombre}` : ""} × {s.cantidad}
                    </span>
                    <span>{moneyEsAr.format(Number(s.subtotal))}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="sales-history-drawer-section sales-history-totals">
            <h3 className="sales-history-drawer-h">Totales</h3>
            <dl className="sales-history-dl sales-history-dl-totals">
              <dt>Subtotal</dt>
              <dd>{moneyEsAr.format(subtotal)}</dd>
              {descuentoPuntos > 0 ? (
                <>
                  <dt>Descuento puntos</dt>
                  <dd className="text-danger">−{moneyEsAr.format(descuentoPuntos)}</dd>
                </>
              ) : null}
              <dt className="sales-history-total-row">Total</dt>
              <dd className="sales-history-total-row">{moneyEsAr.format(Number(detalle.total))}</dd>
            </dl>
          </section>

          <section className="sales-history-drawer-section muted">
            <h3 className="sales-history-drawer-h">Historial</h3>
            <p className="sales-history-meta">
              Registrada: {fmtFechaHora(detalle.created_at)}
              {detalle.estado === "cancelada" ? " · Venta anulada" : ""}
            </p>
          </section>
        </div>
      )}
    </Drawer>
  );
}
