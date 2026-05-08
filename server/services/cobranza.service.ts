import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";

export const cobranzaService = {
  async list(estado?: string) {
    let sql = `SELECT d.*, c.nombre AS cliente_nombre
               FROM cobranzas_pendientes d
               JOIN clientes c ON c.id = d.cliente_id`;
    const params: string[] = [];
    if (estado && estado.trim()) {
      sql += ` WHERE d.estado = ?`;
      params.push(estado.trim());
    }
    sql += ` ORDER BY (d.vencimiento IS NULL), d.vencimiento ASC, d.id DESC`;
    return await db.prepare(sql).all(...params);
  },

  async create(body: Record<string, unknown>) {
    const cliente_id = Number(body.cliente_id);
    if (!Number.isFinite(cliente_id)) throw new AppError("cliente_id requerido");
    const descripcion =
      typeof body.descripcion === "string" ? body.descripcion.trim() : "";
    if (!descripcion) throw new AppError("descripción requerida");
    const monto = Number(body.monto);
    if (!Number.isFinite(monto) || monto <= 0) throw new AppError("monto inválido");
    const now = new Date().toISOString();
    const vencimiento =
      typeof body.vencimiento === "string" && body.vencimiento.trim()
        ? body.vencimiento.trim().slice(0, 10)
        : null;
    const info = await db
      .prepare(
        `INSERT INTO cobranzas_pendientes
         (cliente_id, descripcion, monto, saldo_pendiente, vencimiento, estado, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(cliente_id, descripcion, monto, monto, vencimiento, "pendiente", now, now);
    return await db
      .prepare(
        `SELECT d.*, c.nombre AS cliente_nombre FROM cobranzas_pendientes d
         JOIN clientes c ON c.id = d.cliente_id WHERE d.id = ?`
      )
      .get(info.lastInsertRowid);
  },

  async registrarPago(id: number, body: Record<string, unknown>) {
    const row = (await db.prepare(`SELECT * FROM cobranzas_pendientes WHERE id = ?`).get(id)) as
      | { saldo_pendiente: number; estado: string }
      | undefined;
    if (!row) throw new AppError("no encontrado", 404);
    if (row.estado === "cobrado") throw new AppError("Deuda ya saldada");
    const pago = Number(body.monto);
    if (!Number.isFinite(pago) || pago <= 0) throw new AppError("monto de pago inválido");
    const nuevo = Math.max(0, row.saldo_pendiente - pago);
    const estado = nuevo <= 0.0001 ? "cobrado" : "pendiente";
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE cobranzas_pendientes SET saldo_pendiente = ?, estado = ?, updated_at = ? WHERE id = ?`
      )
      .run(nuevo, estado, now, id);
    return await db
      .prepare(
        `SELECT d.*, c.nombre AS cliente_nombre FROM cobranzas_pendientes d
         JOIN clientes c ON c.id = d.cliente_id WHERE d.id = ?`
      )
      .get(id);
  },
};
