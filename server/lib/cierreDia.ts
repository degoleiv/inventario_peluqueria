import {
  labelMedioTransferencia,
  mediosTransferenciaActivos,
  type MedioPagoTransferencia,
} from "./mediosPagoTransferencia.js";

/** Canales fijos de conciliación (no configurables). */
export const CANALES_CIERRE_FIJOS = ["efectivo", "tarjeta", "transferencia", "mixto", "otro"] as const;

export type CanalCierreFijo = (typeof CANALES_CIERRE_FIJOS)[number];

export type CanalCierreMeta = {
  id: string;
  label: string;
  siempreVisible: boolean;
};

export type MontosPorCanal = Record<string, number>;

export function buildCanalesCierreMeta(medios: MedioPagoTransferencia[]): CanalCierreMeta[] {
  const activos = mediosTransferenciaActivos(medios);
  return [
    { id: "efectivo", label: "Efectivo (caja)", siempreVisible: true },
    { id: "tarjeta", label: "Tarjeta / datáfono", siempreVisible: true },
    { id: "transferencia", label: "Transferencia (sin especificar)", siempreVisible: false },
    ...activos.map((m) => ({
      id: m.id,
      label: m.label,
      siempreVisible: true,
    })),
    { id: "mixto", label: "Pago mixto (revisar)", siempreVisible: false },
    { id: "otro", label: "Otros medios", siempreVisible: false },
  ];
}

export function idsCanalesCierre(medios: MedioPagoTransferencia[]): string[] {
  return buildCanalesCierreMeta(medios).map((c) => c.id);
}

export function montosVacios(medios: MedioPagoTransferencia[]): MontosPorCanal {
  const out: MontosPorCanal = {};
  for (const id of idsCanalesCierre(medios)) out[id] = 0;
  return out;
}

export function clasificarMetodoPagoCierre(
  metodo: string,
  medios: MedioPagoTransferencia[]
): string {
  const m = metodo.trim().toLowerCase();
  if (m === "efectivo") return "efectivo";
  if (m === "tarjeta") return "tarjeta";
  if (m === "transferencia") return "transferencia";
  if (m.startsWith("mixto")) return "mixto";

  const activos = new Set(mediosTransferenciaActivos(medios).map((x) => x.id));
  if (m.startsWith("transferencia_")) {
    const id = m.slice("transferencia_".length);
    if (activos.has(id)) return id;
    // Histórico: medios desactivados o eliminados
    if (id) return id;
  }
  return "otro";
}

/** Reparte montos de ventas mixtas por parte (solo para referencia futura; hoy va todo a mixto). */
export function clasificarParteMixta(parte: string, medios: MedioPagoTransferencia[]): string {
  return clasificarMetodoPagoCierre(parte, medios);
}

export function sumarMontos(a: MontosPorCanal, b: MontosPorCanal): MontosPorCanal {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = (out[k] ?? 0) + (v ?? 0);
  }
  return out;
}

export function diferenciaMontos(reportado: MontosPorCanal, real: MontosPorCanal): MontosPorCanal {
  const keys = new Set([...Object.keys(reportado), ...Object.keys(real)]);
  const out: MontosPorCanal = {};
  for (const k of keys) {
    out[k] = Number((real[k] ?? 0) - (reportado[k] ?? 0));
  }
  return out;
}

export function totalMontos(m: MontosPorCanal): number {
  return Object.values(m).reduce((s, v) => s + (Number(v) || 0), 0);
}

export function parseMontosJson(
  raw: unknown,
  medios: MedioPagoTransferencia[]
): MontosPorCanal {
  const base = montosVacios(medios);
  if (raw == null || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    const n = Number(v);
    if (Number.isFinite(n)) base[k] = n;
  }
  return base;
}

export function montosFromBody(
  body: Record<string, unknown>,
  medios: MedioPagoTransferencia[],
  errClass: new (msg: string) => Error = Error
): MontosPorCanal {
  const raw = body.montos_reales ?? body.montosReales;
  if (raw == null || typeof raw !== "object") {
    throw new errClass("montos_reales requerido");
  }
  return parseMontosJson(raw, medios);
}

export function labelCanalCierre(id: string, medios: MedioPagoTransferencia[]): string {
  const meta = buildCanalesCierreMeta(medios).find((c) => c.id === id);
  if (meta) return meta.label;
  return labelMedioTransferencia(id, medios);
}
