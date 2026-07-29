import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";
import { localNow, localToday } from "../lib/localDate.js";

export type DescuentoAlcance = "cliente" | "producto";
export type DescuentoTipo = "porcentaje" | "monto";

export type DescuentoRow = {
  id: number;
  alcance: DescuentoAlcance;
  cliente_id: number | null;
  producto_id: number | null;
  tipo: DescuentoTipo;
  valor: number;
  nombre: string;
  descripcion: string | null;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  activo: number;
  creado_por: number | null;
  created_at: string;
  updated_at: string;
};

export type DescuentoInput = {
  alcance: DescuentoAlcance;
  cliente_id?: number | null;
  producto_id?: number | null;
  tipo: DescuentoTipo;
  valor: number;
  nombre: string;
  descripcion?: string | null;
  vigente_desde?: string | null;
  vigente_hasta?: string | null;
  activo?: boolean;
};

/** Descuento ya calculado (monto real que se resta del subtotal). */
export type DescuentoAplicado = {
  descuento_id: number | null;
  origen: "cliente" | "producto" | "manual";
  tipo: DescuentoTipo;
  valor: number;
  monto: number;
  descripcion: string;
  producto_id: number | null;
  cliente_id: number | null;
};

function normalizarInput(body: Record<string, unknown>): DescuentoInput {
  const alcance = body.alcance;
  if (alcance !== "cliente" && alcance !== "producto") {
    throw new AppError("alcance debe ser 'cliente' o 'producto'");
  }
  const tipo = body.tipo;
  if (tipo !== "porcentaje" && tipo !== "monto") {
    throw new AppError("tipo debe ser 'porcentaje' o 'monto'");
  }
  const valor = Number(body.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new AppError("valor debe ser un número mayor que 0");
  }
  if (tipo === "porcentaje" && valor > 100) {
    throw new AppError("Un descuento en % no puede superar 100");
  }
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  if (!nombre) throw new AppError("nombre requerido");

  const cliente_id =
    body.cliente_id != null && body.cliente_id !== ""
      ? Math.floor(Number(body.cliente_id))
      : null;
  const producto_id =
    body.producto_id != null && body.producto_id !== ""
      ? Math.floor(Number(body.producto_id))
      : null;

  if (alcance === "cliente" && (cliente_id == null || !Number.isFinite(cliente_id))) {
    throw new AppError("Debe indicar el cliente para un descuento por cliente");
  }
  if (alcance === "producto" && (producto_id == null || !Number.isFinite(producto_id))) {
    throw new AppError("Debe indicar el producto para un descuento por producto");
  }

  return {
    alcance,
    cliente_id: alcance === "cliente" ? cliente_id : null,
    producto_id: alcance === "producto" ? producto_id : null,
    tipo,
    valor,
    nombre,
    descripcion:
      typeof body.descripcion === "string" && body.descripcion.trim()
        ? body.descripcion.trim()
        : null,
    vigente_desde:
      typeof body.vigente_desde === "string" && body.vigente_desde.trim()
        ? body.vigente_desde.trim().slice(0, 10)
        : null,
    vigente_hasta:
      typeof body.vigente_hasta === "string" && body.vigente_hasta.trim()
        ? body.vigente_hasta.trim().slice(0, 10)
        : null,
    activo: body.activo == null ? true : Boolean(body.activo),
  };
}

async function auditar(
  descuentoId: number | null,
  usuarioId: number | null | undefined,
  accion: string,
  detalle?: Record<string, unknown>
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO descuento_auditoria (descuento_id, usuario_id, accion, detalle_json, created_at)
       VALUES (?,?,?,?,?)`
    )
    .run(
      descuentoId,
      usuarioId ?? null,
      accion,
      detalle ? JSON.stringify(detalle) : null,
      localNow()
    );
}

export const descuentoService = {
  async list(params?: {
    alcance?: DescuentoAlcance | "todos";
    cliente_id?: number;
    producto_id?: number;
    incluir_inactivos?: boolean;
    search?: string;
  }) {
    let sql = `SELECT d.*,
                 c.nombre AS cliente_nombre,
                 p.nombre AS producto_nombre,
                 u.nombre AS creado_por_nombre
               FROM descuentos d
               LEFT JOIN clientes  c ON c.id = d.cliente_id
               LEFT JOIN productos p ON p.id = d.producto_id
               LEFT JOIN usuarios  u ON u.id = d.creado_por`;
    const conds: string[] = [];
    const args: unknown[] = [];

    if (params?.alcance && params.alcance !== "todos") {
      conds.push(`d.alcance = ?`);
      args.push(params.alcance);
    }
    if (params?.cliente_id != null) {
      conds.push(`d.cliente_id = ?`);
      args.push(params.cliente_id);
    }
    if (params?.producto_id != null) {
      conds.push(`d.producto_id = ?`);
      args.push(params.producto_id);
    }
    if (!params?.incluir_inactivos) {
      conds.push(`d.activo = 1`);
    }
    if (params?.search?.trim()) {
      const like = `%${params.search.trim().toLowerCase()}%`;
      conds.push(
        `(LOWER(d.nombre) LIKE ? OR LOWER(IFNULL(c.nombre,'')) LIKE ? OR LOWER(IFNULL(p.nombre,'')) LIKE ?)`
      );
      args.push(like, like, like);
    }

    if (conds.length) sql += ` WHERE ` + conds.join(` AND `);
    sql += ` ORDER BY d.activo DESC, d.updated_at DESC`;
    return db.prepare(sql).all(...args);
  },

  async getById(id: number) {
    const row = await db
      .prepare(
        `SELECT d.*,
                c.nombre AS cliente_nombre,
                p.nombre AS producto_nombre,
                u.nombre AS creado_por_nombre
         FROM descuentos d
         LEFT JOIN clientes  c ON c.id = d.cliente_id
         LEFT JOIN productos p ON p.id = d.producto_id
         LEFT JOIN usuarios  u ON u.id = d.creado_por
         WHERE d.id = ?`
      )
      .get(id);
    if (!row) throw new AppError("Descuento no encontrado", 404);
    return row;
  },

  async create(body: Record<string, unknown>, usuarioId: number | null | undefined) {
    const input = normalizarInput(body);
    const now = localNow();

    if (input.alcance === "cliente" && input.cliente_id != null) {
      const cli = await db
        .prepare(`SELECT id FROM clientes WHERE id = ?`)
        .get<{ id: number }>(input.cliente_id);
      if (!cli) throw new AppError("Cliente no existe", 404);
    }
    if (input.alcance === "producto" && input.producto_id != null) {
      const p = await db
        .prepare(`SELECT id FROM productos WHERE id = ?`)
        .get<{ id: number }>(input.producto_id);
      if (!p) throw new AppError("Producto no existe", 404);
    }

    const info = await db
      .prepare(
        `INSERT INTO descuentos
           (alcance, cliente_id, producto_id, tipo, valor, nombre, descripcion,
            vigente_desde, vigente_hasta, activo, creado_por, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        input.alcance,
        input.cliente_id,
        input.producto_id,
        input.tipo,
        input.valor,
        input.nombre,
        input.descripcion,
        input.vigente_desde,
        input.vigente_hasta,
        input.activo ? 1 : 0,
        usuarioId ?? null,
        now,
        now
      );
    const id = Number(info.lastInsertRowid);
    await auditar(id, usuarioId, "crear", { ...input });
    await recordSyncEvent("descuento", "creado", { descuento_id: id });
    return descuentoService.getById(id);
  },

  async update(
    id: number,
    body: Record<string, unknown>,
    usuarioId: number | null | undefined
  ) {
    const actual = (await db
      .prepare(`SELECT * FROM descuentos WHERE id = ?`)
      .get<DescuentoRow>(id));
    if (!actual) throw new AppError("Descuento no encontrado", 404);

    const input = normalizarInput({
      alcance: body.alcance ?? actual.alcance,
      cliente_id:
        body.cliente_id !== undefined ? body.cliente_id : actual.cliente_id,
      producto_id:
        body.producto_id !== undefined ? body.producto_id : actual.producto_id,
      tipo: body.tipo ?? actual.tipo,
      valor: body.valor != null ? body.valor : actual.valor,
      nombre: body.nombre ?? actual.nombre,
      descripcion:
        body.descripcion !== undefined ? body.descripcion : actual.descripcion,
      vigente_desde:
        body.vigente_desde !== undefined ? body.vigente_desde : actual.vigente_desde,
      vigente_hasta:
        body.vigente_hasta !== undefined ? body.vigente_hasta : actual.vigente_hasta,
      activo: body.activo !== undefined ? body.activo : actual.activo === 1,
    });

    const now = localNow();
    await db
      .prepare(
        `UPDATE descuentos SET
            alcance = ?, cliente_id = ?, producto_id = ?, tipo = ?, valor = ?,
            nombre = ?, descripcion = ?, vigente_desde = ?, vigente_hasta = ?,
            activo = ?, updated_at = ?
          WHERE id = ?`
      )
      .run(
        input.alcance,
        input.cliente_id,
        input.producto_id,
        input.tipo,
        input.valor,
        input.nombre,
        input.descripcion,
        input.vigente_desde,
        input.vigente_hasta,
        input.activo ? 1 : 0,
        now,
        id
      );

    await auditar(id, usuarioId, "editar", {
      anterior: {
        tipo: actual.tipo,
        valor: actual.valor,
        activo: actual.activo === 1,
        nombre: actual.nombre,
      },
      nuevo: input,
    });
    await recordSyncEvent("descuento", "editado", { descuento_id: id });
    return descuentoService.getById(id);
  },

  async patchEstado(
    id: number,
    activo: boolean,
    usuarioId: number | null | undefined
  ) {
    const actual = (await db
      .prepare(`SELECT id, activo FROM descuentos WHERE id = ?`)
      .get<{ id: number; activo: number }>(id));
    if (!actual) throw new AppError("Descuento no encontrado", 404);
    const now = localNow();
    await db
      .prepare(`UPDATE descuentos SET activo = ?, updated_at = ? WHERE id = ?`)
      .run(activo ? 1 : 0, now, id);
    await auditar(id, usuarioId, activo ? "activar" : "desactivar");
    await recordSyncEvent("descuento", activo ? "activado" : "desactivado", {
      descuento_id: id,
    });
    return descuentoService.getById(id);
  },

  async remove(id: number, usuarioId: number | null | undefined) {
    const actual = await db
      .prepare(`SELECT id, nombre FROM descuentos WHERE id = ?`)
      .get<{ id: number; nombre: string }>(id);
    if (!actual) throw new AppError("Descuento no encontrado", 404);
    await auditar(id, usuarioId, "eliminar", { nombre: actual.nombre });
    await db.prepare(`DELETE FROM descuentos WHERE id = ?`).run(id);
    await recordSyncEvent("descuento", "eliminado", { descuento_id: id });
  },

  /**
   * Devuelve los descuentos vigentes para un cliente / conjunto de productos, para uso en el POS.
   * Devuelve los descuentos activos y vigentes; el cálculo del monto lo hace el servicio de ventas.
   */
  async vigentesParaVenta(params: {
    cliente_id?: number | null;
    producto_ids?: number[];
  }) {
    const today = localToday();
    const rows: DescuentoRow[] = [];
    if (params.cliente_id != null) {
      const r = (await db
        .prepare(
          `SELECT * FROM descuentos
            WHERE alcance = 'cliente' AND activo = 1 AND cliente_id = ?
              AND (vigente_desde IS NULL OR vigente_desde <= ?)
              AND (vigente_hasta IS NULL OR vigente_hasta >= ?)`
        )
        .all<DescuentoRow>(params.cliente_id, today, today));
      rows.push(...r);
    }
    if (params.producto_ids && params.producto_ids.length > 0) {
      const placeholders = params.producto_ids.map(() => "?").join(",");
      const r = (await db
        .prepare(
          `SELECT * FROM descuentos
            WHERE alcance = 'producto' AND activo = 1
              AND producto_id IN (${placeholders})
              AND (vigente_desde IS NULL OR vigente_desde <= ?)
              AND (vigente_hasta IS NULL OR vigente_hasta >= ?)`
        )
        .all<DescuentoRow>(...params.producto_ids, today, today));
      rows.push(...r);
    }
    return rows;
  },

  /**
   * Calcula descuentos aplicables. NO persiste — sólo devuelve una previsualización.
   * Regla:
   *  - Descuentos por producto se aplican sobre el subtotal del producto en el carrito.
   *  - Descuento por cliente se aplica sobre el subtotal restante (post-descuentos-producto).
   *  - Descuento manual (si viene) se aplica al final, sin superar el remanente.
   */
  async calcular(params: {
    cliente_id: number | null;
    lineas: Array<{ producto_id: number; cantidad: number; precio_unitario: number }>;
    servicios?: Array<{ valor_unitario: number; cantidad: number }>;
    manual?: { tipo: DescuentoTipo; valor: number; motivo?: string | null } | null;
  }): Promise<{
    subtotal: number;
    aplicados: DescuentoAplicado[];
    total_descuento: number;
    total_final: number;
  }> {
    const subtotalProductos = params.lineas.reduce(
      (acc, l) => acc + Number(l.precio_unitario) * Math.max(1, Math.floor(Number(l.cantidad))),
      0
    );
    const subtotalServicios = (params.servicios ?? []).reduce(
      (acc, s) => acc + Number(s.valor_unitario) * Math.max(1, Math.floor(Number(s.cantidad))),
      0
    );
    const subtotal = subtotalProductos + subtotalServicios;

    const producto_ids = [...new Set(params.lineas.map((l) => Number(l.producto_id)).filter(Number.isFinite))];
    const vigentes = await descuentoService.vigentesParaVenta({
      cliente_id: params.cliente_id ?? null,
      producto_ids,
    });

    const porProducto = new Map<number, DescuentoRow>();
    let descuentoCliente: DescuentoRow | null = null;
    for (const d of vigentes) {
      if (d.alcance === "producto" && d.producto_id != null) {
        // Si hay más de un descuento por producto vigente (raro), nos quedamos con el mejor (mayor monto teórico).
        const prev = porProducto.get(d.producto_id);
        if (!prev) porProducto.set(d.producto_id, d);
      } else if (d.alcance === "cliente" && d.cliente_id != null) {
        if (!descuentoCliente) descuentoCliente = d;
      }
    }

    const aplicados: DescuentoAplicado[] = [];
    let acumulado = 0;

    // 1) Descuentos por producto
    for (const l of params.lineas) {
      const d = porProducto.get(Number(l.producto_id));
      if (!d) continue;
      const subtotalLinea = Number(l.precio_unitario) * Math.max(1, Math.floor(Number(l.cantidad)));
      const monto =
        d.tipo === "porcentaje"
          ? subtotalLinea * (d.valor / 100)
          : Math.min(d.valor, subtotalLinea);
      const montoRedondeado = Math.max(0, Math.round(monto));
      if (montoRedondeado <= 0) continue;
      aplicados.push({
        descuento_id: d.id,
        origen: "producto",
        tipo: d.tipo,
        valor: d.valor,
        monto: montoRedondeado,
        descripcion: d.nombre,
        producto_id: Number(l.producto_id),
        cliente_id: null,
      });
      acumulado += montoRedondeado;
    }

    // 2) Descuento por cliente
    if (descuentoCliente) {
      const base = Math.max(0, subtotal - acumulado);
      const monto =
        descuentoCliente.tipo === "porcentaje"
          ? base * (descuentoCliente.valor / 100)
          : Math.min(descuentoCliente.valor, base);
      const montoRedondeado = Math.max(0, Math.round(monto));
      if (montoRedondeado > 0) {
        aplicados.push({
          descuento_id: descuentoCliente.id,
          origen: "cliente",
          tipo: descuentoCliente.tipo,
          valor: descuentoCliente.valor,
          monto: montoRedondeado,
          descripcion: descuentoCliente.nombre,
          producto_id: null,
          cliente_id: descuentoCliente.cliente_id,
        });
        acumulado += montoRedondeado;
      }
    }

    // 3) Descuento manual (POS)
    if (params.manual && params.manual.valor > 0) {
      const base = Math.max(0, subtotal - acumulado);
      const monto =
        params.manual.tipo === "porcentaje"
          ? base * (params.manual.valor / 100)
          : Math.min(params.manual.valor, base);
      const montoRedondeado = Math.max(0, Math.round(monto));
      if (montoRedondeado > 0) {
        aplicados.push({
          descuento_id: null,
          origen: "manual",
          tipo: params.manual.tipo,
          valor: params.manual.valor,
          monto: montoRedondeado,
          descripcion: params.manual.motivo?.trim() || "Descuento manual",
          producto_id: null,
          cliente_id: params.cliente_id ?? null,
        });
        acumulado += montoRedondeado;
      }
    }

    const total_descuento = Math.min(subtotal, acumulado);
    const total_final = Math.max(0, subtotal - total_descuento);
    return { subtotal, aplicados, total_descuento, total_final };
  },

  /** Persiste las aplicaciones a una venta. */
  async registrarAplicaciones(
    ventaId: number,
    clienteId: number | null,
    aplicados: DescuentoAplicado[]
  ) {
    if (aplicados.length === 0) return;
    const now = localNow();
    const ins = db.prepare(
      `INSERT INTO descuento_aplicaciones
         (venta_id, descuento_id, origen, tipo, valor, monto_aplicado, descripcion, producto_id, cliente_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    for (const a of aplicados) {
      await ins.run(
        ventaId,
        a.descuento_id,
        a.origen,
        a.tipo,
        a.valor,
        a.monto,
        a.descripcion,
        a.producto_id,
        a.cliente_id ?? clienteId,
        now
      );
    }
  },

  async historialAplicaciones(params?: {
    desde?: string;
    hasta?: string;
    cliente_id?: number;
    descuento_id?: number;
    origen?: "cliente" | "producto" | "manual";
    limit?: number;
  }) {
    let sql = `SELECT a.*,
                 v.fecha AS venta_fecha, v.total AS venta_total,
                 c.nombre AS cliente_nombre,
                 p.nombre AS producto_nombre,
                 d.nombre AS descuento_nombre
               FROM descuento_aplicaciones a
               LEFT JOIN ventas v      ON v.id = a.venta_id
               LEFT JOIN clientes c    ON c.id = a.cliente_id
               LEFT JOIN productos p   ON p.id = a.producto_id
               LEFT JOIN descuentos d  ON d.id = a.descuento_id`;
    const conds: string[] = [];
    const args: unknown[] = [];
    if (params?.desde) {
      conds.push(`substr(a.created_at, 1, 10) >= ?`);
      args.push(params.desde.trim().slice(0, 10));
    }
    if (params?.hasta) {
      conds.push(`substr(a.created_at, 1, 10) <= ?`);
      args.push(params.hasta.trim().slice(0, 10));
    }
    if (params?.cliente_id != null) {
      conds.push(`a.cliente_id = ?`);
      args.push(params.cliente_id);
    }
    if (params?.descuento_id != null) {
      conds.push(`a.descuento_id = ?`);
      args.push(params.descuento_id);
    }
    if (params?.origen) {
      conds.push(`a.origen = ?`);
      args.push(params.origen);
    }
    if (conds.length) sql += ` WHERE ` + conds.join(` AND `);
    sql += ` ORDER BY a.created_at DESC LIMIT ?`;
    args.push(Math.min(500, Math.max(1, params?.limit ?? 200)));
    return db.prepare(sql).all(...args);
  },

  async auditoria(params?: { descuento_id?: number; limit?: number }) {
    let sql = `SELECT a.*,
                 u.nombre AS usuario_nombre,
                 d.nombre AS descuento_nombre
               FROM descuento_auditoria a
               LEFT JOIN usuarios u   ON u.id = a.usuario_id
               LEFT JOIN descuentos d ON d.id = a.descuento_id`;
    const conds: string[] = [];
    const args: unknown[] = [];
    if (params?.descuento_id != null) {
      conds.push(`a.descuento_id = ?`);
      args.push(params.descuento_id);
    }
    if (conds.length) sql += ` WHERE ` + conds.join(` AND `);
    sql += ` ORDER BY a.id DESC LIMIT ?`;
    args.push(Math.min(500, Math.max(1, params?.limit ?? 200)));
    return db.prepare(sql).all(...args);
  },
};
