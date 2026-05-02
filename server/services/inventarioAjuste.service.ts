import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";

/** Ajuste físico vs sistema (trazabilidad de pérdidas / diferencias). */
export const inventarioAjusteService = {
  registrarAjuste(
    body: Record<string, unknown>,
    usuarioId: number | null | undefined
  ) {
    const producto_id = Number(body.producto_id);
    if (!Number.isFinite(producto_id)) throw new AppError("producto_id requerido");
    const stock_real = Math.floor(Number(body.stock_real));
    if (!Number.isFinite(stock_real) || stock_real < 0) throw new AppError("stock_real inválido");
    const motivo =
      typeof body.motivo === "string" && body.motivo.trim() ? body.motivo.trim() : null;

    const now = new Date().toISOString();
    const row = db.prepare(`SELECT id, stock, nombre FROM productos WHERE id = ?`).get(producto_id) as
      | { id: number; stock: number; nombre: string }
      | undefined;
    if (!row) throw new AppError("Producto no existe", 404);

    const anterior = row.stock;
    const diferencia = stock_real - anterior;

    db.transaction(() => {
      db.prepare(
        `INSERT INTO ajustes_inventario
         (producto_id, stock_anterior, stock_nuevo, diferencia, motivo, usuario_id, created_at)
         VALUES (?,?,?,?,?,?,?)`
      ).run(producto_id, anterior, stock_real, diferencia, motivo, usuarioId ?? null, now);
      db.prepare(`UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?`).run(
        stock_real,
        now,
        producto_id
      );
    })();

    recordSyncEvent("inventario", "ajuste_stock", {
      producto_id,
      anterior,
      stock_real,
      diferencia,
    });

    return {
      producto_id,
      nombre: row.nombre,
      stock_anterior: anterior,
      stock_nuevo: stock_real,
      diferencia,
    };
  },
};
