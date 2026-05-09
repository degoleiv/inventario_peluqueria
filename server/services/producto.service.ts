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

async function resolveProveedorActivo(id: number): Promise<{ nombre: string }> {
  const row = (await db
    .prepare(`SELECT nombre, estado FROM proveedores WHERE id = ?`)
    .get(id)) as { nombre: string; estado: string } | undefined;
  if (!row) throw new AppError("Proveedor no encontrado");
  if (row.estado !== "activo") throw new AppError("El proveedor seleccionado no está activo");
  return { nombre: row.nombre };
}

async function resolveCategoriaActivaNombre(input: string): Promise<string> {
  const t = input.trim();
  if (!t) throw new AppError("Debés seleccionar una categoría activa");
  const row = (await db
    .prepare(
      `SELECT nombre_categoria FROM categorias_producto
       WHERE estado = 'activo' AND LOWER(TRIM(nombre_categoria)) = LOWER(?)`
    )
    .get(t)) as { nombre_categoria: string } | undefined;
  if (!row) {
    throw new AppError(
      "La categoría no existe o no está activa. Creala o activala en Configuración → Parámetros generales."
    );
  }
  return row.nombre_categoria;
}

export type ProductoDTO = Record<string, unknown>;

export type ProductoCreateOptions = {
  /** Alta rápida desde pedidos: categoría/marca libres, proveedor solo debe existir. */
  relaxCatalog?: boolean;
};

export const productoService = {
  async list() {
    return db
      .prepare(
        `SELECT id, codigo_barras, nombre, marca, categoria, descripcion, imagen_url,
                stock, precio, precio_compra, precio_venta, stock_minimo, fecha_vencimiento,
                proveedor_id, estado, created_at, updated_at
         FROM productos ORDER BY updated_at DESC`
      )
      .all();
  },

  async setEstado(id: number, estado: "activo" | "inactivo") {
    if (estado !== "activo" && estado !== "inactivo") {
      throw new AppError("estado inválido");
    }
    const existing = await db.prepare(`SELECT id FROM productos WHERE id = ?`).get(id);
    if (!existing) throw new AppError("no encontrado", 404);
    const now = new Date().toISOString();
    await db
      .prepare(`UPDATE productos SET estado = ?, updated_at = ? WHERE id = ?`)
      .run(estado, now, id);
    const row = await db.prepare(`SELECT * FROM productos WHERE id = ?`).get(id);
    await recordSyncEvent("producto", estado === "activo" ? "activado" : "desactivado", row);
    return row;
  },

  async create(body: Record<string, unknown>, opts?: ProductoCreateOptions) {
    const relax = opts?.relaxCatalog === true;

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

    let proveedor_id: number | null = null;
    let marcaPersist: string | null = null;
    let categoriaPersist: string | null = null;

    if (relax) {
      if (body.proveedor_id != null && body.proveedor_id !== "") {
        const pid = Number(body.proveedor_id);
        if (!Number.isFinite(pid) || pid <= 0) throw new AppError("proveedor_id inválido");
        const pr = await db.prepare(`SELECT id, nombre FROM proveedores WHERE id = ?`).get(pid) as
          | { id: number; nombre: string }
          | undefined;
        if (!pr) throw new AppError("Proveedor no encontrado");
        proveedor_id = pid;
        const marcaBody = typeof body.marca === "string" ? body.marca.trim() : "";
        marcaPersist = marcaBody || pr.nombre;
      }
      categoriaPersist =
        typeof body.categoria === "string" && body.categoria.trim() ? body.categoria.trim() : null;
    } else {
      if (body.proveedor_id == null || body.proveedor_id === "") {
        throw new AppError("Debés seleccionar un proveedor (marca) activo");
      }
      const pid = Number(body.proveedor_id);
      if (!Number.isFinite(pid) || pid <= 0) throw new AppError("proveedor_id inválido");
      const prov = await resolveProveedorActivo(pid);
      proveedor_id = pid;
      marcaPersist = prov.nombre;
      const catRaw = typeof body.categoria === "string" ? body.categoria : "";
      categoriaPersist = await resolveCategoriaActivaNombre(catRaw);
    }

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
        marcaPersist,
        categoriaPersist,
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

    let proveedor_id =
      body.proveedor_id !== undefined
        ? body.proveedor_id === null || body.proveedor_id === ""
          ? null
          : Number(body.proveedor_id)
        : (existing.proveedor_id as number | null | undefined) ?? null;

    const touchesCatalog =
      Object.prototype.hasOwnProperty.call(body, "categoria") ||
      Object.prototype.hasOwnProperty.call(body, "proveedor_id") ||
      Object.prototype.hasOwnProperty.call(body, "marca");

    let marcaFinal =
      typeof body.marca === "string" ? body.marca || null : (existing.marca as string | null);
    let categoriaFinal =
      typeof body.categoria === "string"
        ? body.categoria || null
        : (existing.categoria as string | null);

    if (touchesCatalog) {
      if (proveedor_id == null || !Number.isFinite(proveedor_id) || proveedor_id <= 0) {
        throw new AppError("Debés seleccionar un proveedor (marca) activo");
      }
      const prov = await resolveProveedorActivo(proveedor_id);
      marcaFinal = prov.nombre;
      const catSource =
        typeof body.categoria === "string" ? body.categoria : String(categoriaFinal ?? "");
      categoriaFinal = await resolveCategoriaActivaNombre(catSource);
    } else if (body.proveedor_id !== undefined && proveedor_id != null) {
      if (!Number.isFinite(proveedor_id) || proveedor_id <= 0) {
        throw new AppError("proveedor_id inválido");
      }
      const pr = await db.prepare(`SELECT id FROM proveedores WHERE id = ?`).get(proveedor_id);
      if (!pr) throw new AppError("Proveedor no encontrado");
    }

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
        marcaFinal,
        categoriaFinal,
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
    if (!row) throw new AppError("no encontrado", 404);

    const ventas = (await db
      .prepare(`SELECT COUNT(*) AS n FROM venta_lineas WHERE producto_id = ?`)
      .get(id)) as { n: number } | undefined;
    if ((ventas?.n ?? 0) > 0) {
      throw new AppError(
        "No se puede eliminar: el producto está vinculado a ventas registradas. Marcalo como inactivo o anulá las ventas asociadas."
      );
    }

    const pedidos = (await db
      .prepare(`SELECT COUNT(*) AS n FROM pedido_proveedor_lineas WHERE producto_id = ?`)
      .get(id)) as { n: number } | undefined;
    if ((pedidos?.n ?? 0) > 0) {
      throw new AppError(
        "No se puede eliminar: el producto aparece en pedidos a proveedor. Eliminá esos pedidos antes."
      );
    }

    try {
      await db.transaction(async () => {
        await db.prepare(`DELETE FROM movimientos_inventario WHERE producto_id = ?`).run(id);
        await db.prepare(`DELETE FROM ajustes_inventario WHERE producto_id = ?`).run(id);
        const info = await db.prepare(`DELETE FROM productos WHERE id = ?`).run(id);
        if (info.changes === 0) throw new AppError("no encontrado", 404);
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      const code = (err as { code?: string } | null)?.code;
      if (code === "SQLITE_CONSTRAINT") {
        throw new AppError(
          "No se puede eliminar: el producto tiene registros relacionados que impiden borrarlo."
        );
      }
      throw err;
    }

    await recordSyncEvent("producto", "eliminado", row);
  },
};
