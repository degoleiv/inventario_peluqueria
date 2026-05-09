import type { Cita } from "../api";

export type DíaCalOcupacion = "libre" | "parcial" | "lleno";

export type MetaDíaCalendario = {
  ocupacion: DíaCalOcupacion;
  /** Día sin huecos en la franja del negocio (según filtro y citas cargadas). */
  disabled: boolean;
  /** Citas no canceladas ese día (respetando el filtro de lista). */
  count: number;
  /**
   * Con un empleado elegido en filtros de lista: no hay fila en Empleados → Turnos para esa fecha
   * (no laborable en agenda).
   */
  descansoSinTurno?: boolean;
};

function localDayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isCancelled(estado: string) {
  return estado.toLowerCase().includes("cancel");
}

function minutosDelDiaLocal(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
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

function mergedCitasEnVentana(citas: Cita[], ws: number, we: number): [number, number][] {
  const raw: [number, number][] = [];
  for (const c of citas) {
    const t0 = minutosDelDiaLocal(c.inicio);
    const t1 = t0 + c.duracion_min;
    const lo = Math.max(t0, ws);
    const hi = Math.min(t1, we);
    if (hi > lo) raw.push([lo, hi]);
  }
  return mergeIntervals(raw);
}

function coberturaTotalMin(merged: [number, number][], ws: number, we: number): number {
  let t = 0;
  for (const [a, b] of merged) {
    const lo = Math.max(a, ws);
    const hi = Math.min(b, we);
    if (hi > lo) t += hi - lo;
  }
  return t;
}

const UMBRAL_DIA_LLENO = 0.98;

/** 6×7 celdas (mes anterior / actual / siguiente). */
export function monthMatrixSixWeeks(year: number, monthIndex: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = new Date(year, monthIndex, 1);
  const startWeekdayMon0 = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - startWeekdayMon0);
  const cells: Array<{ key: string; inMonth: boolean; displayDay: number }> = [];
  const cur = new Date(start);
  for (let i = 0; i < 42; i++) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const d = cur.getDate();
    cells.push({
      key: `${y}-${pad(m + 1)}-${pad(d)}`,
      inMonth: m === monthIndex && y === year,
      displayDay: d,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return cells;
}

/**
 * Ocupación por día para el calendario: colores y días no seleccionables.
 * - Todos los empleados: el día se deshabilita solo si **cada** miembro del equipo tiene ≥98 % de la
 *   franja del negocio cubierta por sus citas (no canceladas) ese día (nadie con hueco útil).
 * - Un empleado: misma franja, solo citas de ese profesional.
 */
export function computeDayMetaMap(args: {
  matrixDayKeys: readonly string[];
  citas: Cita[];
  filtroEmpleado: number | "todos";
  equipoIds: number[];
  workStartMin: number;
  workEndMin: number;
}): Map<string, MetaDíaCalendario> {
  const { matrixDayKeys, citas, filtroEmpleado, equipoIds, workStartMin, workEndMin } = args;
  let ws = workStartMin;
  let we = workEndMin;
  if (!(we > ws)) {
    ws = 9 * 60;
    we = 18 * 60;
  }
  const span = we - ws;

  const activas = citas.filter((c) => !isCancelled(c.estado));
  const map = new Map<string, MetaDíaCalendario>();

  for (const dayKey of matrixDayKeys) {
    const citasDía = activas.filter((c) => localDayKeyFromIso(c.inicio) === dayKey);

    if (filtroEmpleado === "todos") {
      const count = citasDía.length;
      if (equipoIds.length === 0) {
        map.set(dayKey, {
          ocupacion: count > 0 ? "parcial" : "libre",
          disabled: false,
          count,
        });
        continue;
      }
      let allStaffFull = true;
      for (const uid of equipoIds) {
        const subset = citasDía.filter((c) => c.usuario_id === uid);
        const merged = mergedCitasEnVentana(subset, ws, we);
        const cov = coberturaTotalMin(merged, ws, we);
        const ratio = span > 0 ? cov / span : 0;
        if (ratio < UMBRAL_DIA_LLENO) {
          allStaffFull = false;
          break;
        }
      }
      const full = allStaffFull && count > 0;
      const ocupacion: DíaCalOcupacion = full ? "lleno" : count > 0 ? "parcial" : "libre";
      map.set(dayKey, {
        ocupacion,
        disabled: full,
        count,
      });
    } else {
      const subset = citasDía.filter((c) => c.usuario_id === filtroEmpleado);
      const count = subset.length;
      const merged = mergedCitasEnVentana(subset, ws, we);
      const cov = coberturaTotalMin(merged, ws, we);
      const ratio = span > 0 ? cov / span : 0;
      const full = count > 0 && ratio >= UMBRAL_DIA_LLENO;
      const ocupacion: DíaCalOcupacion = full ? "lleno" : count > 0 ? "parcial" : "libre";
      map.set(dayKey, {
        ocupacion,
        disabled: full,
        count,
      });
    }
  }

  return map;
}
