import { useEffect, useRef } from "react";
import "./SaleSuccessModal.css";

type SaleSuccessModalProps = {
  open: boolean;
  total: number;
  invoiceNumber?: string | number | null;
  onClose: () => void;
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

export function SaleSuccessModal({ open, total, invoiceNumber, onClose }: SaleSuccessModalProps) {
  const timerRef = useRef<number | null>(null);
  const closingRef = useRef(false);

  useEffect(() => {
    if (!open) {
      closingRef.current = false;
      return;
    }
    timerRef.current = window.setTimeout(() => {
      onClose();
    }, 2800);
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sale-success-backdrop" onClick={onClose}>
      <div
        className="sale-success-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Venta realizada con éxito"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sale-success-check-wrap">
          <svg
            className="sale-success-check-svg"
            viewBox="0 0 80 80"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              className="sale-success-check-circle"
              cx="40"
              cy="40"
              r="36"
              strokeWidth="3"
            />
            <path
              className="sale-success-check-path"
              d="M24 42 L35 53 L56 28"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="sale-success-ripple" />
          <div className="sale-success-ripple sale-success-ripple--2" />
        </div>

        <h2 className="sale-success-title">Venta realizada!</h2>
        <p className="sale-success-subtitle">La venta fue registrada correctamente</p>

        <div className="sale-success-total">{formatMoney(total)}</div>

        {invoiceNumber != null && invoiceNumber !== "" ? (
          <p className="sale-success-invoice">
            Consecutivo <span className="sale-success-invoice-num">#{invoiceNumber}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
