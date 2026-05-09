/**
 * Borra TODO el historial de ventas:
 *   - facturas_electronicas
 *   - movimientos_inventario donde venta_id IS NOT NULL
 *   - venta_lineas
 *   - comisiones
 *   - ventas
 *
 * NO modifica stock ni puntos de fidelidad de los clientes:
 * la idea es solo limpiar el historial sin "deshacer" los efectos de cada venta
 * (lo que podría dejar inconsistencias en stock y puntos).
 *
 * Parámetro obligatorio: --yes
 * Cerrá el servidor API antes de ejecutar.
 */
import sqlite3 from "sqlite3";
import { inventarioDbFilePath } from "../server/db.js";

const yes = process.argv.includes("--yes");
if (!yes) {
  console.error(
    "Uso: npm run reset:ventas -- --yes\n" +
      "Elimina TODO el historial de ventas (ventas, líneas, facturas, comisiones, movimientos por venta).\n" +
      "No revierte stock ni puntos de clientes.\n" +
      "Detené el servidor antes de ejecutar."
  );
  process.exit(1);
}

function openRaw(pathStr: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const d = new sqlite3.Database(pathStr, (err) => {
      if (err) reject(err);
      else resolve(d);
    });
  });
}

function exec(d: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    d.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function run(d: sqlite3.Database, sql: string): Promise<number> {
  return new Promise((resolve, reject) => {
    d.run(sql, function (this: sqlite3.RunResult, err: Error | null) {
      if (err) reject(err);
      else resolve(this.changes ?? 0);
    });
  });
}

async function main() {
  const dbPath = inventarioDbFilePath();
  console.log(`Base de datos: ${dbPath}`);
  const d = await openRaw(dbPath);
  try {
    await exec(d, "PRAGMA foreign_keys = ON");
    await exec(d, "BEGIN IMMEDIATE");
    try {
      const facturas = await run(d, "DELETE FROM facturas_electronicas");
      const movimientos = await run(
        d,
        "DELETE FROM movimientos_inventario WHERE venta_id IS NOT NULL"
      );
      const lineas = await run(d, "DELETE FROM venta_lineas");
      const comisiones = await run(d, "DELETE FROM comisiones");
      const ventas = await run(d, "DELETE FROM ventas");
      await exec(d, "COMMIT");
      console.log("Eliminados:");
      console.log(`  ventas:                 ${ventas}`);
      console.log(`  venta_lineas:           ${lineas}`);
      console.log(`  facturas_electronicas:  ${facturas}`);
      console.log(`  comisiones:             ${comisiones}`);
      console.log(`  movimientos_inventario: ${movimientos}`);
      console.log("Listo. El historial de ventas quedó vacío.");
    } catch (e) {
      try {
        await exec(d, "ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    }
  } finally {
    await new Promise<void>((resolve) => d.close(() => resolve()));
  }
}

main().catch((err) => {
  const e = err as NodeJS.ErrnoException;
  if (e.code === "SQLITE_BUSY" || e.code === "EBUSY") {
    console.error(
      "La base está ocupada. Cerrá el servidor (npm run dev) y volvé a intentar."
    );
    process.exit(1);
  }
  console.error("Error al limpiar el historial de ventas:", err);
  process.exit(1);
});
