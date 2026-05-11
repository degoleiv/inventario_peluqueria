import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";
import { configuracionService } from "./configuracion.service.js";
import { commissionService } from "./commission.service.js";

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export const ventaService = {
  async list(desde?: string, hasta?: string) {
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
    return await db.prepare(sql).all(...params);
  },

  async getById(id: number) {
    const venta = await db
      .prepare(
        `SELECT v.*, c.nombre AS cliente_nombre, u.nombre AS vendedor_nombre
         FROM ventas v
         LEFT JOIN clientes c ON c.id = v.cliente_id
         LEFT JOIN usuarios u ON u.id = v.usuario_id
         WHERE v.id = ?`
      )
      .get(id);
    if (!venta) throw new AppError("no encontrado", 404);
    const lineas = await db
      .prepare(
        `SELECT vl.*, p.nombre AS producto_nombre
         FROM venta_lineas vl
         JOIN productos p ON p.id = vl.producto_id
         WHERE vl.venta_id = ?`
      )
      .all(id);
    const servicios = await db
      .prepare(
        `SELECT vs.*, u.nombre AS profesional_nombre
         FROM venta_servicios vs
         LEFT JOIN usuarios u ON u.id = vs.usuario_id
         WHERE vs.venta_id = ?`
      )
      .all(id);
    return { ...venta, lineas, servicios };
  },

  async create(body: Record<string, unknown>) {
    const lineasIn = Array.isArray(body.lineas) ? body.lineas : [];
    const serviciosIn = Array.isArray(body.servicios) ? body.servicios : [];
    if (lineasIn.length === 0 && serviciosIn.length === 0) {
      throw new AppError("Debe incluir al menos un producto o un servicio realizado");
    }

    const citaIdRaw = body.cita_id;
    const citaIdPre =
      citaIdRaw != null && Number.isFinite(Number(citaIdRaw)) && Number(citaIdRaw) > 0
        ? Math.floor(Number(citaIdRaw))
        : null;

    if (citaIdPre != null) {
      const yaVenta = (await db
        .prepare(
          `SELECT id FROM ventas WHERE cita_id = ? AND IFNULL(estado,'confirmada') != 'cancelada' LIMIT 1`
        )
        .get(citaIdPre)) as { id: number } | undefined;
      if (yaVenta) {
        throw new AppError(
          `Esta cita ya fue cobrada en la venta #${yaVenta.id}. Anulá esa venta primero si necesitás re-cobrarla.`
        );
      }
      const existeCita = (await db
        .prepare(`SELECT id FROM citas WHERE id = ?`)
        .get(citaIdPre)) as { id: number } | undefined;
      if (!existeCita) throw new AppError("La cita asociada no existe", 404);
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
    const vu = (await db
      .prepare(`SELECT id FROM usuarios WHERE id = ? AND activo = 1`)
      .get(usuario_id)) as { id: number } | undefined;
    if (!vu) throw new AppError("Vendedor no encontrado o inactivo");

    const insVenta = db.prepare(
      `INSERT INTO ventas (cliente_id, fecha, total, metodo_pago, notas, created_at, descuento_puntos, puntos_canjeados, usuario_id, cita_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    const insServicio = db.prepare(
      `INSERT INTO venta_servicios (venta_id, cita_id, servicio_nombre, usuario_id, cantidad, valor_unitario, subtotal, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    );
    const insMov = db.prepare(
      `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, venta_id, referencia, created_at)
       VALUES (?, 'SALIDA', ?, ?, ?, ?)`
    );

    const { ventaId, puntosOtorgados } = await db.transaction(async () => {
      let totalBruto = 0;
      const prepared: {
        producto_id: number;
        cantidad: number;
        precio_unitario: number;
        subtotal: number;
      }[] = [];
      const preparedServicios: {
        servicio_nombre: string;
        usuario_id: number | null;
        cantidad: number;
        valor_unitario: number;
        subtotal: number;
      }[] = [];

      const today = todayISODate();

      for (const sv of serviciosIn as Record<string, unknown>[]) {
        const nombre =
          typeof sv.servicio_nombre === "string"
            ? sv.servicio_nombre.trim()
            : typeof sv.nombre === "string"
              ? sv.nombre.trim()
              : "";
        if (!nombre) {
          throw new AppError("Cada servicio realizado debe tener un nombre");
        }
        const cantidad = Math.max(1, Math.floor(Number(sv.cantidad ?? 1)));
        const valorUnitario = Math.max(0, Number(sv.valor_unitario ?? 0));
        if (!Number.isFinite(valorUnitario)) {
          throw new AppError(`Valor inválido para el servicio «${nombre}»`);
        }
        let usuarioServ: number | null = null;
        if (sv.usuario_id != null && sv.usuario_id !== "") {
          const n = Number(sv.usuario_id);
          if (Number.isFinite(n)) usuarioServ = Math.floor(n);
        }
        const subtotalServ = valorUnitario * cantidad;
        totalBruto += subtotalServ;
        preparedServicios.push({
          servicio_nombre: nombre,
          usuario_id: usuarioServ,
          cantidad,
          valor_unitario: valorUnitario,
          subtotal: subtotalServ,
        });
      }

      for (const ln of lineasIn as Record<string, unknown>[]) {
        const producto_id = Number(ln.producto_id);
        const cantidad = Math.floor(Number(ln.cantidad));
        if (!Number.isFinite(producto_id) || cantidad <= 0) {
          throw new AppError("Línea inválida (producto o cantidad)");
        }
        const prod = (await db
          .prepare(
            `SELECT stock, precio, precio_venta, nombre, fecha_vencimiento, estado FROM productos WHERE id = ?`
          )
          .get(producto_id)) as
          | {
              stock: number;
              precio: number | null;
              precio_venta: number | null;
              nombre: string;
              fecha_vencimiento: string | null;
              estado: string | null;
            }
          | undefined;
        if (!prod) throw new AppError(`Producto ${producto_id} no existe`);
        if (prod.estado === "inactivo") {
          throw new AppError(`El producto «${prod.nombre}» está inactivo y no puede venderse`);
        }
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

      const valorRedencion = await configuracionService.getPuntosValorRedencion();
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
        const cli = (await db.prepare(`SELECT puntos FROM clientes WHERE id = ?`).get(clienteIdPre)) as
          | { puntos: number }
          | undefined;
        if (!cli) throw new AppError("Cliente no existe");
        const maxPtsPorMonto = Math.floor(totalBruto / valorRedencion + 1e-12);
        const usar = Math.min(reqCanje, Math.max(0, cli.puntos), maxPtsPorMonto);
        if (usar > 0) {
          descuentoPuntos = Math.min(usar * valorRedencion, totalBruto);
          puntosCanjeadosEfectivos = usar;
          const quitarPts = db.prepare(
            `UPDATE clientes SET puntos = puntos - ?, updated_at = ? WHERE id = ? AND puntos >= ?`
          );
          const ch = await quitarPts.run(usar, now, clienteIdPre, usar);
          if (ch.changes === 0) {
            throw new AppError("Puntos insuficientes para canje");
          }
        }
      }

      const totalFinal = Math.max(0, totalBruto - descuentoPuntos);

      const info = await insVenta.run(
        clienteIdPre,
        fechaVenta,
        totalFinal,
        typeof body.metodo_pago === "string" && body.metodo_pago ? body.metodo_pago : "efectivo",
        typeof body.notas === "string" ? body.notas || null : null,
        now,
        descuentoPuntos,
        puntosCanjeadosEfectivos,
        usuario_id,
        citaIdPre
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
        await insLine.run(vid, pl.producto_id, pl.cantidad, pl.precio_unitario, pl.subtotal);
        await updStock.run(pl.cantidad, now, pl.producto_id);
        await insMov.run(
          pl.producto_id,
          pl.cantidad,
          vid,
          `venta:${vid}`,
          now
        );
      }

      for (const sv of preparedServicios) {
        await insServicio.run(
          vid,
          citaIdPre,
          sv.servicio_nombre,
          sv.usuario_id,
          sv.cantidad,
          sv.valor_unitario,
          sv.subtotal,
          now
        );
      }

      const clienteId = clienteIdPre;
      let puntosOtorgados = 0;
      const puntosCfg = await configuracionService.getPuntosConfig();
      if (puntosCfg.activo && clienteId != null && totalFinal > 0) {
        puntosOtorgados = Math.floor(totalFinal * puntosCfg.puntos_por_unidad_moneda);
        if (puntosOtorgados > 0) {
          const updPts = db.prepare(
            `UPDATE clientes SET puntos = COALESCE(puntos, 0) + ?, updated_at = ? WHERE id = ?`
          );
          const ch = await updPts.run(puntosOtorgados, now, clienteId);
          if (ch.changes === 0) {
            throw new AppError("Cliente de la venta no existe");
          }
        }
      }

      await commissionService.insertForVenta(vid, usuario_id, totalFinal, fechaVenta);

      await recordSyncEvent("venta", "creada", {
        venta_id: vid,
        cita_id: citaIdPre,
        total: totalFinal,
        total_bruto: totalBruto,
        descuento_puntos: descuentoPuntos,
        lineas: prepared.length,
        servicios: preparedServicios.length,
        puntos_otorgados: puntosOtorgados,
        puntos_canjeados: puntosCanjeadosEfectivos,
      });
      return { ventaId: vid, puntosOtorgados };
    });

    const detalle = await ventaService.getById(ventaId);
    return { ...detalle, puntos_otorgados: puntosOtorgados };
  },

  async cancelar(
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

    const venta = (await db.prepare(`SELECT * FROM ventas WHERE id = ?`).get(id)) as
      | Record<string, unknown>
      | undefined;
    if (!venta) throw new AppError("no encontrado", 404);

    const estadoActual = String(venta.estado ?? "confirmada");
    if (estadoActual === "cancelada") {
      throw new AppError("La venta ya está cancelada");
    }

    const lineas = (await db
      .prepare(`SELECT producto_id, cantidad FROM venta_lineas WHERE venta_id = ?`)
      .all(id)) as { producto_id: number; cantidad: number }[];

    const now = new Date().toISOString();

    await db.transaction(async () => {
      await commissionService.deleteByVentaId(id);

      const insEntrada = db.prepare(
        `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, venta_id, referencia, created_at)
         VALUES (?, 'ENTRADA', ?, ?, ?, ?)`
      );
      const updStock = db.prepare(
        `UPDATE productos SET stock = stock + ?, updated_at = ? WHERE id = ?`
      );

      for (const ln of lineas) {
        await updStock.run(ln.cantidad, now, ln.producto_id);
        await insEntrada.run(
          ln.producto_id,
          ln.cantidad,
          id,
          `anulacion_venta:${id}`,
          now
        );
      }

      await db
        .prepare(
          `UPDATE ventas SET estado = 'cancelada', cancelado_por = ?, cancelado_motivo = ?, cancelado_at = ? WHERE id = ?`
        )
        .run(por, motivo, now, id);

      const clienteId =
        venta.cliente_id != null ? Number(venta.cliente_id) : null;
      const totalFinal = Number(venta.total);
      const puntosCfg = await configuracionService.getPuntosConfig();
      if (puntosCfg.activo && clienteId != null && totalFinal > 0) {
        const quitar = Math.floor(totalFinal * puntosCfg.puntos_por_unidad_moneda);
        if (quitar > 0) {
          await db
            .prepare(
              `UPDATE clientes SET puntos = MAX(0, COALESCE(puntos, 0) - ?), updated_at = ? WHERE id = ?`
            )
            .run(quitar, now, clienteId);
        }
      }
    });

    await recordSyncEvent("venta", "cancelada", { venta_id: id, cancelado_por: por });
    return await ventaService.getById(id);
  },
};
