import type { Cita } from "../../api";

export const AGENDA_START_HOUR = 8;
export const AGENDA_END_HOUR = 22;
/** Minutos totales en la franja [START, END) */
export const AGENDA_SPAN_MIN = (AGENDA_END_HOUR - AGENDA_START_HOUR) * 60;

function estadoVisualClass(estado: string) {
  const e = estado.toLowerCase();
  if (e.includes("cancel")) return "cita-estado--cancelado";
  if (e.includes("confirm")) return "cita-estado--confirmado";
  return "cita-estado--pendiente";
}

function blockStyle(c: Cita) {
  const d = new Date(c.inicio);
  const fromMidnight = d.getHours() * 60 + d.getMinutes();
  const fromStart = fromMidnight - AGENDA_START_HOUR * 60;
  const top = Math.max(0, Math.min(100, (fromStart / AGENDA_SPAN_MIN) * 100));
  const h = (c.duracion_min / AGENDA_SPAN_MIN) * 100;
  return { top: `${top}%`, height: `${Math.max(h, 2.8)}%` };
}

function snapToStep(minutesFromStart: number, step = 15) {
  const s = Math.round(minutesFromStart / step) * step;
  return Math.max(0, Math.min(AGENDA_SPAN_MIN - 15, s));
}

type Props = {
  citasDelDia: Cita[];
  fechaDia: string;
  onEmptySlot: (isoLocalStart: string) => void;
  onEditCita: (c: Cita) => void;
};

export function DailyTimeline({ citasDelDia, fechaDia, onEmptySlot, onEditCita }: Props) {
  const hours = Array.from(
    { length: AGENDA_END_HOUR - AGENDA_START_HOUR },
    (_, i) => AGENDA_START_HOUR + i
  );

  function handleTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(".agenda-block")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const pct = Math.max(0, Math.min(1, y / rect.height));
    const rawMin = pct * AGENDA_SPAN_MIN;
    const snapped = snapToStep(rawMin, 15);
    const totalMin = AGENDA_START_HOUR * 60 + snapped;
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    const isoLocal = `${fechaDia}T${pad(hh)}:${pad(mm)}`;
    onEmptySlot(isoLocal);
  }

  return (
    <div className="agenda-vista-wrap">
      <p className="muted agenda-vista-hint">
        {AGENDA_START_HOUR}:00–{AGENDA_END_HOUR}:00 · Tocá un hueco para nueva cita · Tocá una cita para editar
      </p>
      <div className="agenda-vista-dia">
        <div className="agenda-rail" aria-hidden>
          {hours.map((h) => (
            <div key={h} className="agenda-hour-label">
              {h}:00
            </div>
          ))}
        </div>
        <div
          className="agenda-track agenda-track--interactive"
          role="application"
          aria-label="Franja horaria del día"
          onClick={handleTrackClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              /* keyboard slot pick not implemented — use mouse */
            }
          }}
        >
          {citasDelDia.length === 0 ? (
            <div className="empty-state empty-state--compact agenda-empty">
              <p>Sin citas este día.</p>
              <p className="muted">Tocá la grilla para elegir horario.</p>
            </div>
          ) : (
            citasDelDia.map((x) => {
              const staffCol = x.empleado_color?.trim();
              const useStaff = Boolean(staffCol);
              return (
              <button
                key={x.id}
                type="button"
                className={`agenda-block ${useStaff ? "agenda-block--staff" : estadoVisualClass(x.estado)}`}
                style={{
                  ...blockStyle(x),
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
