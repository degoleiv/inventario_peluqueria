import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";

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
        `INSERT INTO clientes (nombre, telefono, email, notas, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        nombre,
        telefono,
        typeof body.email === "string" ? body.email || null : null,
        typeof body.notas === "string" ? body.notas || null : null,
        now,
        now
      );
    const row = db.prepare(`SELECT * FROM clientes WHERE id = ?`).get(info.lastInsertRowid);
    recordSyncEvent("cliente", "creado", row);
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
