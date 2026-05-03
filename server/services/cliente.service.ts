import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";

const TIPO_REGISTRADO = "registrado";
const TIPO_TEMPORAL = "temporal";

export const clienteService = {
  list(q?: string) {
    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      return db
        .prepare(
          `SELECT * FROM clientes
           WHERE nombre LIKE ? ESCAPE '\\' OR IFNULL(telefono,'') LIKE ?
           ORDER BY nombre COLLATE NOCASE`
        )
        .all(term, term);
    }
    return db.prepare(`SELECT * FROM clientes ORDER BY nombre COLLATE NOCASE`).all();
  },

  create(body: Record<string, unknown>) {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) throw new AppError("nombre requerido");
    const telefono = typeof body.telefono === "string" ? body.telefono.trim() || null : null;
    if (telefono) {
      const d = db
        .prepare(`SELECT id FROM clientes WHERE telefono = ? AND telefono != ''`)
        .get(telefono);
      if (d) throw new AppError("Ya existe un cliente con ese teléfono");
    }
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO clientes (nombre, telefono, email, notas, created_at, updated_at, tipo_cliente, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(
        nombre,
        telefono,
        typeof body.email === "string" ? body.email || null : null,
        typeof body.notas === "string" ? body.notas || null : null,
        now,
        now,
        TIPO_REGISTRADO
      );
    const row = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(info.lastInsertRowid);
    recordSyncEvent("cliente", "creado", row);
    return row;
  },

  /**
   * Cliente ocasional (guest): datos mínimos. Si hay teléfono y ya existe un cliente con ese número, devuelve ese registro (evita duplicados).
   */
  createTemporal(body: Record<string, unknown>) {
    const telRaw = typeof body.telefono === "string" ? body.telefono.trim() : "";
    const telefono = telRaw || null;
    if (telefono) {
      const ex = db
        .prepare(`SELECT * FROM clientes WHERE telefono = ? AND IFNULL(telefono,'') != ''`)
        .get(telefono) as Record<string, unknown> | undefined;
      if (ex) {
        return { cliente: ex, reutilizado: true as const };
      }
    }
    const nombreIn = typeof body.nombre === "string" ? body.nombre.trim() : "";
    const nombre = nombreIn || "Cliente ocasional";
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO clientes (nombre, telefono, email, notas, created_at, updated_at, tipo_cliente, activo)
         VALUES (?, ?, NULL, NULL, ?, ?, ?, 1)`
      )
      .run(nombre, telefono, now, now, TIPO_TEMPORAL);
    const row = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(info.lastInsertRowid);
    recordSyncEvent("cliente", "creado_temporal", row);
    return { cliente: row, reutilizado: false as const };
  },

  convertirARegistrado(id: number, body: Record<string, unknown>) {
    const existing = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id) as Record<
      string,
      unknown
    > | undefined;
    if (!existing) throw new AppError("no encontrado", 404);
    const tipo = String(existing.tipo_cliente ?? TIPO_REGISTRADO);
    if (tipo !== TIPO_TEMPORAL) {
      throw new AppError("Este cliente ya está registrado; editá los datos con «Actualizar»");
    }
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) throw new AppError("Nombre requerido para registrar el cliente");
    const telefono =
      typeof body.telefono === "string" ? body.telefono.trim() || null : null;
    if (telefono) {
      const dup = db
        .prepare(`SELECT id FROM clientes WHERE telefono = ? AND id != ?`)
        .get(telefono, id) as { id: number } | undefined;
      if (dup) {
        throw new AppError(
          "Ya existe otro cliente con ese teléfono. Unificá desde ese contacto o usá otro número."
        );
      }
    }
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE clientes SET tipo_cliente = ?, nombre = ?, telefono = ?, email = ?, notas = ?, updated_at = ? WHERE id = ?`
    ).run(
      TIPO_REGISTRADO,
      nombre,
      telefono,
      typeof body.email === "string" ? body.email.trim() || null : null,
      typeof body.notas === "string" ? body.notas.trim() || null : null,
      now,
      id
    );
    const row = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id);
    recordSyncEvent("cliente", "convertido_registrado", row);
    return row;
  },

  update(id: number, body: Record<string, unknown>) {
    const existing = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id) as Record<
      string,
      unknown
    > | undefined;
    if (!existing) throw new AppError("no encontrado", 404);
    const nombre =
      typeof body.nombre === "string" ? body.nombre.trim() : String(existing.nombre);
    const telefono =
      typeof body.telefono === "string" ? body.telefono.trim() || null : existing.telefono;
    if (telefono && String(telefono) !== String(existing.telefono)) {
      const d = db
        .prepare(`SELECT id FROM clientes WHERE telefono = ? AND id != ?`)
        .get(telefono, id);
      if (d) throw new AppError("Ya existe un cliente con ese teléfono");
    }
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE clientes SET nombre = ?, telefono = ?, email = ?, notas = ?, updated_at = ? WHERE id = ?`
    ).run(
      nombre,
      telefono,
      typeof body.email === "string" ? body.email || null : existing.email,
      typeof body.notas === "string" ? body.notas || null : existing.notas,
      now,
      id
    );
    const row = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id);
    recordSyncEvent("cliente", "actualizado", row);
    return row;
  },

  delete(id: number) {
    const row = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id);
    const info = db.prepare(`DELETE FROM clientes WHERE id = ?`).run(id);
    if (info.changes === 0) throw new AppError("no encontrado", 404);
    recordSyncEvent("cliente", "eliminado", row);
  },
};
