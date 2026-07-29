import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";
import { localNow, localToday } from "../lib/localDate.js";
import { configuracionService } from "./configuracion.service.js";
import { commissionService } from "./commission.service.js";
import { descuentoService, type DescuentoTipo } from "./descuento.service.js";

export const ventaService = {
  async list(desde?: string, hasta?: string) {
    let sql = `SELECT v.*, c.nombre AS cliente_nombre, u.nombre AS vendedor_nombre,
               (SELECT COUNT(*) FROM venta_lineas vl WHERE vl.venta_id = v.id) AS num_lineas,
               (SELECT COALESCE(SUM(vl.cantidad), 0) FROM venta_lineas vl WHERE vl.venta_id = v.id) AS unidades_productos,
               (SELECT COUNT(*) FROM venta_servicios vs WHERE vs.venta_id = v.id) AS num_servicios,
               (SELECT GROUP_CONCAT(p.nombre, ' · ')
                  FROM venta_lineas vl
                  JOIN productos p ON p.id = vl.producto_id
                 WHERE vl.venta_id = v.id) AS resumen_productos,
               (SELECT GROUP_CONCAT(vs.servicio_nombre, ' · ')
                  FROM venta_servicios vs
                 WHERE vs.venta_id = v.id) AS resumen_servicios
               FROM ventas v
               LEFT JOIN clientes c ON c.id = v.cliente_id
               LEFT JOIN usuarios u ON u.id = v.usuario_id`;
    const params: string[] = [];
    // Comparar por día calendario (fecha guardada suele ser ISO con hora).
    if (desde) {
      sql += ` WHERE date(v.fecha) >= date(?)`;
      params.push(desde);
      if (hasta) {
        sql += ` AND date(v.fecha) <= date(?)`;
        params.push(hasta);
      }
    } else if (hasta) {
      sql += ` WHERE date(v.fecha) <= date(?)`;
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
    const descuentos_aplicados = await db
      .prepare(
        `SELECT da.*, d.nombre AS descuento_nombre, p.nombre AS producto_nombre
         FROM descuento_aplicaciones da
         LEFT JOIN descuentos d  ON d.id = da.descuento_id
         LEFT JOIN productos  p  ON p.id = da.producto_id
         WHERE da.venta_id = ?
         ORDER BY da.id ASC`
      )
      .all(id);
    return { ...venta, lineas, servicios, descuentos_aplicados };
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
    const now = localNow();
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
      `INSERT INTO ventas (cliente_id, fecha, total, metodo_pago, notas, created_at, descuento_puntos, puntos_canjeados, usuario_id, cita_id, descuento_total, descuento_manual, descuento_manual_motivo)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
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

      const today = localToday();

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

      // ── Descuentos configurados + manual ─────────────────────────────
      let manualIn: { tipo: DescuentoTipo; valor: number; motivo: string | null } | null = null;
      const rawManual = body.descuento_manual as Record<string, unknown> | undefined | null;
      if (rawManual && typeof rawManual === "object") {
        const t = rawManual.tipo;
        const v = Number(rawManual.valor);
        if ((t === "porcentaje" || t === "monto") && Number.isFinite(v) && v > 0) {
          if (t === "porcentaje" && v > 100) {
            throw new AppError("El descuento manual en % no puede superar 100");
          }
          manualIn = {
            tipo: t,
            valor: v,
            motivo: typeof rawManual.motivo === "string" ? rawManual.motivo.trim() || null : null,
          };
        }
      }

      const calc = await descuentoService.calcular({
        cliente_id: clienteIdPre,
        lineas: prepared.map((p) => ({
          producto_id: p.producto_id,
          cantidad: p.cantidad,
          precio_unitario: p.precio_unitario,
        })),
        servicios: preparedServicios.map((s) => ({
          cantidad: s.cantidad,
          valor_unitario: s.valor_unitario,
        })),
        manual: manualIn,
      });
      const descuentoTotalCfg = calc.total_descuento;
      const totalBrutoTrasDescuentos = Math.max(0, totalBruto - descuentoTotalCfg);
      const descuentoManualMonto = calc.aplicados
        .filter((a) => a.origen === "manual")
        .reduce((acc, a) => acc + a.monto, 0);

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
        totalBrutoTrasDescuentos > 0
      ) {
        const cli = (await db.prepare(`SELECT puntos FROM clientes WHERE id = ?`).get(clienteIdPre)) as
          | { puntos: number }
          | undefined;
        if (!cli) throw new AppError("Cliente no existe");
        const maxPtsPorMonto = Math.floor(totalBrutoTrasDescuentos / valorRedencion + 1e-12);
        const usar = Math.min(reqCanje, Math.max(0, cli.puntos), maxPtsPorMonto);
        if (usar > 0) {
          descuentoPuntos = Math.min(usar * valorRedencion, totalBrutoTrasDescuentos);
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

      const totalFinal = Math.max(0, totalBrutoTrasDescuentos - descuentoPuntos);

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
        citaIdPre,
        descuentoTotalCfg,
        descuentoManualMonto,
        manualIn?.motivo ?? null
      );
      const vid = Number(info.lastInsertRowid);
      await descuentoService.registrarAplicaciones(vid, clienteIdPre, calc.aplicados);

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
        descuento_total: descuentoTotalCfg,
        descuento_manual: descuentoManualMonto,
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

    const now = localNow();

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
