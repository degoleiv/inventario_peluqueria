import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  crearCitasSerieRecurrente,
  createCita,
  deleteCita,
  fetchAuthMe,
  fetchCitas,
  fetchCitasSugerenciasHorario,
  fetchClientes,
  fetchEquipo,
  updateCita,
  type Cita,
  type Cliente,
  type EquipoMiembro,
} from "../api";
import { Drawer } from "../components/Drawer";
import { SubNav } from "../components/SubNav";
import { DailyTimeline } from "../components/agenda/DailyTimeline";
import { MonthCalendar, localDayKeyFromIso } from "../components/agenda/MonthCalendar";
import { CITAS_TABS, readCitasTab, type CitasTab } from "../lib/moduleRoutes";
import { filterIntegerTyping, parseIntLoose } from "../lib/decimalInput";

const ESTADOS = ["pendiente", "confirmado", "cancelado"] as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

function shiftDateKey(dayKey: string, deltaDays: number): string {
  const d = new Date(dayKey + "T12:00:00");
  d.setDate(d.getDate() + deltaDays);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isCancelledEstado(estado: string) {
  return estado.toLowerCase().includes("cancel");
}

function mismoProf(a: number | null | undefined, b: number | null | undefined) {
  return (a ?? null) === (b ?? null);
}

function overlapConflict(
  inicio: Date,
  durMin: number,
  citas: Cita[],
  excludeId: number | null,
  staffId: number | null
): Cita | null {
  const t0 = inicio.getTime();
  const t1 = t0 + durMin * 60_000;
  for (const c of citas) {
    if (excludeId != null && c.id === excludeId) continue;
    if (isCancelledEstado(c.estado)) continue;
    if (!mismoProf(staffId, c.usuario_id ?? null)) continue;
    const s = new Date(c.inicio).getTime();
    const e = s + c.duracion_min * 60_000;
    if (t0 < e && s < t1) return c;
  }
  return null;
}

export function CitasPage() {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const fechaParam = searchParams.get("fecha");
  const fechaDia = useMemo(() => {
    if (fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam)) return fechaParam;
    return todayStr();
  }, [fechaParam]);

  const setFechaDia = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("fecha", next);
          return p;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [citas, setCitas] = useState<Cita[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clienteId, setClienteId] = useState<number | "">("");
  const [clienteBusqueda, setClienteBusqueda] = useState("");
  const [inicio, setInicio] = useState("");
  const [duracionStr, setDuracionStr] = useState("60");
  const [servicio, setServicio] = useState("");
  const [estado, setEstado] = useState<string>("pendiente");
  const [notas, setNotas] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [slots, setSlots] = useState<string[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);

  const [serieIntervaloStr, setSerieIntervaloStr] = useState("15");
  const [serieRepsStr, setSerieRepsStr] = useState("4");
  const [serieInicio, setSerieInicio] = useState("");
  const [serieMsg, setSerieMsg] = useState<string | null>(null);

  const [filtroEstado, setFiltroEstado] = useState<"todos" | string>("todos");
  const [filtroProf, setFiltroProf] = useState<number | "todos">("todos");

  const [equipo, setEquipo] = useState<EquipoMiembro[]>([]);
  const [miUsuarioId, setMiUsuarioId] = useState<number | null>(null);
  const [profesionalId, setProfesionalId] = useState<number | "">("");

  const [viewMonth, setViewMonth] = useState(() => new Date(fechaDia + "T12:00:00"));

  useEffect(() => {
    void fetchAuthMe()
      .then((me) => setMiUsuarioId(me.user.id))
      .catch(() => {});
    void fetchEquipo()
      .then(setEquipo)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (miUsuarioId != null && profesionalId === "") {
      setProfesionalId(miUsuarioId);
    }
  }, [miUsuarioId, profesionalId]);

  useEffect(() => {
    const d = new Date(fechaDia + "T12:00:00");
    setViewMonth((vm) => {
      if (vm.getFullYear() === d.getFullYear() && vm.getMonth() === d.getMonth()) return vm;
      return d;
    });
  }, [fechaDia]);

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

  useEffect(() => {
    if (tabParam !== "agenda" && tabParam !== "calendario") return;
    if (!searchParams.get("fecha")) {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("fecha", fechaDia);
          return p;
        },
        { replace: true }
      );
    }
  }, [tabParam, searchParams, fechaDia, setSearchParams]);

  function reset() {
    setClienteId("");
    setClienteBusqueda("");
    setInicio("");
    setDuracionStr("60");
    setServicio("");
    setEstado("pendiente");
    setNotas("");
    setEditingId(null);
    setProfesionalId(miUsuarioId ?? "");
  }

  function toLocalInput(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const clientesFiltrados = useMemo(() => {
    const q = clienteBusqueda.trim().toLowerCase();
    if (!q) return clientes.slice(0, 80);
    return clientes
      .filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          (c.telefono && String(c.telefono).includes(q))
      )
      .slice(0, 40);
  }, [clientes, clienteBusqueda]);

  const servicioSugerencias = useMemo(() => {
    const s = new Set<string>();
    for (const c of citas) {
      if (c.servicio && c.servicio.trim()) s.add(c.servicio.trim());
    }
    return [...s].slice(0, 12);
  }, [citas]);

  const citasDelDia = useMemo(() => {
    return citas
      .filter((c) => localDayKeyFromIso(c.inicio) === fechaDia)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [citas, fechaDia]);

  const citasTimeline = useMemo(() => {
    let list = citasDelDia;
    if (filtroEstado !== "todos") list = list.filter((c) => c.estado === filtroEstado);
    if (filtroProf !== "todos") list = list.filter((c) => c.usuario_id === filtroProf);
    return list;
  }, [citasDelDia, filtroEstado, filtroProf]);

  const proximasCitas = useMemo(() => {
    const now = Date.now();
    return [...citas]
      .filter((c) => new Date(c.inicio).getTime() >= now && !isCancelledEstado(c.estado))
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .slice(0, 6);
  }, [citas]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (clienteId === "" || !inicio.trim() || profesionalId === "") return;
    setError(null);
    const inicioDate = new Date(inicio);
    if (Number.isNaN(inicioDate.getTime())) {
      setError("Fecha u hora no válida.");
      return;
    }
    const duracionMin = parseIntLoose(duracionStr, 60);
    const pid = Number(profesionalId);
    const clash = overlapConflict(inicioDate, duracionMin, citas, editingId, pid);
    if (clash) {
      setError(
        `Solapamiento con cita de ${clash.cliente_nombre} (${new Date(clash.inicio).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}).`
      );
      return;
    }
    const inicioIso = inicioDate.toISOString();
    try {
      if (editingId != null) {
        await updateCita(editingId, {
          cliente_id: Number(clienteId),
          usuario_id: pid,
          inicio: inicioIso,
          duracion_min: duracionMin,
          servicio: servicio.trim() || null,
          estado,
          notas: notas.trim() || null,
        });
      } else {
        await createCita({
          cliente_id: Number(clienteId),
          usuario_id: pid,
          inicio: inicioIso,
          duracion_min: duracionMin,
          servicio: servicio.trim() || null,
          estado,
          notas: notas.trim() || null,
        });
      }
      reset();
      setDrawerOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    }
  }

  function openNewDrawerFromSlot(isoLocal: string) {
    reset();
    setInicio(isoLocal);
    setDrawerOpen(true);
  }

  function openEditDrawer(x: Cita) {
    setEditingId(x.id);
    setClienteId(x.cliente_id);
    setProfesionalId(x.usuario_id != null ? x.usuario_id : miUsuarioId ?? "");
    const cl = clientes.find((c) => c.id === x.cliente_id);
    setClienteBusqueda(cl?.nombre ?? "");
    setInicio(toLocalInput(x.inicio));
    setDuracionStr(String(x.duracion_min));
    setServicio(x.servicio ?? "");
    setEstado(x.estado);
    setNotas(x.notas ?? "");
    setDrawerOpen(true);
  }

  function openNewTabForm() {
    reset();
    navigate(`/citas/nueva?fecha=${encodeURIComponent(fechaDia)}`);
  }

  async function cargarSugerencias() {
    setCargandoSlots(true);
    setSlots([]);
    try {
      const r = await fetchCitasSugerenciasHorario(
        fechaDia,
        parseIntLoose(duracionStr, 60),
        profesionalId === "" ? undefined : Number(profesionalId)
      );
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
    if (clienteId === "" || !serieInicio.trim() || profesionalId === "") return;
    setError(null);
    setSerieMsg(null);
    try {
      const out = await crearCitasSerieRecurrente({
        cliente_id: Number(clienteId),
        usuario_id: profesionalId === "" ? undefined : Number(profesionalId),
        inicio_primera: new Date(serieInicio).toISOString(),
        duracion_min: parseIntLoose(duracionStr, 60),
        servicio: servicio.trim() || null,
        estado: estado,
        intervalo_dias: parseIntLoose(serieIntervaloStr, 15),
        repeticiones: parseIntLoose(serieRepsStr, 4),
        notas: notas.trim() || null,
      });
      setSerieMsg(`Se crearon ${out.creadas} citas.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en serie");
    }
  }

  async function onDelete(id: number) {
    if (!confirm("¿Eliminar esta cita?")) return;
    setError(null);
    try {
      await deleteCita(id);
      if (editingId === id) {
        reset();
        setDrawerOpen(false);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (drawerOpen) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate(`/citas/nueva?fecha=${encodeURIComponent(fechaDia)}`);
      }
      if (tabParam === "agenda" || tabParam === "calendario") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setFechaDia(shiftDateKey(fechaDia, -1));
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setFechaDia(shiftDateKey(fechaDia, 1));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, navigate, tabParam, fechaDia, setFechaDia]);

  const fechaQs = `?fecha=${encodeURIComponent(fechaDia)}`;

  if (tabParam === "lista") {
    const qs = searchParams.toString();
    return <Navigate to={qs ? `/citas/agenda?${qs}` : "/citas/agenda"} replace />;
  }

  const tabOk = tabParam != null && CITAS_TABS.includes(tabParam as CitasTab);
  if (!tabOk) {
    return <Navigate to={`/citas/${readCitasTab()}${fechaQs}`} replace />;
  }
  const tab = tabParam as CitasTab;

  const drawerForm = (
    <form className="form drawer-form" onSubmit={onSubmit} id="cita-drawer-form">
      <label className="field">
        <span>Cliente *</span>
        <input
          type="search"
          autoComplete="off"
          placeholder="Buscar por nombre o teléfono…"
          value={clienteBusqueda}
          onChange={(e) => {
            setClienteBusqueda(e.target.value);
            setClienteId("");
          }}
        />
        {clienteId !== "" ? (
          <p className="muted small">
            Seleccionado: {clientes.find((c) => c.id === clienteId)?.nombre ?? `#${clienteId}`}
          </p>
        ) : null}
        {clienteBusqueda.trim() && clienteId === "" ? (
          <ul className="agenda-cliente-pick" role="listbox">
            {clientesFiltrados.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="agenda-cliente-pick-btn"
                  onClick={() => {
                    setClienteId(c.id);
                    setClienteBusqueda(c.nombre);
                  }}
                >
                  <span>{c.nombre}</span>
                  <span className="muted small">{c.telefono ?? ""}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </label>
      <label className="field">
        <span>Profesional *</span>
        <select
          required
          value={profesionalId === "" ? "" : String(profesionalId)}
          onChange={(e) =>
            setProfesionalId(e.target.value === "" ? "" : Number(e.target.value))
          }
        >
          <option value="">Seleccionar…</option>
          {equipo.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre || p.email}
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
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={duracionStr}
            onChange={(e) => setDuracionStr(filterIntegerTyping(e.target.value))}
          />
        </label>
      </div>
      <label className="field">
        <span>Servicio</span>
        <input
          list="agenda-servicios-datalist"
          value={servicio}
          onChange={(e) => setServicio(e.target.value)}
          placeholder="Corte, tinte…"
        />
        <datalist id="agenda-servicios-datalist">
          {servicioSugerencias.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
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
      <div className="drawer-actions">
        <button type="submit" className="btn primary btn-lg">
          {editingId ? "Guardar" : "Agendar"}
        </button>
        {editingId != null ? (
          <button type="button" className="btn ghost danger-text" onClick={() => void onDelete(editingId)}>
            Eliminar
          </button>
        ) : null}
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            setDrawerOpen(false);
            reset();
          }}
        >
          Cerrar
        </button>
      </div>
    </form>
  );

  return (
    <>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <SubNav
        moduleId="citas"
        enableNumberShortcuts={!drawerOpen}
        items={[
          { id: "calendario", label: "Calendario", to: `/citas/calendario${fechaQs}` },
          { id: "agenda", label: "Agenda diaria", to: `/citas/agenda${fechaQs}` },
          { id: "nueva", label: "Crear cita", to: `/citas/nueva${fechaQs}` },
        ]}
        quickActions={
          <>
            <button type="button" className="btn ghost small" onClick={() => void load()} title="Actualizar datos">
              Actualizar
            </button>
            <button type="button" className="btn secondary small" onClick={openNewTabForm} title="Ctrl+N">
              + Cita
            </button>
          </>
        }
      />

      {proximasCitas.length > 0 && tab !== "nueva" ? (
        <section className="card agenda-proximas" aria-label="Próximas citas">
          <div className="card-head">
            <h2 className="card-title">Próximas citas</h2>
          </div>
          <ul className="agenda-proximas-list">
            {proximasCitas.map((c) => (
              <li key={c.id}>
                <button type="button" className="agenda-proximas-item" onClick={() => openEditDrawer(c)}>
                  <span className="mono">
                    {new Date(c.inicio).toLocaleString([], {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="agenda-proximas-name">{c.cliente_nombre}</span>
                  <span className="muted">{c.servicio ?? "—"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "calendario" ? (
        <section className="card agenda-section">
          <MonthCalendar
            citas={citas}
            viewMonth={viewMonth}
            selectedDay={fechaDia}
            onPrevMonth={() =>
              setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
            }
            onNextMonth={() =>
              setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
            }
            onSelectDay={(dayKey) => {
              setFechaDia(dayKey);
              navigate(`/citas/agenda?fecha=${encodeURIComponent(dayKey)}`);
            }}
          />
        </section>
      ) : null}

      {tab === "agenda" ? (
        <section className="card agenda-section">
          <div className="card-head">
            <h2 className="card-title">Agenda diaria</h2>
            <div className="toolbar-inline">
              <label className="field-inline agenda-date-label">
                <span>Fecha</span>
                <input
                  type="date"
                  value={fechaDia}
                  onChange={(e) => setFechaDia(e.target.value)}
                />
              </label>
              <div className="agenda-filtros-estado" role="group" aria-label="Filtrar por estado">
                <button
                  type="button"
                  className={filtroEstado === "todos" ? "btn secondary small" : "btn ghost small"}
                  onClick={() => setFiltroEstado("todos")}
                >
                  Todos
                </button>
                {ESTADOS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={filtroEstado === s ? "btn secondary small" : "btn ghost small"}
                    onClick={() => setFiltroEstado(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <label className="field-inline agenda-date-label">
                <span>Profesional</span>
                <select
                  value={filtroProf === "todos" ? "" : String(filtroProf)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFiltroProf(v === "" ? "todos" : Number(v));
                  }}
                >
                  <option value="">Todos</option>
                  {equipo.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre || p.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {loading ? (
            <p className="muted">Cargando…</p>
          ) : (
            <DailyTimeline
              fechaDia={fechaDia}
              citasDelDia={citasTimeline}
              onEmptySlot={(isoLocal) => openNewDrawerFromSlot(isoLocal)}
              onEditCita={(c) => openEditDrawer(c)}
            />
          )}
        </section>
      ) : null}

      {tab === "nueva" ? (
        <>
          <section className="card">
            <h2 className="card-title">{editingId ? "Editar cita" : "Crear cita"}</h2>
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
              <label className="field">
                <span>Profesional *</span>
                <select
                  required
                  value={profesionalId === "" ? "" : String(profesionalId)}
                  onChange={(e) =>
                    setProfesionalId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                >
                  <option value="">Seleccionar…</option>
                  {equipo.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre || p.email}
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
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={duracionStr}
                    onChange={(e) => setDuracionStr(filterIntegerTyping(e.target.value))}
                  />
                </label>
              </div>
              <label className="field">
                <span>Servicio</span>
                <input
                  list="nueva-servicios-datalist"
                  value={servicio}
                  onChange={(e) => setServicio(e.target.value)}
                  placeholder="Corte, color, etc."
                />
                <datalist id="nueva-servicios-datalist">
                  {servicioSugerencias.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
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
              Intervalos de 15 min dentro del horario laboral (servidor). Usá el día de la agenda o
              elegí uno aquí.
            </p>
            <div className="filtros-row">
              <label className="field inline">
                <span>Día</span>
                <input type="date" value={fechaDia} onChange={(e) => setFechaDia(e.target.value)} />
              </label>
              <button
                type="button"
                className="btn secondary"
                onClick={() => void cargarSugerencias()}
                disabled={cargandoSlots}
              >
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
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={serieIntervaloStr}
                    onChange={(e) => setSerieIntervaloStr(filterIntegerTyping(e.target.value))}
                  />
                </label>
                <label className="field">
                  <span>Repeticiones</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={serieRepsStr}
                    onChange={(e) => setSerieRepsStr(filterIntegerTyping(e.target.value))}
                  />
                </label>
              </div>
              <p className="muted">Usa el cliente, duración, servicio y estado del formulario de arriba.</p>
              <button type="submit" className="btn secondary">
                Crear serie
              </button>
            </form>
          </section>
        </>
      ) : null}

      <Drawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          reset();
        }}
        title={editingId ? "Editar cita" : "Crear cita"}
        wide
      >
        {drawerForm}
      </Drawer>
    </>
  );
}
