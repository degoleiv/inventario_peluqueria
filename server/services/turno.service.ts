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

const MAX_DIAS_RANGO_TURNO_PLANTILLA = 120;

export type TurnoPlantillaSemanal = {
  fecha_desde: string;
  fecha_hasta: string;
  dias_semana: number[];
  hora_inicio: string;
  hora_fin: string;
};

/** Parsea `turno_inicial` del body de POST /usuarios. Devuelve `undefined` si no aplica. */
export function parseTurnoPlantillaSemanal(raw: unknown): TurnoPlantillaSemanal | undefined {
  if (raw == null || raw === false) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError("turno_inicial inválido");
  }
  const o = raw as Record<string, unknown>;
  const fecha_desde = typeof o.fecha_desde === "string" ? o.fecha_desde.trim().slice(0, 10) : "";
  const fecha_hasta = typeof o.fecha_hasta === "string" ? o.fecha_hasta.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_desde) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_hasta)) {
    throw new AppError("turno_inicial: fechas requeridas (YYYY-MM-DD)");
  }
  const hora_inicio = typeof o.hora_inicio === "string" ? o.hora_inicio.trim() : "";
  const hora_fin = typeof o.hora_fin === "string" ? o.hora_fin.trim() : "";
  if (!hora_inicio || !hora_fin) throw new AppError("turno_inicial: hora_inicio y hora_fin requeridas");

  let dias: number[] = [];
  if (Array.isArray(o.dias_semana)) {
    dias = o.dias_semana
      .map((x) => Number(x))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  }
  dias = [...new Set(dias)].sort((a, b) => a - b);
  if (dias.length === 0) {
    throw new AppError("turno_inicial: elegí al menos un día de la semana (0=dom … 6=sáb)");
  }

  return { fecha_desde, fecha_hasta, dias_semana: dias, hora_inicio, hora_fin };
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

  /** Una fila en `turnos_empleado` por cada fecha en el rango cuyo día de la semana esté en `dias_semana`. */
  async bulkSemanal(empleado_id: number, plantilla: TurnoPlantillaSemanal): Promise<number> {
    const p0 = plantilla.fecha_desde.split("-").map((x) => Number(x));
    const p1 = plantilla.fecha_hasta.split("-").map((x) => Number(x));
    if (p0.length !== 3 || p0.some((n) => !Number.isFinite(n)) || p1.length !== 3 || p1.some((n) => !Number.isFinite(n))) {
      throw new AppError("Fechas inválidas");
    }
    const desde = new Date(p0[0], p0[1] - 1, p0[2]);
    const hasta = new Date(p1[0], p1[1] - 1, p1[2]);
    if (hasta < desde) throw new AppError("La fecha hasta no puede ser anterior a la desde");

    let span = 0;
    for (
      let probe = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
      probe <= hasta;
      probe.setDate(probe.getDate() + 1)
    ) {
      span++;
      if (span > MAX_DIAS_RANGO_TURNO_PLANTILLA) {
        throw new AppError(`El rango no puede superar ${MAX_DIAS_RANGO_TURNO_PLANTILLA} días`);
      }
    }

    const diasSet = new Set(plantilla.dias_semana);
    let created = 0;
    for (let i = 0; ; i++) {
      const cur = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + i);
      if (cur > hasta) break;
      if (i >= MAX_DIAS_RANGO_TURNO_PLANTILLA) {
        throw new AppError(`El rango no puede superar ${MAX_DIAS_RANGO_TURNO_PLANTILLA} días`);
      }
      if (!diasSet.has(cur.getDay())) continue;
      const fecha = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      await this.create({
        empleado_id,
        fecha,
        hora_inicio: plantilla.hora_inicio,
        hora_fin: plantilla.hora_fin,
        estado: "activo",
      });
      created++;
      if (created > MAX_DIAS_RANGO_TURNO_PLANTILLA) {
        throw new AppError(`Máximo ${MAX_DIAS_RANGO_TURNO_PLANTILLA} turnos por operación`);
      }
    }
    return created;
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
