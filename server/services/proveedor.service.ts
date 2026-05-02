import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";

export const proveedorService = {
  list() {
    return db.prepare(`SELECT * FROM proveedores ORDER BY nombre COLLATE NOCASE`).all();
  },

  create(body: Record<string, unknown>) {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) throw new AppError("nombre requerido");
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO proveedores (nombre, telefono, email, notas, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        nombre,
        typeof body.telefono === "string" ? body.telefono.trim() || null : null,
        typeof body.email === "string" ? body.email.trim() || null : null,
        typeof body.notas === "string" ? body.notas || null : null,
        now
      );
    return db.prepare(`SELECT * FROM proveedores WHERE id = ?`).get(info.lastInsertRowid);
  },
};
