import type { MedioPagoTransferencia } from "./mediosPagoTransferencia";
import { etiquetaMedioTransferencia, MEDIOS_TRANSFERENCIA_DEFAULT } from "./mediosPagoTransferencia";

export type CanalCierreMeta = {
  id: string;
  label: string;
  siempreVisible: boolean;
};

export type MontosPorCanal = Record<string, number>;

export function buildCanalesCierreMeta(
  medios: MedioPagoTransferencia[] = MEDIOS_TRANSFERENCIA_DEFAULT
): CanalCierreMeta[] {
  const activos = medios.filter((m) => m.activo);
  return [
    { id: "efectivo", label: "Efectivo (caja)", siempreVisible: true },
    { id: "tarjeta", label: "Tarjeta / datáfono", siempreVisible: true },
    { id: "transferencia", label: "Transferencia (sin especificar)", siempreVisible: false },
    ...activos.map((m) => ({
      id: m.id,
      label: etiquetaMedioTransferencia(m),
      siempreVisible: true,
    })),
    { id: "mixto", label: "Pago mixto (revisar)", siempreVisible: false },
    { id: "otro", label: "Otros medios", siempreVisible: false },
  ];
}

export function montosVacios(
  canales: CanalCierreMeta[] = buildCanalesCierreMeta()
): MontosPorCanal {
  const out: MontosPorCanal = {};
  for (const c of canales) out[c.id] = 0;
  return out;
}

export function totalMontos(m: MontosPorCanal): number {
  return Object.values(m).reduce((s, v) => s + (Number(v) || 0), 0);
}

export function diferenciaMontos(reportado: MontosPorCanal, real: MontosPorCanal): MontosPorCanal {
  const keys = new Set([...Object.keys(reportado), ...Object.keys(real)]);
  const out: MontosPorCanal = {};
  for (const k of keys) {
    out[k] = Number((real[k] ?? 0) - (reportado[k] ?? 0));
  }
  return out;
}

export function isoDateLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const moneyCierre = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
