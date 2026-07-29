import type { DevolucionKpis } from "../../../api";
import { formatCurrency } from "./utils";

type Props = { kpis: DevolucionKpis | null; loading: boolean };

export function ReturnsKpiCards({ kpis, loading }: Props) {
  const cards = [
    { label: "Total devoluciones", value: kpis ? String(kpis.total_devoluciones) : "—" },
    { label: "Monto devuelto", value: kpis ? formatCurrency(kpis.monto_total_devuelto) : "—" },
    { label: "Pendientes", value: kpis ? String(kpis.pendientes_count) : "—" },
    { label: "Tasa aprobación", value: kpis ? `${kpis.tasa_aprobacion}%` : "—" },
  ];

  return (
    <div className="returns-kpis">
      {cards.map((c) => (
        <div key={c.label} className={`returns-kpi-card ${loading ? "returns-kpi-card--loading" : ""}`}>
          <span className="returns-kpi-card__label">{c.label}</span>
          <strong className="returns-kpi-card__value">{c.value}</strong>
        </div>
      ))}
    </div>
  );
}
