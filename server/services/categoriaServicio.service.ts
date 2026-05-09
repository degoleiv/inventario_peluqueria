import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";

export type CategoriaServicio = {
  id: number;
  nombre_categoria: string;
  descripcion: string | null;
  emoji: string | null;
  estado: "activo" | "inactivo";
  fecha_creacion: string;
  updated_at: string;
  /** Citas cuyo campo `servicio` coincide con `nombre_categoria` (sin distinguir mayúsculas). */
  productos_count: number;
};

export type ListCategoriasServicioParams = {
  q?: string;
  estado?: "activo" | "inactivo" | "todos";
  page?: number;
  page_size?: number;
};

export type ListCategoriasServicioResult = {
  items: CategoriaServicio[];
  total: number;
  page: number;
  page_size: number;
};

function trimNombre(s: string): string {
  return s.trim().replace(/\s+/g, " ");
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

async function nombreDuplicado(nombre: string, excludeId?: number): Promise<boolean> {
  const t = trimNombre(nombre);
  if (!t) return false;
  const row = (await db
    .prepare(
      excludeId != null
        ? `SELECT id FROM categorias_servicio WHERE LOWER(TRIM(nombre_categoria)) = LOWER(?) AND id != ?`
        : `SELECT id FROM categorias_servicio WHERE LOWER(TRIM(nombre_categoria)) = LOWER(?)`
    )
    .get(excludeId != null ? [t, excludeId] : [t])) as { id: number } | undefined;
  return !!row;
}

const SQL_COUNT_CITAS_SERVICIO = `COALESCE((
  SELECT COUNT(*) FROM citas ci
  WHERE ci.servicio IS NOT NULL AND TRIM(ci.servicio) != ''
    AND LOWER(TRIM(ci.servicio)) = LOWER(TRIM(c.nombre_categoria))
), 0) AS productos_count`;

async function countCitasUsandoNombre(nombreServicio: string): Promise<number> {
  const t = trimNombre(nombreServicio);
  const row = (await db
    .prepare(
      `SELECT COUNT(*) AS n FROM citas
       WHERE servicio IS NOT NULL AND TRIM(servicio) != ''
         AND LOWER(TRIM(servicio)) = LOWER(?)`
    )
    .get(t)) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

export const categoriaServicioService = {
  async list(params: ListCategoriasServicioParams): Promise<ListCategoriasServicioResult> {
    const page = Math.max(1, Math.floor(Number(params.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(params.page_size) || 20)));
    const offset = (page - 1) * pageSize;
    const q = typeof params.q === "string" ? params.q.trim() : "";
    const estadoFiltro = params.estado === "activo" || params.estado === "inactivo" ? params.estado : "todos";

    const conds: string[] = ["1=1"];
    const args: unknown[] = [];

    if (estadoFiltro !== "todos") {
      conds.push("c.estado = ?");
      args.push(estadoFiltro);
    }
    if (q) {
      conds.push(
        "(instr(LOWER(c.nombre_categoria), LOWER(?)) > 0 OR instr(LOWER(IFNULL(c.descripcion,'')), LOWER(?)) > 0)"
      );
      args.push(q, q);
    }

    const where = conds.join(" AND ");

    const countRow = (await db
      .prepare(`SELECT COUNT(*) AS n FROM categorias_servicio c WHERE ${where}`)
      .get(...args)) as { n: number };
    const total = Number(countRow?.n ?? 0);

    const rawItems = (await db
      .prepare(
        `SELECT c.id, c.nombre_categoria, c.descripcion, c.emoji, c.estado, c.fecha_creacion, c.updated_at,
                ${SQL_COUNT_CITAS_SERVICIO}
         FROM categorias_servicio c
         WHERE ${where}
         ORDER BY c.nombre_categoria COLLATE NOCASE ASC
         LIMIT ? OFFSET ?`
      )
      .all(...args, pageSize, offset)) as (CategoriaServicio & { productos_count: number | string })[];

    const items: CategoriaServicio[] = rawItems.map((row) => ({
      ...row,
      emoji: row.emoji ?? null,
      productos_count: Number(row.productos_count ?? 0),
    }));

    return { items, total, page, page_size: pageSize };
  },

  async getById(id: number): Promise<CategoriaServicio | undefined> {
    const row = (await db
      .prepare(
        `SELECT c.id, c.nombre_categoria, c.descripcion, c.emoji, c.estado, c.fecha_creacion, c.updated_at,
                ${SQL_COUNT_CITAS_SERVICIO}
         FROM categorias_servicio c WHERE c.id = ?`
      )
      .get(id)) as (CategoriaServicio & { productos_count: number | string }) | undefined;
    if (!row) return undefined;
    return {
      ...row,
      emoji: row.emoji ?? null,
      productos_count: Number(row.productos_count ?? 0),
    };
  },

  async create(body: Record<string, unknown>): Promise<CategoriaServicio> {
    const nombre = trimNombre(typeof body.nombre_categoria === "string" ? body.nombre_categoria : "");
    if (!nombre) throw new AppError("El nombre del servicio es obligatorio");
    if (nombre.length > 120) throw new AppError("El nombre admite como máximo 120 caracteres");

    if (await nombreDuplicado(nombre)) {
      throw new AppError("Ya existe un servicio con ese nombre", 409);
    }

    const descripcion =
      typeof body.descripcion === "string" && body.descripcion.trim()
        ? body.descripcion.trim().slice(0, 2000)
        : null;

    let estado: "activo" | "inactivo" = "activo";
    if (typeof body.estado === "string") {
      assertEstado(body.estado);
      estado = body.estado;
    }

    const emojiParsed = parseEmojiField(body);
    const emoji = emojiParsed === undefined ? null : emojiParsed;

    const now = new Date().toISOString();
    const info = await db
      .prepare(
        `INSERT INTO categorias_servicio (nombre_categoria, descripcion, estado, emoji, fecha_creacion, updated_at)
         VALUES (?,?,?,?,?,?)`
      )
      .run(nombre, descripcion, estado, emoji, now, now);

    const row = await categoriaServicioService.getById(Number(info.lastInsertRowid));
    if (!row) throw new AppError("No se pudo crear el servicio", 500);
    return row;
  },

  async update(id: number, body: Record<string, unknown>): Promise<CategoriaServicio> {
    const existing = await categoriaServicioService.getById(id);
    if (!existing) throw new AppError("Servicio no encontrado", 404);

    const nombre =
      typeof body.nombre_categoria === "string"
        ? trimNombre(body.nombre_categoria)
        : existing.nombre_categoria;
    if (!nombre) throw new AppError("El nombre del servicio es obligatorio");
    if (nombre.length > 120) throw new AppError("El nombre admite como máximo 120 caracteres");

    if (nombre.toLowerCase() !== existing.nombre_categoria.toLowerCase() && (await nombreDuplicado(nombre, id))) {
      throw new AppError("Ya existe un servicio con ese nombre", 409);
    }

    const descripcion =
      body.descripcion === undefined
        ? existing.descripcion
        : typeof body.descripcion === "string" && body.descripcion.trim()
          ? body.descripcion.trim().slice(0, 2000)
          : null;

    let estado: "activo" | "inactivo" = existing.estado;
    if (typeof body.estado === "string") {
      assertEstado(body.estado);
      estado = body.estado;
    }

    const emojiPatch = parseEmojiField(body);
    const emoji = emojiPatch === undefined ? (existing.emoji ?? null) : emojiPatch;

    const now = new Date().toISOString();

    if (nombre !== existing.nombre_categoria) {
      const nAnt = existing.nombre_categoria.trim();
      await db
        .prepare(
          `UPDATE citas SET servicio = ?, updated_at = ?
           WHERE servicio IS NOT NULL AND TRIM(servicio) != ''
             AND LOWER(TRIM(servicio)) = LOWER(?)`
        )
        .run(nombre, now, nAnt);
    }

    await db
      .prepare(
        `UPDATE categorias_servicio SET
          nombre_categoria = ?, descripcion = ?, estado = ?, emoji = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(nombre, descripcion, estado, emoji, now, id);

    const row = await categoriaServicioService.getById(id);
    if (!row) throw new AppError("Servicio no encontrado", 404);
    return row;
  },

  async delete(id: number): Promise<void> {
    const existing = await categoriaServicioService.getById(id);
    if (!existing) throw new AppError("Servicio no encontrado", 404);

    const n = await countCitasUsandoNombre(existing.nombre_categoria);
    if (n > 0) {
      throw new AppError(
        `No se puede eliminar: ${n} cita(s) tienen asignado este servicio. Cambiá el servicio en esas citas antes de eliminar.`,
        409
      );
    }

    const info = await db.prepare(`DELETE FROM categorias_servicio WHERE id = ?`).run(id);
    if (info.changes === 0) throw new AppError("Servicio no encontrado", 404);
  },
};
