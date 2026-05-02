import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";
import { productoService } from "./producto.service.js";

type LineIn = Record<string, unknown>;

export const compraService = {
  list(desde?: string, hasta?: string) {
    let sql = `SELECT co.*, pr.nombre AS proveedor_nombre_ref
               FROM compras co
               LEFT JOIN proveedores pr ON pr.id = co.proveedor_id`;
    const params: string[] = [];
    if (desde) {
      sql += ` WHERE co.fecha >= ?`;
      params.push(desde);
      if (hasta) {
        sql += ` AND co.fecha <= ?`;
        params.push(hasta);
      }
    } else if (hasta) {
      sql += ` WHERE co.fecha <= ?`;
      params.push(hasta);
    }
    sql += ` ORDER BY co.fecha DESC`;
    return db.prepare(sql).all(...params);
  },

  getById(id: number) {
    const c = db
      .prepare(
        `SELECT co.*, pr.nombre AS proveedor_nombre_ref
         FROM compras co
         LEFT JOIN proveedores pr ON pr.id = co.proveedor_id
         WHERE co.id = ?`
      )
      .get(id);
    if (!c) throw new AppError("no encontrado", 404);
    const lineas = db
      .prepare(
        `SELECT cl.*, p.nombre AS producto_nombre
         FROM compra_lineas cl
         JOIN productos p ON p.id = cl.producto_id
         WHERE cl.compra_id = ?`
      )
      .all(id);
    return { ...c, lineas };
  },

  create(body: Record<string, unknown>) {
    const lineasIn = body.lineas;
    if (!Array.isArray(lineasIn) || lineasIn.length === 0) {
      throw new AppError("Debe incluir al menos una línea de compra");
    }

    const now = new Date().toISOString();
    const fecha =
      typeof body.fecha === "string" && body.fecha.trim() ? body.fecha.trim() : now;

    const proveedor_id =
      body.proveedor_id != null && Number.isFinite(Number(body.proveedor_id))
        ? Number(body.proveedor_id)
        : null;
    let proveedor_nombre =
      typeof body.proveedor_nombre === "string" ? body.proveedor_nombre.trim() || null : null;
    if (proveedor_id) {
      const pr = db.prepare(`SELECT nombre FROM proveedores WHERE id = ?`).get(proveedor_id) as
        | { nombre: string }
        | undefined;
      if (!pr) throw new AppError("Proveedor no encontrado");
      proveedor_nombre = pr.nombre;
    }

    const insCompra = db.prepare(
      `INSERT INTO compras (proveedor_id, proveedor_nombre, fecha, total, notas, referencia, created_at)
       VALUES (?,?,?,?,?,?,?)`
    );
    const insLine = db.prepare(
      `INSERT INTO compra_lineas (compra_id, producto_id, cantidad, costo_unitario, subtotal)
       VALUES (?,?,?,?,?)`
    );
    const insMov = db.prepare(
      `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, venta_id, compra_id, referencia, created_at)
       VALUES (?, 'ENTRADA', ?, NULL, ?, ?, ?)`
    );
    const updStock = db.prepare(
      `UPDATE productos SET stock = stock + ?, updated_at = ? WHERE id = ?`
    );
    const updPrecios = db.prepare(
      `UPDATE productos SET precio_compra = ?, precio_venta = COALESCE(?, precio_venta),
       precio = COALESCE(?, precio), updated_at = ? WHERE id = ?`
    );

    const compraId = db.transaction(() => {
      let total = 0;
      const resolvedLines: {
        producto_id: number;
        cantidad: number;
        costo_unitario: number;
        subtotal: number;
        actualizar_precios: boolean;
        nuevo_precio_venta: number | null;
      }[] = [];

      for (const raw of lineasIn as LineIn[]) {
        let producto_id: number;
        const cantidad = Math.floor(Number(raw.cantidad));
        const costo_unitario = Number(raw.costo_unitario);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          throw new AppError("Cantidad inválida en línea de compra");
        }
        if (!Number.isFinite(costo_unitario) || costo_unitario < 0) {
          throw new AppError("Costo unitario inválido");
        }

        if (raw.nuevo_producto && typeof raw.nuevo_producto === "object") {
          const np = raw.nuevo_producto as Record<string, unknown>;
          const pv =
            typeof np.precio_venta === "number" && Number.isFinite(np.precio_venta)
              ? np.precio_venta
              : null;
          if (pv == null) throw new AppError("nuevo_producto.precio_venta es requerido");
          const created = productoService.create({
            ...np,
            stock: 0,
            precio_compra: costo_unitario,
            precio_venta: pv,
          }) as { id: number };
          producto_id = created.id;
        } else {
          producto_id = Number(raw.producto_id);
          if (!Number.isFinite(producto_id)) {
            throw new AppError("producto_id o nuevo_producto requerido por línea");
          }
          const exists = db.prepare(`SELECT id FROM productos WHERE id = ?`).get(producto_id);
          if (!exists) throw new AppError(`Producto ${producto_id} no existe`);
        }

        const subtotal = costo_unitario * cantidad;
        total += subtotal;
        const actualizar_precios = raw.actualizar_precios === true;
        const nuevo_precio_venta =
          typeof raw.precio_venta_lista === "number" && Number.isFinite(raw.precio_venta_lista)
            ? raw.precio_venta_lista
            : null;

        resolvedLines.push({
          producto_id,
          cantidad,
          costo_unitario,
          subtotal,
          actualizar_precios,
          nuevo_precio_venta,
        });
      }

      const info = insCompra.run(
        proveedor_id,
        proveedor_nombre,
        fecha,
        total,
        typeof body.notas === "string" ? body.notas || null : null,
        typeof body.referencia === "string" ? body.referencia || null : null,
        now
      );
      const cid = Number(info.lastInsertRowid);

      for (const ln of resolvedLines) {
        insLine.run(cid, ln.producto_id, ln.cantidad, ln.costo_unitario, ln.subtotal);
        updStock.run(ln.cantidad, now, ln.producto_id);
        if (ln.actualizar_precios) {
          updPrecios.run(
            ln.costo_unitario,
            ln.nuevo_precio_venta,
            ln.nuevo_precio_venta,
            now,
            ln.producto_id
          );
        }
        insMov.run(ln.producto_id, ln.cantidad, cid, `compra:${cid}`, now);
      }

      recordSyncEvent("compra", "creada", { compra_id: cid, total, lineas: resolvedLines.length });
      return cid;
    })();

    return compraService.getById(compraId);
  },
};
