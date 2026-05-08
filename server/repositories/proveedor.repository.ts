import type { RunResult } from "../db.js";
import { db } from "../db.js";

/** Fila persistida (SQLite). */
export type ProveedorRow = {
  id: number;
  nombre: string;
  nit: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  icono_url: string | null;
  estado: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
};

export type ProveedorListFilter = {
  /** Sin permiso de gestión: sólo activos. */
  forceSoloActivos: boolean;
  /** Con permiso: false = sólo activos (compat API sin incluir_inactivos). */
  incluirTodosLosEstados: boolean;
  estado: "todos" | "activo" | "inactivo";
  /** Patrones LIKE ya con %…% o null. */
  searchPattern: string | null;
};

async function columnExists(col: string): Promise<boolean> {
  const rows = (await db.prepare(`PRAGMA table_info(proveedores)`).all()) as { name: string }[];
  return rows.some((r) => r.name === col);
}

export const proveedorRepository = {
  async listFiltered(opts: ProveedorListFilter): Promise<ProveedorRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.forceSoloActivos) {
      conditions.push(`estado = 'activo'`);
    } else if (!opts.incluirTodosLosEstados) {
      conditions.push(`estado = 'activo'`);
    } else if (opts.estado === "activo") {
      conditions.push(`estado = 'activo'`);
    } else if (opts.estado === "inactivo") {
      conditions.push(`estado = 'inactivo'`);
    }

    if (opts.searchPattern) {
      conditions.push(`(lower(nombre) LIKE lower(?) OR lower(estado) LIKE lower(?))`);
      params.push(opts.searchPattern, opts.searchPattern);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT id, nombre, nit, telefono, email, direccion, icono_url, estado, fecha_creacion, fecha_actualizacion
         FROM proveedores ${where} ORDER BY nombre COLLATE NOCASE`;
    return (await db.prepare(sql).all(...params)) as ProveedorRow[];
  },

  async countPedidosByProveedorId(proveedorId: number): Promise<number> {
    const row = (await db
      .prepare(`SELECT COUNT(*) AS c FROM pedidos_proveedor WHERE proveedor_id = ?`)
      .get(proveedorId)) as { c: number } | undefined;
    return row?.c ?? 0;
  },

  async deleteById(id: number): Promise<void> {
    await db.prepare(`DELETE FROM proveedores WHERE id = ?`).run(id);
  },

  async findById(id: number): Promise<ProveedorRow | undefined> {
    return (await db
      .prepare(
        `SELECT id, nombre, nit, telefono, email, direccion, icono_url, estado, fecha_creacion, fecha_actualizacion
         FROM proveedores WHERE id = ?`
      )
      .get(id)) as ProveedorRow | undefined;
  },

  async findByNitNormalized(nit: string, excludeId?: number): Promise<{ id: number } | undefined> {
    const n = nit.trim().toLowerCase();
    if (excludeId != null) {
      return (await db
        .prepare(`SELECT id FROM proveedores WHERE lower(trim(nit)) = ? AND id != ?`)
        .get(n, excludeId)) as { id: number } | undefined;
    }
    return (await db.prepare(`SELECT id FROM proveedores WHERE lower(trim(nit)) = ?`).get(n)) as
      | { id: number }
      | undefined;
  },

  async insert(row: {
    nombre: string;
    nit: string;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    icono_url: string | null;
    estado: string;
    fecha_creacion: string;
    fecha_actualizacion: string;
    created_at: string | null;
  }): Promise<RunResult> {
    const hasCreated = await columnExists("created_at");
    if (hasCreated) {
      return db
        .prepare(
          `INSERT INTO proveedores (
            nombre, nit, telefono, email, direccion, icono_url, estado,
            fecha_creacion, fecha_actualizacion, created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          row.nombre,
          row.nit,
          row.telefono,
          row.email,
          row.direccion,
          row.icono_url,
          row.estado,
          row.fecha_creacion,
          row.fecha_actualizacion,
          row.created_at ?? row.fecha_creacion
        );
    }
    return db
      .prepare(
        `INSERT INTO proveedores (
          nombre, nit, telefono, email, direccion, icono_url, estado,
          fecha_creacion, fecha_actualizacion
        ) VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        row.nombre,
        row.nit,
        row.telefono,
        row.email,
        row.direccion,
        row.icono_url,
        row.estado,
        row.fecha_creacion,
        row.fecha_actualizacion
      );
  },

  async update(
    id: number,
    patch: {
      nombre: string;
      nit: string;
      telefono: string | null;
      email: string | null;
      direccion: string | null;
      icono_url: string | null;
      estado: string;
      fecha_actualizacion: string;
    }
  ): Promise<void> {
    const hasCreated = await columnExists("created_at");
    if (hasCreated) {
      await db
        .prepare(
          `UPDATE proveedores SET
            nombre = ?, nit = ?, telefono = ?, email = ?, direccion = ?, icono_url = ?,
            estado = ?, fecha_actualizacion = ?, created_at = ?
          WHERE id = ?`
        )
        .run(
          patch.nombre,
          patch.nit,
          patch.telefono,
          patch.email,
          patch.direccion,
          patch.icono_url,
          patch.estado,
          patch.fecha_actualizacion,
          patch.fecha_actualizacion,
          id
        );
      return;
    }
    await db
      .prepare(
        `UPDATE proveedores SET
          nombre = ?, nit = ?, telefono = ?, email = ?, direccion = ?, icono_url = ?,
          estado = ?, fecha_actualizacion = ?
        WHERE id = ?`
      )
      .run(
        patch.nombre,
        patch.nit,
        patch.telefono,
        patch.email,
        patch.direccion,
        patch.icono_url,
        patch.estado,
        patch.fecha_actualizacion,
        id
      );
  },

  async setEstado(id: number, estado: string, fecha_actualizacion: string): Promise<void> {
    const hasCreated = await columnExists("created_at");
    if (hasCreated) {
      await db
        .prepare(
          `UPDATE proveedores SET estado = ?, fecha_actualizacion = ?, created_at = ? WHERE id = ?`
        )
        .run(estado, fecha_actualizacion, fecha_actualizacion, id);
    } else {
      await db
        .prepare(`UPDATE proveedores SET estado = ?, fecha_actualizacion = ? WHERE id = ?`)
        .run(estado, fecha_actualizacion, id);
    }
  },
};
