import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { applyMigrations } from "./migrations/apply.js";

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

export const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

db.exec(`
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
`);

applyMigrations(db);

export function recordSyncEvent(entidad: string, accion: string, payload: unknown) {
  db.prepare(
    `INSERT INTO sync_outbox (entidad, accion, payload_json, created_at, sincronizado)
     VALUES (?, ?, ?, ?, 0)`
  ).run(entidad, accion, JSON.stringify(payload), new Date().toISOString());
}
