import { db } from "../db.js";

export type UsuarioRow = {
  id: number;
  email: string;
  password_hash: string;
  nombre: string | null;
  rol: string;
  activo: number;
  created_at: string;
};

export const usuariosRepo = {
  count(): number {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM usuarios`).get() as { n: number };
    return r.n;
  },

  findByEmail(email: string): UsuarioRow | undefined {
    return db.prepare(`SELECT * FROM usuarios WHERE email = ? COLLATE NOCASE`).get(email) as
      | UsuarioRow
      | undefined;
  },

  findById(id: number): UsuarioRow | undefined {
    return db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(id) as UsuarioRow | undefined;
  },

  create(params: {
    email: string;
    password_hash: string;
    nombre: string | null;
    rol: string;
  }): UsuarioRow {
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO usuarios (email, password_hash, nombre, rol, activo, created_at)
         VALUES (?, ?, ?, ?, 1, ?)`
      )
      .run(params.email, params.password_hash, params.nombre, params.rol, now);
    return db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(info.lastInsertRowid) as UsuarioRow;
  },

  list(): Omit<UsuarioRow, "password_hash">[] {
    return db
      .prepare(`SELECT id, email, nombre, rol, activo, created_at FROM usuarios ORDER BY id`)
      .all() as Omit<UsuarioRow, "password_hash">[];
  },

  delete(id: number): boolean {
    const info = db.prepare(`DELETE FROM usuarios WHERE id = ?`).run(id);
    return info.changes > 0;
  },
};
