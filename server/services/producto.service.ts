import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";

function validatePrecios(precio_compra: number | null, precio_venta: number | null) {
  if (
    precio_compra != null &&
    precio_venta != null &&
    precio_venta < precio_compra
  ) {
    throw new AppError("precio_venta debe ser ≥ precio_compra");
  }
}

export type ProductoDTO = Record<string, unknown>;

export const productoService = {
  async list() {
    return db
      .prepare(
        `SELECT id, codigo_barras, nombre, marca, categoria, descripcion, imagen_url,
                stock, precio, precio_compra, precio_venta, stock_minimo, fecha_vencimiento,
                proveedor_id, created_at, updated_at
         FROM productos ORDER BY updated_at DESC`
      )
      .all();
  },

  async create(body: Record<string, unknown>) {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) throw new AppError("nombre requerido");

    const precio_compra =
      typeof body.precio_compra === "number" && Number.isFinite(body.precio_compra)
        ? body.precio_compra
        : null;
    let precio_venta =
      typeof body.precio_venta === "number" && Number.isFinite(body.precio_venta)
        ? body.precio_venta
        : null;
    if (precio_venta == null && typeof body.precio === "number" && Number.isFinite(body.precio)) {
      precio_venta = body.precio;
    }
    validatePrecios(precio_compra, precio_venta);

    const stock_minimo =
      typeof body.stock_minimo === "number" && Number.isFinite(body.stock_minimo)
        ? Math.max(0, Math.floor(body.stock_minimo))
        : 5;
    const stock =
      typeof body.stock === "number" && Number.isFinite(body.stock)
        ? Math.max(0, Math.floor(body.stock))
        : 0;

    const now = new Date().toISOString();
    const codigo =
      typeof body.codigo_barras === "string" ? body.codigo_barras.trim() || null : null;
    if (codigo) {
      const dup = await db.prepare(`SELECT id FROM productos WHERE codigo_barras = ?`).get(codigo);
      if (dup) throw new AppError("Ya existe un producto con ese código de barras");
    }

    const proveedor_id =
      body.proveedor_id != null &&
      body.proveedor_id !== "" &&
      Number.isFinite(Number(body.proveedor_id)) &&
      Number(body.proveedor_id) > 0
        ? Math.floor(Number(body.proveedor_id))
        : null;

    const info = await db
      .prepare(
        `INSERT INTO productos (
          codigo_barras, nombre, marca, categoria, descripcion, imagen_url,
          stock, precio, precio_compra, precio_venta, stock_minimo, fecha_vencimiento,
          proveedor_id, created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        codigo,
        nombre,
        typeof body.marca === "string" ? body.marca || null : null,
        typeof body.categoria === "string" ? body.categoria || null : null,
        typeof body.descripcion === "string" ? body.descripcion || null : null,
        typeof body.imagen_url === "string" ? body.imagen_url || null : null,
        stock,
        precio_venta,
        precio_compra,
        precio_venta,
        stock_minimo,
        typeof body.fecha_vencimiento === "string" && body.fecha_vencimiento.trim()
          ? body.fecha_vencimiento.trim()
          : null,
        proveedor_id,
        now,
        now
      );

    const row = await db.prepare(`SELECT * FROM productos WHERE id = ?`).get(info.lastInsertRowid);
    await recordSyncEvent("producto", "creado", row);
    return row;
  },

  async update(id: number, body: Record<string, unknown>) {
    const existing = (await db.prepare(`SELECT * FROM productos WHERE id = ?`).get(id)) as Record<
      string,
      unknown
    > | undefined;
    if (!existing) throw new AppError("no encontrado", 404);

    const nombre =
      typeof body.nombre === "string" ? body.nombre.trim() : String(existing.nombre);
    const codigo_barras =
      typeof body.codigo_barras === "string"
        ? body.codigo_barras.trim() || null
        : existing.codigo_barras;
    if (codigo_barras && String(codigo_barras) !== String(existing.codigo_barras)) {
      const dup = await db
        .prepare(`SELECT id FROM productos WHERE codigo_barras = ? AND id != ?`)
        .get(codigo_barras, id);
      if (dup) throw new AppError("Ya existe un producto con ese código de barras");
    }

    const precio_compra =
      typeof body.precio_compra === "number" && Number.isFinite(body.precio_compra)
        ? body.precio_compra
        : (existing.precio_compra as number | null);
    let precio_venta =
      typeof body.precio_venta === "number" && Number.isFinite(body.precio_venta)
        ? body.precio_venta
        : (existing.precio_venta as number | null);
    if (precio_venta == null && typeof body.precio === "number" && Number.isFinite(body.precio)) {
      precio_venta = body.precio;
    }
    if (precio_venta == null && existing.precio != null) precio_venta = existing.precio as number;
    validatePrecios(
      precio_compra,
      precio_venta != null ? precio_venta : null
    );

    const stock_minimo =
      typeof body.stock_minimo === "number" && Number.isFinite(body.stock_minimo)
        ? Math.max(0, Math.floor(body.stock_minimo))
        : Number(existing.stock_minimo ?? 5);
    const stock =
      typeof body.stock === "number" && Number.isFinite(body.stock)
        ? Math.max(0, Math.floor(body.stock))
        : Number(existing.stock);

    const proveedor_id =
      body.proveedor_id === undefined
        ? (existing.proveedor_id as number | null | undefined) ?? null
        : body.proveedor_id === null || body.proveedor_id === ""
          ? null
          : Number.isFinite(Number(body.proveedor_id)) && Number(body.proveedor_id) > 0
            ? Math.floor(Number(body.proveedor_id))
            : null;

    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE productos SET
        codigo_barras = ?, nombre = ?, marca = ?, categoria = ?, descripcion = ?, imagen_url = ?,
        stock = ?, precio = ?, precio_compra = ?, precio_venta = ?, stock_minimo = ?, fecha_vencimiento = ?,
        proveedor_id = ?, updated_at = ?
       WHERE id = ?`
      )
      .run(
        codigo_barras,
        nombre,
        typeof body.marca === "string" ? body.marca || null : existing.marca,
        typeof body.categoria === "string" ? body.categoria || null : existing.categoria,
        typeof body.descripcion === "string" ? body.descripcion || null : existing.descripcion,
        typeof body.imagen_url === "string" ? body.imagen_url || null : existing.imagen_url,
        stock,
        precio_venta,
        precio_compra,
        precio_venta,
        stock_minimo,
        typeof body.fecha_vencimiento === "string"
          ? body.fecha_vencimiento.trim() || null
          : existing.fecha_vencimiento,
        proveedor_id,
        now,
        id
      );
    const row = await db.prepare(`SELECT * FROM productos WHERE id = ?`).get(id);
    await recordSyncEvent("producto", "actualizado", row);
    return row;
  },

  async delete(id: number) {
    const row = await db.prepare(`SELECT * FROM productos WHERE id = ?`).get(id);
    const info = await db.prepare(`DELETE FROM productos WHERE id = ?`).run(id);
    if (info.changes === 0) throw new AppError("no encontrado", 404);
    await recordSyncEvent("producto", "eliminado", row);
  },
};
