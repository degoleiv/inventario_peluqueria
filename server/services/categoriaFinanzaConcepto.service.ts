import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";

function trimNombre(s: string) {
  return s.trim().slice(0, 120);
}

function assertEstado(v: string): asserts v is "activo" | "inactivo" {
  if (v !== "activo" && v !== "inactivo") throw new AppError("estado debe ser activo o inactivo");
}

function parseEmojiField(body: Record<string, unknown>): string | null | undefined {
  if (!("emoji" in body)) return undefined;
  const raw = typeof body.emoji === "string" ? body.emoji.trim() : "";
  if (!raw) return null;
  return raw.length > 16 ? raw.slice(0, 16) : raw;
}

export type CategoriaFinanzaConceptoRow = {
  id: number;
  nombre: string;
  descripcion: string | null;
  emoji: string | null;
  estado: "activo" | "inactivo";
  created_at: string;
  updated_at: string | null;
};

export const categoriaFinanzaConceptoService = {
  /** Solo categorías activas (p. ej. selector en Finanzas). */
  async listActivas(): Promise<CategoriaFinanzaConceptoRow[]> {
    return (await db
      .prepare(
        `SELECT id, nombre, descripcion, emoji, estado, created_at, updated_at
         FROM categorias_finanza_concepto
         WHERE estado = 'activo'
         ORDER BY nombre COLLATE NOCASE ASC`
      )
      .all()) as CategoriaFinanzaConceptoRow[];
  },

  async listAll(): Promise<CategoriaFinanzaConceptoRow[]> {
    return (await db
      .prepare(
        `SELECT id, nombre, descripcion, emoji, estado, created_at, updated_at
         FROM categorias_finanza_concepto
         ORDER BY nombre COLLATE NOCASE ASC`
      )
      .all()) as CategoriaFinanzaConceptoRow[];
  },

  async getById(id: number): Promise<CategoriaFinanzaConceptoRow | undefined> {
    return (await db
      .prepare(
        `SELECT id, nombre, descripcion, emoji, estado, created_at, updated_at
         FROM categorias_finanza_concepto WHERE id = ?`
      )
      .get(id)) as CategoriaFinanzaConceptoRow | undefined;
  },

  async create(body: Record<string, unknown>): Promise<CategoriaFinanzaConceptoRow> {
    const nombre = trimNombre(typeof body.nombre === "string" ? body.nombre : "");
    if (!nombre) throw new AppError("nombre requerido");
    const dup = (await db
      .prepare(`SELECT id FROM categorias_finanza_concepto WHERE LOWER(TRIM(nombre)) = LOWER(?)`)
      .get(nombre)) as { id: number } | undefined;
    if (dup) throw new AppError("Ya existe una categoría con ese nombre", 400);
    const descripcion =
      typeof body.descripcion === "string" && body.descripcion.trim()
        ? body.descripcion.trim().slice(0, 2000)
        : null;
    const emoji = parseEmojiField(body) ?? null;
    let estado: "activo" | "inactivo" = "activo";
    if (typeof body.estado === "string") {
      const e = body.estado.trim().toLowerCase();
      assertEstado(e);
      estado = e;
    }
    const now = new Date().toISOString();
    const info = await db
      .prepare(
        `INSERT INTO categorias_finanza_concepto (nombre, descripcion, emoji, estado, created_at, updated_at)
         VALUES (?,?,?,?,?,?)`
      )
      .run(nombre, descripcion, emoji, estado, now, now);
    const row = await categoriaFinanzaConceptoService.getById(Number(info.lastInsertRowid));
    if (!row) throw new AppError("Error al crear categoría", 500);
    return row;
  },

  async update(id: number, body: Record<string, unknown>): Promise<CategoriaFinanzaConceptoRow> {
    const existing = await categoriaFinanzaConceptoService.getById(id);
    if (!existing) throw new AppError("categoría no encontrada", 404);
    const nombre =
      typeof body.nombre === "string" ? trimNombre(body.nombre) : existing.nombre;
    if (!nombre) throw new AppError("nombre inválido");
    if (nombre.toLowerCase() !== existing.nombre.toLowerCase()) {
      const dup = (await db
        .prepare(
          `SELECT id FROM categorias_finanza_concepto WHERE LOWER(TRIM(nombre)) = LOWER(?) AND id != ?`
        )
        .get(nombre, id)) as { id: number } | undefined;
      if (dup) throw new AppError("Ya existe una categoría con ese nombre", 400);
    }
    const descripcion =
      "descripcion" in body
        ? typeof body.descripcion === "string"
          ? body.descripcion.trim().slice(0, 2000) || null
          : existing.descripcion
        : existing.descripcion;
    const emojiParsed = parseEmojiField(body);
    const emoji = emojiParsed === undefined ? existing.emoji : emojiParsed;
    let estado = existing.estado;
    if (typeof body.estado === "string") {
      const e = body.estado.trim().toLowerCase();
      assertEstado(e);
      estado = e;
    }
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE categorias_finanza_concepto SET
          nombre = ?, descripcion = ?, emoji = ?, estado = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(nombre, descripcion, emoji, estado, now, id);
    await db
      .prepare(`UPDATE gastos_operativos SET categoria = ? WHERE categoria_finanza_id = ?`)
      .run(nombre, id);
    const row = await categoriaFinanzaConceptoService.getById(id);
    if (!row) throw new AppError("categoría no encontrada", 404);
    return row;
  },

  async delete(id: number): Promise<void> {
    const n = (
      (await db
        .prepare(`SELECT COUNT(*) AS c FROM gastos_operativos WHERE categoria_finanza_id = ?`)
        .get(id)) as { c: number }
    ).c;
    if (n > 0) {
      throw new AppError("No se puede eliminar: hay gastos que usan esta categoría", 400);
    }
    const info = await db.prepare(`DELETE FROM categorias_finanza_concepto WHERE id = ?`).run(id);
    if (info.changes === 0) throw new AppError("categoría no encontrada", 404);
  },
};
