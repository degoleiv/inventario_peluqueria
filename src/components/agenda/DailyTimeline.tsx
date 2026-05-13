import { useMemo, type ReactNode } from "react";
import type { Cita } from "../../api";

/** Ventana horaria del día (turnos en Empleados o franja global del negocio). */
export type AgendaVentanaDia = {
  cargando: boolean;
  /** Sin turnos cargados para ese empleado y día = descanso / no laborable en agenda. */
  descanso: boolean;
  segmentos: Array<{ hora_inicio: string; hora_fin: string }>;
  /** Franja según BUSINESS_* (vista “todos” los profesionales). */
  modoGlobal?: boolean;
};

function estadoVisualClass(estado: string) {
  const e = estado.toLowerCase();
  if (e.includes("cancel")) return "cita-estado--cancelado";
  if (e.includes("realiz")) return "cita-estado--realizado";
  if (e.includes("confirm")) return "cita-estado--confirmado";
  return "cita-estado--pendiente";
}

function parseHm(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return 0;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh * 60 + mm;
}

function minutosDelDiaLocal(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function blockStyleClipped(
  c: Cita,
  canvasStart: number,
  canvasSpan: number,
  clipStart: number,
  clipEnd: number
): { top: string; height: string } | null {
  const t0 = minutosDelDiaLocal(c.inicio);
  const t1 = t0 + c.duracion_min;
  const vis0 = Math.max(t0, clipStart);
  const vis1 = Math.min(t1, clipEnd);
  if (vis1 <= vis0) return null;
  const top = ((vis0 - canvasStart) / canvasSpan) * 100;
  let h = ((vis1 - vis0) / canvasSpan) * 100;
  h = Math.max(h, 2.6);
  if (top + h > 100) h = Math.max(100 - top, 0.55);
  return { top: `${top}%`, height: `${h}%` };
}

/** Paso por defecto al elegir hueco en la grilla (5 min: ajustes finos al mover la cita). */
export const AGENDA_SNAP_CLIC_MINUTOS = 5;

/**
 * Alinea el minuto de inicio al paso (p. ej. 5 min) y lo limita para que
 * `[inicio, inicio + duración)` quede dentro de `[workStart, workEnd)`.
 * (Antes se usaba `span - paso`, lo que permitía empezar demasiado tarde con citas largas
 * y rompía la coherencia con la ocupación por bloques.)
 */
function snapMinEnRango(
  totalMin: number,
  workStart: number,
  workEnd: number,
  appointmentDurMin: number,
  step = AGENDA_SNAP_CLIC_MINUTOS
): number {
  const span = workEnd - workStart;
  if (!(span > 0)) return workStart;

  const effStep = Math.min(step, Math.max(5, span));
  const dur = Math.max(1, Math.round(appointmentDurMin));
  const rel = Math.max(0, Math.min(span, totalMin - workStart));
  const snappedRel = Math.round(rel / effStep) * effStep;

  if (dur > span) {
    return workStart;
  }

  const maxRel = Math.max(0, Math.floor((span - dur) / effStep) * effStep);
  const clampedRel = Math.min(Math.max(0, snappedRel), maxRel);
  return workStart + clampedRel;
}

function mergeIntervals(iv: [number, number][]): [number, number][] {
  if (!iv.length) return [];
  const sorted = [...iv].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  let cs = sorted[0]![0];
  let ce = sorted[0]![1];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i]!;
    if (s <= ce) ce = Math.max(ce, e);
    else {
      merged.push([cs, ce]);
      cs = s;
      ce = e;
    }
  }
  merged.push([cs, ce]);
  return merged;
}

/** Intervalos de citas en minutos del día, recortados al tramo [clipStart, clipEnd). */
function intervalosCitasEnTramo(citas: Cita[], clipStart: number, clipEnd: number): [number, number][] {
  const raw: [number, number][] = [];
  for (const c of citas) {
    const t0 = minutosDelDiaLocal(c.inicio);
    const t1 = t0 + c.duracion_min;
    const lo = Math.max(t0, clipStart);
    const hi = Math.min(t1, clipEnd);
    if (hi > lo) raw.push([lo, hi]);
  }
  return mergeIntervals(raw);
}

function minutosCubiertosEnSlot(merged: [number, number][], slotStart: number, slotEnd: number): number {
  let total = 0;
  for (const [a, b] of merged) {
    const lo = Math.max(a, slotStart);
    const hi = Math.min(b, slotEnd);
    if (hi > lo) total += hi - lo;
  }
  return total;
}

type OcupacionKind = "libre" | "parcial" | "lleno";

/** Paso de la regla de tiempos en el lateral (vista fija por hora; la ocupación sigue en cuartos de hora). */
export type AgendaRailZoomStep = 60;

function claseOcupacionSlot(ratio: number): OcupacionKind {
  if (ratio >= 0.98) return "lleno";
  if (ratio <= 0.02) return "libre";
  return "parcial";
}

type SegmentTrackProps = {
  fechaDia: string;
  horaInicio: string;
  horaFin: string;
  citasDelDia: Cita[];
  /** Citas del empleado (no canceladas) para colorear la ocupación en la grilla. */
  citasOcupacion: Cita[];
  ocupacionActiva: boolean;
  /** Minuto del día (0–1439) del inicio elegido en el formulario. */
  marcaSlotMinutos?: number | null;
  /** Duración de la cita en minutos (marca visual de inicio hasta fin). */
  marcaDuracionMinutos?: number | null;
  onEmptySlot: (isoLocalStart: string) => void;
  onSlotTimeWhilePointer?: (isoLocalStart: string) => void;
  onEditCita: (c: Cita) => void;
  segmentLabel?: string;
  /** Separación de las marcas en el lateral y de las filas de la grilla (1 h o 15 min). */
  railStepMin: AgendaRailZoomStep;
};

function formatHm(m: number) {
  const hh = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return `${pad2(hh)}:${pad2(((mm % 60) + 60) % 60)}`;
}

function AgendaSegmentTrack({
  fechaDia,
  horaInicio,
  horaFin,
  citasDelDia,
  citasOcupacion,
  ocupacionActiva,
  marcaSlotMinutos,
  marcaDuracionMinutos,
  onEmptySlot,
  onSlotTimeWhilePointer,
  onEditCita,
  segmentLabel,
  railStepMin,
}: SegmentTrackProps) {
  const workStart = parseHm(horaInicio);
  const workEnd = parseHm(horaFin);
  const canvasSpan = Math.max(1, workEnd - workStart);

  /** Marcas de tiempo en orden según el zoom (cada hora o cada 15 min). */
  const labelMinutes = useMemo(() => {
    const out: number[] = [];
    const step = railStepMin;
    for (let t = workStart; t < workEnd; t += step) {
      out.push(t);
    }
    return out.length ? out : [workStart];
  }, [workStart, workEnd, railStepMin]);

  /** Altura por fila: menos filas en vista horaria → filas más altas. */
  const agendaRowPx = useMemo(() => {
    const n = labelMinutes.length;
    const targetTotal = railStepMin >= 60 ? 400 : 520;
    const minPx = railStepMin >= 60 ? 26 : 11;
    const maxPx = railStepMin >= 60 ? 56 : 30;
    return Math.max(minPx, Math.min(maxPx, Math.round(targetTotal / Math.max(1, n))));
  }, [labelMinutes.length, railStepMin]);

  const citasVisibles = useMemo(() => {
    return citasDelDia.filter((c) => {
      const t0 = minutosDelDiaLocal(c.inicio);
      const t1 = t0 + c.duracion_min;
      return t0 < workEnd && t1 > workStart;
    });
  }, [citasDelDia, workStart, workEnd]);

  const mergedOcupacion = useMemo(() => {
    if (!ocupacionActiva) return [] as [number, number][];
    return intervalosCitasEnTramo(citasOcupacion, workStart, workEnd);
  }, [ocupacionActiva, citasOcupacion, workStart, workEnd]);

  /** Celdas finas para validar clics (misma resolución que el snap al elegir hora). */
  const slotsOcupacionClic = useMemo(() => {
    if (!ocupacionActiva) return [] as Array<{ key: number; top: string; height: string; kind: OcupacionKind }>;
    const step = AGENDA_SNAP_CLIC_MINUTOS;
    const out: Array<{ key: number; top: string; height: string; kind: OcupacionKind }> = [];
    for (let s = workStart; s < workEnd; s += step) {
      const slotEnd = Math.min(s + step, workEnd);
      if (slotEnd <= s) break;
      const dur = slotEnd - s;
      const cov = minutosCubiertosEnSlot(mergedOcupacion, s, slotEnd);
      const ratio = dur > 0 ? cov / dur : 0;
      const kind = claseOcupacionSlot(ratio);
      const top = ((s - workStart) / canvasSpan) * 100;
      const height = (dur / canvasSpan) * 100;
      out.push({
        key: s,
        top: `${top}%`,
        height: `${height}%`,
        kind,
      });
    }
    return out;
  }, [ocupacionActiva, workStart, workEnd, canvasSpan, mergedOcupacion]);

  /** Pintura de ocupación alineada al zoom (1 h = una franja por hora, sin rayas cada 15 min). */
  const slotsOcupacionVisibles = useMemo(() => {
    if (!ocupacionActiva) return [] as Array<{ key: number; top: string; height: string; kind: OcupacionKind }>;
    const step = railStepMin;
    const out: Array<{ key: number; top: string; height: string; kind: OcupacionKind }> = [];
    for (let s = workStart; s < workEnd; s += step) {
      const slotEnd = Math.min(s + step, workEnd);
      if (slotEnd <= s) break;
      const dur = slotEnd - s;
      const cov = minutosCubiertosEnSlot(mergedOcupacion, s, slotEnd);
      const ratio = dur > 0 ? cov / dur : 0;
      const kind = claseOcupacionSlot(ratio);
      const top = ((s - workStart) / canvasSpan) * 100;
      const height = (dur / canvasSpan) * 100;
      out.push({
        key: s,
        top: `${top}%`,
        height: `${height}%`,
        kind,
      });
    }
    return out;
  }, [ocupacionActiva, workStart, workEnd, canvasSpan, mergedOcupacion, railStepMin]);

  const marcaSlotStyle = useMemo(() => {
    if (marcaSlotMinutos == null) return null;
    const durForm = Math.max(1, Math.round(marcaDuracionMinutos ?? 60));
    const selStart = marcaSlotMinutos;
    const selEnd = selStart + durForm;
    const vis0 = Math.max(selStart, workStart);
    const vis1 = Math.min(selEnd, workEnd);
    if (vis1 <= vis0) return null;
    const top = ((vis0 - workStart) / canvasSpan) * 100;
    const height = ((vis1 - vis0) / canvasSpan) * 100;
    return { top: `${top}%`, height: `${Math.max(height, 0.35)}%` };
  }, [marcaSlotMinutos, marcaDuracionMinutos, workStart, workEnd, canvasSpan]);

  function tryPickIsoLocal(clientY: number, trackEl: HTMLDivElement): string | null {
    const rect = trackEl.getBoundingClientRect();
    const y = clientY - rect.top;
    const pct = Math.max(0, Math.min(1, y / rect.height));
    const totalMin = workStart + pct * canvasSpan;
    if (totalMin < workStart - 0.5 || totalMin > workEnd) return null;
    const durMin = Math.max(1, Math.round(marcaDuracionMinutos ?? 60));
    if (durMin > canvasSpan) return null;
    const snapped = snapMinEnRango(totalMin, workStart, workEnd, durMin, AGENDA_SNAP_CLIC_MINUTOS);
    const rangeEnd = snapped + durMin;
    if (rangeEnd > workEnd + 1e-6) return null;
    const stepClic = AGENDA_SNAP_CLIC_MINUTOS;
    if (ocupacionActiva && slotsOcupacionClic.length > 0) {
      for (const sl of slotsOcupacionClic) {
        const s = sl.key;
        const slotEnd = Math.min(s + stepClic, workEnd);
        if (s >= rangeEnd || slotEnd <= snapped) continue;
        if (sl.kind === "lleno") return null;
      }
    }
    const hh = Math.floor(snapped / 60);
    const mm = snapped % 60;
    return `${fechaDia}T${pad2(hh)}:${pad2(mm)}`;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".agenda-block")) return;
    const track = e.currentTarget;
    try {
      track.setPointerCapture(e.pointerId);
    } catch {
      /* ya capturado u otro error */
    }
    e.preventDefault();
    const iso = tryPickIsoLocal(e.clientY, track);
    if (iso) onSlotTimeWhilePointer?.(iso);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const track = e.currentTarget;
    if (!track.hasPointerCapture(e.pointerId)) return;
    e.preventDefault();
    const iso = tryPickIsoLocal(e.clientY, track);
    if (iso) onSlotTimeWhilePointer?.(iso);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const track = e.currentTarget;
    if (!track.hasPointerCapture(e.pointerId)) return;
    e.preventDefault();
    const iso = tryPickIsoLocal(e.clientY, track);
    if (iso) onEmptySlot(iso);
    try {
      track.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
  }

  function handlePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    const track = e.currentTarget;
    if (!track.hasPointerCapture(e.pointerId)) return;
    try {
      track.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
  }

  return (
    <div className="agenda-segment">
      {segmentLabel ? (
        <p className="agenda-segment-label muted small">
          <strong>{segmentLabel}</strong> · {horaInicio}–{horaFin}
        </p>
      ) : (
        <p className="agenda-segment-label muted small">
          {horaInicio}–{horaFin}
        </p>
      )}
      <div
        className="agenda-vista-dia agenda-vista-dia--segment"
        style={
          {
            "--agenda-hour-slots": labelMinutes.length,
            "--agenda-hour-row": `${agendaRowPx}px`,
          } as React.CSSProperties
        }
      >
        <div className="agenda-rail" aria-hidden>
          {labelMinutes.map((m) => (
            <div key={m} className="agenda-hour-label">
              {formatHm(m)}
            </div>
          ))}
        </div>
        <div
          className="agenda-track agenda-track--interactive agenda-track--segment"
          role="application"
          aria-label={`Franja ${horaInicio} a ${horaFin}`}
          style={{
            minHeight: `calc(var(--agenda-hour-slots) * var(--agenda-hour-row))`,
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
            }
          }}
        >
          {ocupacionActiva && slotsOcupacionVisibles.length > 0 ? (
            <div
              className={`agenda-ocupacion-layer${railStepMin >= 60 ? " agenda-ocupacion-layer--hora" : ""}`}
              aria-hidden
            >
              {slotsOcupacionVisibles.map((sl) => (
                <div
                  key={sl.key}
                  className={`agenda-ocupacion-slot agenda-ocupacion-slot--${sl.kind}`}
                  style={{ top: sl.top, height: sl.height }}
                />
              ))}
            </div>
          ) : null}
          {marcaSlotStyle ? (
            <div
              className="agenda-marca-seleccion"
              style={marcaSlotStyle}
              title="Franja elegida para la cita (inicio y duración)"
              aria-hidden
            />
          ) : null}
          {citasVisibles.length === 0 ? null : (
            citasVisibles.map((x) => {
              const st = blockStyleClipped(x, workStart, canvasSpan, workStart, workEnd);
              if (!st) return null;
              const staffCol = x.empleado_color?.trim();
              const useStaff = Boolean(staffCol);
              return (
                <button
                  key={x.id}
                  type="button"
                  className={`agenda-block ${useStaff ? "agenda-block--staff" : estadoVisualClass(x.estado)}`}
                  style={{
                    ...st,
                    ...(useStaff && staffCol
                      ? {
                          borderColor: staffCol,
                          background: `${staffCol}2e`,
                          color: "#2c2420",
                        }
                      : {}),
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onEditCita(x);
                  }}
                  title={`${x.cliente_nombre}${x.empleado_nombre ? ` · ${x.empleado_nombre}` : ""} — ${x.estado}${x.servicio ? ` · ${x.servicio}` : ""}`}
                >
                  <span className="agenda-block-time">
                    {new Date(x.inicio).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="agenda-block-name">{x.cliente_nombre}</span>
                  <span className="agenda-block-svc">{x.servicio || "—"}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

type Props = {
  citasDelDia: Cita[];
  /** Citas no canceladas del empleado filtrado (solo aplica si `mostrarOcupacionEmpleado`). */
  citasOcupacionEmpleado: Cita[];
  /** Vista un empleado: colorear ocupación (libre / parcial / ocupado). */
  mostrarOcupacionEmpleado: boolean;
  fechaDia: string;
  ventana: AgendaVentanaDia;
  /** Chips bajo la fecha (origen de la selección de hora, etc.). */
  headerTags?: ReactNode;
  /** Minuto del día del campo inicio del formulario (misma fecha que `fechaDia`). */
  marcaSlotMinutos?: number | null;
  /** Duración en minutos para la marca en la grilla y validación al elegir hueco. */
  marcaDuracionMinutos?: number | null;
  onEmptySlot: (isoLocalStart: string) => void;
  onSlotTimeWhilePointer?: (isoLocalStart: string) => void;
  onEditCita: (c: Cita) => void;
};

const RAIL_STEP_MIN: AgendaRailZoomStep = 60;

export function DailyTimeline({
  citasDelDia,
  citasOcupacionEmpleado,
  mostrarOcupacionEmpleado,
  fechaDia,
  ventana,
  headerTags,
  marcaSlotMinutos,
  marcaDuracionMinutos,
  onEmptySlot,
  onSlotTimeWhilePointer,
  onEditCita,
}: Props) {
  const fechaLarga = useMemo(
    () =>
      new Date(fechaDia + "T12:00:00").toLocaleDateString("es", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [fechaDia]
  );

  const hint = useMemo(() => {
    if (ventana.cargando) return "Cargando horario…";
    if (ventana.descanso) return "Sin turno de trabajo configurado para este día.";
    if (ventana.modoGlobal) {
      return "Vista con todos los profesionales: franja general del negocio (configuración del servidor). Para ver solo los horarios cargados en Empleados → Turnos, elegí un profesional arriba.";
    }
    if (ventana.segmentos.length > 1) {
      return "Solo se muestran los tramos configurados en Empleados → Turnos para este día.";
    }
    return "Horario según Empleados → Turnos. Mantené presionado y arrastrá en un hueco libre para elegir la hora (cada 5 min), o tocá una vez; tocá una cita para editar.";
  }, [ventana]);

  return (
    <div className="agenda-vista-wrap">
      <p className="agenda-vista-fecha">{fechaLarga}</p>
      {headerTags ? <div className="agenda-origen-tags">{headerTags}</div> : null}
      <p className="muted agenda-vista-hint">{hint}</p>
      {ventana.cargando ? (
        <p className="muted">Cargando horario del día…</p>
      ) : ventana.descanso ? (
        <div className="banner banner-info" role="status">
          <strong>Día de descanso o sin turno cargado</strong> para este empleado en esta fecha. Configurá los
          turnos en <strong>Empleados → Turnos</strong> (horario de trabajo). Mientras no haya tramos, no se
          pueden agendar citas desde la grilla de este día.
        </div>
      ) : (
        <>
          <div className="agenda-zoom-toolbar agenda-zoom-toolbar--solo-label" aria-label="Vista de la grilla">
            <span className="agenda-zoom-label muted small">Vista: 1 hora</span>
          </div>
          <div className="agenda-segment-stack">
            {ventana.segmentos.map((seg, idx) => (
              <AgendaSegmentTrack
                key={`${seg.hora_inicio}-${seg.hora_fin}-${idx}`}
                fechaDia={fechaDia}
                horaInicio={seg.hora_inicio}
                horaFin={seg.hora_fin}
                citasDelDia={citasDelDia}
                citasOcupacion={citasOcupacionEmpleado}
                ocupacionActiva={mostrarOcupacionEmpleado}
                marcaSlotMinutos={marcaSlotMinutos}
                marcaDuracionMinutos={marcaDuracionMinutos}
                onEmptySlot={onEmptySlot}
                onSlotTimeWhilePointer={onSlotTimeWhilePointer}
                onEditCita={onEditCita}
                segmentLabel={ventana.segmentos.length > 1 ? `Tramo ${idx + 1}` : undefined}
                railStepMin={RAIL_STEP_MIN}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
