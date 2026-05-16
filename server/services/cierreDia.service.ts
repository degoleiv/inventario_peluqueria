import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";
import {
  buildCanalesCierreMeta,
  clasificarMetodoPagoCierre,
  diferenciaMontos,
  montosFromBody,
  montosVacios,
  parseMontosJson,
  totalMontos,
  type CanalCierreMeta,
  type MontosPorCanal,
} from "../lib/cierreDia.js";
import { parseMetodoPagoMixto } from "../lib/metodoPagoMixto.js";
import type { MedioPagoTransferencia } from "../lib/mediosPagoTransferencia.js";
import { configuracionService } from "./configuracion.service.js";

export type CierreDiaRow = {
  id: number;
  fecha: string;
  ventas_cantidad: number;
  ventas_total: number;
  montos_reportados: string;
  montos_reales: string;
  montos_diferencia: string;
  nota_final: string | null;
  usuario_id: number | null;
  usuario_nombre: string | null;
  created_at: string;
};

export type LineaProductoCierre = {
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
  subtotal: number;
};

export type LineaServicioCierre = {
  servicio_nombre: string;
  profesional_nombre: string | null;
  cantidad: number;
  subtotal: number;
};

export type DetalleVentasDia = {
  productos: LineaProductoCierre[];
  servicios: LineaServicioCierre[];
  total_productos: number;
  total_servicios: number;
};

export type CierreDiaDto = DetalleVentasDia & {
  id: number;
  fecha: string;
  ventas_cantidad: number;
  ventas_total: number;
  montos_reportados: MontosPorCanal;
  montos_reales: MontosPorCanal;
  montos_diferencia: MontosPorCanal;
  canales_cierre: CanalCierreMeta[];
  total_reportado: number;
  total_real: number;
  total_diferencia: number;
  nota_final: string | null;
  usuario_id: number | null;
  usuario_nombre: string | null;
  created_at: string;
};

export type ResumenDiaCierre = DetalleVentasDia & {
  fecha: string;
  ya_cerrado: boolean;
  cierre_id: number | null;
  ventas_cantidad: number;
  ventas_total: number;
  montos_reportados: MontosPorCanal;
  canales_cierre: CanalCierreMeta[];
  total_reportado: number;
};

async function detalleVentasDelDia(fecha: string): Promise<DetalleVentasDia> {
  const productos = (await db
    .prepare(
      `SELECT p.id AS producto_id, p.nombre AS producto_nombre,
              SUM(vl.cantidad) AS cantidad, SUM(vl.subtotal) AS subtotal
       FROM venta_lineas vl
       JOIN productos p ON p.id = vl.producto_id
       JOIN ventas v ON v.id = vl.venta_id
       WHERE date(v.fecha) = date(?)
         AND COALESCE(v.estado, 'confirmada') != 'cancelada'
       GROUP BY p.id
       ORDER BY p.nombre COLLATE NOCASE ASC`
    )
    .all(fecha)) as LineaProductoCierre[];

  const servicios = (await db
    .prepare(
      `SELECT vs.servicio_nombre,
              u.nombre AS profesional_nombre,
              SUM(vs.cantidad) AS cantidad, SUM(vs.subtotal) AS subtotal
       FROM venta_servicios vs
       JOIN ventas v ON v.id = vs.venta_id
       LEFT JOIN usuarios u ON u.id = vs.usuario_id
       WHERE date(v.fecha) = date(?)
         AND COALESCE(v.estado, 'confirmada') != 'cancelada'
       GROUP BY vs.servicio_nombre, vs.usuario_id
       ORDER BY vs.servicio_nombre COLLATE NOCASE ASC, u.nombre COLLATE NOCASE ASC`
    )
    .all(fecha)) as LineaServicioCierre[];

  const total_productos = productos.reduce((s, r) => s + Number(r.subtotal || 0), 0);
  const total_servicios = servicios.reduce((s, r) => s + Number(r.subtotal || 0), 0);

  return {
    productos: productos.map((r) => ({
      producto_id: r.producto_id,
      producto_nombre: r.producto_nombre,
      cantidad: Number(r.cantidad) || 0,
      subtotal: Number(r.subtotal) || 0,
    })),
    servicios: servicios.map((r) => ({
      servicio_nombre: r.servicio_nombre,
      profesional_nombre: r.profesional_nombre ?? null,
      cantidad: Number(r.cantidad) || 0,
      subtotal: Number(r.subtotal) || 0,
    })),
    total_productos,
    total_servicios,
  };
}

async function toDto(row: CierreDiaRow, medios: MedioPagoTransferencia[]): Promise<CierreDiaDto> {
  const canales_cierre = buildCanalesCierreMeta(medios);
  const reportado = parseMontosJson(JSON.parse(row.montos_reportados), medios);
  const real = parseMontosJson(JSON.parse(row.montos_reales), medios);
  const diff = parseMontosJson(JSON.parse(row.montos_diferencia), medios);
  const ventas = await detalleVentasDelDia(row.fecha);
  return {
    id: row.id,
    fecha: row.fecha,
    ventas_cantidad: row.ventas_cantidad,
    ventas_total: row.ventas_total,
    montos_reportados: reportado,
    montos_reales: real,
    montos_diferencia: diff,
    canales_cierre,
    total_reportado: totalMontos(reportado),
    total_real: totalMontos(real),
    total_diferencia: totalMontos(diff),
    nota_final: row.nota_final,
    usuario_id: row.usuario_id,
    usuario_nombre: row.usuario_nombre,
    created_at: row.created_at,
    ...ventas,
  };
}

function validarFecha(fecha: unknown): string {
  const f = typeof fecha === "string" ? fecha.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) {
    throw new AppError("fecha inválida (use AAAA-MM-DD)");
  }
  return f;
}

async function agregarVentasDelDia(
  fecha: string,
  medios: MedioPagoTransferencia[]
): Promise<{
  ventas_cantidad: number;
  ventas_total: number;
  montos_reportados: MontosPorCanal;
}> {
  const rows = (await db
    .prepare(
      `SELECT metodo_pago, total FROM ventas
       WHERE date(fecha) = date(?)
         AND COALESCE(estado, 'confirmada') != 'cancelada'`
    )
    .all(fecha)) as { metodo_pago: string; total: number }[];

  const montos = montosVacios(medios);
  let ventas_total = 0;
  for (const v of rows) {
    const total = Number(v.total);
    if (!Number.isFinite(total)) continue;
    ventas_total += total;
    const metodo = v.metodo_pago ?? "";
    const mixto = parseMetodoPagoMixto(metodo);
    const conMontos =
      mixto?.partes.length === 2 &&
      mixto.partes.every((p) => p.monto != null && p.monto >= 0);
    if (conMontos && mixto) {
      for (const parte of mixto.partes) {
        const monto = Number(parte.monto);
        if (!Number.isFinite(monto) || monto <= 0) continue;
        const canal = clasificarMetodoPagoCierre(parte.codigo, medios);
        montos[canal] = (montos[canal] ?? 0) + monto;
      }
    } else {
      const canal = clasificarMetodoPagoCierre(metodo, medios);
      montos[canal] = (montos[canal] ?? 0) + total;
    }
  }
  return { ventas_cantidad: rows.length, ventas_total, montos_reportados: montos };
}

export const cierreDiaService = {
  async resumen(fechaInput?: string): Promise<ResumenDiaCierre> {
    const medios = await configuracionService.getMediosPagoTransferencia();
    const canales_cierre = buildCanalesCierreMeta(medios);
    const fecha = fechaInput ? validarFecha(fechaInput) : new Date().toISOString().slice(0, 10);
    const existente = (await db
      .prepare(`SELECT id FROM cierres_dia WHERE fecha = ?`)
      .get(fecha)) as { id: number } | undefined;
    const agg = await agregarVentasDelDia(fecha, medios);
    const ventas = await detalleVentasDelDia(fecha);
    return {
      fecha,
      ya_cerrado: !!existente,
      cierre_id: existente?.id ?? null,
      ventas_cantidad: agg.ventas_cantidad,
      ventas_total: agg.ventas_total,
      montos_reportados: agg.montos_reportados,
      canales_cierre,
      total_reportado: totalMontos(agg.montos_reportados),
      ...ventas,
    };
  },

  async list(limit = 60): Promise<CierreDiaDto[]> {
    const medios = await configuracionService.getMediosPagoTransferencia();
    const n = Math.min(Math.max(1, Math.floor(limit)), 200);
    const rows = (await db
      .prepare(`SELECT * FROM cierres_dia ORDER BY fecha DESC LIMIT ?`)
      .all(n)) as CierreDiaRow[];
    return Promise.all(rows.map((r) => toDto(r, medios)));
  },

  async getById(id: number): Promise<CierreDiaDto> {
    const medios = await configuracionService.getMediosPagoTransferencia();
    const row = (await db.prepare(`SELECT * FROM cierres_dia WHERE id = ?`).get(id)) as
      | CierreDiaRow
      | undefined;
    if (!row) throw new AppError("Cierre de día no encontrado", 404);
    return toDto(row, medios);
  },

  async getByFecha(fecha: string): Promise<CierreDiaDto | null> {
    const medios = await configuracionService.getMediosPagoTransferencia();
    const f = validarFecha(fecha);
    const row = (await db.prepare(`SELECT * FROM cierres_dia WHERE fecha = ?`).get(f)) as
      | CierreDiaRow
      | undefined;
    return row ? toDto(row, medios) : null;
  },

  async crear(
    body: Record<string, unknown>,
    usuario: { id: number; nombre?: string | null }
  ): Promise<CierreDiaDto> {
    const medios = await configuracionService.getMediosPagoTransferencia();
    const fecha = validarFecha(body.fecha ?? new Date().toISOString().slice(0, 10));
    const existente = await db.prepare(`SELECT id FROM cierres_dia WHERE fecha = ?`).get(fecha);
    if (existente) {
      throw new AppError(`El día ${fecha} ya fue cerrado. Consultá el historial de cierres.`, 409);
    }

    const agg = await agregarVentasDelDia(fecha, medios);
    const montos_reales = montosFromBody(body, medios, AppError);
    const montos_diferencia = diferenciaMontos(agg.montos_reportados, montos_reales);
    const nota =
      typeof body.nota_final === "string"
        ? body.nota_final.trim() || null
        : typeof body.nota === "string"
          ? body.nota.trim() || null
          : null;

    const now = new Date().toISOString();
    const info = await db
      .prepare(
        `INSERT INTO cierres_dia (
          fecha, ventas_cantidad, ventas_total,
          montos_reportados, montos_reales, montos_diferencia,
          nota_final, usuario_id, usuario_nombre, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        fecha,
        agg.ventas_cantidad,
        agg.ventas_total,
        JSON.stringify(agg.montos_reportados),
        JSON.stringify(montos_reales),
        JSON.stringify(montos_diferencia),
        nota,
        usuario.id,
        usuario.nombre ?? null,
        now
      );

    const row = (await db
      .prepare(`SELECT * FROM cierres_dia WHERE id = ?`)
      .get(info.lastInsertRowid)) as CierreDiaRow;
    return await toDto(row, medios);
  },
};
