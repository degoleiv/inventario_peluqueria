import { useMemo } from "react";
import type { Cita } from "../../api";

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
    const k = localDayKeyFromIso(c.inicio);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function monthMatrix(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  const startWeekdayMon0 = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < startWeekdayMon0; i++) {
    cells.push({ day: null, key: `p-${i}` });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      key: `${year}-${pad(monthIndex + 1)}-${pad(d)}`,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, key: `t-${cells.length}` });
  }
  return cells;
}

type Props = {
  citas: Cita[];
  /** Primer día del mes que se muestra */
  viewMonth: Date;
  selectedDay: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDay: (dayKey: string) => void;
};

export function MonthCalendar({
  citas,
  viewMonth,
  selectedDay,
  onPrevMonth,
  onNextMonth,
  onSelectDay,
}: Props) {
  const year = viewMonth.getFullYear();
  const monthIndex = viewMonth.getMonth();
  const counts = useMemo(() => countsByDay(citas), [citas]);
  const matrix = useMemo(() => monthMatrix(year, monthIndex), [year, monthIndex]);

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
          if (cell.day == null) {
            return <div key={cell.key} className="month-cal-cell month-cal-cell--pad" />;
          }
          const dayKey = cell.key;
          const n = counts.get(dayKey) ?? 0;
          const isToday = dayKey === todayKey;
          const isSelected = dayKey === selectedDay;
          const titleTip =
            n === 0
              ? `${dayKey} · Sin citas`
              : `${dayKey} · ${n} cita${n === 1 ? "" : "s"}`;
          return (
            <button
              key={cell.key}
              type="button"
              role="gridcell"
              className={`month-cal-cell month-cal-day ${isToday ? "month-cal-day--today" : ""} ${
                isSelected ? "month-cal-day--selected" : ""
              }`}
              onClick={() => onSelectDay(dayKey)}
              title={titleTip}
            >
              <span className="month-cal-day-num">{cell.day}</span>
              {n > 0 ? (
                <span className="month-cal-day-badge" aria-hidden>
                  {n > 9 ? "9+" : n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="muted month-cal-hint">
        Tocá un día para abrir la agenda diaria. Los números indican cantidad de citas.
      </p>
    </div>
  );
}
