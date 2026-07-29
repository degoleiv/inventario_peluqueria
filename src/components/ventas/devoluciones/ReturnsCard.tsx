import type { Devolucion } from "../../../api";
import { ESTADO_CSS_CLASS, ESTADO_LABELS, formatCurrency, formatDateShort } from "./utils";

type Props = {
  devolucion: Devolucion;
  selected: boolean;
  onClick: () => void;
};

export function ReturnsCard({ devolucion: d, selected, onClick }: Props) {
  const items = d.num_productos + d.num_servicios;
  return (
    <article
      className={`returns-card ${selected ? "is-selected" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    >
      <div className="returns-card__left">
        <span className={`returns-badge ${ESTADO_CSS_CLASS[d.estado]}`}>
          {ESTADO_LABELS[d.estado]}
        </span>
        <div className="returns-card__id">
          <span className="returns-card__invoice">#{d.id}</span>
          <time className="returns-card__meta">{formatDateShort(d.fecha)}</time>
        </div>
        <p className="returns-card__meta">{d.cliente_nombre ?? "Sin cliente"}</p>
      </div>
      <div className="returns-card__center">
        <p className="returns-card__motivo">{d.motivo}</p>
        <p className="returns-card__meta">
          {items} ítem{items !== 1 ? "s" : ""} · Venta #{d.venta_id}
        </p>
      </div>
      <div className="returns-card__right">
        <strong className="returns-card__total">{formatCurrency(d.total_devolucion)}</strong>
      </div>
    </article>
  );
}
