import type { MedioPagoTransferencia } from "../../api";
import {
  etiquetaMedioTransferencia,
  mediosTransferenciaActivos,
} from "../../lib/mediosPagoTransferencia";
import {
  METODOS_PARA_MIXTO,
  montoMixto2,
  type MetodoPagoPrincipal,
  type MetodoPagoVentaInput,
} from "../../lib/ventaMetodoPago";

type Props = {
  value: MetodoPagoVentaInput;
  onChange: (patch: Partial<MetodoPagoVentaInput>) => void;
  medios: MedioPagoTransferencia[];
  totalVenta: number;
};

const moneyPos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function LlaveTransferenciaPicker({
  value,
  onChange,
  name,
  medios,
}: {
  value: string;
  onChange: (llave: string) => void;
  name: string;
  medios: MedioPagoTransferencia[];
}) {
  const opciones = mediosTransferenciaActivos(medios);
  if (opciones.length === 0) {
    return (
      <p className="muted small">
        No hay medios de transferencia activos. Configuralos en Parámetros generales.
      </p>
    );
  }
  return (
    <div className="pos-saas-transfer-keys" role="radiogroup" aria-label={name}>
      {opciones.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          aria-checked={value === opt.id}
          className={`pos-saas-transfer-key${value === opt.id ? " pos-saas-transfer-key--on" : ""}`}
          onClick={() => onChange(opt.id)}
        >
          {etiquetaMedioTransferencia(opt)}
        </button>
      ))}
    </div>
  );
}

function MixtoMedioRow({
  label,
  principal,
  llave,
  onPrincipal,
  onLlave,
  medios,
  monto,
  onMonto,
  montoReadOnly,
}: {
  label: string;
  principal: MetodoPagoPrincipal;
  llave: string;
  onPrincipal: (m: MetodoPagoPrincipal) => void;
  onLlave: (k: string) => void;
  medios: MedioPagoTransferencia[];
  monto?: number | "";
  onMonto?: (raw: string) => void;
  montoReadOnly?: boolean;
}) {
  return (
    <div className="pos-saas-mixto-row">
      <span className="pos-saas-field-label">{label}</span>
      <div className="pos-saas-mixto-principales" role="group" aria-label={label}>
        {METODOS_PARA_MIXTO.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`pos-saas-pay-card pos-saas-pay-card--compact${
              principal === opt.id ? " pos-saas-pay-card--on" : ""
            }`}
            onClick={() => onPrincipal(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {principal === "transferencia" ? (
        <LlaveTransferenciaPicker
          value={llave}
          onChange={onLlave}
          name={`${label} — medio`}
          medios={medios}
        />
      ) : null}
      {montoReadOnly ? (
        <div className="pos-saas-mixto-monto pos-saas-mixto-monto--readonly">
          <span className="pos-saas-field-label">Monto</span>
          <output className="pos-saas-mixto-monto-value mono" aria-live="polite">
            {typeof monto === "number" && monto > 0 ? moneyPos.format(monto) : "—"}
          </output>
        </div>
      ) : onMonto ? (
        <label className="pos-saas-mixto-monto">
          <span className="pos-saas-field-label">Monto *</span>
          <input
            type="number"
            min={0}
            step="100"
            className="pos-saas-input mono"
            placeholder="0"
            value={monto === "" || monto == null ? "" : monto}
            onChange={(e) => onMonto(e.target.value)}
          />
        </label>
      ) : null}
    </div>
  );
}

export function PosMetodoPagoFields({ value, onChange, medios, totalVenta }: Props) {
  if (value.principal === "transferencia") {
    return (
      <div className="pos-saas-pago-detalle">
        <span className="pos-saas-field-label">Medio de transferencia *</span>
        <LlaveTransferenciaPicker
          value={value.transferenciaLlave ?? ""}
          onChange={(k) => onChange({ transferenciaLlave: k })}
          name="Medio de transferencia"
          medios={medios}
        />
      </div>
    );
  }

  if (value.principal === "mixto") {
    const monto2 = montoMixto2(totalVenta, value.mixto1Monto);
    return (
      <div className="pos-saas-pago-detalle pos-saas-pago-detalle--mixto">
        <p className="muted small pos-saas-mixto-hint">
          Elegí los dos medios. Ingresá el monto del medio 1; el medio 2 se completa con el resto (
          {moneyPos.format(totalVenta)} total).
        </p>
        <MixtoMedioRow
          label="Medio 1 *"
          principal={value.mixto1 ?? "efectivo"}
          llave={value.mixto1Llave ?? ""}
          onPrincipal={(m) =>
            onChange({ mixto1: m, mixto1Llave: m === "transferencia" ? value.mixto1Llave : "" })
          }
          onLlave={(k) => onChange({ mixto1Llave: k })}
          medios={medios}
          monto={value.mixto1Monto ?? ""}
          onMonto={(raw) => {
            const n = raw.trim() === "" ? "" : Number(raw.replace(",", "."));
            onChange({
              mixto1Monto: raw.trim() === "" || !Number.isFinite(n) ? "" : Math.max(0, n),
            });
          }}
        />
        <MixtoMedioRow
          label="Medio 2 *"
          principal={value.mixto2 ?? "tarjeta"}
          llave={value.mixto2Llave ?? ""}
          onPrincipal={(m) =>
            onChange({ mixto2: m, mixto2Llave: m === "transferencia" ? value.mixto2Llave : "" })
          }
          onLlave={(k) => onChange({ mixto2Llave: k })}
          medios={medios}
          monto={monto2}
          montoReadOnly
        />
      </div>
    );
  }

  return null;
}
