import { db } from "../db.js";

export type UsuarioRow = {
  id: number;
  email: string;
  password_hash: string;
  nombre: string | null;
  rol: string;
  activo: number;
  telefono: string | null;
  color_agenda: string | null;
  foto_url: string | null;
  tipo_comision: string;
  valor_comision: number;
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
    telefono?: string | null;
    color_agenda?: string | null;
    foto_url?: string | null;
    tipo_comision?: string;
    valor_comision?: number;
  }): UsuarioRow {
    const now = new Date().toISOString();
    const tipo = params.tipo_comision ?? "porcentaje";
    const valor = params.valor_comision ?? 0;
    const info = db
      .prepare(
        `INSERT INTO usuarios (email, password_hash, nombre, rol, activo, telefono, color_agenda, foto_url, tipo_comision, valor_comision, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.email,
        params.password_hash,
        params.nombre,
        params.rol,
        params.telefono ?? null,
        params.color_agenda ?? null,
        params.foto_url ?? null,
        tipo,
        valor,
        now
      );
    return db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(info.lastInsertRowid) as UsuarioRow;
  },

  list(): Omit<UsuarioRow, "password_hash">[] {
    return db
      .prepare(
        `SELECT id, email, nombre, rol, activo, telefono, color_agenda, foto_url, tipo_comision, valor_comision, created_at FROM usuarios ORDER BY id`
      )
      .all() as Omit<UsuarioRow, "password_hash">[];
  },

  listActivos(): Omit<UsuarioRow, "password_hash">[] {
    return db
      .prepare(
        `SELECT id, email, nombre, rol, activo, telefono, color_agenda, foto_url, tipo_comision, valor_comision, created_at FROM usuarios WHERE activo = 1 ORDER BY nombre COLLATE NOCASE, email`
      )
      .all() as Omit<UsuarioRow, "password_hash">[];
  },

  delete(id: number): boolean {
    const info = db.prepare(`DELETE FROM usuarios WHERE id = ?`).run(id);
    return info.changes > 0;
  },

  updateRol(id: number, rol: string): void {
    db.prepare(`UPDATE usuarios SET rol = ? WHERE id = ?`).run(rol, id);
  },

  updateNombre(id: number, nombre: string | null): void {
    db.prepare(`UPDATE usuarios SET nombre = ? WHERE id = ?`).run(nombre, id);
  },

  updatePasswordHash(id: number, password_hash: string): void {
    db.prepare(`UPDATE usuarios SET password_hash = ? WHERE id = ?`).run(password_hash, id);
  },

  updateTelefono(id: number, telefono: string | null): void {
    db.prepare(`UPDATE usuarios SET telefono = ? WHERE id = ?`).run(telefono, id);
  },

  updateColorAgenda(id: number, color: string | null): void {
    db.prepare(`UPDATE usuarios SET color_agenda = ? WHERE id = ?`).run(color, id);
  },

  updateFotoUrl(id: number, url: string | null): void {
    db.prepare(`UPDATE usuarios SET foto_url = ? WHERE id = ?`).run(url, id);
  },

  setActivo(id: number, activo: boolean): void {
    db.prepare(`UPDATE usuarios SET activo = ? WHERE id = ?`).run(activo ? 1 : 0, id);
  },

  updateComision(id: number, tipo: string, valor: number): void {
    db.prepare(`UPDATE usuarios SET tipo_comision = ?, valor_comision = ? WHERE id = ?`).run(
      tipo,
      valor,
      id
    );
  },
};
