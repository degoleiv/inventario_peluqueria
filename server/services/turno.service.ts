import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";

function parseHm(h: string): { h: number; m: number } {
  const s = h.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new AppError("Horario inválido (usá HH:MM)");
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) throw new AppError("Horario inválido");
  return { h: hh, m: mm };
}

function toMinutes(h: string): number {
  const { h: hh, m: mm } = parseHm(h);
  return hh * 60 + mm;
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number) {
  return a0 < b1 && a1 > b0;
}

export const turnoService = {
  async list(desde?: string, hasta?: string, empleadoId?: number) {
    let sql = `SELECT t.*, u.nombre AS empleado_nombre FROM turnos_empleado t
               JOIN usuarios u ON u.id = t.empleado_id WHERE 1=1`;
    const params: (string | number)[] = [];
    if (empleadoId != null) {
      sql += ` AND t.empleado_id = ?`;
      params.push(empleadoId);
    }
    if (desde) {
      sql += ` AND t.fecha >= ?`;
      params.push(desde);
    }
    if (hasta) {
      sql += ` AND t.fecha <= ?`;
      params.push(hasta);
    }
    sql += ` ORDER BY t.fecha ASC, t.hora_inicio ASC`;
    return await db.prepare(sql).all(...params);
  },

  async create(body: Record<string, unknown>) {
    const empleado_id = Number(body.empleado_id);
    if (!Number.isFinite(empleado_id)) throw new AppError("empleado_id requerido");
    const ok = (await db.prepare(`SELECT id FROM usuarios WHERE id = ?`).get(empleado_id)) as
      | { id: number }
      | undefined;
    if (!ok) throw new AppError("Empleado no encontrado");

    const fecha = typeof body.fecha === "string" ? body.fecha.trim().slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new AppError("fecha requerida (YYYY-MM-DD)");

    const hora_inicio = typeof body.hora_inicio === "string" ? body.hora_inicio : "";
    const hora_fin = typeof body.hora_fin === "string" ? body.hora_fin : "";
    const s0 = toMinutes(hora_inicio);
    const s1 = toMinutes(hora_fin);
    if (s1 <= s0) throw new AppError("hora_fin debe ser posterior a hora_inicio");

    let estado = typeof body.estado === "string" ? body.estado : "activo";
    if (estado !== "activo" && estado !== "finalizado") estado = "activo";

    const rows = (await db
      .prepare(
        `SELECT id, hora_inicio, hora_fin FROM turnos_empleado WHERE empleado_id = ? AND fecha = ?`
      )
      .all(empleado_id, fecha)) as { id: number; hora_inicio: string; hora_fin: string }[];

    for (const r of rows) {
      const r0 = toMinutes(r.hora_inicio);
      const r1 = toMinutes(r.hora_fin);
      if (rangesOverlap(s0, s1, r0, r1)) {
        throw new AppError("El turno se solapa con otro del mismo día");
      }
    }

    const now = new Date().toISOString();
    const info = await db
      .prepare(
        `INSERT INTO turnos_empleado (empleado_id, fecha, hora_inicio, hora_fin, estado, created_at)
         VALUES (?,?,?,?,?,?)`
      )
      .run(empleado_id, fecha, hora_inicio.trim(), hora_fin.trim(), estado, now);

    return await db
      .prepare(
        `SELECT t.*, u.nombre AS empleado_nombre FROM turnos_empleado t
         JOIN usuarios u ON u.id = t.empleado_id WHERE t.id = ?`
      )
      .get(info.lastInsertRowid);
  },

  async update(id: number, body: Record<string, unknown>) {
    const ex = (await db
      .prepare(`SELECT * FROM turnos_empleado WHERE id = ?`)
      .get(id)) as Record<string, unknown> | undefined;
    if (!ex) throw new AppError("no encontrado", 404);

    const empleado_id =
      body.empleado_id != null && Number.isFinite(Number(body.empleado_id))
        ? Math.floor(Number(body.empleado_id))
        : Number(ex.empleado_id);
    const ok = (await db.prepare(`SELECT id FROM usuarios WHERE id = ?`).get(empleado_id)) as
      | { id: number }
      | undefined;
    if (!ok) throw new AppError("Empleado no encontrado");

    const fecha =
      typeof body.fecha === "string" ? body.fecha.trim().slice(0, 10) : String(ex.fecha);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new AppError("fecha inválida");

    const hora_inicio =
      typeof body.hora_inicio === "string" ? body.hora_inicio : String(ex.hora_inicio);
    const hora_fin = typeof body.hora_fin === "string" ? body.hora_fin : String(ex.hora_fin);
    const s0 = toMinutes(hora_inicio);
    const s1 = toMinutes(hora_fin);
    if (s1 <= s0) throw new AppError("hora_fin debe ser posterior a hora_inicio");

    let estado = typeof body.estado === "string" ? body.estado : String(ex.estado);
    if (estado !== "activo" && estado !== "finalizado") estado = "activo";

    const rows = (await db
      .prepare(
        `SELECT id, hora_inicio, hora_fin FROM turnos_empleado WHERE empleado_id = ? AND fecha = ? AND id != ?`
      )
      .all(empleado_id, fecha, id)) as { id: number; hora_inicio: string; hora_fin: string }[];

    for (const r of rows) {
      const r0 = toMinutes(r.hora_inicio);
      const r1 = toMinutes(r.hora_fin);
      if (rangesOverlap(s0, s1, r0, r1)) {
        throw new AppError("El turno se solapa con otro del mismo día");
      }
    }

    await db
      .prepare(
        `UPDATE turnos_empleado SET empleado_id = ?, fecha = ?, hora_inicio = ?, hora_fin = ?, estado = ? WHERE id = ?`
      )
      .run(empleado_id, fecha, hora_inicio.trim(), hora_fin.trim(), estado, id);

    return await db
      .prepare(
        `SELECT t.*, u.nombre AS empleado_nombre FROM turnos_empleado t
         JOIN usuarios u ON u.id = t.empleado_id WHERE t.id = ?`
      )
      .get(id);
  },

  async delete(id: number) {
    const info = await db.prepare(`DELETE FROM turnos_empleado WHERE id = ?`).run(id);
    if (info.changes === 0) throw new AppError("no encontrado", 404);
  },
};
