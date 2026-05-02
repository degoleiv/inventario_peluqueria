import { db } from "../db.js";

/** Registro de cambios para trazabilidad (auditoría ligera). Ampliar llamadas desde rutas críticas. */
export const auditService = {
  log(
    usuarioId: number | null | undefined,
    accion: string,
    entidad: string,
    entidadId: number | null,
    detalle?: Record<string, unknown>
  ) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalle_json, created_at)
       VALUES (?,?,?,?,?,?)`
    ).run(
      usuarioId ?? null,
      accion,
      entidad,
      entidadId,
      detalle ? JSON.stringify(detalle) : null,
      now
    );
  },

  list(limit = 100) {
    const lim = Math.min(500, Math.max(1, limit));
    return db
      .prepare(
        `SELECT a.*, u.email AS usuario_email
         FROM auditoria a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         ORDER BY a.id DESC
         LIMIT ?`
      )
      .all(lim);
  },
};
