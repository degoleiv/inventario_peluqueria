import { useMemo } from "react";
import type { Cita } from "../../api";
import {
  monthMatrixSixWeeks,
  type MetaDíaCalendario,
} from "../../lib/citasCalendarioOcupacion";

const WEEKDAYS_ES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function localDayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function countsByDay(citas: Cita[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of citas) {
    if (c.estado.toLowerCase().includes("cancel")) continue;
    const k = localDayKeyFromIso(c.inicio);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

type Props = {
  citas: Cita[];
  /** Metadatos por día (ocupación, deshabilitado, conteo); si no se pasa, solo conteo desde citas. */
  dayMetaByKey?: Map<string, MetaDíaCalendario>;
  /** Si true, se amplía la leyenda (días grises = sin turno cargado para el empleado filtrado). */
  hintDescansoPorTurnos?: boolean;
  viewMonth: Date;
  selectedDay: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDay: (dayKey: string) => void;
};

export function MonthCalendar({
  citas,
  dayMetaByKey,
  hintDescansoPorTurnos = false,
  viewMonth,
  selectedDay,
  onPrevMonth,
  onNextMonth,
  onSelectDay,
}: Props) {
  const year = viewMonth.getFullYear();
  const monthIndex = viewMonth.getMonth();
  const counts = useMemo(() => countsByDay(citas), [citas]);
  const matrix = useMemo(() => monthMatrixSixWeeks(year, monthIndex), [year, monthIndex]);

  const title = viewMonth.toLocaleDateString("es", { month: "long", year: "numeric" });

  const todayKey = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  }, []);

  return (
    <div className="month-cal">
      <div className="month-cal-head">
        <button type="button" className="btn ghost month-cal-nav" onClick={onPrevMonth} aria-label="Mes anterior">
          ‹
        </button>
        <h3 className="month-cal-title">{title}</h3>
        <button type="button" className="btn ghost month-cal-nav" onClick={onNextMonth} aria-label="Mes siguiente">
          ›
        </button>
      </div>
      <div className="month-cal-weekdays" aria-hidden>
        {WEEKDAYS_ES.map((w) => (
          <div key={w} className="month-cal-weekday">
            {w}
          </div>
        ))}
      </div>
      <div className="month-cal-grid" role="grid" aria-label="Calendario mensual">
        {matrix.map((cell) => {
          const dayKey = cell.key;
          const meta = dayMetaByKey?.get(dayKey);
          const n = meta?.count ?? (counts.get(dayKey) ?? 0);
          const ocup = meta?.ocupacion;
          const disabled = meta?.disabled === true;
          const isToday = dayKey === todayKey;
          const isSelected = dayKey === selectedDay;
          const titleTip = disabled
            ? `${dayKey} · Día completo según el filtro (no hay huecos en la franja del negocio)`
            : n === 0
              ? `${dayKey} · Sin citas`
              : ocup === "lleno"
                ? `${dayKey} · ${n} cita${n === 1 ? "" : "s"} · Muy ocupado`
                : ocup === "parcial"
                  ? `${dayKey} · ${n} cita${n === 1 ? "" : "s"} · Ocupación parcial`
                  : `${dayKey} · ${n} cita${n === 1 ? "" : "s"}`;
          const descanso = meta?.descansoSinTurno === true;
          const ocupClass =
            descanso
              ? " month-cal-day--descanso"
              : ocup === "parcial"
                ? " month-cal-day--ocup-parcial"
                : ocup === "lleno"
                  ? " month-cal-day--ocup-lleno"
                  : ocup === "libre" && n === 0 && dayMetaByKey
                    ? " month-cal-day--ocup-libre"
                    : "";
          const titleTipDescanso = `${dayKey} · Sin turno cargado: tocá para confirmar y crear el horario del negocio`;
          return (
            <button
              key={cell.key}
              type="button"
              role="gridcell"
              disabled={disabled}
              aria-disabled={disabled}
              className={`month-cal-cell month-cal-day ${cell.inMonth ? "" : "month-cal-day--outside"} ${
                isToday ? "month-cal-day--today" : ""
              } ${isSelected ? "month-cal-day--selected" : ""}${disabled ? " month-cal-day--disabled" : ""}${ocupClass}`}
              onClick={() => {
                if (!disabled) onSelectDay(dayKey);
              }}
              title={descanso ? titleTipDescanso : titleTip}
            >
              <span className="month-cal-day-num">{cell.displayDay}</span>
              {n > 0 ? (
                <span
                  className={`month-cal-day-badge${ocup === "lleno" ? " month-cal-day-badge--lleno" : ocup === "parcial" ? " month-cal-day-badge--parcial" : ""}`}
                  aria-hidden
                >
                  {n > 9 ? "9+" : n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="muted month-cal-hint">
        Verde suave: día libre. Ámbar: citas pero con huecos. Rojo: día muy ocupado (franja del negocio casi
        cubierta). Los días en rojo bloqueado no se pueden abrir. Tocá un día válido para la grilla de horas.
        {hintDescansoPorTurnos ? (
          <>
            {" "}
            <strong>Gris:</strong> sin turno cargado en esa fecha; al tocar el día se pide confirmación para
            crear el horario del negocio y abrir la grilla.
          </>
        ) : null}
      </p>
    </div>
  );
}
