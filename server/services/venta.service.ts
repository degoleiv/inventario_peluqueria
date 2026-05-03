import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";
import { configuracionService } from "./configuracion.service.js";
import { commissionService } from "./commission.service.js";

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export const ventaService = {
  list(desde?: string, hasta?: string) {
    let sql = `SELECT v.*, c.nombre AS cliente_nombre, u.nombre AS vendedor_nombre
               FROM ventas v
               LEFT JOIN clientes c ON c.id = v.cliente_id
               LEFT JOIN usuarios u ON u.id = v.usuario_id`;
    const params: string[] = [];
    if (desde) {
      sql += ` WHERE v.fecha >= ?`;
      params.push(desde);
      if (hasta) {
        sql += ` AND v.fecha <= ?`;
        params.push(hasta);
      }
    } else if (hasta) {
      sql += ` WHERE v.fecha <= ?`;
      params.push(hasta);
    }
    sql += ` ORDER BY v.fecha DESC`;
    return db.prepare(sql).all(...params);
  },

  getById(id: number) {
    const venta = db
      .prepare(
        `SELECT v.*, c.nombre AS cliente_nombre, u.nombre AS vendedor_nombre
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN usuarios u ON u.id = v.usuario_id
         WHERE v.id = ?`
      )
      .get(id);
    if (!venta) throw new AppError("no encontrado", 404);
    const lineas = db
      .prepare(
        `SELECT vl.*, p.nombre AS producto_nombre
         FROM venta_lineas vl
         JOIN productos p ON p.id = vl.producto_id
         WHERE vl.venta_id = ?`
      )
      .all(id);
    return { ...venta, lineas };
  },

  create(body: Record<string, unknown>) {
    const lineasIn = body.lineas;
    if (!Array.isArray(lineasIn) || lineasIn.length === 0) {
      throw new AppError("Debe incluir al menos una línea de venta");
    }
    const now = new Date().toISOString();
    const fechaVenta =
      typeof body.fecha === "string" && body.fecha.trim() ? body.fecha.trim() : now;

    const uidRaw = body.usuario_id;
    const usuario_id =
      uidRaw != null && Number.isFinite(Number(uidRaw))
        ? Math.floor(Number(uidRaw))
        : null;
    if (usuario_id == null) {
      throw new AppError("usuario_id (vendedor) requerido");
    }
    const vu = db.prepare(`SELECT id FROM usuarios WHERE id = ? AND activo = 1`).get(usuario_id) as
      | { id: number }
      | undefined;
    if (!vu) throw new AppError("Vendedor no encontrado o inactivo");

    const insVenta = db.prepare(
      `INSERT INTO ventas (cliente_id, fecha, total, metodo_pago, notas, created_at, descuento_puntos, puntos_canjeados, usuario_id)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    const insMov = db.prepare(
      `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, venta_id, referencia, created_at)
       VALUES (?, 'SALIDA', ?, ?, ?, ?)`
    );

    const { ventaId, puntosOtorgados } = db.transaction(() => {
      let totalBruto = 0;
      const prepared: {
        producto_id: number;
        cantidad: number;
        precio_unitario: number;
        subtotal: number;
      }[] = [];

      const today = todayISODate();

      for (const ln of lineasIn as Record<string, unknown>[]) {
        const producto_id = Number(ln.producto_id);
        const cantidad = Math.floor(Number(ln.cantidad));
        if (!Number.isFinite(producto_id) || cantidad <= 0) {
          throw new AppError("Línea inválida (producto o cantidad)");
        }
        const prod = db
          .prepare(
            `SELECT stock, precio, precio_venta, nombre, fecha_vencimiento FROM productos WHERE id = ?`
          )
          .get(producto_id) as
          | {
              stock: number;
              precio: number | null;
              precio_venta: number | null;
              nombre: string;
              fecha_vencimiento: string | null;
            }
          | undefined;
        if (!prod) throw new AppError(`Producto ${producto_id} no existe`);
        if (prod.stock < cantidad) {
          throw new AppError(`Stock insuficiente para «${prod.nombre}» (${prod.stock} disponible)`);
        }
        if (prod.fecha_vencimiento && prod.fecha_vencimiento < today) {
          throw new AppError(`El producto «${prod.nombre}» está vencido y no puede venderse`);
        }

        const precioLista =
          prod.precio_venta != null ? prod.precio_venta : prod.precio != null ? prod.precio : 0;
        const precio_unitario =
          typeof ln.precio_unitario === "number" && Number.isFinite(ln.precio_unitario)
            ? ln.precio_unitario
            : precioLista;
        const subtotal = precio_unitario * cantidad;
        totalBruto += subtotal;
        prepared.push({ producto_id, cantidad, precio_unitario, subtotal });
      }

      const clienteIdPre =
        body.cliente_id != null && Number.isFinite(Number(body.cliente_id))
          ? Number(body.cliente_id)
          : null;

      const valorRedencion = configuracionService.getPuntosValorRedencion();
      const reqCanje = Math.floor(
        Number(
          body.puntos_canjeados != null ? body.puntos_canjeados : 0
        )
      );
      let descuentoPuntos = 0;
      let puntosCanjeadosEfectivos = 0;
      if (
        clienteIdPre != null &&
        valorRedencion > 0 &&
        reqCanje > 0 &&
        totalBruto > 0
      ) {
        const cli = db
          .prepare(`SELECT puntos FROM clientes WHERE id = ?`)
          .get(clienteIdPre) as { puntos: number } | undefined;
        if (!cli) throw new AppError("Cliente no existe");
        const maxPtsPorMonto = Math.floor(totalBruto / valorRedencion + 1e-12);
        const usar = Math.min(reqCanje, Math.max(0, cli.puntos), maxPtsPorMonto);
        if (usar > 0) {
          descuentoPuntos = Math.min(usar * valorRedencion, totalBruto);
          puntosCanjeadosEfectivos = usar;
          const quitarPts = db.prepare(
            `UPDATE clientes SET puntos = puntos - ?, updated_at = ? WHERE id = ? AND puntos >= ?`
          );
          const ch = quitarPts.run(usar, now, clienteIdPre, usar);
          if (ch.changes === 0) {
            throw new AppError("Puntos insuficientes para canje");
          }
        }
      }

      const totalFinal = Math.max(0, totalBruto - descuentoPuntos);

      const info = insVenta.run(
        clienteIdPre,
        fechaVenta,
        totalFinal,
        typeof body.metodo_pago === "string" && body.metodo_pago ? body.metodo_pago : "efectivo",
        typeof body.notas === "string" ? body.notas || null : null,
        now,
        descuentoPuntos,
        puntosCanjeadosEfectivos,
        usuario_id
      );
      const vid = Number(info.lastInsertRowid);

      const insLine = db.prepare(
        `INSERT INTO venta_lineas (venta_id, producto_id, cantidad, precio_unitario, subtotal)
         VALUES (?,?,?,?,?)`
      );
      const updStock = db.prepare(
        `UPDATE productos SET stock = stock - ?, updated_at = ? WHERE id = ?`
      );

      for (const pl of prepared) {
        insLine.run(vid, pl.producto_id, pl.cantidad, pl.precio_unitario, pl.subtotal);
        updStock.run(pl.cantidad, now, pl.producto_id);
        insMov.run(
          pl.producto_id,
          pl.cantidad,
          vid,
          `venta:${vid}`,
          now
        );
      }

      const clienteId = clienteIdPre;
      let puntosOtorgados = 0;
      const puntosCfg = configuracionService.getPuntosConfig();
      if (puntosCfg.activo && clienteId != null && totalFinal > 0) {
        puntosOtorgados = Math.floor(totalFinal * puntosCfg.puntos_por_unidad_moneda);
        if (puntosOtorgados > 0) {
          const updPts = db.prepare(
            `UPDATE clientes SET puntos = COALESCE(puntos, 0) + ?, updated_at = ? WHERE id = ?`
          );
          const ch = updPts.run(puntosOtorgados, now, clienteId);
          if (ch.changes === 0) {
            throw new AppError("Cliente de la venta no existe");
          }
        }
      }

      commissionService.insertForVenta(vid, usuario_id, totalFinal, fechaVenta);

      recordSyncEvent("venta", "creada", {
        venta_id: vid,
        total: totalFinal,
        total_bruto: totalBruto,
        descuento_puntos: descuentoPuntos,
        lineas: prepared.length,
        puntos_otorgados: puntosOtorgados,
        puntos_canjeados: puntosCanjeadosEfectivos,
      });
      return { ventaId: vid, puntosOtorgados };
    })();

    const detalle = ventaService.getById(ventaId);
    return { ...detalle, puntos_otorgados: puntosOtorgados };
  },

  cancelar(
    id: number,
    body: {
      motivo: string;
      cancelado_por: "cliente" | "empleado" | "admin";
    }
  ) {
    const motivo =
      typeof body.motivo === "string" ? body.motivo.trim() : "";
    if (!motivo) throw new AppError("motivo requerido");
    const por = body.cancelado_por;
    if (por !== "cliente" && por !== "empleado" && por !== "admin") {
      throw new AppError("cancelado_por debe ser cliente, empleado o admin");
    }

    const venta = db.prepare(`SELECT * FROM ventas WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    if (!venta) throw new AppError("no encontrado", 404);

    const estadoActual = String(venta.estado ?? "confirmada");
    if (estadoActual === "cancelada") {
      throw new AppError("La venta ya está cancelada");
    }

    const lineas = db
      .prepare(`SELECT producto_id, cantidad FROM venta_lineas WHERE venta_id = ?`)
      .all(id) as { producto_id: number; cantidad: number }[];

    const now = new Date().toISOString();

    db.transaction(() => {
      commissionService.deleteByVentaId(id);

      const insEntrada = db.prepare(
        `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, venta_id, referencia, created_at)
         VALUES (?, 'ENTRADA', ?, ?, ?, ?)`
      );
      const updStock = db.prepare(
        `UPDATE productos SET stock = stock + ?, updated_at = ? WHERE id = ?`
      );

      for (const ln of lineas) {
        updStock.run(ln.cantidad, now, ln.producto_id);
        insEntrada.run(
          ln.producto_id,
          ln.cantidad,
          id,
          `anulacion_venta:${id}`,
          now
        );
      }

      db.prepare(
        `UPDATE ventas SET estado = 'cancelada', cancelado_por = ?, cancelado_motivo = ?, cancelado_at = ? WHERE id = ?`
      ).run(por, motivo, now, id);

      const clienteId =
        venta.cliente_id != null ? Number(venta.cliente_id) : null;
      const totalFinal = Number(venta.total);
      const puntosCfg = configuracionService.getPuntosConfig();
      if (puntosCfg.activo && clienteId != null && totalFinal > 0) {
        const quitar = Math.floor(totalFinal * puntosCfg.puntos_por_unidad_moneda);
        if (quitar > 0) {
          db.prepare(`UPDATE clientes SET puntos = MAX(0, COALESCE(puntos, 0) - ?), updated_at = ? WHERE id = ?`).run(
            quitar,
            now,
            clienteId
          );
        }
      }
    })();

    recordSyncEvent("venta", "cancelada", { venta_id: id, cancelado_por: por });
    return ventaService.getById(id);
  },
};
