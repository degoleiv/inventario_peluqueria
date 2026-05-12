import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";
import {
  isOurMediaUrl,
  saveGastoComprobanteDataUrl,
  unlinkMediaPublicPath,
} from "../lib/mediaStore.js";

const COMPROBANTE_MAX_LEN = 4_500_000; /* ~3 MB de binario en base64 (solo data URL; en disco hasta 15 MB) */
const COMPROBANTE_MAX_DISK_BYTES = 15 * 1024 * 1024;

function parseComprobanteUrl(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new AppError("Comprobante inválido");
  const t = value.trim();
  if (!t) return null;
  const low = t.toLowerCase();
  if (low.startsWith("/api/media/")) {
    if (!isOurMediaUrl(t)) throw new AppError("Comprobante inválido");
    if (t.length > 500) throw new AppError("Comprobante inválido");
    return t;
  }
  if (t.length > COMPROBANTE_MAX_LEN) {
    throw new AppError("Comprobante demasiado grande (máx. 3 MB).");
  }
  if (!low.startsWith("data:image/") && !low.startsWith("data:application/pdf")) {
    throw new AppError(
      "Solo se aceptan imágenes (JPG/PNG/WEBP) o PDF como comprobante."
    );
  }
  return t;
}

const GASTO_SELECT_FIELDS = `g.id, g.concepto, g.monto, g.fecha, g.notas, g.created_at,
  g.categoria_finanza_id, g.pagado, g.pagado_at, g.comprobante_url,
  COALESCE(cf.nombre, g.categoria) AS categoria`;

export const finanzaService = {
  async listGastos(desde?: string, hasta?: string) {
    let sql = `SELECT ${GASTO_SELECT_FIELDS}
         FROM gastos_operativos g
         LEFT JOIN categorias_finanza_concepto cf ON cf.id = g.categoria_finanza_id
         WHERE 1=1`;
    const p: string[] = [];
    if (desde) {
      sql += ` AND g.fecha >= ?`;
      p.push(desde);
    }
    if (hasta) {
      sql += ` AND g.fecha <= ?`;
      p.push(hasta);
    }
    sql += ` ORDER BY g.fecha DESC, g.id DESC`;
    return await db.prepare(sql).all(...p);
  },

  async createGasto(body: Record<string, unknown>) {
    const concepto = typeof body.concepto === "string" ? body.concepto.trim() : "";
    if (!concepto) throw new AppError("concepto requerido");
    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto < 0) throw new AppError("monto inválido");
    const fecha =
      typeof body.fecha === "string" && body.fecha.trim()
        ? body.fecha.trim()
        : new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    let categoriaText: string | null = null;
    let categoriaFinanzaId: number | null = null;
    const rawCatId = body.categoria_finanza_id;
    if (rawCatId !== undefined && rawCatId !== null && rawCatId !== "") {
      const id = Number(rawCatId);
      if (!Number.isInteger(id) || id < 1) throw new AppError("categoria_finanza_id inválido");
      const cat = (await db
        .prepare(`SELECT nombre FROM categorias_finanza_concepto WHERE id = ?`)
        .get(id)) as { nombre: string } | undefined;
      if (!cat) throw new AppError("Categoría no encontrada", 400);
      categoriaFinanzaId = id;
      categoriaText = cat.nombre;
    } else if (typeof body.categoria === "string" && body.categoria.trim()) {
      categoriaText = body.categoria.trim();
    }

    const info = await db
      .prepare(
        `INSERT INTO gastos_operativos (concepto, categoria, categoria_finanza_id, monto, fecha, notas, created_at)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(
        concepto,
        categoriaText,
        categoriaFinanzaId,
        monto,
        fecha,
        typeof body.notas === "string" ? body.notas || null : null,
        now
      );
    return await finanzaService.getGastoById(Number(info.lastInsertRowid));
  },

  async getGastoById(id: number) {
    return await db
      .prepare(
        `SELECT ${GASTO_SELECT_FIELDS}
         FROM gastos_operativos g
         LEFT JOIN categorias_finanza_concepto cf ON cf.id = g.categoria_finanza_id
         WHERE g.id = ?`
      )
      .get(id);
  },

  async deleteGasto(id: number) {
    if (!Number.isInteger(id) || id < 1) throw new AppError("id inválido", 400);
    const row = (await db
      .prepare(`SELECT comprobante_url FROM gastos_operativos WHERE id = ?`)
      .get(id)) as { comprobante_url: string | null } | undefined;
    if (!row) throw new AppError("Gasto no encontrado", 404);
    if (row.comprobante_url && isOurMediaUrl(row.comprobante_url)) {
      await unlinkMediaPublicPath(row.comprobante_url);
    }
    const info = await db.prepare(`DELETE FROM gastos_operativos WHERE id = ?`).run(id);
    if (info.changes === 0) throw new AppError("Gasto no encontrado", 404);
  },

  /**
   * Marca / desmarca un gasto como pagado y opcionalmente adjunta un comprobante
   * (data URL imagen/PDF). Si pagado=false, se borra fecha y comprobante.
   * Si pagado=true sin comprobante en el body, se conserva el comprobante actual.
   */
  async setGastoPago(id: number, body: Record<string, unknown>) {
    if (!Number.isInteger(id) || id < 1) throw new AppError("id inválido", 400);
    const cur = (await db
      .prepare(`SELECT id, comprobante_url FROM gastos_operativos WHERE id = ?`)
      .get(id)) as { id: number; comprobante_url: string | null } | undefined;
    if (!cur) throw new AppError("Gasto no encontrado", 404);

    if (typeof body.pagado === "undefined") {
      throw new AppError("'pagado' es obligatorio (true/false)", 400);
    }
    const pagadoFlag =
      body.pagado === true ||
      body.pagado === 1 ||
      body.pagado === "1" ||
      body.pagado === "true";

    let comprobante: string | null;
    if (!pagadoFlag) {
      if (cur.comprobante_url && isOurMediaUrl(cur.comprobante_url)) {
        await unlinkMediaPublicPath(cur.comprobante_url);
      }
      comprobante = null;
    } else if (body.comprobante_url === undefined) {
      comprobante = cur.comprobante_url ?? null;
    } else {
      let c = parseComprobanteUrl(body.comprobante_url);
      if (c && c.toLowerCase().startsWith("data:")) {
        c = await saveGastoComprobanteDataUrl(c, COMPROBANTE_MAX_DISK_BYTES);
      }
      if (cur.comprobante_url && cur.comprobante_url !== c && isOurMediaUrl(cur.comprobante_url)) {
        await unlinkMediaPublicPath(cur.comprobante_url);
      }
      comprobante = c;
    }

    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE gastos_operativos
         SET pagado = ?, pagado_at = ?, comprobante_url = ?
         WHERE id = ?`
      )
      .run(pagadoFlag ? 1 : 0, pagadoFlag ? now : null, comprobante, id);

    return await finanzaService.getGastoById(id);
  },

  /** Ingresos por ventas, egresos por gastos operativos + total pedidos a proveedores en el período. */
  async flujoCaja(desde: string, hasta: string) {
    const ingresos = (await db
      .prepare(`SELECT COALESCE(SUM(total), 0) AS s FROM ventas WHERE fecha >= ? AND fecha <= ?`)
      .get(desde, hasta)) as { s: number };
    const egresosGastos = (await db
      .prepare(
        `SELECT COALESCE(SUM(monto), 0) AS s FROM gastos_operativos WHERE fecha >= ? AND fecha <= ?`
      )
      .get(desde.slice(0, 10), hasta.slice(0, 10))) as { s: number };
    const egresosPedidos = (await db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS s FROM pedidos_proveedor WHERE fecha >= ? AND fecha <= ?`
      )
      .get(desde.slice(0, 10), hasta.slice(0, 10))) as { s: number };
    const egresos = egresosGastos.s + egresosPedidos.s;
    return {
      periodo: { desde, hasta },
      ingresos_ventas: ingresos.s,
      egresos_gastos: egresosGastos.s,
      /** Total facturado en pedidos (líneas de stock), mismo concepto que antes con compras. */
      egresos_pedidos_proveedor: egresosPedidos.s,
      /** @deprecated usar egresos_pedidos_proveedor */
      egresos_compras: egresosPedidos.s,
      egresos_total: egresos,
      resultado_neto: ingresos.s - egresos,
    };
  },
};
