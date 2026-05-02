import { db } from "../db.js";

/** RF-10: alertas locales sin duplicar entradas (dedupe por id). */
export const notificacionService = {
  listar() {
    const stock = db
      .prepare(
        `SELECT id, nombre, stock, stock_minimo
         FROM productos
         WHERE stock = 0 OR (COALESCE(stock_minimo,0) > 0 AND stock > 0 AND stock <= stock_minimo)
         ORDER BY stock ASC, nombre`
      )
      .all();

    const limite = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const citas = db
      .prepare(
        `SELECT c.id, c.inicio, c.estado, cl.nombre AS cliente_nombre
         FROM citas c
         JOIN clientes cl ON cl.id = c.cliente_id
         WHERE c.inicio >= datetime('now') AND c.inicio <= ?
           AND c.estado NOT IN ('cancelado','cancelada')
         ORDER BY c.inicio ASC
         LIMIT 30`
      )
      .all(limite);

    return {
      stock_bajo: stock,
      citas_proximas: citas,
    };
  },
};
