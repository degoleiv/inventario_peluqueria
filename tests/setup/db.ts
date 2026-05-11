import { initDatabase, db } from "../../server/db.js";

let initialized = false;

export async function ensureDb() {
  if (!initialized) {
    await initDatabase();
    initialized = true;
  }
}

/* Tablas semilla que no deben truncarse entre tests para que las migraciones
   no tengan que volver a aplicarse. Mantienen los correlativos en 0 y la
   configuración por defecto. */
const SEED_TABLES = new Set(["correlativos", "configuracion", "roles_app"]);

export async function resetDb() {
  await ensureDb();
  const tables = (await db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all()) as { name: string }[];
  await db.pragma("foreign_keys = OFF");
  for (const t of tables) {
    if (SEED_TABLES.has(t.name)) continue;
    await db.exec(`DELETE FROM "${t.name}"`);
  }
  /* Reinicia correlativos para que las pruebas vean numero=1 al emitir la primera factura */
  await db.exec(`UPDATE correlativos SET ultimo = 0`);
  try {
    await db.exec(
      `DELETE FROM sqlite_sequence WHERE name IN (${tables
        .filter((t) => !SEED_TABLES.has(t.name))
        .map(() => "?")
        .join(",")})`
    );
  } catch {
    /* sqlite_sequence puede no existir si no hay AUTOINCREMENT usado */
  }
  await db.pragma("foreign_keys = ON");
}
