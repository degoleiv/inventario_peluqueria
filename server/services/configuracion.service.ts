import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";

const CLAVES = {
  puntos_activo: "puntos_activo",
  puntos_ratio: "puntos_por_unidad_moneda",
  puntos_valor_redencion: "puntos_valor_redencion",
} as const;

function getValor(clave: string): string | null {
  const row = db.prepare(`SELECT valor FROM configuracion WHERE clave = ?`).get(clave) as
    | { valor: string }
    | undefined;
  return row?.valor ?? null;
}

function setValor(clave: string, valor: string) {
  db.prepare(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).run(clave, valor);
}

export const configuracionService = {
  /** Descuento en moneda por cada punto canjeado en venta (0 = canje desactivado). */
  getPuntosValorRedencion(): number {
    const v = getValor(CLAVES.puntos_valor_redencion);
    const n = v != null && v !== "" ? Number(v) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  },

  getPuntosConfig(): {
    activo: boolean;
    puntos_por_unidad_moneda: number;
    valor_redencion_moneda: number;
  } {
    const a = getValor(CLAVES.puntos_activo);
    const r = getValor(CLAVES.puntos_ratio);
    const activo = a === "1" || a === "true";
    const raw = r != null && r !== "" ? Number(r) : 1;
    const puntos_por_unidad_moneda =
      Number.isFinite(raw) && raw >= 0 ? raw : 1;
    return {
      activo,
      puntos_por_unidad_moneda,
      valor_redencion_moneda: configuracionService.getPuntosValorRedencion(),
    };
  },

  updatePuntosConfig(body: Record<string, unknown>) {
    if (typeof body.activo === "boolean") {
      setValor(CLAVES.puntos_activo, body.activo ? "1" : "0");
    }
    if (body.puntos_por_unidad_moneda != null) {
      const n = Number(body.puntos_por_unidad_moneda);
      if (!Number.isFinite(n) || n < 0) {
        throw new AppError("puntos_por_unidad_moneda debe ser un número ≥ 0");
      }
      setValor(CLAVES.puntos_ratio, String(n));
    }
    if (body.valor_redencion_moneda != null) {
      const n = Number(body.valor_redencion_moneda);
      if (!Number.isFinite(n) || n < 0) {
        throw new AppError("valor_redencion_moneda debe ser un número ≥ 0");
      }
      setValor(CLAVES.puntos_valor_redencion, String(n));
    }
    return configuracionService.getPuntosConfig();
  },
};
