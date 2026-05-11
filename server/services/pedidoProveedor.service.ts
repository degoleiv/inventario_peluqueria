import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";
import { productoService } from "./producto.service.js";

type LineIn = Record<string, unknown>;

const ESTADOS = new Set(["pendiente", "parcial", "pagado", "vencido"]);

export function parseDay(v: unknown): string | null {
  if (v == null || typeof v !== "string") return null;
  const t = v.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

function fechaPedidoNorm(fecha: string): string {
  const d = parseDay(fecha);
  if (d) return d;
  return fecha.trim().replace(/T.*/, "").slice(0, 10);
}

/** Reglas: fecha pedido ≤ fecha pago con descuento ≤ fecha máxima; montos > 0 si vienen informados. */
export function validatePedidoFechasYMontos(opts: {
  fecha: string;
  fecha_pago_con_descuento?: string | null;
  fecha_pago_maxima?: string | null;
  valor_pago_con_descuento?: number | null;
  valor_pago_sin_descuento?: number | null;
}) {
  const f0 = fechaPedidoNorm(opts.fecha);
  const fd = opts.fecha_pago_con_descuento != null ? parseDay(opts.fecha_pago_con_descuento) : null;
  const fm = opts.fecha_pago_maxima != null ? parseDay(opts.fecha_pago_maxima) : null;
  if (fd && fm && fd > fm) {
    throw new AppError("La fecha de pago con descuento debe ser ≤ a la fecha máxima de pago");
  }
  if (fd && f0 > fd) {
    throw new AppError("La fecha del pedido debe ser ≤ a la fecha de pago con descuento");
  }
  if (fm && f0 > fm) {
    throw new AppError("La fecha del pedido debe ser ≤ a la fecha máxima de pago");
  }
  const vd = opts.valor_pago_con_descuento;
  const vs = opts.valor_pago_sin_descuento;
  if (vd != null && vd !== undefined && (!Number.isFinite(Number(vd)) || Number(vd) < 0)) {
    throw new AppError("El valor a pagar con descuento debe ser numérico y ≥ 0");
  }
  if (vs != null && vs !== undefined && (!Number.isFinite(Number(vs)) || Number(vs) < 0)) {
    throw new AppError("El valor a pagar sin descuento debe ser numérico y ≥ 0");
  }
  if (
    vd != null &&
    vs != null &&
    Number.isFinite(Number(vd)) &&
    Number.isFinite(Number(vs)) &&
    Number(vd) > Number(vs)
  ) {
    throw new AppError("El valor con descuento no puede ser mayor al valor sin descuento");
  }
}

/** Indicador derivado (no persiste): ventana de descuento, plazo sin descuento, vencido, etc. */
export function indicadorPago(row: Record<string, unknown>): string {
  const estado = String(row.estado ?? "pendiente");
  if (estado === "pagado") return "pagado";
  if (estado === "parcial") return "parcial";
  const today = new Date().toISOString().slice(0, 10);
  const fp = fechaPedidoNorm(String(row.fecha ?? ""));
  const fd = parseDay(row.fecha_pago_con_descuento as string | null);
  const fm = parseDay(row.fecha_pago_maxima as string | null);
  if (!fd && !fm) return "sin_plazos_configurados";
  if (fm && today > fm) return "vencido";
  if (fd && today >= fp && today <= fd) return "en_descuento";
  if (fd && today > fd && (!fm || today <= fm)) return "fuera_descuento_en_plazo";
  if (!fd && fm && today <= fm) return "sin_descuento_configurado";
  return "pendiente";
}

function enrichRow(row: Record<string, unknown>) {
  return {
    ...row,
    indicador_pago: indicadorPago(row),
  };
}

export const pedidoProveedorService = {
  async listProductosAsociados(proveedorId: number, q?: string, limit = 300) {
    const pid = Number(proveedorId);
    if (!Number.isFinite(pid) || pid <= 0) {
      throw new AppError("proveedor_id inválido");
    }
    const max = Math.min(Math.max(Math.floor(Number(limit) || 300), 1), 1000);
    const query = (q ?? "").trim().toLowerCase();

    const whereSearch = query
      ? ` AND (
          LOWER(COALESCE(p.nombre, '')) LIKE ? OR
          LOWER(COALESCE(p.codigo_barras, '')) LIKE ? OR
          LOWER(COALESCE(p.marca, '')) LIKE ?
        )`
      : "";
    const args: unknown[] = [pid, pid];
    if (query) {
      const like = `%${query}%`;
      args.push(like, like, like);
    }
    args.push(max);

    return db
      .prepare(
        `SELECT
            p.id,
            p.codigo_barras,
            p.nombre,
            p.marca,
            p.categoria,
            p.descripcion,
            p.imagen_url,
            p.stock,
            p.precio,
            p.precio_compra,
            p.precio_venta,
            p.stock_minimo,
            p.fecha_vencimiento,
            p.proveedor_id,
            p.created_at,
            p.updated_at
         FROM productos p
         WHERE (
           p.proveedor_id = ?
           OR EXISTS (
             SELECT 1 FROM pedido_proveedor_lineas ppl
             JOIN pedidos_proveedor pp ON pp.id = ppl.pedido_proveedor_id
             WHERE ppl.producto_id = p.id AND pp.proveedor_id = ?
           )
         )${whereSearch}
         ORDER BY p.updated_at DESC
         LIMIT ?`
      )
      .all(...args);
  },

  async list(filters?: {
    desde?: string;
    hasta?: string;
    proveedor_id?: number;
    /** Texto libre: coincide con `referencia` (parcial, sin distinguir mayúsculas) o con el id numérico del pedido. */
    referencia?: string;
  }) {
    const desde = filters?.desde?.trim().slice(0, 10);
    const hasta = filters?.hasta?.trim().slice(0, 10);
    const proveedorId = filters?.proveedor_id;
    const refRaw = (filters?.referencia ?? "").trim();

    let sql = `SELECT co.*, pr.nombre AS proveedor_nombre_ref
               FROM pedidos_proveedor co
               LEFT JOIN proveedores pr ON pr.id = co.proveedor_id`;
    const params: unknown[] = [];
    const cond: string[] = [];

    if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) {
      cond.push(`co.fecha >= ?`);
      params.push(desde);
    }
    if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      cond.push(`co.fecha <= ?`);
      params.push(hasta);
    }
    if (proveedorId != null && Number.isFinite(proveedorId) && proveedorId > 0) {
      cond.push(`co.proveedor_id = ?`);
      params.push(proveedorId);
    }
    if (refRaw) {
      const idNum = Number(refRaw);
      if (Number.isFinite(idNum) && idNum > 0 && String(Math.floor(idNum)) === refRaw) {
        cond.push(`(LOWER(COALESCE(co.referencia, '')) LIKE ? OR co.id = ?)`);
        params.push(`%${refRaw.toLowerCase()}%`, Math.floor(idNum));
      } else {
        cond.push(`LOWER(COALESCE(co.referencia, '')) LIKE ?`);
        params.push(`%${refRaw.toLowerCase()}%`);
      }
    }

    if (cond.length) {
      sql += ` WHERE ${cond.join(" AND ")}`;
    }
    sql += ` ORDER BY co.fecha DESC, co.id DESC`;
    const rows = (await db.prepare(sql).all(...params)) as Record<string, unknown>[];
    return rows.map((r) => enrichRow(r));
  },

  async getById(id: number) {
    const c = (await db
      .prepare(
        `SELECT co.*, pr.nombre AS proveedor_nombre_ref
         FROM pedidos_proveedor co
         LEFT JOIN proveedores pr ON pr.id = co.proveedor_id
         WHERE co.id = ?`
      )
      .get(id)) as Record<string, unknown> | undefined;
    if (!c) throw new AppError("no encontrado", 404);
    const lineas = await db
      .prepare(
        `SELECT cl.*, p.nombre AS producto_nombre
         FROM pedido_proveedor_lineas cl
         JOIN productos p ON p.id = cl.producto_id
         WHERE cl.pedido_proveedor_id = ?`
      )
      .all(id);
    return enrichRow({ ...c, lineas });
  },

  async create(body: Record<string, unknown>) {
    const lineasIn = body.lineas;
    if (!Array.isArray(lineasIn) || lineasIn.length === 0) {
      throw new AppError("Debe incluir al menos una línea de pedido");
    }

    const proveedor_id = Number(body.proveedor_id);
    if (!Number.isFinite(proveedor_id) || proveedor_id <= 0) {
      throw new AppError("proveedor_id es obligatorio: elegí un proveedor de la lista");
    }
    const pr = (await db.prepare(`SELECT nombre FROM proveedores WHERE id = ?`).get(proveedor_id)) as
      | { nombre: string }
      | undefined;
    if (!pr) throw new AppError("Proveedor no encontrado");

    const now = new Date().toISOString();
    const fecha =
      typeof body.fecha === "string" && body.fecha.trim() ? body.fecha.trim() : now;

    const fecha_pago_con_descuento =
      typeof body.fecha_pago_con_descuento === "string" && body.fecha_pago_con_descuento.trim()
        ? body.fecha_pago_con_descuento.trim().slice(0, 10)
        : null;
    const fecha_pago_maxima =
      typeof body.fecha_pago_maxima === "string" && body.fecha_pago_maxima.trim()
        ? body.fecha_pago_maxima.trim().slice(0, 10)
        : null;
    const valor_pago_con_descuento =
      body.valor_pago_con_descuento != null && body.valor_pago_con_descuento !== ""
        ? Number(body.valor_pago_con_descuento)
        : null;
    const valor_pago_sin_descuento =
      body.valor_pago_sin_descuento != null && body.valor_pago_sin_descuento !== ""
        ? Number(body.valor_pago_sin_descuento)
        : null;

    let estado =
      typeof body.estado === "string" && body.estado.trim() ? body.estado.trim() : "pendiente";
    if (!ESTADOS.has(estado)) estado = "pendiente";

    validatePedidoFechasYMontos({
      fecha,
      fecha_pago_con_descuento,
      fecha_pago_maxima,
      valor_pago_con_descuento,
      valor_pago_sin_descuento,
    });

    const insPedido = db.prepare(
      `INSERT INTO pedidos_proveedor (
        proveedor_id, proveedor_nombre, fecha, fecha_pago_con_descuento, fecha_pago_maxima,
        valor_pago_con_descuento, valor_pago_sin_descuento, total, notas, referencia, estado, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    const insLine = db.prepare(
      `INSERT INTO pedido_proveedor_lineas (pedido_proveedor_id, producto_id, cantidad, costo_unitario, subtotal)
       VALUES (?,?,?,?,?)`
    );
    const insMov = db.prepare(
      `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, venta_id, pedido_proveedor_id, referencia, created_at)
       VALUES (?, 'ENTRADA', ?, NULL, ?, ?, ?)`
    );
    const updStock = db.prepare(
      `UPDATE productos SET stock = stock + ?, updated_at = ? WHERE id = ?`
    );

    const pedidoId = await db.transaction(async () => {
      let total = 0;
      const resolvedLines: {
        producto_id: number;
        cantidad: number;
        costo_unitario: number;
        subtotal: number;
      }[] = [];

      for (const raw of lineasIn as LineIn[]) {
        let producto_id: number;
        const cantidad = Math.floor(Number(raw.cantidad));
        const costo_unitario = Number(raw.costo_unitario);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          throw new AppError("Cantidad inválida en línea de pedido");
        }
        if (!Number.isFinite(costo_unitario) || costo_unitario < 0) {
          throw new AppError("Costo unitario inválido");
        }

        if (raw.nuevo_producto && typeof raw.nuevo_producto === "object") {
          const np = raw.nuevo_producto as Record<string, unknown>;
          let pv =
            typeof np.precio_venta === "number" && Number.isFinite(np.precio_venta)
              ? np.precio_venta
              : null;
          if (pv == null) pv = costo_unitario;
          const created = (await productoService.create({
            ...np,
            stock: 0,
            precio_compra: costo_unitario,
            precio_venta: pv,
          })) as { id: number };
          producto_id = created.id;
        } else {
          producto_id = Number(raw.producto_id);
          if (!Number.isFinite(producto_id)) {
            throw new AppError("producto_id o nuevo_producto requerido por línea");
          }
          const exists = await db.prepare(`SELECT id FROM productos WHERE id = ?`).get(producto_id);
          if (!exists) throw new AppError(`Producto ${producto_id} no existe`);
        }

        const subtotal = costo_unitario * cantidad;
        total += subtotal;

        resolvedLines.push({
          producto_id,
          cantidad,
          costo_unitario,
          subtotal,
        });
      }

      const info = await insPedido.run(
        proveedor_id,
        pr.nombre,
        fecha,
        fecha_pago_con_descuento,
        fecha_pago_maxima,
        valor_pago_con_descuento != null && Number.isFinite(valor_pago_con_descuento)
          ? valor_pago_con_descuento
          : null,
        valor_pago_sin_descuento != null && Number.isFinite(valor_pago_sin_descuento)
          ? valor_pago_sin_descuento
          : null,
        total,
        typeof body.notas === "string" ? body.notas || null : null,
        typeof body.referencia === "string" ? body.referencia || null : null,
        estado,
        now
      );
      const pid = Number(info.lastInsertRowid);

      for (const ln of resolvedLines) {
        await insLine.run(pid, ln.producto_id, ln.cantidad, ln.costo_unitario, ln.subtotal);
        await updStock.run(ln.cantidad, now, ln.producto_id);
        await insMov.run(ln.producto_id, ln.cantidad, pid, `pedido_proveedor:${pid}`, now);
      }

      await recordSyncEvent("pedido_proveedor", "creado", {
        pedido_proveedor_id: pid,
        total,
        lineas: resolvedLines.length,
      });
      return pid;
    });

    return await pedidoProveedorService.getById(pedidoId);
  },

  /** Solo metadatos de pago / fechas / estado (no modifica líneas ni stock). */
  async updateMeta(id: number, body: Record<string, unknown>) {
    const cur = (await db.prepare(`SELECT * FROM pedidos_proveedor WHERE id = ?`).get(id)) as
      | Record<string, unknown>
      | undefined;
    if (!cur) throw new AppError("no encontrado", 404);

    const fecha =
      typeof body.fecha === "string" && body.fecha.trim() ? body.fecha.trim() : String(cur.fecha);
    const fecha_pago_con_descuento =
      body.fecha_pago_con_descuento !== undefined
        ? typeof body.fecha_pago_con_descuento === "string" && body.fecha_pago_con_descuento.trim()
          ? body.fecha_pago_con_descuento.trim().slice(0, 10)
          : null
        : (cur.fecha_pago_con_descuento as string | null);
    const fecha_pago_maxima =
      body.fecha_pago_maxima !== undefined
        ? typeof body.fecha_pago_maxima === "string" && body.fecha_pago_maxima.trim()
          ? body.fecha_pago_maxima.trim().slice(0, 10)
          : null
        : (cur.fecha_pago_maxima as string | null);
    const valor_pago_con_descuento =
      body.valor_pago_con_descuento !== undefined
        ? body.valor_pago_con_descuento === null || body.valor_pago_con_descuento === ""
          ? null
          : Number(body.valor_pago_con_descuento)
        : (cur.valor_pago_con_descuento as number | null);
    const valor_pago_sin_descuento =
      body.valor_pago_sin_descuento !== undefined
        ? body.valor_pago_sin_descuento === null || body.valor_pago_sin_descuento === ""
          ? null
          : Number(body.valor_pago_sin_descuento)
        : (cur.valor_pago_sin_descuento as number | null);

    let estado = String(cur.estado ?? "pendiente");
    if (body.estado !== undefined && typeof body.estado === "string" && body.estado.trim()) {
      const cand = body.estado.trim();
      if (ESTADOS.has(cand)) estado = cand;
    }

    validatePedidoFechasYMontos({
      fecha,
      fecha_pago_con_descuento,
      fecha_pago_maxima,
      valor_pago_con_descuento,
      valor_pago_sin_descuento,
    });

    const notas =
      body.notas !== undefined
        ? typeof body.notas === "string"
          ? body.notas || null
          : (cur.notas as string | null)
        : (cur.notas as string | null);
    const referencia =
      body.referencia !== undefined
        ? typeof body.referencia === "string"
          ? body.referencia || null
          : (cur.referencia as string | null)
        : (cur.referencia as string | null);

    await db
      .prepare(
        `UPDATE pedidos_proveedor SET
        fecha = ?,
        fecha_pago_con_descuento = ?,
        fecha_pago_maxima = ?,
        valor_pago_con_descuento = ?,
        valor_pago_sin_descuento = ?,
        estado = ?,
        notas = ?,
        referencia = ?
      WHERE id = ?`
      )
      .run(
        fecha,
        fecha_pago_con_descuento,
        fecha_pago_maxima,
        valor_pago_con_descuento != null && Number.isFinite(valor_pago_con_descuento)
          ? valor_pago_con_descuento
          : null,
        valor_pago_sin_descuento != null && Number.isFinite(valor_pago_sin_descuento)
          ? valor_pago_sin_descuento
          : null,
        estado,
        notas,
        referencia,
        id
      );

    await recordSyncEvent("pedido_proveedor", "actualizado", { pedido_proveedor_id: id });
    return await pedidoProveedorService.getById(id);
  },
};
