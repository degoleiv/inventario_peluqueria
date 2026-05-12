import sqlite3 from "sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
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

/**
 * Raíz del paquete API (`…/server`): misma carpeta con `package.json` del API
 * y la carpeta `data/` persistente. No debe vivir dentro de `dist/` para que
 * `npm run build` no borre la base al limpiar o recompilar.
 */
function serverPackageRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Compilado: …/server/dist/db.js  →  …/server
  if (path.basename(here) === "dist") {
    return path.resolve(here, "..");
  }
  // Desarrollo (tsx): …/server/db.ts  →  …/server
  return here;
}

/**
 * Si existe una base en la ruta antigua del monorepo (`<repo>/data/`, al subir
 * un nivel desde `server/`), se mueve a `server/data/` para no perder datos.
 */
function migrateLegacySqliteIfNeeded(targetDb: string, serverRoot: string): void {
  if (fs.existsSync(targetDb)) return;

  const legacyPairs: { db: string; mediaDir: string }[] = [
    {
      db: path.join(serverRoot, "..", "data", "inventario.sqlite"),
      mediaDir: path.join(serverRoot, "..", "data", "media"),
    },
    {
      db: path.join(serverRoot, "dist", "data", "inventario.sqlite"),
      mediaDir: path.join(serverRoot, "dist", "data", "media"),
    },
  ];

  const targetDir = path.dirname(targetDb);
  const targetMedia = path.join(targetDir, "media");

  for (const { db: legacyDb, mediaDir: legacyMedia } of legacyPairs) {
    if (!fs.existsSync(legacyDb)) continue;
    try {
      fs.renameSync(legacyDb, targetDb);
      console.warn(
        `[db] Se encontró inventario.sqlite en una ubicación antigua (${legacyDb}). ` +
          `Se movió a la carpeta persistente del API: ${targetDb}`
      );
    } catch (e) {
      console.error(`[db] No se pudo mover la base desde ${legacyDb}:`, e);
      throw e;
    }
    if (fs.existsSync(legacyMedia) && !fs.existsSync(targetMedia)) {
      try {
        fs.renameSync(legacyMedia, targetMedia);
        console.warn(`[db] Carpeta media migrada a: ${targetMedia}`);
      } catch {
        fs.cpSync(legacyMedia, targetMedia, { recursive: true });
        fs.rmSync(legacyMedia, { recursive: true, force: true });
        console.warn(`[db] Carpeta media copiada a: ${targetMedia}`);
      }
    }
    return;
  }
}

/** Ruta del archivo SQLite. Útil para scripts de mantenimiento. */
export function inventarioDbFilePath(): string {
  const fromEnv = process.env.INVENTARIO_DB_PATH?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  const serverRoot = serverPackageRoot();
  const dataDir = process.env.INVENTARIO_DATA_DIR?.trim()
    ? path.resolve(process.env.INVENTARIO_DATA_DIR.trim())
    : path.join(serverRoot, "data");

  fs.mkdirSync(dataDir, { recursive: true });
  const dbFile = path.join(dataDir, "inventario.sqlite");

  migrateLegacySqliteIfNeeded(dbFile, serverRoot);

  return dbFile;
}

export let db!: SqliteDb;

/**
 * Inicializa la base de datos.
 * En instalación nueva: aplica todas las migraciones y crea el schema completo.
 * En instalación existente: aplica solo las migraciones pendientes.
 * El schema y las migraciones viven en server/migrations/apply.ts.
 */
export async function initDatabase(): Promise<void> {
  const dbPath = inventarioDbFilePath();
  console.log(`[db] Abriendo base de datos: ${dbPath}`);
  const raw = await openRaw(dbPath);
  db = new SqliteDb(raw);
  await db.pragma("foreign_keys = ON");
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
