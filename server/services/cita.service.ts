import { businessHours } from "../config.js";
import { db, recordSyncEvent } from "../db.js";
import { AppError } from "../lib/AppError.js";
import { clienteService } from "./cliente.service.js";
import { commissionService } from "./commission.service.js";
import { turnoService } from "./turno.service.js";

const ESTADOS = new Set(["pendiente", "confirmado", "realizado", "cancelado"]);

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

type CitaSolapeRow = {
  id: number;
  inicio: string;
  duracion_min: number;
  usuario_id: number | null;
};

async function loadCitasActivasLite(): Promise<CitaSolapeRow[]> {
  return (await db
    .prepare(
      `SELECT id, inicio, duracion_min, usuario_id FROM citas
       WHERE estado NOT IN ('cancelado','cancelada','realizado')`
    )
    .all()) as CitaSolapeRow[];
}

/** Devuelve el id de la cita que solapa, o null. */
function findOverlapCitaId(
  rows: CitaSolapeRow[],
  inicioIso: string,
  duracionMin: number,
  excludeId: number | null,
  staffId: number | null
): number | null {
  const start = parseMs(inicioIso);
  const end = start + duracionMin * 60_000;
  for (const r of rows) {
    if (excludeId != null && r.id === excludeId) continue;
    const rid = r.usuario_id != null ? Number(r.usuario_id) : null;
    if (!mismoProfesional(staffId, rid)) continue;
    const rs = parseMs(r.inicio);
    const re = rs + r.duracion_min * 60_000;
    if (rangesOverlap(start, end, rs, re)) return r.id;
  }
  return null;
}

/** HH:MM del turno de empleado → partes locales (misma convención que `turno.service`). */
function parseHmTurno(hm: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
  return { h: hh, m: mm };
}

const CITA_DURACION_MINIMA_MIN = 10;
const CITA_PASO_MINUTOS = 5;

function assertDuracionCitaPermitida(duracionMin: number) {
  if (!Number.isFinite(duracionMin) || duracionMin < CITA_DURACION_MINIMA_MIN) {
    throw new AppError(`La duración mínima es ${CITA_DURACION_MINIMA_MIN} minutos`);
  }
  if (duracionMin % CITA_PASO_MINUTOS !== 0) {
    throw new AppError(`La duración debe ser múltiplo de ${CITA_PASO_MINUTOS} (10, 15, 20…)`);
  }
}

/** Inicio en pasos de 5 min (hora local del servidor). */
function assertInicioPasosDeCinco(inicioIso: string) {
  const d = new Date(inicioIso);
  if (Number.isNaN(d.getTime())) throw new AppError("inicio no válido");
  const desdeMedianoche = d.getHours() * 60 + d.getMinutes();
  if (desdeMedianoche % CITA_PASO_MINUTOS !== 0) {
    throw new AppError("El inicio debe alinearse a intervalos de 5 minutos (:00, :05, :10…)");
  }
}

/** Primer instante local ≥ `ms` con minutos y segundos en cero (hora en punto). */
function msPrimeraHoraEnPuntoLocal(ms: number): number {
  const d = new Date(ms);
  const y = d.getFullYear();
  const mo = d.getMonth();
  const da = d.getDate();
  const h = d.getHours();
  const floor = new Date(y, mo, da, h, 0, 0, 0).getTime();
  if (ms <= floor) return floor;
  return new Date(y, mo, da, h + 1, 0, 0, 0).getTime();
}

async function assertNoOverlap(
  inicioIso: string,
  duracionMin: number,
  excludeId: number | null,
  staffId: number | null
) {
  const { open, close } = businessHours();
  const d = new Date(inicioIso);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < open || h + duracionMin / 60 > close) {
    throw new AppError(
      `Cita fuera de horario laboral (config: ${open}h–${close}h, BUSINESS_OPEN_HOUR / BUSINESS_CLOSE_HOUR)`
    );
  }

  const rows = await loadCitasActivasLite();
  const hit = findOverlapCitaId(rows, inicioIso, duracionMin, excludeId, staffId);
  if (hit != null) {
    throw new AppError("Ya existe una cita solapada para ese profesional");
  }
}

const rowSql = `SELECT c.*, cl.nombre AS cliente_nombre,
    u.nombre AS empleado_nombre, u.color_agenda AS empleado_color
    FROM citas c
    JOIN clientes cl ON cl.id = c.cliente_id
    LEFT JOIN usuarios u ON u.id = c.usuario_id`;

async function crearCita(body: Record<string, unknown>) {
  let cid = Number(body.cliente_id);
  if (!Number.isFinite(cid) || cid <= 0) {
    const rawDatos = body.cliente_datos;
    const datos =
      rawDatos != null && typeof rawDatos === "object" && !Array.isArray(rawDatos)
        ? (rawDatos as Record<string, unknown>)
        : null;
    if (datos) {
      cid = await clienteService.createTemporalParaCita(datos);
    } else {
      cid = await clienteService.getOrCreateIdParaCitaSinCliente();
    }
  }
  const inicio = typeof body.inicio === "string" ? body.inicio.trim() : "";
  if (!inicio) throw new AppError("inicio requerido (ISO)");
  const duracion_min =
    typeof body.duracion_min === "number" && body.duracion_min > 0
      ? Math.floor(body.duracion_min)
      : 60;
  assertDuracionCitaPermitida(duracion_min);
  assertInicioPasosDeCinco(inicio);
  let estado =
    typeof body.estado === "string" && body.estado ? body.estado : "pendiente";
  if (!ESTADOS.has(estado)) estado = "pendiente";

  const usuario_id = await parseUsuarioIdOrThrow(body, true);

  if (estado === "realizado") {
    throw new AppError(
      "Creá la cita como pendiente o confirmada y luego marcala como realizada con el importe cobrado"
    );
  }

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

const FECHA_DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CitaListQuery = {
  desde?: string;
  hasta?: string;
  usuario_id?: number;
};

export const citaService = {
  async list(query?: CitaListQuery) {
    const cond: string[] = [];
    const params: unknown[] = [];
    const desde = query?.desde?.trim() ?? "";
    const hasta = query?.hasta?.trim() ?? "";
    if (desde && FECHA_DIA_RE.test(desde)) {
      cond.push(`date(c.inicio) >= date(?)`);
      params.push(desde);
    }
    if (hasta && FECHA_DIA_RE.test(hasta)) {
      cond.push(`date(c.inicio) <= date(?)`);
      params.push(hasta);
    }
    if (query?.usuario_id != null && Number.isFinite(query.usuario_id)) {
      cond.push(`c.usuario_id = ?`);
      params.push(Math.floor(Number(query.usuario_id)));
    }
    const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
    return await db.prepare(`${rowSql} ${where} ORDER BY c.inicio ASC`).all(...params);
  },

  /** Cita que solapa con el turno propuesto (mismo empleado), o null. No valida horario comercial. */
  async findSolape(
    inicioIso: string,
    duracionMin: number,
    usuarioId: number,
    excludeCitaId: number | null
  ) {
    const rows = await loadCitasActivasLite();
    const hitId = findOverlapCitaId(rows, inicioIso, duracionMin, excludeCitaId, usuarioId);
    if (hitId == null) return null;
    const row = (await db.prepare(`${rowSql} WHERE c.id = ?`).get(hitId)) as Record<string, unknown> | undefined;
    return row ?? null;
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

    assertDuracionCitaPermitida(duracion_min);
    assertInicioPasosDeCinco(inicio);

    let importe_servicio: number | null =
      existing.importe_servicio != null && existing.importe_servicio !== ""
        ? Number(existing.importe_servicio)
        : null;
    if (body.importe_servicio !== undefined && body.importe_servicio !== null && body.importe_servicio !== "") {
      const raw = Number(body.importe_servicio);
      if (!Number.isFinite(raw) || raw < 0) throw new AppError("importe_servicio inválido");
      importe_servicio = raw > 0 ? raw : null;
    } else if (body.importe_servicio === null) {
      importe_servicio = null;
    }

    if (estado === "realizado") {
      const imp = importe_servicio ?? 0;
      if (imp <= 0) {
        throw new AppError(
          "Indicá el importe cobrado por el servicio (importe_servicio) para marcar la cita como realizada"
        );
      }
    }

    if (estado !== "cancelado" && estado !== "realizado") {
      await assertNoOverlap(inicio, duracion_min, id, usuario_id);
    }

    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE citas SET cliente_id = ?, usuario_id = ?, inicio = ?, duracion_min = ?, servicio = ?, estado = ?, notas = ?, importe_servicio = ?, updated_at = ? WHERE id = ?`
      )
      .run(
        cliente_id,
        usuario_id,
        inicio,
        duracion_min,
        typeof body.servicio === "string" ? body.servicio || null : existing.servicio,
        estado,
        typeof body.notas === "string" ? body.notas || null : existing.notas,
        importe_servicio,
        now,
        id
      );

    if (estado === "realizado") {
      await commissionService.deleteByCitaId(id);
      await commissionService.insertForCita(id, usuario_id, importe_servicio!, inicio);
    } else if (String(existing.estado) === "realizado") {
      await commissionService.deleteByCitaId(id);
    }

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

    await commissionService.deleteByCitaId(id);

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
    const existing = (await db.prepare(`SELECT * FROM citas WHERE id = ?`).get(id)) as
      | Record<string, unknown>
      | undefined;
    if (existing && String(existing.estado) === "realizado") {
      await commissionService.deleteByCitaId(id);
    }
    const info = await db.prepare(`DELETE FROM citas WHERE id = ?`).run(id);
    if (info.changes === 0) throw new AppError("no encontrado", 404);
    await recordSyncEvent("cita", "eliminada", row);
  },

  async sugerirHorarios(fechaDia: string, duracionMin: number, staffId: number | null) {
    let dur = Math.max(CITA_DURACION_MINIMA_MIN, Math.floor(duracionMin));
    if (dur % CITA_PASO_MINUTOS !== 0) {
      dur += CITA_PASO_MINUTOS - (dur % CITA_PASO_MINUTOS);
    }
    const parts = fechaDia.trim().split("-").map((x) => Number(x));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
      throw new AppError("fecha debe ser YYYY-MM-DD");
    }
    const yy = parts[0]!;
    const mm = parts[1]!;
    const dd = parts[2]!;
    const { open, close } = businessHours();
    const hourMs = 60 * 60 * 1000;
    const slots: string[] = [];
    const seen = new Set<string>();
    const startDay = new Date(yy, mm - 1, dd, Math.floor(open), Math.round((open % 1) * 60), 0, 0);
    const endClose = new Date(yy, mm - 1, dd, Math.floor(close), Math.round((close % 1) * 60), 0, 0);

    const pushIfFree = async (tMs: number) => {
      const inicioIso = new Date(tMs).toISOString();
      if (seen.has(inicioIso)) return;
      try {
        await assertNoOverlap(inicioIso, dur, null, staffId);
        seen.add(inicioIso);
        slots.push(inicioIso);
      } catch {
        /* ocupado o fuera de horario del negocio */
      }
    };

    const uid = staffId != null && Number.isFinite(Number(staffId)) ? Math.floor(Number(staffId)) : null;

    if (uid != null) {
      const rows = (await turnoService.list(fechaDia, fechaDia, uid)) as Array<{
        hora_inicio: string;
        hora_fin: string;
        estado: string;
      }>;
      const activos = rows.filter((r) => String(r.estado) !== "finalizado");
      for (const seg of activos) {
        const p0 = parseHmTurno(String(seg.hora_inicio));
        const p1 = parseHmTurno(String(seg.hora_fin));
        if (!p0 || !p1) continue;
        const segStart = new Date(yy, mm - 1, dd, p0.h, p0.m, 0, 0);
        const segEnd = new Date(yy, mm - 1, dd, p1.h, p1.m, 0, 0);
        const effStartMs = Math.max(startDay.getTime(), segStart.getTime());
        const effEndMs = Math.min(endClose.getTime(), segEnd.getTime());
        if (effEndMs <= effStartMs) continue;
        for (
          let t = msPrimeraHoraEnPuntoLocal(effStartMs);
          t + dur * 60_000 <= effEndMs;
          t += hourMs
        ) {
          await pushIfFree(t);
          if (slots.length >= 64) break;
        }
        if (slots.length >= 64) break;
      }
    } else {
      for (
        let t = msPrimeraHoraEnPuntoLocal(startDay.getTime());
        t + dur * 60_000 <= endClose.getTime();
        t += hourMs
      ) {
        await pushIfFree(t);
        if (slots.length >= 64) break;
      }
    }

    slots.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return { fecha: fechaDia, duracion_min: dur, slots };
  },

  async crearSerieRecurrente(body: Record<string, unknown>) {
    const reps = Math.min(52, Math.max(1, Math.floor(Number(body.repeticiones ?? 6))));
    const intervalo = Math.max(1, Math.floor(Number(body.intervalo_dias ?? 14)));
    const inicioPrimera =
      typeof body.inicio_primera === "string" ? body.inicio_primera.trim() : "";
    if (!inicioPrimera) throw new AppError("inicio_primera requerido (ISO)");
    let clienteSerie = Number(body.cliente_id);
    if (!Number.isFinite(clienteSerie) || clienteSerie <= 0) {
      clienteSerie = await clienteService.getOrCreateIdParaCitaSinCliente();
    }
    let t = parseMs(inicioPrimera);
    const ids: number[] = [];
    for (let i = 0; i < reps; i++) {
      const inicioIso = new Date(t).toISOString();
      const row = (await crearCita({
        cliente_id: clienteSerie,
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
