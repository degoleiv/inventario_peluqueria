/**
 * Borra por completo el archivo SQLite de la app (y -wal / -shm si existen).
 * Al volver a levantar el API, `initDatabase` recrea tablas y migraciones desde cero.
 *
 * Parámetro obligatorio: --yes
 * Cerrá el servidor API (y cualquier proceso que abra la DB) antes de ejecutar.
 */
import fs from "node:fs";
import { inventarioDbFilePath } from "../server/db.js";

const yes = process.argv.includes("--yes");
if (!yes) {
  console.error(
    "Uso: npm run reset:total -- --yes\n" +
      "Elimina TODA la base de datos local (productos, ventas, usuarios, etc.).\n" +
      "Detené el servidor antes de ejecutar."
  );
  process.exit(1);
}

function tryUnlink(p: string): void {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return;
    throw e;
  }
}

const dbPath = inventarioDbFilePath();
const sidecars = [`${dbPath}-wal`, `${dbPath}-shm`];

try {
  for (const p of [dbPath, ...sidecars]) tryUnlink(p);
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  if (err.code === "EBUSY" || err.code === "EPERM") {
    console.error(
      "No se pudo borrar el archivo (¿sigue abierto el servidor o otro programa?). Cerralo e intentá de nuevo."
    );
    process.exit(1);
  }
  throw e;
}

console.log(`Eliminado (si existía): ${dbPath}`);
console.log("La próxima vez que inicies el API se creará una base vacía y podrás hacer el bootstrap del primer admin.");
