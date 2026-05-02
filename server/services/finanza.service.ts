import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";

export const finanzaService = {
  listGastos(desde?: string, hasta?: string) {
    let sql = `SELECT * FROM gastos_operativos WHERE 1=1`;
    const p: string[] = [];
    if (desde) {
      sql += ` AND fecha >= ?`;
      p.push(desde);
    }
    if (hasta) {
      sql += ` AND fecha <= ?`;
      p.push(hasta);
    }
    sql += ` ORDER BY fecha DESC, id DESC`;
    return db.prepare(sql).all(...p);
  },

  createGasto(body: Record<string, unknown>) {
    const concepto = typeof body.concepto === "string" ? body.concepto.trim() : "";
    if (!concepto) throw new AppError("concepto requerido");
    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto < 0) throw new AppError("monto inválido");
    const fecha =
      typeof body.fecha === "string" && body.fecha.trim()
        ? body.fecha.trim()
        : new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO gastos_operativos (concepto, categoria, monto, fecha, notas, created_at)
         VALUES (?,?,?,?,?,?)`
      )
      .run(
        concepto,
        typeof body.categoria === "string" ? body.categoria.trim() || null : null,
        monto,
        fecha,
        typeof body.notas === "string" ? body.notas || null : null,
        now
      );
    return db.prepare(`SELECT * FROM gastos_operativos WHERE id = ?`).get(info.lastInsertRowid);
  },

  /** Ingresos por ventas, egresos por gastos operativos + total compras en el período. */
  flujoCaja(desde: string, hasta: string) {
    const ingresos = db
      .prepare(`SELECT COALESCE(SUM(total), 0) AS s FROM ventas WHERE fecha >= ? AND fecha <= ?`)
      .get(desde, hasta) as { s: number };
    const egresosGastos = db
      .prepare(
        `SELECT COALESCE(SUM(monto), 0) AS s FROM gastos_operativos WHERE fecha >= ? AND fecha <= ?`
      )
      .get(desde.slice(0, 10), hasta.slice(0, 10)) as { s: number };
    const egresosCompras = db
      .prepare(`SELECT COALESCE(SUM(total), 0) AS s FROM compras WHERE fecha >= ? AND fecha <= ?`)
      .get(desde.slice(0, 10), hasta.slice(0, 10)) as { s: number };
    const egresos = egresosGastos.s + egresosCompras.s;
    return {
      periodo: { desde, hasta },
      ingresos_ventas: ingresos.s,
      egresos_gastos: egresosGastos.s,
      egresos_compras: egresosCompras.s,
      egresos_total: egresos,
      resultado_neto: ingresos.s - egresos,
    };
  },
};
