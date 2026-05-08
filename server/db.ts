import sqlite3 from "sqlite3";
import path from "node:path";
import fs from "node:fs";
import { applyMigrations } from "./migrations/apply.js";

export type RunResult = { lastInsertRowid: number; changes: number };

export type SqlStatement = {
  run: (...params: unknown[]) => Promise<RunResult>;
  get: <T = unknown>(...params: unknown[]) => Promise<T | undefined>;
  all: <T = unknown>(...params: unknown[]) => Promise<T[]>;
};

/** Driver `sqlite3` (node-sqlite3) con API promisificada similar a better-sqlite3. */
export class SqliteDb {
  constructor(private readonly raw: sqlite3.Database) {}

  prepare(sql: string): SqlStatement {
    const raw = this.raw;
    return {
      run: (...params: unknown[]) =>
        new Promise<RunResult>((resolve, reject) => {
          raw.run(sql, params, function (this: sqlite3.RunResult, err: Error | null) {
            if (err) reject(err);
            else resolve({ lastInsertRowid: Number(this.lastID), changes: this.changes });
          });
        }),
      get: <T = unknown>(...params: unknown[]) =>
        new Promise<T | undefined>((resolve, reject) => {
          raw.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row as T | undefined);
          });
        }),
      all: <T = unknown>(...params: unknown[]) =>
        new Promise<T[]>((resolve, reject) => {
          raw.all(sql, params, (err, rows: unknown[]) => {
            if (err) reject(err);
            else resolve((rows as T[]) ?? []);
          });
        }),
    };
  }

  exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.raw.exec(sql, (err) => (err ? reject(err) : resolve()));
    });
  }

  /** Ej. `foreign_keys = ON`. */
  pragma(directive: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.raw.run(`PRAGMA ${directive}`, (err) => (err ? reject(err) : resolve()));
    });
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.exec("BEGIN IMMEDIATE");
    try {
      const out = await fn();
      await this.exec("COMMIT");
      return out;
    } catch (e) {
      try {
        await this.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.raw.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function openRaw(pathStr: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const d = new sqlite3.Database(pathStr, (err) => {
      if (err) reject(err);
      else resolve(d);
    });
  });
}

/** Ruta del archivo SQLite (misma lógica que `initDatabase`). Útil para scripts de mantenimiento. */
export function inventarioDbFilePath(): string {
  let dbPath = process.env.INVENTARIO_DB_PATH;
  if (!dbPath) {
    const base =
      process.env.APPDATA ||
      (process.platform === "darwin"
        ? path.join(process.env.HOME || "", "Library", "Application Support")
        : process.env.HOME
          ? path.join(process.env.HOME, ".local", "share")
          : process.cwd());
    const dir = path.join(base, "inventario-peluqueria");
    fs.mkdirSync(dir, { recursive: true });
    dbPath = path.join(dir, "inventario.sqlite");
  }
  return dbPath;
}

export let db!: SqliteDb;

const schemaSql = `
CREATE TABLE IF NOT EXISTS productos_cache_api (
  codigo_barras TEXT PRIMARY KEY,
  respuesta_json TEXT NOT NULL,
  fecha_consulta TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo_barras TEXT UNIQUE,
  nombre TEXT NOT NULL,
  marca TEXT,
  categoria TEXT,
  descripcion TEXT,
  imagen_url TEXT,
  stock INTEGER NOT NULL DEFAULT 0,
  precio REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo_barras);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT,
  email TEXT,
  notas TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS citas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  inicio TEXT NOT NULL,
  duracion_min INTEGER NOT NULL DEFAULT 60,
  servicio TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  notas TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_citas_inicio ON citas(inicio);
CREATE INDEX IF NOT EXISTS idx_citas_cliente ON citas(cliente_id);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER,
  fecha TEXT NOT NULL,
  total REAL NOT NULL,
  metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
  notas TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);

CREATE TABLE IF NOT EXISTS venta_lineas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL,
  producto_id INTEGER NOT NULL,
  cantidad INTEGER NOT NULL,
  precio_unitario REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  FOREIGN KEY (producto_id) REFERENCES productos(id)
);

CREATE INDEX IF NOT EXISTS idx_lineas_venta ON venta_lineas(venta_id);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidad TEXT NOT NULL,
  accion TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sincronizado INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sync_pendiente ON sync_outbox(sincronizado);
`;

export async function initDatabase(): Promise<void> {
  const raw = await openRaw(inventarioDbFilePath());
  db = new SqliteDb(raw);
  await db.pragma("foreign_keys = ON");
  await db.exec(schemaSql);
  await applyMigrations(db);
}

export async function recordSyncEvent(entidad: string, accion: string, payload: unknown) {
  await db
    .prepare(
      `INSERT INTO sync_outbox (entidad, accion, payload_json, created_at, sincronizado)
     VALUES (?, ?, ?, ?, 0)`
    )
    .run(entidad, accion, JSON.stringify(payload), new Date().toISOString());
}
