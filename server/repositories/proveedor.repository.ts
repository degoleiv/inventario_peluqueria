import type Database from "better-sqlite3";
import { db } from "../db.js";

/** Fila persistida (SQLite). */
export type ProveedorRow = {
  id: number;
  nombre: string;
  nit: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  estado: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
};

function dbh(): Database.Database {
  return db;
}

export type ProveedorListFilter = {
  /** Sin permiso de gestión: sólo activos. */
  forceSoloActivos: boolean;
  /** Con permiso: false = sólo activos (compat API sin incluir_inactivos). */
  incluirTodosLosEstados: boolean;
  estado: "todos" | "activo" | "inactivo";
  /** Patrones LIKE ya con %…% o null. */
  searchPattern: string | null;
};

export const proveedorRepository = {
  listFiltered(opts: ProveedorListFilter): ProveedorRow[] {
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
    const sql = `SELECT id, nombre, nit, telefono, email, direccion, estado, fecha_creacion, fecha_actualizacion
         FROM proveedores ${where} ORDER BY nombre COLLATE NOCASE`;
    return dbh().prepare(sql).all(...params) as ProveedorRow[];
  },

  countPedidosByProveedorId(proveedorId: number): number {
    const row = dbh()
      .prepare(`SELECT COUNT(*) AS c FROM pedidos_proveedor WHERE proveedor_id = ?`)
      .get(proveedorId) as { c: number } | undefined;
    return row?.c ?? 0;
  },

  deleteById(id: number): void {
    dbh().prepare(`DELETE FROM proveedores WHERE id = ?`).run(id);
  },

  findById(id: number): ProveedorRow | undefined {
    return dbh()
      .prepare(
        `SELECT id, nombre, nit, telefono, email, direccion, estado, fecha_creacion, fecha_actualizacion
         FROM proveedores WHERE id = ?`
      )
      .get(id) as ProveedorRow | undefined;
  },

  findByNitNormalized(nit: string, excludeId?: number): { id: number } | undefined {
    const n = nit.trim().toLowerCase();
    if (excludeId != null) {
      return dbh()
        .prepare(
          `SELECT id FROM proveedores WHERE lower(trim(nit)) = ? AND id != ?`
        )
        .get(n, excludeId) as { id: number } | undefined;
    }
    return dbh()
      .prepare(`SELECT id FROM proveedores WHERE lower(trim(nit)) = ?`)
      .get(n) as { id: number } | undefined;
  },

  insert(row: {
    nombre: string;
    nit: string;
    telefono: string | null;
    email: string | null;
    direccion: string | null;
    estado: string;
    fecha_creacion: string;
    fecha_actualizacion: string;
    created_at: string | null;
  }) {
    const hasCreated = columnExists("created_at");
    if (hasCreated) {
      return dbh()
        .prepare(
          `INSERT INTO proveedores (
            nombre, nit, telefono, email, direccion, estado,
            fecha_creacion, fecha_actualizacion, created_at
          ) VALUES (?,?,?,?,?,?,?,?,?)`
        )
        .run(
          row.nombre,
          row.nit,
          row.telefono,
          row.email,
          row.direccion,
          row.estado,
          row.fecha_creacion,
          row.fecha_actualizacion,
          row.created_at ?? row.fecha_creacion
        );
    }
    return dbh()
      .prepare(
        `INSERT INTO proveedores (
          nombre, nit, telefono, email, direccion, estado,
          fecha_creacion, fecha_actualizacion
        ) VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(
        row.nombre,
        row.nit,
        row.telefono,
        row.email,
        row.direccion,
        row.estado,
        row.fecha_creacion,
        row.fecha_actualizacion
      );
  },

  update(
    id: number,
    patch: {
      nombre: string;
      nit: string;
      telefono: string | null;
      email: string | null;
      direccion: string | null;
      estado: string;
      fecha_actualizacion: string;
    }
  ) {
    const hasCreated = columnExists("created_at");
    if (hasCreated) {
      dbh()
        .prepare(
          `UPDATE proveedores SET
            nombre = ?, nit = ?, telefono = ?, email = ?, direccion = ?,
            estado = ?, fecha_actualizacion = ?, created_at = ?
          WHERE id = ?`
        )
        .run(
          patch.nombre,
          patch.nit,
          patch.telefono,
          patch.email,
          patch.direccion,
          patch.estado,
          patch.fecha_actualizacion,
          patch.fecha_actualizacion,
          id
        );
      return;
    }
    dbh()
      .prepare(
        `UPDATE proveedores SET
          nombre = ?, nit = ?, telefono = ?, email = ?, direccion = ?,
          estado = ?, fecha_actualizacion = ?
        WHERE id = ?`
      )
      .run(
        patch.nombre,
        patch.nit,
        patch.telefono,
        patch.email,
        patch.direccion,
        patch.estado,
        patch.fecha_actualizacion,
        id
      );
  },

  setEstado(id: number, estado: string, fecha_actualizacion: string) {
    const hasCreated = columnExists("created_at");
    if (hasCreated) {
      dbh()
        .prepare(
          `UPDATE proveedores SET estado = ?, fecha_actualizacion = ?, created_at = ? WHERE id = ?`
        )
        .run(estado, fecha_actualizacion, fecha_actualizacion, id);
    } else {
      dbh()
        .prepare(`UPDATE proveedores SET estado = ?, fecha_actualizacion = ? WHERE id = ?`)
        .run(estado, fecha_actualizacion, id);
    }
  },
};

function columnExists(col: string): boolean {
  const rows = dbh().prepare(`PRAGMA table_info(proveedores)`).all() as { name: string }[];
  return rows.some((r) => r.name === col);
}
