import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const TEST_DB_DIR = path.join(os.tmpdir(), "inventario-peluqueria-tests");
fs.mkdirSync(TEST_DB_DIR, { recursive: true });

/* Mismo archivo durante toda la corrida (singleFork). resetDb() limpia entre tests. */
const dbFile = path.join(TEST_DB_DIR, `test-${process.pid}.sqlite`);

process.env.INVENTARIO_DB_PATH = dbFile;
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
process.env.NODE_ENV = "test";
