/** Medios principales en el POS (antes de detalle transferencia / mixto). */
import {
  getMediosPagoTransferenciaCached,
  labelMedioTransferencia,
  mediosTransferenciaActivos,
  MEDIOS_TRANSFERENCIA_DEFAULT,
  type MedioPagoTransferencia,
} from "./mediosPagoTransferencia";

export type MetodoPagoPrincipal = "efectivo" | "tarjeta" | "transferencia";

export const METODOS_PAGO_POS: { id: MetodoPagoPrincipal | "mixto"; label: string }[] = [
  { id: "efectivo", label: "💵 Efectivo" },
  { id: "tarjeta", label: "💳 Tarjeta" },
  { id: "transferencia", label: "🏦 Transferencia" },
  { id: "mixto", label: "🔀 Mixto" },
];

export const METODOS_PARA_MIXTO: { id: MetodoPagoPrincipal; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "transferencia", label: "Transferencia" },
];

export type ParteMixta = { codigo: string; monto?: number };

function labelLlave(llave: string, medios: MedioPagoTransferencia[]): string {
  return labelMedioTransferencia(llave, medios);
}

function moneyShort(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function labelParteAlmacenada(
  part: string,
  medios: MedioPagoTransferencia[],
  monto?: number
): string {
  const k = part.trim().toLowerCase();
  let base: string;
  if (k === "efectivo") base = "Efectivo";
  else if (k === "tarjeta") base = "Tarjeta";
  else if (k.startsWith("transferencia_")) {
    base = `Transferencia (${labelLlave(k.slice("transferencia_".length), medios)})`;
  } else if (k === "transferencia") base = "Transferencia";
  else if (k === "mixto") base = "Mixto";
  else if (k === "otro") base = "Otro";
  else base = part || "—";
  if (monto != null && monto > 0) return `${base} ${moneyShort(monto)}`;
  return base;
}

/** Parsea parte `efectivo@5000` o `transferencia_nequi`. */
export function parseParteMixta(segmento: string): ParteMixta {
  const s = segmento.trim();
  const at = s.lastIndexOf("@");
  if (at > 0) {
    const codigo = s.slice(0, at).trim().toLowerCase();
    const monto = Number(s.slice(at + 1).replace(",", "."));
    return {
      codigo,
      monto: Number.isFinite(monto) && monto >= 0 ? monto : undefined,
    };
  }
  return { codigo: s.toLowerCase() };
}

export function parseMetodoPagoMixto(metodo: string): { partes: ParteMixta[] } | null {
  const raw = metodo.trim();
  if (!raw.toLowerCase().startsWith("mixto:")) return null;
  const cuerpo = raw.slice(raw.indexOf(":") + 1);
  const partes = cuerpo
    .split("+")
    .filter(Boolean)
    .map((p) => parseParteMixta(p));
  return { partes };
}

/** Texto legible para historial, tickets, KPIs. */
export function labelMetodoPago(m: string, medios?: MedioPagoTransferencia[]): string {
  const list = medios ?? getMediosPagoTransferenciaCached() ?? MEDIOS_TRANSFERENCIA_DEFAULT;
  const raw = m.trim();
  if (!raw) return "—";
  const mixto = parseMetodoPagoMixto(raw);
  if (mixto) {
    if (mixto.partes.length === 0) return "Mixto";
    return `Mixto (${mixto.partes
      .map((p) => labelParteAlmacenada(p.codigo, list, p.monto))
      .join(" + ")})`;
  }
  return labelParteAlmacenada(raw, list);
}

export function codificarPartePago(
  principal: MetodoPagoPrincipal,
  medioTransferenciaId?: string,
  medios: MedioPagoTransferencia[] = MEDIOS_TRANSFERENCIA_DEFAULT
): string {
  if (principal === "transferencia") {
    const k = (medioTransferenciaId ?? "").trim();
    if (k && mediosTransferenciaActivos(medios).some((m) => m.id === k)) {
      return `transferencia_${k}`;
    }
    return "transferencia";
  }
  return principal;
}

export type MetodoPagoVentaInput = {
  principal: MetodoPagoPrincipal | "mixto";
  transferenciaLlave?: string;
  mixto1?: MetodoPagoPrincipal;
  mixto1Llave?: string;
  mixto1Monto?: number | "";
  mixto2?: MetodoPagoPrincipal;
  mixto2Llave?: string;
};

export function buildMetodoPagoParaApi(
  input: MetodoPagoVentaInput,
  medios: MedioPagoTransferencia[] = MEDIOS_TRANSFERENCIA_DEFAULT,
  totalVenta = 0
): string {
  if (input.principal === "mixto") {
    const p1 = codificarPartePago(input.mixto1 ?? "efectivo", input.mixto1Llave, medios);
    const p2 = codificarPartePago(input.mixto2 ?? "tarjeta", input.mixto2Llave, medios);
    const m1 = Number(input.mixto1Monto);
    if (Number.isFinite(m1) && m1 > 0 && totalVenta > 0) {
      const m2 = Math.max(0, Math.round((totalVenta - m1) * 100) / 100);
      return `mixto:${p1}@${m1}+${p2}@${m2}`;
    }
    return `mixto:${p1}+${p2}`;
  }
  if (input.principal === "transferencia") {
    return codificarPartePago("transferencia", input.transferenciaLlave, medios);
  }
  return input.principal;
}

export function metodoPagoCoincideFiltro(almacenado: string, filtro: string): boolean {
  if (filtro === "todos") return true;
  const a = almacenado.trim().toLowerCase();
  const f = filtro.trim().toLowerCase();
  if (a === f) return true;
  if (f === "transferencia" && a.startsWith("transferencia")) return true;
  if (f.startsWith("transferencia_") && a === f) return true;
  if (f === "mixto" && a.startsWith("mixto")) return true;
  return false;
}

function validarLlaveTransferencia(
  llave: string | undefined,
  medios: MedioPagoTransferencia[],
  contexto: string
): string | null {
  const k = (llave ?? "").trim();
  if (!k || !mediosTransferenciaActivos(medios).some((m) => m.id === k)) {
    const nombres = mediosTransferenciaActivos(medios)
      .map((m) => m.label)
      .join(", ");
    return `${contexto} elegí el medio de transferencia (${nombres}).`;
  }
  return null;
}

/** Mensaje de error para toast; null si está listo para cobrar. */
export function validarMetodoPagoVenta(
  input: MetodoPagoVentaInput,
  medios: MedioPagoTransferencia[] = MEDIOS_TRANSFERENCIA_DEFAULT,
  totalVenta = 0
): string | null {
  if (input.principal === "transferencia") {
    return validarLlaveTransferencia(input.transferenciaLlave, medios, "Para transferencia");
  }
  if (input.principal === "mixto") {
    if (!input.mixto1 || !input.mixto2) {
      return "En pago mixto elegí los dos medios de pago.";
    }
    if (input.mixto1 === input.mixto2) {
      const mismaLlave =
        input.mixto1 !== "transferencia" ||
        (input.mixto1Llave ?? "") === (input.mixto2Llave ?? "");
      if (mismaLlave) {
        return "En pago mixto los dos medios deben ser distintos.";
      }
    }
    if (input.mixto1 === "transferencia") {
      const e = validarLlaveTransferencia(input.mixto1Llave, medios, "En el primer medio");
      if (e) return e;
    }
    if (input.mixto2 === "transferencia") {
      const e = validarLlaveTransferencia(input.mixto2Llave, medios, "En el segundo medio");
      if (e) return e;
    }
    const m1 = Number(input.mixto1Monto);
    if (!Number.isFinite(m1) || m1 <= 0) {
      return "Indicá el monto del medio 1.";
    }
    if (totalVenta <= 0) {
      return "El total de la venta debe ser mayor a cero.";
    }
    if (m1 >= totalVenta) {
      return "El monto del medio 1 debe ser menor al total a pagar.";
    }
    return null;
  }
  return null;
}

export function montoMixto2(totalVenta: number, mixto1Monto: number | "" | undefined): number {
  const m1 = Number(mixto1Monto);
  if (!Number.isFinite(totalVenta) || totalVenta <= 0 || !Number.isFinite(m1) || m1 <= 0) {
    return 0;
  }
  return Math.max(0, Math.round((totalVenta - m1) * 100) / 100);
}

export const METODO_PAGO_VENTA_INICIAL: MetodoPagoVentaInput = {
  principal: "efectivo",
  transferenciaLlave: "",
  mixto1: "efectivo",
  mixto1Llave: "",
  mixto1Monto: "",
  mixto2: "tarjeta",
  mixto2Llave: "",
};
