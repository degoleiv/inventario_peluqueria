import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";

export const finanzaService = {
  async listGastos(desde?: string, hasta?: string) {
    let sql = `SELECT g.id, g.concepto, g.monto, g.fecha, g.notas, g.created_at, g.categoria_finanza_id,
         COALESCE(cf.nombre, g.categoria) AS categoria
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
        `SELECT g.id, g.concepto, g.monto, g.fecha, g.notas, g.created_at, g.categoria_finanza_id,
         COALESCE(cf.nombre, g.categoria) AS categoria
         FROM gastos_operativos g
         LEFT JOIN categorias_finanza_concepto cf ON cf.id = g.categoria_finanza_id
         WHERE g.id = ?`
      )
      .get(id);
  },

  async deleteGasto(id: number) {
    if (!Number.isInteger(id) || id < 1) throw new AppError("id inválido", 400);
    const info = await db.prepare(`DELETE FROM gastos_operativos WHERE id = ?`).run(id);
    if (info.changes === 0) throw new AppError("Gasto no encontrado", 404);
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
