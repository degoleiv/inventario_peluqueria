import {
  Bank,
  CreditCard,
  DotsThreeVertical,
  Eye,
  Money,
  Package,
  Printer,
  Prohibit,
} from "@phosphor-icons/react";
import type { Venta } from "../../../api";
import {
  fmtFechaHora,
  labelMetodoPago,
  moneyEsAr,
  productsCount,
  resumenItemsVenta,
  ventaActiva,
  ventaEstadoUi,
} from "./utils";

type Props = {
  venta: Venta;
  selected?: boolean;
  onOpen: () => void;
  onReprint: () => void;
  onCancel: () => void;
};

const STATUS_LABEL: Record<ReturnType<typeof ventaEstadoUi>, string> = {
  completada: "Completada",
  anulada: "Anulada",
  pendiente: "Pendiente",
};

function PaymentIcon({ method }: { method: string }) {
  const k = method.toLowerCase();
  if (k === "efectivo") return <Money size={18} weight="duotone" />;
  if (k === "tarjeta") return <CreditCard size={18} weight="duotone" />;
  return <Bank size={18} weight="duotone" />;
}

export function SalesCard({ venta, selected, onOpen, onReprint, onCancel }: Props) {
  const estado = ventaEstadoUi(venta);
  const activa = ventaActiva(venta);
  const nItems = productsCount(venta);

  return (
    <article
      className={`sales-history-card${selected ? " is-selected" : ""}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Venta ${venta.id}, ${moneyEsAr.format(Number(venta.total))}`}
    >
      <div className="sales-history-card-left">
        <span className={`sales-history-badge sales-history-badge--${estado}`}>{STATUS_LABEL[estado]}</span>
        <div className="sales-history-card-id">
          <span className="sales-history-invoice">#{venta.id}</span>
          <time className="sales-history-meta" dateTime={venta.fecha}>
            {fmtFechaHora(venta.fecha)}
          </time>
        </div>
        <p className="sales-history-meta">
          {venta.cliente_nombre?.trim() ? venta.cliente_nombre : "Cliente ocasional"}
        </p>
        <p className="sales-history-meta sales-history-cashier">
          {venta.vendedor_nombre?.trim() ? venta.vendedor_nombre : "Sin cajero"}
        </p>
      </div>

      <div className="sales-history-card-center">
        <span className="sales-history-pay">
          <PaymentIcon method={venta.metodo_pago} />
          {labelMetodoPago(venta.metodo_pago)}
        </span>
        <span className="sales-history-meta">
          <Package size={14} aria-hidden />
          {nItems} ítem{nItems === 1 ? "" : "s"}
        </span>
        <p className="sales-history-notes" title={venta.notas ?? undefined}>
          {venta.notas?.trim() || resumenItemsVenta(venta)}
        </p>
      </div>

      <div className="sales-history-card-right" onClick={(e) => e.stopPropagation()}>
        <strong className="sales-history-total">{moneyEsAr.format(Number(venta.total))}</strong>
        <div className="sales-history-actions">
          <button type="button" className="btn ghost small icon-only" title="Ver detalle" onClick={onOpen}>
            <Eye size={18} />
          </button>
          <button type="button" className="btn ghost small icon-only" title="Reimprimir" onClick={onReprint}>
            <Printer size={18} />
          </button>
          {activa ? (
            <button
              type="button"
              className="btn ghost small icon-only danger"
              title="Anular venta"
              onClick={onCancel}
            >
              <Prohibit size={18} />
            </button>
          ) : null}
          <button type="button" className="btn ghost small icon-only" title="Más opciones" onClick={onOpen}>
            <DotsThreeVertical size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}
