import { businessHours } from "../config.js";
import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";

const ESTADOS = new Set(["pendiente", "confirmado", "cancelado"]);

function parseMs(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) throw new AppError("Fecha/hora de cita inválida");
  return t;
}

function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
) {
  return aStart < bEnd && aEnd > bStart;
}

function assertNoOverlap(
  inicioIso: string,
  duracionMin: number,
  excludeId: number | null
) {
  const start = parseMs(inicioIso);
  const end = start + duracionMin * 60_000;
  const { open, close } = businessHours();
  const d = new Date(inicioIso);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < open || h + duracionMin / 60 > close) {
    throw new AppError(
      `Cita fuera de horario laboral (config: ${open}h–${close}h, BUSINESS_OPEN_HOUR / BUSINESS_CLOSE_HOUR)`
    );
  }

  const rows = db
    .prepare(
      `SELECT id, inicio, duracion_min FROM citas
       WHERE estado NOT IN ('cancelado','cancelada')`
    )
    .all() as { id: number; inicio: string; duracion_min: number }[];

  for (const r of rows) {
    if (excludeId != null && r.id === excludeId) continue;
    const rs = parseMs(r.inicio);
    const re = rs + r.duracion_min * 60_000;
    if (rangesOverlap(start, end, rs, re)) {
      throw new AppError("Ya existe una cita solapada en ese horario");
    }
  }
}

function crearCita(body: Record<string, unknown>) {
  const cid = Number(body.cliente_id);
  if (!Number.isFinite(cid)) throw new AppError("cliente_id requerido");
  const inicio = typeof body.inicio === "string" ? body.inicio.trim() : "";
  if (!inicio) throw new AppError("inicio requerido (ISO)");
  const duracion_min =
    typeof body.duracion_min === "number" && body.duracion_min > 0
      ? Math.floor(body.duracion_min)
      : 60;
  let estado =
    typeof body.estado === "string" && body.estado ? body.estado : "pendiente";
  if (!ESTADOS.has(estado)) estado = "pendiente";

  if (estado !== "cancelado") assertNoOverlap(inicio, duracion_min, null);

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO citas (cliente_id, inicio, duracion_min, servicio, estado, notas, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      cid,
      inicio,
      duracion_min,
      typeof body.servicio === "string" ? body.servicio || null : null,
      estado,
      typeof body.notas === "string" ? body.notas || null : null,
      now,
      now
    );
  const row = db
    .prepare(
      `SELECT c.*, cl.nombre AS cliente_nombre FROM citas c JOIN clientes cl ON cl.id = c.cliente_id WHERE c.id = ?`
    )
    .get(info.lastInsertRowid);
  recordSyncEvent("cita", "creada", row);
  return row;
}

export const citaService = {
  list() {
    return db
      .prepare(
        `SELECT c.*, cl.nombre AS cliente_nombre
         FROM citas c
         JOIN clientes cl ON cl.id = c.cliente_id
         ORDER BY c.inicio ASC`
      )
      .all();
  },

  create: crearCita,

  update(id: number, body: Record<string, unknown>) {
    const existing = db.prepare(`SELECT * FROM citas WHERE id = ?`).get(id) as Record<
      string,
      unknown
    > | undefined;
    if (!existing) throw new AppError("no encontrado", 404);

    const cliente_id =
      typeof body.cliente_id === "number" && Number.isFinite(body.cliente_id)
        ? body.cliente_id
        : Number(existing.cliente_id);
    const inicio =
      typeof body.inicio === "string" ? body.inicio.trim() : String(existing.inicio);
    const duracion_min =
      typeof body.duracion_min === "number" && body.duracion_min > 0
        ? Math.floor(body.duracion_min)
        : Number(existing.duracion_min);
    let estado =
      typeof body.estado === "string" && body.estado ? body.estado : String(existing.estado);
    if (!ESTADOS.has(estado)) estado = "pendiente";

    if (estado !== "cancelado") {
      assertNoOverlap(inicio, duracion_min, id);
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE citas SET cliente_id = ?, inicio = ?, duracion_min = ?, servicio = ?, estado = ?, notas = ?, updated_at = ? WHERE id = ?`
    ).run(
      cliente_id,
      inicio,
      duracion_min,
      typeof body.servicio === "string" ? body.servicio || null : existing.servicio,
      estado,
      typeof body.notas === "string" ? body.notas || null : existing.notas,
      now,
      id
    );
    const row = db
      .prepare(
        `SELECT c.*, cl.nombre AS cliente_nombre FROM citas c JOIN clientes cl ON cl.id = c.cliente_id WHERE c.id = ?`
      )
      .get(id);
    recordSyncEvent("cita", "actualizada", row);
    return row;
  },

  delete(id: number) {
    const row = db
      .prepare(
        `SELECT c.*, cl.nombre AS cliente_nombre FROM citas c JOIN clientes cl ON cl.id = c.cliente_id WHERE c.id = ?`
      )
      .get(id);
    const info = db.prepare(`DELETE FROM citas WHERE id = ?`).run(id);
    if (info.changes === 0) throw new AppError("no encontrado", 404);
    recordSyncEvent("cita", "eliminada", row);
  },

  /**
   * Slots libres en un día (intervalos de 15 min) respetando horario comercial y solapamientos.
   * `fechaDia` = YYYY-MM-DD (interpretación en hora local del servidor).
   */
  sugerirHorarios(fechaDia: string, duracionMin: number) {
    const dur = Math.max(15, Math.floor(duracionMin));
    const parts = fechaDia.trim().split("-").map((x) => Number(x));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
      throw new AppError("fecha debe ser YYYY-MM-DD");
    }
    const [yy, mm, dd] = parts;
    const { open, close } = businessHours();
    const slotMs = 15 * 60 * 1000;
    const slots: string[] = [];
    const startDay = new Date(yy, mm - 1, dd, Math.floor(open), Math.round((open % 1) * 60), 0, 0);
    const endClose = new Date(yy, mm - 1, dd, Math.floor(close), Math.round((close % 1) * 60), 0, 0);
    for (let t = startDay.getTime(); t + dur * 60_000 <= endClose.getTime(); t += slotMs) {
      const inicioIso = new Date(t).toISOString();
      try {
        assertNoOverlap(inicioIso, dur, null);
        slots.push(inicioIso);
        if (slots.length >= 64) break;
      } catch {
        /* ocupado */
      }
    }
    return { fecha: fechaDia, duracion_min: dur, slots };
  },

  /** Varias citas espaciadas por `intervalo_dias` (p.ej. cada 15 días). Falla si algún slot choca. */
  crearSerieRecurrente(body: Record<string, unknown>) {
    const reps = Math.min(52, Math.max(1, Math.floor(Number(body.repeticiones ?? 6))));
    const intervalo = Math.max(1, Math.floor(Number(body.intervalo_dias ?? 14)));
    const inicioPrimera =
      typeof body.inicio_primera === "string" ? body.inicio_primera.trim() : "";
    if (!inicioPrimera) throw new AppError("inicio_primera requerido (ISO)");
    let t = parseMs(inicioPrimera);
    const ids: number[] = [];
    for (let i = 0; i < reps; i++) {
      const inicioIso = new Date(t).toISOString();
      const row = crearCita({
        cliente_id: body.cliente_id,
        inicio: inicioIso,
        duracion_min: body.duracion_min,
        servicio: body.servicio,
        estado: typeof body.estado === "string" ? body.estado : undefined,
        notas: body.notas,
      }) as { id: number };
      ids.push(row.id);
      t += intervalo * 86_400_000;
    }
    return { ids, creadas: ids.length, intervalo_dias: intervalo };
  },
};
