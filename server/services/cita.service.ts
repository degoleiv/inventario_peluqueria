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

/** Mismo profesional (null con null = agenda “única” compartida). */
function mismoProfesional(a: number | null, b: number | null) {
  return (a ?? null) === (b ?? null);
}

async function parseUsuarioIdOrThrow(
  body: Record<string, unknown>,
  required: boolean
): Promise<number | null> {
  if (body.usuario_id == null || body.usuario_id === "") {
    if (required) throw new AppError("Seleccioná un profesional (usuario_id)");
    return null;
  }
  const n = Number(body.usuario_id);
  if (!Number.isFinite(n)) throw new AppError("usuario_id inválido");
  const ok = (await db.prepare(`SELECT id FROM usuarios WHERE id = ? AND activo = 1`).get(n)) as
    | { id: number }
    | undefined;
  if (!ok) throw new AppError("Profesional no encontrado o inactivo");
  return n;
}

async function assertNoOverlap(
  inicioIso: string,
  duracionMin: number,
  excludeId: number | null,
  staffId: number | null
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

  const rows = (await db
    .prepare(
      `SELECT id, inicio, duracion_min, usuario_id FROM citas
       WHERE estado NOT IN ('cancelado','cancelada')`
    )
    .all()) as { id: number; inicio: string; duracion_min: number; usuario_id: number | null }[];

  for (const r of rows) {
    if (excludeId != null && r.id === excludeId) continue;
    const rid = r.usuario_id != null ? Number(r.usuario_id) : null;
    if (!mismoProfesional(staffId, rid)) continue;
    const rs = parseMs(r.inicio);
    const re = rs + r.duracion_min * 60_000;
    if (rangesOverlap(start, end, rs, re)) {
      throw new AppError("Ya existe una cita solapada para ese profesional");
    }
  }
}

const rowSql = `SELECT c.*, cl.nombre AS cliente_nombre,
    u.nombre AS empleado_nombre, u.color_agenda AS empleado_color
    FROM citas c
    JOIN clientes cl ON cl.id = c.cliente_id
    LEFT JOIN usuarios u ON u.id = c.usuario_id`;

async function crearCita(body: Record<string, unknown>) {
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

  const usuario_id = await parseUsuarioIdOrThrow(body, true);

  if (estado !== "cancelado") await assertNoOverlap(inicio, duracion_min, null, usuario_id);

  const now = new Date().toISOString();
  const info = await db
    .prepare(
      `INSERT INTO citas (cliente_id, usuario_id, inicio, duracion_min, servicio, estado, notas, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      cid,
      usuario_id,
      inicio,
      duracion_min,
      typeof body.servicio === "string" ? body.servicio || null : null,
      estado,
      typeof body.notas === "string" ? body.notas || null : null,
      now,
      now
    );
  const row = await db.prepare(`${rowSql} WHERE c.id = ?`).get(info.lastInsertRowid);
  await recordSyncEvent("cita", "creada", row);
  return row;
}

export const citaService = {
  async list() {
    return await db.prepare(`${rowSql} ORDER BY c.inicio ASC`).all();
  },

  create: crearCita,

  async update(id: number, body: Record<string, unknown>) {
    const existing = (await db.prepare(`SELECT * FROM citas WHERE id = ?`).get(id)) as Record<
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

    let usuario_id: number | null =
      existing.usuario_id != null ? Number(existing.usuario_id) : null;
    if (body.usuario_id !== undefined) {
      usuario_id = await parseUsuarioIdOrThrow(
        { ...body, usuario_id: body.usuario_id === null ? "" : body.usuario_id },
        true
      );
    }
    if (usuario_id == null) {
      throw new AppError("Seleccioná un profesional para la cita");
    }

    if (estado !== "cancelado") {
      await assertNoOverlap(inicio, duracion_min, id, usuario_id);
    }

    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE citas SET cliente_id = ?, usuario_id = ?, inicio = ?, duracion_min = ?, servicio = ?, estado = ?, notas = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        cliente_id,
        usuario_id,
        inicio,
        duracion_min,
        typeof body.servicio === "string" ? body.servicio || null : existing.servicio,
        estado,
        typeof body.notas === "string" ? body.notas || null : existing.notas,
        now,
        id
      );
    const row = await db.prepare(`${rowSql} WHERE c.id = ?`).get(id);
    await recordSyncEvent("cita", "actualizada", row);
    return row;
  },

  async cancelar(
    id: number,
    body: {
      motivo: string;
      cancelado_por: "cliente" | "empleado" | "admin";
    }
  ) {
    const motivo =
      typeof body.motivo === "string" ? body.motivo.trim() : "";
    if (!motivo) throw new AppError("motivo requerido");
    const por = body.cancelado_por;
    if (por !== "cliente" && por !== "empleado" && por !== "admin") {
      throw new AppError("cancelado_por debe ser cliente, empleado o admin");
    }

    const existing = (await db.prepare(`SELECT * FROM citas WHERE id = ?`).get(id)) as
      | Record<string, unknown>
      | undefined;
    if (!existing) throw new AppError("no encontrado", 404);
    if (String(existing.estado) === "cancelado") {
      throw new AppError("La cita ya está cancelada");
    }

    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE citas SET estado = 'cancelado', cancelado_por = ?, cancelado_motivo = ?, cancelado_at = ?, updated_at = ? WHERE id = ?`
      )
      .run(por, motivo, now, now, id);

    const row = await db.prepare(`${rowSql} WHERE c.id = ?`).get(id);
    await recordSyncEvent("cita", "cancelada", row);
    return row;
  },

  async delete(id: number) {
    const row = await db.prepare(`${rowSql} WHERE c.id = ?`).get(id);
    const info = await db.prepare(`DELETE FROM citas WHERE id = ?`).run(id);
    if (info.changes === 0) throw new AppError("no encontrado", 404);
    await recordSyncEvent("cita", "eliminada", row);
  },

  async sugerirHorarios(fechaDia: string, duracionMin: number, staffId: number | null) {
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
        await assertNoOverlap(inicioIso, dur, null, staffId);
        slots.push(inicioIso);
        if (slots.length >= 64) break;
      } catch {
        /* ocupado */
      }
    }
    return { fecha: fechaDia, duracion_min: dur, slots };
  },

  async crearSerieRecurrente(body: Record<string, unknown>) {
    const reps = Math.min(52, Math.max(1, Math.floor(Number(body.repeticiones ?? 6))));
    const intervalo = Math.max(1, Math.floor(Number(body.intervalo_dias ?? 14)));
    const inicioPrimera =
      typeof body.inicio_primera === "string" ? body.inicio_primera.trim() : "";
    if (!inicioPrimera) throw new AppError("inicio_primera requerido (ISO)");
    let t = parseMs(inicioPrimera);
    const ids: number[] = [];
    for (let i = 0; i < reps; i++) {
      const inicioIso = new Date(t).toISOString();
      const row = (await crearCita({
        cliente_id: body.cliente_id,
        usuario_id: body.usuario_id,
        inicio: inicioIso,
        duracion_min: body.duracion_min,
        servicio: body.servicio,
        estado: typeof body.estado === "string" ? body.estado : undefined,
        notas: body.notas,
      })) as { id: number };
      ids.push(row.id);
      t += intervalo * 86_400_000;
    }
    return { ids, creadas: ids.length, intervalo_dias: intervalo };
  },
};
