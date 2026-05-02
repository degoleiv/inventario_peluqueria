import { db } from "../db.js";

/** Tabla y listado preparados; reglas de aplicación en checkout vendrá en una iteración futura. */
export const promocionesService = {
  list() {
    return db.prepare(`SELECT * FROM promociones ORDER BY activo DESC, id DESC`).all();
  },
};
