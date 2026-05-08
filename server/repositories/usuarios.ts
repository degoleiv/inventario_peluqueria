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
  async count(): Promise<number> {
    const r = (await db.prepare(`SELECT COUNT(*) AS n FROM usuarios`).get()) as { n: number };
    return r.n;
  },

  async findByEmail(email: string): Promise<UsuarioRow | undefined> {
    return (await db
      .prepare(`SELECT * FROM usuarios WHERE email = ? COLLATE NOCASE`)
      .get(email)) as UsuarioRow | undefined;
  },

  async findById(id: number): Promise<UsuarioRow | undefined> {
    return (await db.prepare(`SELECT * FROM usuarios WHERE id = ?`).get(id)) as UsuarioRow | undefined;
  },

  async create(params: {
    email: string;
    password_hash: string;
    nombre: string | null;
    rol: string;
    telefono?: string | null;
    color_agenda?: string | null;
    foto_url?: string | null;
    tipo_comision?: string;
    valor_comision?: number;
  }): Promise<UsuarioRow> {
    const now = new Date().toISOString();
    const tipo = params.tipo_comision ?? "porcentaje";
    const valor = params.valor_comision ?? 0;
    const info = await db
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
    return (await db
      .prepare(`SELECT * FROM usuarios WHERE id = ?`)
      .get(info.lastInsertRowid)) as UsuarioRow;
  },

  async list(): Promise<Omit<UsuarioRow, "password_hash">[]> {
    return (await db
      .prepare(
        `SELECT id, email, nombre, rol, activo, telefono, color_agenda, foto_url, tipo_comision, valor_comision, created_at FROM usuarios ORDER BY id`
      )
      .all()) as Omit<UsuarioRow, "password_hash">[];
  },

  async listActivos(): Promise<Omit<UsuarioRow, "password_hash">[]> {
    return (await db
      .prepare(
        `SELECT id, email, nombre, rol, activo, telefono, color_agenda, foto_url, tipo_comision, valor_comision, created_at FROM usuarios WHERE activo = 1 ORDER BY nombre COLLATE NOCASE, email`
      )
      .all()) as Omit<UsuarioRow, "password_hash">[];
  },

  async delete(id: number): Promise<boolean> {
    const info = await db.prepare(`DELETE FROM usuarios WHERE id = ?`).run(id);
    return info.changes > 0;
  },

  async updateRol(id: number, rol: string): Promise<void> {
    await db.prepare(`UPDATE usuarios SET rol = ? WHERE id = ?`).run(rol, id);
  },

  async updateNombre(id: number, nombre: string | null): Promise<void> {
    await db.prepare(`UPDATE usuarios SET nombre = ? WHERE id = ?`).run(nombre, id);
  },

  async updatePasswordHash(id: number, password_hash: string): Promise<void> {
    await db.prepare(`UPDATE usuarios SET password_hash = ? WHERE id = ?`).run(password_hash, id);
  },

  async updateTelefono(id: number, telefono: string | null): Promise<void> {
    await db.prepare(`UPDATE usuarios SET telefono = ? WHERE id = ?`).run(telefono, id);
  },

  async updateColorAgenda(id: number, color: string | null): Promise<void> {
    await db.prepare(`UPDATE usuarios SET color_agenda = ? WHERE id = ?`).run(color, id);
  },

  async updateFotoUrl(id: number, url: string | null): Promise<void> {
    await db.prepare(`UPDATE usuarios SET foto_url = ? WHERE id = ?`).run(url, id);
  },

  async setActivo(id: number, activo: boolean): Promise<void> {
    await db.prepare(`UPDATE usuarios SET activo = ? WHERE id = ?`).run(activo ? 1 : 0, id);
  },

  async updateComision(id: number, tipo: string, valor: number): Promise<void> {
    await db.prepare(`UPDATE usuarios SET tipo_comision = ?, valor_comision = ? WHERE id = ?`).run(
      tipo,
      valor,
      id
    );
  },
};
