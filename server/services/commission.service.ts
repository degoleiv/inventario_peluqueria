import { db } from "../db.js";

export function calcularMontoComision(totalVenta: number, tipo: string, valor: number): number {
  const t = (tipo || "porcentaje").toLowerCase();
  if (t === "fijo") {
    return Math.max(0, Math.round(valor * 100) / 100);
  }
  const pct = Math.max(0, valor);
  return Math.round(totalVenta * (pct / 100) * 100) / 100;
}

export const commissionService = {
  async insertForVenta(
    ventaId: number,
    empleadoId: number,
    totalVenta: number,
    fechaVenta: string
  ): Promise<number | null> {
    const u = (await db
      .prepare(`SELECT tipo_comision, valor_comision FROM usuarios WHERE id = ?`)
      .get(empleadoId)) as { tipo_comision: string; valor_comision: number } | undefined;
    if (!u) return null;
    const monto = calcularMontoComision(totalVenta, u.tipo_comision, Number(u.valor_comision));
    if (monto <= 0) return null;
    const now = new Date().toISOString();
    const fecha = fechaVenta.slice(0, 10);
    await db
      .prepare(
        `INSERT INTO comisiones (empleado_id, venta_id, monto, fecha, created_at) VALUES (?,?,?,?,?)`
      )
      .run(empleadoId, ventaId, monto, fecha, now);
    return monto;
  },

  async deleteByVentaId(ventaId: number): Promise<void> {
    await db.prepare(`DELETE FROM comisiones WHERE venta_id = ?`).run(ventaId);
  },

  async list(desde?: string, hasta?: string, empleadoId?: number) {
    let sql = `SELECT c.*, u.nombre AS empleado_nombre, v.total AS venta_total
               FROM comisiones c
               JOIN usuarios u ON u.id = c.empleado_id
               LEFT JOIN ventas v ON v.id = c.venta_id
               WHERE 1=1`;
    const params: (string | number)[] = [];
    if (empleadoId != null) {
      sql += ` AND c.empleado_id = ?`;
      params.push(empleadoId);
    }
    if (desde) {
      sql += ` AND c.fecha >= ?`;
      params.push(desde);
    }
    if (hasta) {
      sql += ` AND c.fecha <= ?`;
      params.push(hasta);
    }
    sql += ` ORDER BY c.fecha DESC, c.id DESC`;
    return await db.prepare(sql).all(...params);
  },
};
