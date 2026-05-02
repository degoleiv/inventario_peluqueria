import { db } from "../db.js";

export const reporteService = {
  dashboard() {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const today = now.toISOString().slice(0, 10);

    const ventasMes = db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS s, COUNT(*) AS n FROM ventas WHERE fecha >= ?`
      )
      .get(startMonth) as { s: number; n: number };

    const citasHoy = db
      .prepare(
        `SELECT COUNT(*) AS n FROM citas
         WHERE inicio LIKE ? AND estado NOT IN ('cancelado','cancelada')`
      )
      .get(`${today}%`) as { n: number };

    const bajoStock = db
      .prepare(
        `SELECT COUNT(*) AS n FROM productos
         WHERE stock = 0 OR (COALESCE(stock_minimo,0) > 0 AND stock > 0 AND stock <= stock_minimo)`
      )
      .get() as { n: number };

    const syncPend = db
      .prepare(`SELECT COUNT(*) AS n FROM sync_outbox WHERE sincronizado = 0`)
      .get() as { n: number };

    const productosCount = db.prepare(`SELECT COUNT(*) AS n FROM productos`).get() as { n: number };
    const clientesCount = db.prepare(`SELECT COUNT(*) AS n FROM clientes`).get() as { n: number };

    const ventasHoy = db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS s, COUNT(*) AS n
         FROM ventas WHERE substr(fecha, 1, 10) = ?`
      )
      .get(today) as { s: number; n: number };

    const d7 = new Date(now);
    d7.setDate(d7.getDate() - 6);
    const desde7 = `${d7.toISOString().slice(0, 10)}T00:00:00.000Z`;
    const hasta7 = now.toISOString();
    const ingresos7d = reporteService.ingresosDiarios(desde7, hasta7);

    const d30 = new Date(now);
    d30.setDate(d30.getDate() - 30);
    const desde30 = d30.toISOString();
    const topProductos = db
      .prepare(
        `SELECT p.nombre AS nombre, SUM(vl.cantidad) AS unidades
         FROM venta_lineas vl
         JOIN productos p ON p.id = vl.producto_id
         JOIN ventas v ON v.id = vl.venta_id
         WHERE v.fecha >= ?
         GROUP BY p.id
         ORDER BY unidades DESC
         LIMIT 5`
      )
      .all(desde30) as { nombre: string; unidades: number }[];

    return {
      ventas_mes_total: ventasMes.s,
      ventas_mes_cantidad: ventasMes.n,
      ventas_hoy_total: ventasHoy.s,
      ventas_hoy_cantidad: ventasHoy.n,
      citas_hoy: citasHoy.n,
      productos_bajo_stock: bajoStock.n,
      sync_pendientes: syncPend.n,
      productos_total: productosCount.n,
      clientes_total: clientesCount.n,
      ingresos_7d: ingresos7d,
      top_productos: topProductos,
    };
  },

  ventasFiltradas(desde?: string, hasta?: string) {
    let sql = `SELECT v.*, c.nombre AS cliente_nombre
               FROM ventas v
               LEFT JOIN clientes c ON c.id = v.cliente_id WHERE 1=1`;
    const params: string[] = [];
    if (desde) {
      sql += ` AND v.fecha >= ?`;
      params.push(desde);
    }
    if (hasta) {
      sql += ` AND v.fecha <= ?`;
      params.push(hasta);
    }
    sql += ` ORDER BY v.fecha DESC`;
    return db.prepare(sql).all(...params);
  },

  productosMasVendidos(desde: string, hasta: string) {
    return db
      .prepare(
        `SELECT p.id, p.nombre, SUM(vl.cantidad) AS unidades, SUM(vl.subtotal) AS total_vendido
         FROM venta_lineas vl
         JOIN productos p ON p.id = vl.producto_id
         JOIN ventas v ON v.id = vl.venta_id
         WHERE v.fecha >= ? AND v.fecha <= ?
         GROUP BY p.id
         ORDER BY unidades DESC
         LIMIT 25`
      )
      .all(desde, hasta);
  },

  ingresosDiarios(desde: string, hasta: string) {
    return db
      .prepare(
        `SELECT date(fecha) AS dia,
                SUM(total) AS ingresos,
                COUNT(*) AS cantidad_ventas
         FROM ventas
         WHERE fecha >= ? AND fecha <= ?
         GROUP BY date(fecha)
         ORDER BY dia ASC`
      )
      .all(desde, hasta);
  },

  /** Margen aproximado: ventas menos costo de compra por línea (precio_compra * cantidad). */
  productosRentabilidad(desde: string, hasta: string) {
    return db
      .prepare(
        `SELECT p.id,
                p.nombre,
                SUM(vl.subtotal) AS ventas_bruto,
                SUM(vl.cantidad * COALESCE(p.precio_compra, 0)) AS costo_estimado,
                SUM(vl.subtotal - vl.cantidad * COALESCE(p.precio_compra, 0)) AS margen_estimado,
                SUM(vl.cantidad) AS unidades
         FROM venta_lineas vl
         JOIN productos p ON p.id = vl.producto_id
         JOIN ventas v ON v.id = vl.venta_id
         WHERE v.fecha >= ? AND v.fecha <= ?
         GROUP BY p.id
         ORDER BY margen_estimado DESC`
      )
      .all(desde, hasta);
  },

  /** Productos con stock pero sin ventas en los últimos N días. */
  productosSinRotacion(diasSinVenta: number) {
    const d = Math.min(3650, Math.max(7, Math.floor(diasSinVenta)));
    const desde = new Date();
    desde.setDate(desde.getDate() - d);
    const desdeIso = desde.toISOString();
    return db
      .prepare(
        `SELECT p.id, p.nombre, p.stock,
                COALESCE(p.precio_compra, p.precio, 0) AS costo_ref
         FROM productos p
         WHERE p.stock > 0
           AND p.id NOT IN (
             SELECT DISTINCT vl.producto_id
             FROM venta_lineas vl
             JOIN ventas v ON v.id = vl.venta_id
             WHERE v.fecha >= ?
           )
         ORDER BY p.stock DESC`
      )
      .all(desdeIso);
  },

  /** Demanda reciente por producto y sugerencia simple de reorder (heurística). */
  sugerenciasReabastecimiento(diasHistorial = 30, diasCobertura = 14) {
    const dh = Math.min(365, Math.max(7, diasHistorial));
    const dc = Math.min(90, Math.max(7, diasCobertura));
    const desde = new Date();
    desde.setDate(desde.getDate() - dh);
    const desdeIso = desde.toISOString();
    const rows = db
      .prepare(
        `SELECT p.id,
                p.nombre,
                p.stock AS stock_actual,
                COALESCE(p.stock_minimo, 0) AS stock_minimo,
                COALESCE(
                  (SELECT SUM(vl.cantidad)
                   FROM venta_lineas vl
                   JOIN ventas v ON v.id = vl.venta_id
                   WHERE vl.producto_id = p.id AND v.fecha >= ?),
                  0
                ) AS unidades_vendidas_periodo
         FROM productos p`
      )
      .all(desdeIso) as Array<{
      id: number;
      nombre: string;
      stock_actual: number;
      stock_minimo: number;
      unidades_vendidas_periodo: number;
    }>;

    return rows
      .map((r) => {
        const avgUnidadesDia = r.unidades_vendidas_periodo / dh;
        const consumoEstimado = avgUnidadesDia * dc;
        const sugerido = Math.max(
          0,
          Math.ceil(
            Math.max(consumoEstimado - r.stock_actual, r.stock_minimo - r.stock_actual, 0)
          )
        );
        return {
          ...r,
          avg_unidades_dia: avgUnidadesDia,
          dias_historial: dh,
          dias_cobertura_objetivo: dc,
          consumo_estimado_periodo: consumoEstimado,
          sugerencia_compra_unidades: sugerido,
        };
      })
      .filter(
        (r) =>
          r.sugerencia_compra_unidades > 0 &&
          (r.stock_actual <= r.stock_minimo || r.consumo_estimado_periodo > r.stock_actual)
      );
  },

  kpisNegocio(desde: string, hasta: string) {
    const ventasAgg = db
      .prepare(
        `SELECT COUNT(*) AS n,
                COALESCE(SUM(total), 0) AS total,
                COALESCE(AVG(total), 0) AS ticket_promedio
         FROM ventas
         WHERE fecha >= ? AND fecha <= ?`
      )
      .get(desde, hasta) as { n: number; total: number; ticket_promedio: number };

    const clientesConMasDeUna = db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT cliente_id
           FROM ventas
           WHERE cliente_id IS NOT NULL AND fecha >= ? AND fecha <= ?
           GROUP BY cliente_id
           HAVING COUNT(*) > 1
         )`
      )
      .get(desde, hasta) as { n: number };

    const clientesUnaVenta = db
      .prepare(
        `SELECT COUNT(DISTINCT cliente_id) AS n
         FROM ventas
         WHERE cliente_id IS NOT NULL AND fecha >= ? AND fecha <= ?`
      )
      .get(desde, hasta) as { n: number };

    const primerCompra = db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT cliente_id, MIN(fecha) AS primera
           FROM ventas
           WHERE cliente_id IS NOT NULL
           GROUP BY cliente_id
           HAVING primera >= ? AND primera <= ?
         )`
      )
      .get(desde, hasta) as { n: number };

    return {
      periodo: { desde, hasta },
      cantidad_ventas: ventasAgg.n,
      ingresos_totales: ventasAgg.total,
      ticket_promedio: ventasAgg.ticket_promedio,
      clientes_distintos_en_periodo: clientesUnaVenta.n,
      clientes_recurentes_mas_de_una_compra: clientesConMasDeUna.n,
      clientes_primera_compra_en_periodo: primerCompra.n,
    };
  },

  /** Serie temporal simple para tendencia (promedio móvil deja para UI). */
  ventasPorSemana(desde: string, hasta: string) {
    return db
      .prepare(
        `SELECT strftime('%Y-%W', fecha) AS semana,
                SUM(total) AS ingresos,
                COUNT(*) AS cantidad
         FROM ventas
         WHERE fecha >= ? AND fecha <= ?
         GROUP BY strftime('%Y-%W', fecha)
         ORDER BY semana ASC`
      )
      .all(desde, hasta);
  },
};
