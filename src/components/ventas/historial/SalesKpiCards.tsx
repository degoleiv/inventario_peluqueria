import {
  ChartLineUp,
  CreditCard,
  CurrencyCircleDollar,
  Receipt,
  UserCircle,
} from "@phosphor-icons/react";
import { moneyEsAr, labelMetodoPago } from "./utils";

type Props = {
  totalVentas: number;
  monto: number;
  ticketProm: number;
  topMetodo: string;
  topVendedor: string;
  loading?: boolean;
};

export function SalesKpiCards({ totalVentas, monto, ticketProm, topMetodo, topVendedor, loading }: Props) {
  const items = [
    { key: "count", icon: Receipt, label: "Ventas del período", value: String(totalVentas) },
    { key: "amount", icon: CurrencyCircleDollar, label: "Monto total", value: moneyEsAr.format(monto) },
    { key: "avg", icon: ChartLineUp, label: "Ticket promedio", value: moneyEsAr.format(ticketProm) },
    { key: "pay", icon: CreditCard, label: "Pago más usado", value: labelMetodoPago(topMetodo) },
    {
      key: "seller",
      icon: UserCircle,
      label: "Más ventas",
      value: topVendedor.length > 24 ? `${topVendedor.slice(0, 22)}…` : topVendedor,
    },
  ];

  return (
    <div className="sales-history-kpis" aria-label="Resumen del período">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <article key={item.key} className="sales-history-kpi card-pro">
            <div className="sales-history-kpi-icon" aria-hidden>
              <Icon size={22} weight="duotone" />
            </div>
            <div className="sales-history-kpi-body">
              <span className="sales-history-kpi-label">{item.label}</span>
              {loading ? (
                <span className="sales-history-kpi-value skeleton-line" aria-hidden />
              ) : (
                <strong className="sales-history-kpi-value">{item.value}</strong>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
