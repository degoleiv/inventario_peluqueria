import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const E2E_DB = path.join(os.tmpdir(), "inventario-peluqueria-e2e.sqlite");

/**
 * El servidor mantiene un handle abierto sobre la DB SQLite, por lo que no
 * podemos borrar el archivo en caliente. En su lugar, contamos con que la
 * primera prueba realice el flujo de bootstrap y los tests posteriores
 * reutilicen el admin creado.
 */
export const E2E_ADMIN = {
  email: "e2e@admin.com",
  password: "secret123",
  nombre: "E2E Admin",
};

export function dbExists(): boolean {
  return fs.existsSync(E2E_DB);
}
