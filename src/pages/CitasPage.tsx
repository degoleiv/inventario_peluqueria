import { useCallback, useEffect, useMemo, useState } from "react";
import {
  crearCitasSerieRecurrente,
  createCita,
  deleteCita,
  fetchCitas,
  fetchCitasSugerenciasHorario,
  fetchClientes,
  updateCita,
  type Cita,
  type Cliente,
} from "../api";

const ESTADOS = ["pendiente", "confirmado", "cancelado"] as const;

function agendaBlockStyle(c: Cita) {
  const d = new Date(c.inicio);
  const from8 = d.getHours() * 60 + d.getMinutes() - 8 * 60;
  const spanMin = 13 * 60;
  const top = Math.max(0, Math.min(100, (from8 / spanMin) * 100));
  const h = (c.duracion_min / spanMin) * 100;
  return { top: `${top}%`, height: `${Math.max(h, 3)}%` };
}

function estadoVisualClass(estado: string) {
  const e = estado.toLowerCase();
  if (e.includes("cancel")) return "cita-estado--cancelado";
  if (e.includes("confirm")) return "cita-estado--confirmado";
  return "cita-estado--pendiente";
}

export function CitasPage() {
  const [citas, setCitas] = useState<Cita[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clienteId, setClienteId] = useState<number | "">("");
  const [inicio, setInicio] = useState("");
  const [duracionMin, setDuracionMin] = useState(60);
  const [servicio, setServicio] = useState("");
  const [estado, setEstado] = useState<string>("pendiente");
  const [notas, setNotas] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [fechaDia, setFechaDia] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<string[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);

  const [serieIntervalo, setSerieIntervalo] = useState(15);
  const [serieReps, setSerieReps] = useState(4);
  const [serieInicio, setSerieInicio] = useState("");
  const [serieMsg, setSerieMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [c, cl] = await Promise.all([fetchCitas(), fetchClientes()]);
      setCitas(c);
      setClientes(cl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function reset() {
    setClienteId("");
    setInicio("");
    setDuracionMin(60);
    setServicio("");
    setEstado("pendiente");
    setNotas("");
    setEditingId(null);
  }

  function toLocalInput(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (clienteId === "" || !inicio.trim()) return;
    setError(null);
    const inicioIso = new Date(inicio).toISOString();
    try {
      if (editingId != null) {
        await updateCita(editingId, {
          cliente_id: Number(clienteId),
          inicio: inicioIso,
          duracion_min: duracionMin,
          servicio: servicio.trim() || null,
          estado,
          notas: notas.trim() || null,
        });
      } else {
        await createCita({
          cliente_id: Number(clienteId),
          inicio: inicioIso,
          duracion_min: duracionMin,
          servicio: servicio.trim() || null,
          estado,
          notas: notas.trim() || null,
        });
      }
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    }
  }

  function onEdit(x: Cita) {
    setEditingId(x.id);
    setClienteId(x.cliente_id);
    setInicio(toLocalInput(x.inicio));
    setDuracionMin(x.duracion_min);
    setServicio(x.servicio ?? "");
    setEstado(x.estado);
    setNotas(x.notas ?? "");
  }

  async function cargarSugerencias() {
    setCargandoSlots(true);
    setSlots([]);
    try {
      const r = await fetchCitasSugerenciasHorario(fechaDia, duracionMin);
      setSlots(r.slots);
    } catch {
      setError("No se pudieron calcular horarios");
    } finally {
      setCargandoSlots(false);
    }
  }

  function aplicarSlot(iso: string) {
    setInicio(toLocalInput(iso));
  }

  async function onSerie(e: React.FormEvent) {
    e.preventDefault();
    if (clienteId === "" || !serieInicio.trim()) return;
    setError(null);
    setSerieMsg(null);
    try {
      const out = await crearCitasSerieRecurrente({
        cliente_id: Number(clienteId),
        inicio_primera: new Date(serieInicio).toISOString(),
        duracion_min: duracionMin,
        servicio: servicio.trim() || null,
        estado: estado,
        intervalo_dias: serieIntervalo,
        repeticiones: serieReps,
        notas: notas.trim() || null,
      });
      setSerieMsg(`Se crearon ${out.creadas} citas.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en serie");
    }
  }

  const citasDelDia = useMemo(() => {
    return citas
      .filter((c) => {
        const d = new Date(c.inicio);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}` === fechaDia;
      })
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [citas, fechaDia]);

  async function onDelete(id: number) {
    if (!confirm("¿Eliminar esta cita?")) return;
    setError(null);
    try {
      await deleteCita(id);
      if (editingId === id) reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="card">
        <h2 className="card-title">{editingId ? "Editar cita" : "Nueva cita"}</h2>
        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span>Cliente *</span>
            <select
              required
              value={clienteId === "" ? "" : String(clienteId)}
              onChange={(e) =>
                setClienteId(e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">Seleccionar…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Inicio *</span>
              <input
                type="datetime-local"
                required
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Duración (min)</span>
              <input
                type="number"
                min={15}
                step={15}
                value={duracionMin}
                onChange={(e) => setDuracionMin(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="field">
            <span>Servicio</span>
            <input
              value={servicio}
              onChange={(e) => setServicio(e.target.value)}
              placeholder="Corte, color, etc."
            />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Estado</span>
              <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                {ESTADOS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Notas</span>
              <input value={notas} onChange={(e) => setNotas(e.target.value)} />
            </label>
          </div>
          <div className="actions">
            <button type="submit" className="btn primary">
              {editingId ? "Guardar cita" : "Agendar"}
            </button>
            {editingId != null ? (
              <button type="button" className="btn ghost" onClick={reset}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="card-title">Horarios sugeridos</h2>
        <p className="muted">
          Intervalos de 15 min dentro del horario laboral (BUSINESS_OPEN_HOUR / CLOSE en el servidor).
        </p>
        <div className="filtros-row">
          <label className="field inline">
            <span>Día</span>
            <input type="date" value={fechaDia} onChange={(e) => setFechaDia(e.target.value)} />
          </label>
          <button type="button" className="btn secondary" onClick={() => void cargarSugerencias()} disabled={cargandoSlots}>
            {cargandoSlots ? "…" : "Buscar huecos"}
          </button>
        </div>
        {slots.length > 0 ? (
          <div className="slots-grid">
            {slots.slice(0, 24).map((iso) => (
              <button key={iso} type="button" className="btn ghost small" onClick={() => aplicarSlot(iso)}>
                {new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2 className="card-title">Serie recurrente</h2>
        <p className="muted">
          Varias citas al mismo cliente cada X días (ej. mantenimiento cada 15 días).
        </p>
        {serieMsg ? <div className="banner banner-info">{serieMsg}</div> : null}
        <form className="form" onSubmit={onSerie}>
          <label className="field">
            <span>Primera cita *</span>
            <input
              type="datetime-local"
              required
              value={serieInicio}
              onChange={(e) => setSerieInicio(e.target.value)}
            />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Intervalo (días)</span>
              <input
                type="number"
                min={1}
                value={serieIntervalo}
                onChange={(e) => setSerieIntervalo(Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Repeticiones</span>
              <input
                type="number"
                min={1}
                max={52}
                value={serieReps}
                onChange={(e) => setSerieReps(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="muted">
            Usa el cliente, duración, servicio y estado del formulario de arriba.
          </p>
          <button type="submit" className="btn secondary">
            Crear serie
          </button>
        </form>
      </section>

      <section className="card agenda-section">
        <div className="card-head">
          <h2 className="card-title">Agenda</h2>
          <div className="toolbar-inline">
            <label className="field-inline agenda-date-label">
              <span>Día</span>
              <input
                type="date"
                value={fechaDia}
                onChange={(e) => setFechaDia(e.target.value)}
              />
            </label>
            <button type="button" className="btn ghost small" onClick={() => void load()}>
              Actualizar
            </button>
          </div>
        </div>

        <div className="agenda-vista-wrap">
          <p className="muted agenda-vista-hint">
            Vista día (8:00–21:00). Colores: pendiente · confirmado · cancelado.
          </p>
          <div className="agenda-vista-dia">
            <div className="agenda-rail" aria-hidden>
              {Array.from({ length: 14 }, (_, idx) => 8 + idx).map((h) => (
                <div key={h} className="agenda-hour-label">
                  {h}:00
                </div>
              ))}
            </div>
            <div className="agenda-track">
              {citasDelDia.length === 0 ? (
                <div className="empty-state empty-state--compact agenda-empty">
                  <p>Sin citas este día.</p>
                  <p className="muted">Creá una arriba o cambiá la fecha.</p>
                </div>
              ) : (
                citasDelDia.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    className={`agenda-block ${estadoVisualClass(x.estado)}`}
                    style={agendaBlockStyle(x)}
                    onClick={() => onEdit(x)}
                    title={`${x.cliente_nombre} — ${x.estado}`}
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
                ))
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <p className="muted">Cargando…</p>
        ) : citas.length === 0 ? (
          <p className="muted">No hay citas en el sistema.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Cliente</th>
                  <th>Servicio</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {citas.map((x) => (
                  <tr key={x.id}>
                    <td className="mono">
                      {new Date(x.inicio).toLocaleString()}
                      <div className="cell-sub">{x.duracion_min} min</div>
                    </td>
                    <td>{x.cliente_nombre}</td>
                    <td>{x.servicio ?? "—"}</td>
                    <td>{x.estado}</td>
                    <td className="row-actions">
                      <button type="button" className="link" onClick={() => onEdit(x)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="link danger"
                        onClick={() => void onDelete(x.id)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
