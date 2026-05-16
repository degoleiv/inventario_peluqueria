import { ReceiptX } from "@phosphor-icons/react";

type Props = {
  onClear: () => void;
  hasVentasEnPeriodo?: boolean;
};

export function SalesEmptyState({ onClear, hasVentasEnPeriodo }: Props) {
  return (
    <div className="sales-history-empty" role="status">
      <div className="sales-history-empty-icon" aria-hidden>
        <ReceiptX size={56} weight="duotone" />
      </div>
      <h2 className="sales-history-empty-title">
        {hasVentasEnPeriodo ? "Ninguna venta coincide con los filtros" : "No se encontraron ventas"}
      </h2>
      <p className="muted">
        {hasVentasEnPeriodo
          ? "Hay ventas en el período seleccionado, pero ninguna cumple los filtros activos."
          : "Probá ampliar el período o revisar las fechas del rango."}
      </p>
      <button type="button" className="btn primary" onClick={onClear}>
        Limpiar filtros
      </button>
    </div>
  );
}
