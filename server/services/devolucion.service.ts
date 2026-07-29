import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";
import { localNow } from "../lib/localDate.js";
import { configuracionService } from "./configuracion.service.js";
import { commissionService } from "./commission.service.js";

type DevolucionRow = {
  id: number;
  venta_id: number;
  total_devolucion: number;
  estado: string;
  cliente_id: number | null;
  usuario_id: number;
  motivo: string | null;
  notas: string | null;
  fecha: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
};

type DevolucionDetalle = DevolucionRow & {
  productos: unknown[];
  servicios: unknown[];
  auditoria: unknown[];
};

const ESTADOS_TERMINALES = ["procesada", "rechazada", "anulada"];

export const devolucionService = {
  async list(params?: {
    desde?: string;
    hasta?: string;
    estado?: string;
    venta_id?: number;
  }) {
    let sql = `SELECT d.*,
                 c.nombre  AS cliente_nombre,
                 u.nombre  AS vendedor_nombre,
                 v.total   AS venta_total,
                 (SELECT COUNT(*) FROM devolucion_productos dp WHERE dp.devolucion_id = d.id) AS num_productos,
                 (SELECT COUNT(*) FROM devolucion_servicios ds WHERE ds.devolucion_id = d.id) AS num_servicios
               FROM devoluciones d
               LEFT JOIN clientes c  ON c.id = d.cliente_id
               LEFT JOIN usuarios u  ON u.id = d.usuario_id
               LEFT JOIN ventas   v  ON v.id = d.venta_id`;

    const conds: string[] = [];
    const params_: unknown[] = [];

    if (params?.desde) {
      conds.push(`substr(d.fecha, 1, 10) >= ?`);
      params_.push(params.desde.trim().slice(0, 10));
    }
    if (params?.hasta) {
      conds.push(`substr(d.fecha, 1, 10) <= ?`);
      params_.push(params.hasta.trim().slice(0, 10));
    }
    if (params?.estado) {
      conds.push(`d.estado = ?`);
      params_.push(params.estado);
    }
    if (params?.venta_id != null) {
      conds.push(`d.venta_id = ?`);
      params_.push(params.venta_id);
    }

    if (conds.length > 0) sql += ` WHERE ` + conds.join(` AND `);
    sql += ` ORDER BY d.fecha DESC`;

    return await db.prepare(sql).all(...params_);
  },

  async getById(id: number): Promise<DevolucionDetalle> {
    const dev = await db
      .prepare(
        `SELECT d.*,
                c.nombre AS cliente_nombre,
                u.nombre AS vendedor_nombre,
                v.total  AS venta_total,
                ua.nombre AS aprobado_por_nombre,
                up.nombre AS procesado_por_nombre,
                ur.nombre AS rechazado_por_nombre,
                uan.nombre AS anulado_por_nombre
         FROM devoluciones d
         LEFT JOIN clientes c  ON c.id  = d.cliente_id
         LEFT JOIN usuarios u  ON u.id  = d.usuario_id
         LEFT JOIN ventas   v  ON v.id  = d.venta_id
         LEFT JOIN usuarios ua ON ua.id = d.aprobado_por
         LEFT JOIN usuarios up ON up.id = d.procesado_por
         LEFT JOIN usuarios ur ON ur.id = d.rechazado_por
         LEFT JOIN usuarios uan ON uan.id = d.anulado_por
         WHERE d.id = ?`
      )
      .get<DevolucionRow>(id);
    if (!dev) throw new AppError("Devolución no encontrada", 404);

    const productos = await db
      .prepare(
        `SELECT dp.*, p.nombre AS producto_nombre
         FROM devolucion_productos dp
         JOIN productos p ON p.id = dp.producto_id
         WHERE dp.devolucion_id = ?`
      )
      .all(id);

    const servicios = await db
      .prepare(
        `SELECT ds.*
         FROM devolucion_servicios ds
         WHERE ds.devolucion_id = ?`
      )
      .all(id);

    const auditoria = await db
      .prepare(
        `SELECT da.*, u.nombre AS usuario_nombre
         FROM devolucion_auditoria da
         LEFT JOIN usuarios u ON u.id = da.usuario_id
         WHERE da.devolucion_id = ?
         ORDER BY da.created_at ASC`
      )
      .all(id);

    return { ...dev, productos, servicios, auditoria };
  },

  async create(body: Record<string, unknown>, userId: number) {
    const ventaId = Number(body.venta_id);
    if (!Number.isFinite(ventaId)) throw new AppError("venta_id requerido");

    const venta = await db
      .prepare(`SELECT * FROM ventas WHERE id = ?`)
      .get<DevolucionRow>(ventaId);
    if (!venta) throw new AppError("Venta no encontrada", 404);
    if (String(venta.estado ?? "confirmada") === "cancelada") {
      throw new AppError("No se puede devolver una venta cancelada");
    }

    const motivo = typeof body.motivo === "string" ? body.motivo.trim() : "";
    if (!motivo) throw new AppError("Motivo requerido");

    const notas = typeof body.notas === "string" ? body.notas.trim() || null : null;

    const productosIn = Array.isArray(body.productos) ? body.productos : [];
    const serviciosIn = Array.isArray(body.servicios) ? body.servicios : [];
    if (productosIn.length === 0 && serviciosIn.length === 0) {
      throw new AppError("Debe incluir al menos un producto o servicio a devolver");
    }

    const devueltoMap = await devolucionService.devueltoPorVentaLinea(ventaId);

    const now = localNow();

    const { devolucionId } = await db.transaction(async () => {
      let totalDevolucion = 0;

      const prepProd: {
        venta_linea_id: number;
        producto_id: number;
        cantidad: number;
        precio_unitario: number;
        subtotal: number;
        motivo_id: number | null;
        notas: string | null;
      }[] = [];

      for (const ln of productosIn as Record<string, unknown>[]) {
        const ventaLineaId = Number(ln.venta_linea_id);
        const productoId = Number(ln.producto_id);
        const cantidad = Math.floor(Number(ln.cantidad));
        const precioUnitario = Number(ln.precio_unitario);

        if (!Number.isFinite(ventaLineaId) || !Number.isFinite(productoId) || cantidad <= 0) {
          throw new AppError("Línea de producto inválida");
        }
        if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
          throw new AppError("Precio unitario inválido");
        }

        const ventaLinea = await db
          .prepare(`SELECT cantidad FROM venta_lineas WHERE id = ? AND venta_id = ?`)
          .get<{ cantidad: number }>(ventaLineaId, ventaId);
        if (!ventaLinea) throw new AppError(`Línea de venta ${ventaLineaId} no encontrada`);

        const yaDevuelto = devueltoMap.producto[ventaLineaId] ?? 0;
        const disponible = ventaLinea.cantidad - yaDevuelto;
        if (cantidad > disponible) {
          throw new AppError(
            `Cantidad a devolver (${cantidad}) excede lo disponible (${disponible}) para la línea ${ventaLineaId}`
          );
        }

        const subtotal = precioUnitario * cantidad;
        totalDevolucion += subtotal;

        const motivoId = ln.motivo_id != null ? Number(ln.motivo_id) : null;
        const notasLn = typeof ln.notas === "string" ? ln.notas.trim() || null : null;

        prepProd.push({
          venta_linea_id: ventaLineaId,
          producto_id: productoId,
          cantidad,
          precio_unitario: precioUnitario,
          subtotal,
          motivo_id: Number.isFinite(motivoId) ? motivoId : null,
          notas: notasLn,
        });
      }

      const prepSvc: {
        venta_servicio_id: number;
        servicio_nombre: string;
        cantidad: number;
        valor_unitario: number;
        subtotal: number;
        motivo_id: number | null;
        notas: string | null;
      }[] = [];

      for (const sv of serviciosIn as Record<string, unknown>[]) {
        const ventaServicioId = Number(sv.venta_servicio_id);
        const nombre = typeof sv.servicio_nombre === "string" ? sv.servicio_nombre.trim() : "";
        const cantidad = Math.max(1, Math.floor(Number(sv.cantidad ?? 1)));
        const valorUnitario = Number(sv.valor_unitario);

        if (!Number.isFinite(ventaServicioId) || !nombre) {
          throw new AppError("Línea de servicio inválida");
        }
        if (!Number.isFinite(valorUnitario) || valorUnitario < 0) {
          throw new AppError("Valor unitario inválido para servicio");
        }

        const ventaSvc = await db
          .prepare(`SELECT cantidad FROM venta_servicios WHERE id = ? AND venta_id = ?`)
          .get<{ cantidad: number }>(ventaServicioId, ventaId);
        if (!ventaSvc) throw new AppError(`Servicio de venta ${ventaServicioId} no encontrado`);

        const yaDevueltoSvc = devueltoMap.servicio[ventaServicioId] ?? 0;
        const disponibleSvc = ventaSvc.cantidad - yaDevueltoSvc;
        if (cantidad > disponibleSvc) {
          throw new AppError(
            `Cantidad a devolver (${cantidad}) excede lo disponible (${disponibleSvc}) para el servicio ${ventaServicioId}`
          );
        }

        const subtotal = valorUnitario * cantidad;
        totalDevolucion += subtotal;

        const motivoId = sv.motivo_id != null ? Number(sv.motivo_id) : null;
        const notasSv = typeof sv.notas === "string" ? sv.notas.trim() || null : null;

        prepSvc.push({
          venta_servicio_id: ventaServicioId,
          servicio_nombre: nombre,
          cantidad,
          valor_unitario: valorUnitario,
          subtotal,
          motivo_id: Number.isFinite(motivoId) ? motivoId : null,
          notas: notasSv,
        });
      }

      const clienteId = venta.cliente_id != null ? Number(venta.cliente_id) : null;

      const info = await db
        .prepare(
          `INSERT INTO devoluciones
             (venta_id, cliente_id, usuario_id, estado, motivo, notas, total_devolucion, fecha, created_at, updated_at)
           VALUES (?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ?)`
        )
        .run(ventaId, clienteId, userId, motivo, notas, totalDevolucion, now, now, now);
      const devId = Number(info.lastInsertRowid);

      const insProd = db.prepare(
        `INSERT INTO devolucion_productos
           (devolucion_id, venta_linea_id, producto_id, cantidad, precio_unitario, subtotal, motivo_id, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const p of prepProd) {
        await insProd.run(devId, p.venta_linea_id, p.producto_id, p.cantidad, p.precio_unitario, p.subtotal, p.motivo_id, p.notas);
      }

      const insSvc = db.prepare(
        `INSERT INTO devolucion_servicios
           (devolucion_id, venta_servicio_id, servicio_nombre, cantidad, valor_unitario, subtotal, motivo_id, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const s of prepSvc) {
        await insSvc.run(devId, s.venta_servicio_id, s.servicio_nombre, s.cantidad, s.valor_unitario, s.subtotal, s.motivo_id, s.notas);
      }

      await db
        .prepare(
          `INSERT INTO devolucion_auditoria (devolucion_id, usuario_id, accion, estado_anterior, estado_nuevo, created_at)
           VALUES (?, ?, 'creada', NULL, 'pendiente', ?)`
        )
        .run(devId, userId, now);

      return { devolucionId: devId };
    });

    await recordSyncEvent("devolucion", "creada", { devolucion_id: devolucionId, venta_id: ventaId });
    return await devolucionService.getById(devolucionId);
  },

  async aprobar(id: number, userId: number) {
    const dev = await db.prepare(`SELECT * FROM devoluciones WHERE id = ?`).get<DevolucionRow>(id);
    if (!dev) throw new AppError("Devolución no encontrada", 404);
    if (dev.estado !== "pendiente") throw new AppError("Solo se pueden aprobar devoluciones pendientes");

    const now = localNow();
    await db
      .prepare(`UPDATE devoluciones SET estado = 'aprobada', aprobado_por = ?, aprobado_at = ?, updated_at = ? WHERE id = ?`)
      .run(userId, now, now, id);

    await db
      .prepare(
        `INSERT INTO devolucion_auditoria (devolucion_id, usuario_id, accion, estado_anterior, estado_nuevo, created_at)
         VALUES (?, ?, 'aprobada', 'pendiente', 'aprobada', ?)`
      )
      .run(id, userId, now);

    await recordSyncEvent("devolucion", "aprobada", { devolucion_id: id });
    return await devolucionService.getById(id);
  },

  async procesar(id: number, userId: number, body?: { metodo_reembolso?: string }) {
    const dev = await db.prepare(`SELECT * FROM devoluciones WHERE id = ?`).get<DevolucionRow>(id);
    if (!dev) throw new AppError("Devolución no encontrada", 404);
    if (dev.estado !== "aprobada") throw new AppError("Solo se pueden procesar devoluciones aprobadas");

    const metodoReembolso = typeof body?.metodo_reembolso === "string" ? body.metodo_reembolso.trim() || null : null;
    const now = localNow();

    await db.transaction(async () => {
      const productosLineas = await db
        .prepare(`SELECT * FROM devolucion_productos WHERE devolucion_id = ?`)
        .all<{ producto_id: number; cantidad: number }>(id);

      const insEntrada = db.prepare(
        `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, venta_id, referencia, created_at)
         VALUES (?, 'ENTRADA', ?, ?, ?, ?)`
      );
      const updStock = db.prepare(
        `UPDATE productos SET stock = stock + ?, updated_at = ? WHERE id = ?`
      );

      for (const ln of productosLineas) {
        await updStock.run(ln.cantidad, now, ln.producto_id);
        await insEntrada.run(ln.producto_id, ln.cantidad, dev.venta_id, `devolucion:${id}`, now);
      }

      const clienteId = dev.cliente_id != null ? Number(dev.cliente_id) : null;
      const totalDevolucion = Number(dev.total_devolucion);
      const ventaTotal = Number(
        ((await db.prepare(`SELECT total FROM ventas WHERE id = ?`).get<{ total: number }>(dev.venta_id as number))?.total) ?? 0
      );

      const puntosCfg = await configuracionService.getPuntosConfig();
      if (puntosCfg.activo && clienteId != null && totalDevolucion > 0) {
        const quitarPuntos = Math.floor(totalDevolucion * puntosCfg.puntos_por_unidad_moneda);
        if (quitarPuntos > 0) {
          await db
            .prepare(`UPDATE clientes SET puntos = MAX(0, COALESCE(puntos, 0) - ?), updated_at = ? WHERE id = ?`)
            .run(quitarPuntos, now, clienteId);
        }
      }

      if (ventaTotal > 0 && totalDevolucion > 0) {
        const ratio = totalDevolucion / ventaTotal;
        if (ratio >= 0.999) {
          await commissionService.deleteByVentaId(dev.venta_id as number);
        }
      }

      await db
        .prepare(
          `UPDATE devoluciones SET estado = 'procesada', procesado_por = ?, procesado_at = ?, metodo_reembolso = ?, updated_at = ? WHERE id = ?`
        )
        .run(userId, now, metodoReembolso, now, id);

      await db
        .prepare(
          `INSERT INTO devolucion_auditoria (devolucion_id, usuario_id, accion, estado_anterior, estado_nuevo, created_at)
           VALUES (?, ?, 'procesada', 'aprobada', 'procesada', ?)`
        )
        .run(id, userId, now);
    });

    await recordSyncEvent("devolucion", "procesada", { devolucion_id: id });
    return await devolucionService.getById(id);
  },

  async rechazar(id: number, userId: number, body: { motivo: string }) {
    const dev = await db.prepare(`SELECT * FROM devoluciones WHERE id = ?`).get<DevolucionRow>(id);
    if (!dev) throw new AppError("Devolución no encontrada", 404);
    if (dev.estado !== "pendiente") throw new AppError("Solo se pueden rechazar devoluciones pendientes");

    const motivoRechazo = typeof body.motivo === "string" ? body.motivo.trim() : "";
    if (!motivoRechazo) throw new AppError("Motivo de rechazo requerido");

    const now = localNow();
    await db
      .prepare(
        `UPDATE devoluciones SET estado = 'rechazada', rechazado_por = ?, rechazado_at = ?, rechazado_motivo = ?, updated_at = ? WHERE id = ?`
      )
      .run(userId, now, motivoRechazo, now, id);

    await db
      .prepare(
        `INSERT INTO devolucion_auditoria (devolucion_id, usuario_id, accion, estado_anterior, estado_nuevo, detalle_json, created_at)
         VALUES (?, ?, 'rechazada', 'pendiente', 'rechazada', ?, ?)`
      )
      .run(id, userId, JSON.stringify({ motivo: motivoRechazo }), now);

    await recordSyncEvent("devolucion", "rechazada", { devolucion_id: id });
    return await devolucionService.getById(id);
  },

  async anular(id: number, userId: number, body: { motivo: string }) {
    const dev = await db.prepare(`SELECT * FROM devoluciones WHERE id = ?`).get<DevolucionRow>(id);
    if (!dev) throw new AppError("Devolución no encontrada", 404);

    const estadoActual = String(dev.estado);
    if (ESTADOS_TERMINALES.includes(estadoActual)) {
      throw new AppError(`No se puede anular una devolución con estado «${estadoActual}»`);
    }

    const motivoAnulacion = typeof body.motivo === "string" ? body.motivo.trim() : "";
    if (!motivoAnulacion) throw new AppError("Motivo de anulación requerido");

    const now = localNow();
    await db
      .prepare(
        `UPDATE devoluciones SET estado = 'anulada', anulado_por = ?, anulado_at = ?, anulado_motivo = ?, updated_at = ? WHERE id = ?`
      )
      .run(userId, now, motivoAnulacion, now, id);

    await db
      .prepare(
        `INSERT INTO devolucion_auditoria (devolucion_id, usuario_id, accion, estado_anterior, estado_nuevo, detalle_json, created_at)
         VALUES (?, ?, 'anulada', ?, 'anulada', ?, ?)`
      )
      .run(id, userId, estadoActual, JSON.stringify({ motivo: motivoAnulacion }), now);

    await recordSyncEvent("devolucion", "anulada", { devolucion_id: id });
    return await devolucionService.getById(id);
  },

  async kpis(desde?: string, hasta?: string) {
    let filtro = "";
    const params: string[] = [];
    if (desde) {
      filtro += ` AND substr(d.fecha, 1, 10) >= ?`;
      params.push(desde.trim().slice(0, 10));
    }
    if (hasta) {
      filtro += ` AND substr(d.fecha, 1, 10) <= ?`;
      params.push(hasta.trim().slice(0, 10));
    }

    const row = await db
      .prepare(
        `SELECT
           COUNT(*)                                                           AS total_devoluciones,
           COALESCE(SUM(CASE WHEN d.estado = 'procesada' THEN d.total_devolucion ELSE 0 END), 0) AS monto_total_devuelto,
           COALESCE(SUM(CASE WHEN d.estado = 'pendiente' THEN 1 ELSE 0 END), 0) AS pendientes_count,
           CASE WHEN COUNT(*) > 0
             THEN ROUND(
               CAST(SUM(CASE WHEN d.estado IN ('aprobada','procesada') THEN 1 ELSE 0 END) AS REAL) /
               CAST(COUNT(*) AS REAL) * 100, 1)
             ELSE 0
           END AS tasa_aprobacion
         FROM devoluciones d
         WHERE 1=1 ${filtro}`
      )
      .get<Record<string, number>>(...params);

    return row ?? { total_devoluciones: 0, monto_total_devuelto: 0, pendientes_count: 0, tasa_aprobacion: 0 };
  },

  async devueltoPorVentaLinea(ventaId: number): Promise<{
    producto: Record<number, number>;
    servicio: Record<number, number>;
  }> {
    const prodRows = await db
      .prepare(
        `SELECT dp.venta_linea_id, SUM(dp.cantidad) AS devuelto
         FROM devolucion_productos dp
         JOIN devoluciones d ON d.id = dp.devolucion_id
         WHERE d.venta_id = ? AND d.estado NOT IN ('rechazada', 'anulada')
         GROUP BY dp.venta_linea_id`
      )
      .all<{ venta_linea_id: number; devuelto: number }>(ventaId);

    const svcRows = await db
      .prepare(
        `SELECT ds.venta_servicio_id, SUM(ds.cantidad) AS devuelto
         FROM devolucion_servicios ds
         JOIN devoluciones d ON d.id = ds.devolucion_id
         WHERE d.venta_id = ? AND d.estado NOT IN ('rechazada', 'anulada')
         GROUP BY ds.venta_servicio_id`
      )
      .all<{ venta_servicio_id: number; devuelto: number }>(ventaId);

    const producto: Record<number, number> = {};
    for (const r of prodRows) producto[r.venta_linea_id] = r.devuelto;

    const servicio: Record<number, number> = {};
    for (const r of svcRows) servicio[r.venta_servicio_id] = r.devuelto;

    return { producto, servicio };
  },

  async motivos() {
    return await db
      .prepare(`SELECT * FROM devolucion_motivos WHERE activo = 1 ORDER BY id`)
      .all();
  },
};
