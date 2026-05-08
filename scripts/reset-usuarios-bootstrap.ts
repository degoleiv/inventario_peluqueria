/**
 * Vacía la tabla `usuarios` (y filas que la referencian con FK) para volver a mostrar
 * el flujo de "primer administrador" en la app. No hay registro público de usuarios.
 *
 * Parámetro obligatorio: --yes
 * Cerrá el servidor API antes de ejecutar para evitar bloqueos del archivo SQLite.
 */
import fs from "node:fs";
import sqlite3 from "sqlite3";
import { inventarioDbFilePath } from "../server/db.js";

function openDb(pathStr: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const d = new sqlite3.Database(pathStr, (err) => {
      if (err) reject(err);
      else resolve(d);
    });
  });
}

function execSql(db: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

const yes = process.argv.includes("--yes");
if (!yes) {
  console.error(
    "Uso: npm run reset:bootstrap -- --yes\n" +
      "Esto borra todos los usuarios y datos ligados (comisiones, turnos, movimientos de empleado).\n" +
      "Detené el servidor antes de ejecutar."
  );
  process.exit(1);
}

const dbPath = inventarioDbFilePath();
if (!fs.existsSync(dbPath)) {
  console.error(`No existe la base de datos: ${dbPath}`);
  process.exit(1);
}

console.log(`Base: ${dbPath}`);

const raw = await openDb(dbPath);
try {
  await execSql(
    raw,
    `PRAGMA foreign_keys = ON;
     DELETE FROM empleado_movimientos;
     DELETE FROM turnos_empleado;
     DELETE FROM comisiones;
     DELETE FROM usuarios;`
  );
  console.log(
    "Hecho: sin usuarios. Al iniciar la app podés crear de nuevo el primer administrador (bootstrap)."
  );
} finally {
  await new Promise<void>((resolve, reject) => {
    raw.close((err) => (err ? reject(err) : resolve()));
  });
}
