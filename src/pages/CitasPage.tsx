import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  createCita,
  createCitaEmpleadoTurnoDia,
  deleteCita,
  fetchAuthMe,
  fetchCitas,
  fetchCitasConfigAgenda,
  fetchCitasEmpleadoAgendaDia,
  fetchCitaSolape,
  fetchCitasSugerenciasHorario,
  fetchCitasEmpleadoTurnosRango,
  fetchCategoriasServicio,
  fetchClientes,
  fetchEquipo,
  updateCita,
  type CategoriaServicio,
  type Cita,
  type Cliente,
  type EquipoMiembro,
} from "../api";
import { useToast } from "../context/ToastContext";
import { SubNav } from "../components/SubNav";
import { Drawer } from "../components/Drawer";
import { DailyTimeline, type AgendaVentanaDia } from "../components/agenda/DailyTimeline";
import { MonthCalendar, localDayKeyFromIso } from "../components/agenda/MonthCalendar";
import {
  computeDayMetaMap,
  monthMatrixSixWeeks,
  type MetaDíaCalendario,
} from "../lib/citasCalendarioOcupacion";
import type { PosPreloadCitaPayload } from "../lib/posPrecargaDesdeCita";
import { CITAS_TABS, readCitasTab, type CitasTab } from "../lib/moduleRoutes";
import { filterIntegerTyping, parseIntLoose } from "../lib/decimalInput";
import { SearchableSelect } from "../components/SearchableSelect";

const SERVICIO_EMOJI_FALLBACK = "💇";

function parseServicios(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s*,\s*|\s*;\s*|\s+\u00B7\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function serializeServicios(arr: string[]): string {
  return arr.map((s) => s.trim()).filter(Boolean).join(", ");
}

/** Turnos cargados en Empleados → Turnos para colorear el mes (días sin turno = descanso). */
type CalTurnosEstado =
  | { modo: "todos" }
  | { modo: "empleado"; cargando: boolean; diasConTurno: Set<string> };

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

function estadoNorm(estado: string) {
  return estado.toLowerCase().trim();
}

function defaultFiltroDesdeStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  d.setDate(1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function defaultFiltroHastaStr() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 3, 0);
  return `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`;
}

/** Convierte hora del negocio (p. ej. 9.5 → 09:30) a HH:MM para la franja de agenda. */
function floatNegocioAHm(n: number): string {
  let h = Math.floor(n);
  let m = Math.round((n - h) * 60);
  if (m >= 60) {
    h += Math.floor(m / 60);
    m = m % 60;
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseHmToMin(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return 9 * 60;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutosAHm(totalMin: number): string {
  const hh = Math.floor(totalMin / 60);
  const mm = ((totalMin % 60) + 60) % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

const CITA_DURACION_MINIMA_MIN = 10;
const CITA_PASO_MINUTOS = 5;

function validarDuracionCitaCliente(duracionMin: number): string | null {
  if (!Number.isFinite(duracionMin) || duracionMin < CITA_DURACION_MINIMA_MIN) {
    return `La duración mínima es ${CITA_DURACION_MINIMA_MIN} minutos.`;
  }
  if (duracionMin % CITA_PASO_MINUTOS !== 0) {
    return `La duración debe ser múltiplo de ${CITA_PASO_MINUTOS} (10, 15, 20…).`;
  }
  return null;
}

function inicioEnPasosDeCincoMin(dLocal: string): boolean {
  const d = new Date(dLocal.trim());
  if (Number.isNaN(d.getTime())) return false;
  return (d.getHours() * 60 + d.getMinutes()) % CITA_PASO_MINUTOS === 0;
}

const BUSQUEDA_MENU_ANCHO_EST = 216;

/** Mantiene el menú flotante dentro del viewport. */
function posicionMenuBusqueda(left: number, top: number): { left: number; top: number } {
  const pad = 8;
  const w = BUSQUEDA_MENU_ANCHO_EST;
  const h = 240;
  return {
    left: Math.max(pad, Math.min(left, window.innerWidth - w - pad)),
    top: Math.max(pad, Math.min(top, window.innerHeight - h - pad)),
  };
}

type CitasBusquedaAccionesMenuProps = {
  c: Cita;
  left: number;
  top: number;
  onClose: () => void;
  onEdit: (c: Cita) => void;
  onConfirm: (c: Cita) => void | Promise<void>;
  onPos: (c: Cita) => void;
  onCancel: (c: Cita) => void | Promise<void>;
};

function CitasBusquedaAccionesMenu({
  c,
  left,
  top,
  onClose,
  onEdit,
  onConfirm,
  onPos,
  onCancel,
}: CitasBusquedaAccionesMenuProps) {
  const pend = !isCancelledEstado(c.estado) && estadoNorm(c.estado).includes("pend");
  const activa = !isCancelledEstado(c.estado);
  return (
    <div
      className="citas-busqueda-menu-panel"
      role="menu"
      aria-label={`Acciones cita ${c.id}`}
      style={{ left, top }}
    >
      <button
        type="button"
        className="citas-busqueda-menu-item"
        role="menuitem"
        onClick={() => {
          onClose();
          onEdit(c);
        }}
      >
        Editar
      </button>
      {pend ? (
        <button
          type="button"
          className="citas-busqueda-menu-item citas-busqueda-menu-item--confirmar"
          role="menuitem"
          onClick={() => {
            onClose();
            void onConfirm(c);
          }}
        >
          Confirmar
        </button>
      ) : null}
      {activa ? (
        <>
          <button
            type="button"
            className="citas-busqueda-menu-item citas-busqueda-menu-item--pos"
            role="menuitem"
            onClick={() => {
              onClose();
              onPos(c);
            }}
          >
            Cobrar en POS
          </button>
          <button
            type="button"
            className="citas-busqueda-menu-item citas-busqueda-menu-item--cancelar"
            role="menuitem"
            onClick={() => {
              onClose();
              void onCancel(c);
            }}
          >
            Cancelar
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Mismo minuto calendario (local) entre un ISO de slot y el valor datetime-local de inicio. */
function mismoMinutoQueInicio(isoSlot: string, inicioDatetimeLocal: string): boolean {
  const t0 = new Date(isoSlot).getTime();
  const t1 = new Date(inicioDatetimeLocal.trim()).getTime();
  if (Number.isNaN(t0) || Number.isNaN(t1)) return false;
  return Math.floor(t0 / 60000) === Math.floor(t1 / 60000);
}

export function CitasPage() {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  /** En pestaña Calendario: la cuadrícula de horas se abre en modal al elegir un día. */
  const [cuadriculaHorasAbierta, setCuadriculaHorasAbierta] = useState(false);
  /** Día sin turno (gris): modal para confirmar creación del horario del negocio. */
  const [modalDescansoDia, setModalDescansoDia] = useState<string | null>(null);
  const [creandoDiaDescanso, setCreandoDiaDescanso] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const fechaParam = searchParams.get("fecha");
  const fechaDia = useMemo(() => {
    if (fechaParam && /^\d{4}-\d{2}-\d{2}$/.test(fechaParam)) return fechaParam;
    return todayStr();
  }, [fechaParam]);

  const tituloModalHoras = useMemo(
    () =>
      new Date(fechaDia + "T12:00:00").toLocaleDateString("es", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [fechaDia]
  );

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filtroListaDesde, setFiltroListaDesde] = useState(() => defaultFiltroDesdeStr());
  const [filtroListaHasta, setFiltroListaHasta] = useState(() => defaultFiltroHastaStr());
  const [filtroListaEmpleado, setFiltroListaEmpleado] = useState<number | "todos">("todos");
  const [calTurnosEstado, setCalTurnosEstado] = useState<CalTurnosEstado>({ modo: "todos" });
  const [citaSolapeTurno, setCitaSolapeTurno] = useState<Cita | null>(null);
  /** Franja horaria del negocio (minutos) para marcar ocupación en el calendario mensual. */
  const [negocioDiaMin, setNegocioDiaMin] = useState<{ s: number; e: number }>({ s: 9 * 60, e: 18 * 60 });

  const [ventanaAgendaDia, setVentanaAgendaDia] = useState<AgendaVentanaDia>(() => ({
    cargando: true,
    descanso: false,
    segmentos: [],
  }));

  const [inicio, setInicio] = useState("");
  const [duracionStr, setDuracionStr] = useState("60");
  const [servicios, setServicios] = useState<string[]>([]);
  const [serviciosCatalogo, setServiciosCatalogo] = useState<CategoriaServicio[]>([]);
  const [serviciosCatalogoLoading, setServiciosCatalogoLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [slotsCrudos, setSlotsCrudos] = useState<string[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [clientesPickList, setClientesPickList] = useState<Cliente[]>([]);
  const [clientesPickLoading, setClientesPickLoading] = useState(false);
  /** Solo edición: cliente ya vinculado a la cita. */
  const [clienteId, setClienteId] = useState<number | "">("");
  /** Nueva cita: datos mínimos (no hace falta cliente registrado). */
  const [citaClienteNombre, setCitaClienteNombre] = useState("");
  const [citaClienteTelefono, setCitaClienteTelefono] = useState("");
  const [modoClienteNuevo, setModoClienteNuevo] = useState<"existente" | "nuevo">("existente");
  const [citaClienteExistenteId, setCitaClienteExistenteId] = useState<number | "">("");

  const [filtroProf, setFiltroProf] = useState<number | "todos">("todos");

  const [equipo, setEquipo] = useState<EquipoMiembro[]>([]);
  const [miUsuarioId, setMiUsuarioId] = useState<number | null>(null);
  const [profesionalId, setProfesionalId] = useState<number | "">("");

  const [viewMonth, setViewMonth] = useState(() => new Date(fechaDia + "T12:00:00"));

  const [busquedaTexto, setBusquedaTexto] = useState("");
  const [busquedaEstado, setBusquedaEstado] = useState<
    "todos" | "pendiente" | "confirmado" | "cancelado" | "activas"
  >("todos");
  /** Menú contextual de acciones (icono ⋮ o clic derecho en la fila). */
  const [busquedaMenu, setBusquedaMenu] = useState<{ c: Cita; left: number; top: number } | null>(null);

  const calMatrixKeys = useMemo(() => {
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    return monthMatrixSixWeeks(y, m).map((c) => c.key);
  }, [viewMonth]);

  useEffect(() => {
    if (filtroListaEmpleado === "todos") {
      setCalTurnosEstado({ modo: "todos" });
      return;
    }
    let cancelled = false;
    setCalTurnosEstado({ modo: "empleado", cargando: true, diasConTurno: new Set() });
    const keys = [...calMatrixKeys].sort();
    if (keys.length === 0) {
      setCalTurnosEstado({ modo: "empleado", cargando: false, diasConTurno: new Set() });
      return;
    }
    const desde = keys[0]!;
    const hasta = keys[keys.length - 1]!;
    void (async () => {
      try {
        const rows = await fetchCitasEmpleadoTurnosRango({
          desde,
          hasta,
          usuario_id: filtroListaEmpleado,
        });
        if (cancelled) return;
        const diasConTurno = new Set<string>();
        for (const t of rows) {
          if (String(t.estado).toLowerCase() === "finalizado") continue;
          const d = typeof t.fecha === "string" ? t.fecha.trim().slice(0, 10) : "";
          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) diasConTurno.add(d);
        }
        setCalTurnosEstado({ modo: "empleado", cargando: false, diasConTurno });
      } catch {
        if (!cancelled) {
          setCalTurnosEstado({ modo: "empleado", cargando: false, diasConTurno: new Set() });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filtroListaEmpleado, calMatrixKeys]);

  const calDayMeta = useMemo(() => {
    const base = computeDayMetaMap({
      matrixDayKeys: calMatrixKeys,
      citas,
      filtroEmpleado: filtroListaEmpleado,
      equipoIds: equipo.map((e) => e.id),
      workStartMin: negocioDiaMin.s,
      workEndMin: negocioDiaMin.e,
    });
    if (filtroListaEmpleado === "todos" || calTurnosEstado.modo !== "empleado" || calTurnosEstado.cargando) {
      return base;
    }
    const dias = calTurnosEstado.diasConTurno;
    const out = new Map<string, MetaDíaCalendario>();
    for (const dayKey of calMatrixKeys) {
      const prev = base.get(dayKey);
      if (!prev) continue;
      out.set(dayKey, {
        ...prev,
        descansoSinTurno: !dias.has(dayKey),
      });
    }
    return out;
  }, [calMatrixKeys, citas, filtroListaEmpleado, equipo, negocioDiaMin, calTurnosEstado]);

  const marcaMinutoSeleccion = useMemo(() => {
    if (!drawerOpen || !inicio.trim()) return null;
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{1,2}):(\d{2})/.exec(inicio.trim());
    if (!m) return null;
    if (m[1] !== fechaDia) return null;
    const hh = Number(m[2]);
    const mm = Number(m[3]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  }, [drawerOpen, inicio, fechaDia]);

  /** Valor del `<input type="time">` al agendar (misma fecha que la agenda del día). */
  const horaInicioNuevaCita = useMemo(() => {
    if (editingId != null) return "";
    const t = inicio.trim();
    if (!t) return "";
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{1,2}):(\d{2})/.exec(t);
    if (!m || m[1] !== fechaDia) return "";
    return `${pad2(Number(m[2]))}:${pad2(Number(m[3]))}`;
  }, [editingId, inicio, fechaDia]);

  useEffect(() => {
    void fetchAuthMe()
      .then((me) => setMiUsuarioId(me.user.id))
      .catch(() => {});
    void fetchEquipo()
      .then(setEquipo)
      .catch(() => {});
  }, []);

  useEffect(() => {
    void fetchCitasConfigAgenda()
      .then((cfg) => {
        const s = parseHmToMin(floatNegocioAHm(cfg.open));
        const e = parseHmToMin(floatNegocioAHm(cfg.close));
        setNegocioDiaMin({ s: Math.min(s, e), e: Math.max(s, e) });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setFiltroProf(filtroListaEmpleado);
  }, [filtroListaEmpleado]);

  useEffect(() => {
    if (tabParam === "buscar") {
      setCuadriculaHorasAbierta(false);
      setModalDescansoDia(null);
    }
    setBusquedaMenu(null);
  }, [tabParam]);

  useEffect(() => {
    if (!busquedaMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (el.closest(".citas-busqueda-menu-panel") || el.closest(".citas-busqueda-menu-trigger")) return;
      setBusquedaMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBusquedaMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [busquedaMenu]);

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
      let desde = filtroListaDesde.trim();
      let hasta = filtroListaHasta.trim();
      const ok = /^\d{4}-\d{2}-\d{2}$/;
      if (ok.test(desde) && ok.test(hasta) && desde > hasta) {
        const t = desde;
        desde = hasta;
        hasta = t;
      }
      const c = await fetchCitas({
        desde: ok.test(desde) ? desde : undefined,
        hasta: ok.test(hasta) ? hasta : undefined,
        usuario_id: filtroListaEmpleado === "todos" ? undefined : filtroListaEmpleado,
      });
      setCitas(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [filtroListaDesde, filtroListaHasta, filtroListaEmpleado]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setVentanaAgendaDia((v) => ({ ...v, cargando: true }));
      try {
        if (filtroProf === "todos") {
          if (cancelled) return;
          /* La grilla diaria solo se muestra con un profesional elegido; no hace falta cargar franja global. */
          setVentanaAgendaDia({
            cargando: false,
            descanso: true,
            segmentos: [],
            modoGlobal: true,
          });
        } else {
          const d = await fetchCitasEmpleadoAgendaDia(filtroProf, fechaDia);
          if (cancelled) return;
          const seg = [...d.segmentos].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
          setVentanaAgendaDia({
            cargando: false,
            descanso: seg.length === 0,
            segmentos: seg,
            modoGlobal: false,
          });
        }
      } catch {
        if (!cancelled) {
          setVentanaAgendaDia({
            cargando: false,
            descanso: false,
            segmentos: [{ hora_inicio: "09:00", hora_fin: "18:00" }],
            modoGlobal: true,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filtroProf, fechaDia]);

  useEffect(() => {
    const pid =
      editingId != null
        ? profesionalId === ""
          ? null
          : Number(profesionalId)
        : filtroProf === "todos"
          ? null
          : filtroProf;
    if (!drawerOpen || pid == null || !inicio.trim()) {
      setCitaSolapeTurno(null);
      return;
    }
    const inicioDate = new Date(inicio);
    if (Number.isNaN(inicioDate.getTime())) {
      setCitaSolapeTurno(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const r = await fetchCitaSolape({
            usuario_id: pid,
            inicio: inicioDate.toISOString(),
            duracion_min: parseIntLoose(duracionStr, 60),
            exclude_cita_id: editingId,
          });
          if (!cancelled) setCitaSolapeTurno(r.solapa && r.cita ? r.cita : null);
        } catch {
          if (!cancelled) setCitaSolapeTurno(null);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [drawerOpen, editingId, profesionalId, filtroProf, inicio, duracionStr]);

  useEffect(() => {
    if (tabParam !== "calendario") return;
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

  useEffect(() => {
    if (tabParam !== "calendario") setCuadriculaHorasAbierta(false);
  }, [tabParam]);

  useEffect(() => {
    if (!cuadriculaHorasAbierta || tabParam !== "calendario") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cuadriculaHorasAbierta, tabParam]);

  useEffect(() => {
    if (!cuadriculaHorasAbierta || tabParam !== "calendario") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setCuadriculaHorasAbierta(false);
      setDrawerOpen(false);
      reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cuadriculaHorasAbierta, tabParam]);

  function reset() {
    setInicio("");
    setDuracionStr("60");
    setServicios([]);
    setEditingId(null);
    setProfesionalId(miUsuarioId ?? "");
    setCitaSolapeTurno(null);
    setSlotsCrudos([]);
    setClienteId("");
    setCitaClienteNombre("");
    setCitaClienteTelefono("");
    setModoClienteNuevo("existente");
    setCitaClienteExistenteId("");
  }

  function cerrarModalHoras() {
    setCuadriculaHorasAbierta(false);
    setDrawerOpen(false);
    reset();
  }

  function toLocalInput(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const cargarServiciosCatalogo = useCallback(async () => {
    setServiciosCatalogoLoading(true);
    try {
      const res = await fetchCategoriasServicio({
        estado: "activo",
        page: 1,
        page_size: 200,
      });
      setServiciosCatalogo(res.items ?? []);
    } catch {
      setServiciosCatalogo([]);
    } finally {
      setServiciosCatalogoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    void cargarServiciosCatalogo();
  }, [drawerOpen, cargarServiciosCatalogo]);

  const servicioOpciones = useMemo(() => {
    const opts = serviciosCatalogo.map((s) => {
      const nombre = s.nombre_categoria;
      const emoji = (s.emoji && s.emoji.trim()) || SERVICIO_EMOJI_FALLBACK;
      return { value: nombre, emoji, nombre };
    });
    const seen = new Set(opts.map((o) => o.value.toLowerCase()));
    const extras = servicios
      .filter((s) => s.trim() && !seen.has(s.trim().toLowerCase()))
      .map((s) => ({
        value: s.trim(),
        emoji: SERVICIO_EMOJI_FALLBACK,
        nombre: s.trim(),
      }));
    return [...extras, ...opts];
  }, [serviciosCatalogo, servicios]);

  useEffect(() => {
    if (!drawerOpen) return;
    let cancelled = false;
    void (async () => {
      setClientesPickLoading(true);
      try {
        const rows = await fetchClientes();
        if (!cancelled) setClientesPickList(rows);
      } catch {
        if (!cancelled) setClientesPickList([]);
      } finally {
        if (!cancelled) setClientesPickLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onFocus = () => {
      void fetchClientes()
        .then((rows) => setClientesPickList(rows))
        .catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [drawerOpen]);

  const opcionesClienteSelect = useMemo(() => {
    if (editingId == null) return [];
    const out = clientesPickList
      .slice()
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }))
      .map((c) => ({ id: c.id, nombre: c.nombre }));
    const ids = new Set(out.map((o) => o.id));
    const cita = citas.find((c) => c.id === editingId);
    if (cita && !ids.has(cita.cliente_id)) {
      out.unshift({ id: cita.cliente_id, nombre: cita.cliente_nombre });
    }
    return out;
  }, [clientesPickList, editingId, citas]);

  const opcionesClienteExistente = useMemo(() => {
    return clientesPickList
      .slice()
      .filter((c) => c.activo !== 0)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }))
      .map((c) => ({
        value: String(c.id),
        label: c.telefono ? `${c.nombre} · ${c.telefono}` : c.nombre,
      }));
  }, [clientesPickList]);

  /** Solo lo que devuelve el servidor; no depende de «Inicio» para no reordenar huecos al cambiar la hora manualmente. */
  const slotsVisibles = useMemo(() => {
    return [...slotsCrudos].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [slotsCrudos]);

  const citasDelDia = useMemo(() => {
    return citas
      .filter((c) => localDayKeyFromIso(c.inicio) === fechaDia)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [citas, fechaDia]);

  const citasTimeline = useMemo(() => {
    let list = citasDelDia;
    if (filtroProf !== "todos") list = list.filter((c) => c.usuario_id === filtroProf);
    return list;
  }, [citasDelDia, filtroProf]);

  /** Citas del día (no canceladas) del empleado elegido, para pintar ocupación en la grilla. */
  const citasOcupacionEmpleadoDia = useMemo(() => {
    if (filtroProf === "todos") return [];
    return citasDelDia.filter(
      (c) => !isCancelledEstado(c.estado) && c.usuario_id === filtroProf
    );
  }, [citasDelDia, filtroProf]);

  const proximasCitas = useMemo(() => {
    const now = Date.now();
    return [...citas]
      .filter((c) => new Date(c.inicio).getTime() >= now && !isCancelledEstado(c.estado))
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .slice(0, 6);
  }, [citas]);

  const citasResultadoBusqueda = useMemo(() => {
    const q = busquedaTexto.trim().toLowerCase();
    let list = [...citas].sort(
      (a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime()
    );
    if (busquedaEstado === "pendiente") {
      list = list.filter((c) => estadoNorm(c.estado).includes("pend"));
    } else if (busquedaEstado === "confirmado") {
      list = list.filter((c) => estadoNorm(c.estado).includes("confirm"));
    } else if (busquedaEstado === "cancelado") {
      list = list.filter((c) => isCancelledEstado(c.estado));
    } else if (busquedaEstado === "activas") {
      list = list.filter((c) => !isCancelledEstado(c.estado));
    }
    if (!q) return list;
    return list.filter((c) => {
      const blob = `${c.cliente_nombre} ${c.servicio ?? ""} ${c.empleado_nombre ?? ""} ${c.estado}`.toLowerCase();
      return blob.includes(q);
    });
  }, [citas, busquedaTexto, busquedaEstado]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    let pid: number;
    if (editingId != null) {
      if (profesionalId === "") return;
      pid = Number(profesionalId);
    } else {
      if (filtroProf === "todos") {
        setError("Elegí un empleado en «Agenda por empleado» para agendar la cita.");
        return;
      }
      pid = filtroProf;
    }
    if (!inicio.trim()) {
      if (editingId == null) {
        setError("Elegí un horario tocando uno de los botones de arriba o un hueco libre en la grilla del día.");
      }
      return;
    }
    setError(null);
    const inicioDate = new Date(inicio);
    if (Number.isNaN(inicioDate.getTime())) {
      setError("Fecha u hora no válida.");
      return;
    }
    const duracionMin = parseIntLoose(duracionStr, 60);
    const errDur = validarDuracionCitaCliente(duracionMin);
    if (errDur) {
      setError(errDur);
      return;
    }
    if (!inicioEnPasosDeCincoMin(inicio.trim())) {
      setError("El horario de inicio debe ser en intervalos de 5 minutos (:00, :05, :10…).");
      return;
    }
    try {
      const chk = await fetchCitaSolape({
        usuario_id: pid,
        inicio: inicioDate.toISOString(),
        duracion_min: duracionMin,
        exclude_cita_id: editingId,
      });
      if (chk.solapa && chk.cita) {
        const em = chk.cita.empleado_nombre?.trim() || "Este empleado";
        setError(
          `${em} ya tiene turno en ese horario: ${chk.cita.cliente_nombre} (${new Date(chk.cita.inicio).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })}).`
        );
        return;
      }
    } catch {
      setError("No se pudo comprobar si el horario está libre. Intentá de nuevo.");
      return;
    }
    const inicioIso = inicioDate.toISOString();
    try {
      if (editingId != null) {
        if (clienteId === "" || !Number.isFinite(Number(clienteId))) {
          setError("Elegí un cliente para la cita.");
          return;
        }
        await updateCita(editingId, {
          usuario_id: pid,
          cliente_id: Number(clienteId),
          inicio: inicioIso,
          duracion_min: duracionMin,
          servicio: serializeServicios(servicios) || null,
        });
      } else {
        if (modoClienteNuevo === "existente") {
          if (
            citaClienteExistenteId === "" ||
            !Number.isFinite(Number(citaClienteExistenteId))
          ) {
            setError("Elegí un cliente existente o cambiá a «Cliente nuevo».");
            return;
          }
          await createCita({
            usuario_id: pid,
            inicio: inicioIso,
            duracion_min: duracionMin,
            servicio: serializeServicios(servicios) || null,
            cliente_id: Number(citaClienteExistenteId),
          });
        } else {
          const nom = citaClienteNombre.trim();
          const tel = citaClienteTelefono.trim();
          if (!nom || !tel) {
            setError("Completá nombre y teléfono del cliente para agendar la cita.");
            return;
          }
          await createCita({
            usuario_id: pid,
            inicio: inicioIso,
            duracion_min: duracionMin,
            servicio: serializeServicios(servicios) || null,
            cliente_datos: { nombre: nom, telefono: tel },
          });
        }
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
    setProfesionalId(x.usuario_id != null ? x.usuario_id : miUsuarioId ?? "");
    setInicio(toLocalInput(x.inicio));
    setDuracionStr(String(x.duracion_min));
    setServicios(parseServicios(x.servicio));
    setClienteId(x.cliente_id);
    setCitaClienteNombre("");
    setCitaClienteTelefono("");
    setModoClienteNuevo("existente");
    setCitaClienteExistenteId("");
    setDrawerOpen(true);
  }

  function openNewDrawer() {
    reset();
    setDrawerOpen(true);
  }

  function aplicarSlot(iso: string) {
    setInicio(toLocalInput(iso));
  }

  useEffect(() => {
    if (!drawerOpen) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        setCargandoSlots(true);
        try {
          const usuarioSug =
            editingId != null
              ? profesionalId === ""
                ? undefined
                : Number(profesionalId)
              : filtroProf === "todos"
                ? undefined
                : filtroProf;
          const r = await fetchCitasSugerenciasHorario(
            fechaDia,
            parseIntLoose(duracionStr, 60),
            usuarioSug
          );
          if (!cancelled) setSlotsCrudos(r.slots);
        } catch {
          if (!cancelled) setSlotsCrudos([]);
        } finally {
          if (!cancelled) setCargandoSlots(false);
        }
      })();
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [drawerOpen, fechaDia, duracionStr, editingId, profesionalId, filtroProf]);

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

  async function confirmarCitaBusqueda(c: Cita) {
    try {
      await updateCita(c.id, { estado: "confirmado" });
      toast("Cita confirmada.", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo confirmar", "error");
    }
  }

  async function cancelarCitaBusqueda(c: Cita) {
    if (!window.confirm(`¿Cancelar la cita de «${c.cliente_nombre}»?`)) return;
    try {
      await updateCita(c.id, { estado: "cancelado" });
      toast("Cita cancelada.", "success");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo cancelar", "error");
    }
  }

  function irAVentaDesdeCita(c: Cita) {
    const nombres = parseServicios(c.servicio);
    const servicios = (nombres.length > 0 ? nombres : []).map((nombre) => ({
      nombre,
      usuarioId: c.usuario_id ?? null,
      cantidad: 1,
      valorUnitario: 0,
    }));
    const payload: PosPreloadCitaPayload = {
      v: 1,
      clienteId: c.cliente_id,
      citaId: c.id,
      servicio: c.servicio?.trim() || null,
      inicioIso: c.inicio,
      usuarioId: c.usuario_id ?? null,
      servicios,
    };
    navigate("/ventas/ventas", { state: { posPrecargaCita: payload } });
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
        openNewDrawer();
      }
      if (tabParam === "calendario") {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setFechaDia(shiftDateKey(fechaDia, -1));
          setCuadriculaHorasAbierta(true);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setFechaDia(shiftDateKey(fechaDia, 1));
          setCuadriculaHorasAbierta(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, tabParam, fechaDia, setFechaDia]);

  const fechaQs = `?fecha=${encodeURIComponent(fechaDia)}`;

  const rutaCalendario = useMemo(() => {
    const s = searchParams.toString();
    return s ? `/citas/calendario?${s}` : "/citas/calendario";
  }, [searchParams]);

  const abrirGrillaParaDia = useCallback(
    (dayKey: string) => {
      setFechaDia(dayKey);
      const picked = new Date(dayKey + "T12:00:00");
      if (
        picked.getFullYear() !== viewMonth.getFullYear() ||
        picked.getMonth() !== viewMonth.getMonth()
      ) {
        setViewMonth(new Date(picked.getFullYear(), picked.getMonth(), 1));
      }
      setCuadriculaHorasAbierta(true);
    },
    [setFechaDia, viewMonth]
  );

  const nombreEmpleadoFiltroLista = useMemo(() => {
    if (filtroListaEmpleado === "todos") return "";
    const p = equipo.find((e) => e.id === filtroListaEmpleado);
    return p?.nombre?.trim() || p?.email || "este empleado";
  }, [equipo, filtroListaEmpleado]);

  async function confirmarCrearDiaSinTurno() {
    const dayKey = modalDescansoDia;
    if (!dayKey || filtroListaEmpleado === "todos") {
      setModalDescansoDia(null);
      return;
    }
    setCreandoDiaDescanso(true);
    try {
      await createCitaEmpleadoTurnoDia({
        usuario_id: filtroListaEmpleado,
        fecha: dayKey,
        hora_inicio: minutosAHm(negocioDiaMin.s),
        hora_fin: minutosAHm(negocioDiaMin.e),
      });
      setCalTurnosEstado((prev) => {
        if (prev.modo !== "empleado" || prev.cargando) return prev;
        const next = new Set(prev.diasConTurno);
        next.add(dayKey);
        return { modo: "empleado", cargando: false, diasConTurno: next };
      });
      toast("Se cargó el horario del negocio para este día.", "success");
      setModalDescansoDia(null);
      abrirGrillaParaDia(dayKey);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo cargar el turno de trabajo", "error");
    } finally {
      setCreandoDiaDescanso(false);
    }
  }

  useEffect(() => {
    if (!modalDescansoDia) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setModalDescansoDia(null);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [modalDescansoDia]);

  const abrirDiaDesdeCalendario = useCallback(
    (dayKey: string) => {
      const meta = calDayMeta.get(dayKey);
      if (meta?.disabled) {
        toast(
          "Este día está completo en la franja del negocio según el filtro (no queda hueco libre).",
          "info"
        );
        return;
      }
      if (meta?.descansoSinTurno) {
        if (filtroListaEmpleado === "todos") return;
        setModalDescansoDia(dayKey);
        return;
      }
      abrirGrillaParaDia(dayKey);
    },
    [abrirGrillaParaDia, calDayMeta, filtroListaEmpleado, toast]
  );

  if (tabParam === "lista" || tabParam === "nueva") {
    const qs = searchParams.toString();
    return <Navigate to={qs ? `/citas/calendario?${qs}` : "/citas/calendario"} replace />;
  }

  const tabOk = tabParam != null && CITAS_TABS.includes(tabParam as CitasTab);
  if (!tabOk) {
    return <Navigate to={`/citas/${readCitasTab()}${fechaQs}`} replace />;
  }

  const tab = tabParam as CitasTab;

  const drawerForm = (
    <form className="form drawer-form" onSubmit={onSubmit} id="cita-drawer-form">
      {citaSolapeTurno ? (
        <div className="banner banner-error" role="status">
          <strong>Ese empleado ya está agendado en este turno.</strong> Coincide con{" "}
          <strong>{citaSolapeTurno.cliente_nombre}</strong> (
          {new Date(citaSolapeTurno.inicio).toLocaleString("es", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
          , {citaSolapeTurno.duracion_min} min
          {citaSolapeTurno.servicio ? ` · ${citaSolapeTurno.servicio}` : ""}).
        </div>
      ) : null}
      {editingId != null ? (
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
      ) : null}
      {editingId == null ? (
        <div className="drawer-cita-datos-contacto" role="group" aria-label="Datos del cliente">
          <div
            className="cita-cliente-modo-toggle"
            role="tablist"
            aria-label="Modo de cliente"
          >
            <button
              type="button"
              role="tab"
              aria-selected={modoClienteNuevo === "existente"}
              className={`cita-cliente-modo-toggle__opt ${
                modoClienteNuevo === "existente" ? "is-active" : ""
              }`}
              onClick={() => setModoClienteNuevo("existente")}
            >
              Cliente existente
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={modoClienteNuevo === "nuevo"}
              className={`cita-cliente-modo-toggle__opt ${
                modoClienteNuevo === "nuevo" ? "is-active" : ""
              }`}
              onClick={() => setModoClienteNuevo("nuevo")}
            >
              Cliente nuevo
            </button>
          </div>
          {modoClienteNuevo === "existente" ? (
            <SearchableSelect
              label="Cliente *"
              value={
                citaClienteExistenteId === "" ? "" : String(citaClienteExistenteId)
              }
              onChange={(v) =>
                setCitaClienteExistenteId(v === "" ? "" : Number(v))
              }
              options={opcionesClienteExistente}
              placeholder="Buscar por nombre o teléfono…"
              idleTextWhenEmpty={
                clientesPickLoading
                  ? "Cargando clientes…"
                  : "Seleccioná un cliente…"
              }
              emptySlot={
                <div className="searchable-select__empty-actions">
                  <p className="muted small" style={{ marginBottom: "0.5rem" }}>
                    No hay clientes registrados.
                  </p>
                  <Link to="/clientes/nuevo" className="btn secondary small">
                    Registrar cliente
                  </Link>
                </div>
              }
              hint="¿No está en la lista? Cambiá a «Cliente nuevo» o registralo en Clientes."
            />
          ) : (
            <>
              <p className="muted small drawer-cita-datos-contacto-hint">
                Solo hace falta nombre y teléfono.
              </p>
              <div className="grid-2 drawer-cita-datos-contacto-grid">
                <label className="field">
                  <span>Nombre *</span>
                  <input
                    type="text"
                    autoComplete="name"
                    required
                    value={citaClienteNombre}
                    onChange={(e) => setCitaClienteNombre(e.target.value)}
                    placeholder="Nombre completo"
                  />
                </label>
                <label className="field">
                  <span>Teléfono *</span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    required
                    value={citaClienteTelefono}
                    onChange={(e) => setCitaClienteTelefono(e.target.value)}
                    placeholder="Celular o fijo"
                  />
                </label>
              </div>
            </>
          )}
        </div>
      ) : null}
      <div className="drawer-sugerencias">
        {cargandoSlots ? (
          <p className="muted small">Buscando horarios libres…</p>
        ) : slotsVisibles.length > 0 ? (
          <>
            <p className="muted drawer-sugerencias-hint">
              Sugerencias cada hora en punto. En la grilla mantené presionado y arrastrá para elegir la hora
              (cada 5 min), usá el campo «Hora de inicio» o editá la cita.
            </p>
            <div className="slots-grid">
            {slotsVisibles.slice(0, 18).map((iso) => {
              const seleccionado = inicio.trim() !== "" && mismoMinutoQueInicio(iso, inicio);
              return (
                <button
                  key={iso}
                  type="button"
                  className={`btn ghost small${seleccionado ? " slot-sugerencia--seleccionada" : ""}`}
                  aria-pressed={seleccionado}
                  onClick={() => aplicarSlot(iso)}
                >
                  {new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </button>
              );
            })}
            </div>
          </>
        ) : (
          <p className="muted small">No hay huecos libres en la franja configurada para este día.</p>
        )}
      </div>
      {editingId != null ? (
        <label className="field">
          <span>Cliente *</span>
          <select
            value={clienteId === "" ? "" : String(clienteId)}
            onChange={(e) => {
              const v = e.target.value;
              setClienteId(v === "" ? "" : Number(v));
            }}
            disabled={clientesPickLoading}
            required
          >
            {opcionesClienteSelect.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {clientesPickLoading ? <span className="muted small">Cargando clientes…</span> : null}
          <p className="muted small drawer-cita-cliente-nuevo">
            <Link to="/clientes/nuevo">Registrar o editar en Clientes</Link>
            {". Al volver a esta ventana se actualiza la lista."}
          </p>
        </label>
      ) : null}
      {editingId != null ? (
        <div className="grid-2">
          <label className="field">
            <span>Inicio *</span>
            <input
              type="datetime-local"
              required
              step={300}
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
            <span className="muted small">
              Mínimo {CITA_DURACION_MINIMA_MIN} min, múltiplos de {CITA_PASO_MINUTOS} (10, 15, 20…).
            </span>
          </label>
        </div>
      ) : (
        <div className="grid-2">
          <label className="field">
            <span>Hora de inicio *</span>
            <input
              type="time"
              step={300}
              value={horaInicioNuevaCita}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  setInicio("");
                  return;
                }
                setInicio(`${fechaDia}T${v}`);
              }}
            />
            <span className="muted small">Pasos de 5 minutos; también podés arrastrar en la grilla del día.</span>
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
            <span className="muted small">
              Mínimo {CITA_DURACION_MINIMA_MIN} min, de {CITA_PASO_MINUTOS} en {CITA_PASO_MINUTOS}.
            </span>
          </label>
        </div>
      )}
      <div className="field servicios-multi-field">
        <span className="servicios-multi-field__label">
          Servicios
          {servicios.length > 0 ? (
            <span className="servicios-multi-field__count">({servicios.length})</span>
          ) : null}
        </span>
        {servicioOpciones.length === 0 ? (
          <p className="muted small servicios-multi-field__empty">
            {serviciosCatalogoLoading ? (
              "Cargando servicios…"
            ) : (
              <>
                No hay servicios activos.{" "}
                <Link to="/configuracion/parametros">Crear en Configuración</Link>.
              </>
            )}
          </p>
        ) : (
          <ul className="servicios-multi-check" role="group" aria-label="Servicios">
            {servicioOpciones.map((opt) => {
              const checked = servicios.some(
                (s) => s.toLowerCase() === opt.value.toLowerCase()
              );
              return (
                <li key={opt.value} className="servicios-multi-check__row">
                  <label
                    className={`servicios-multi-check__item ${checked ? "is-checked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setServicios((prev) =>
                            prev.some((s) => s.toLowerCase() === opt.value.toLowerCase())
                              ? prev
                              : [...prev, opt.value]
                          );
                        } else {
                          setServicios((prev) =>
                            prev.filter((s) => s.toLowerCase() !== opt.value.toLowerCase())
                          );
                        }
                      }}
                    />
                    <span className="servicios-multi-check__emoji" aria-hidden>
                      {opt.emoji}
                    </span>
                    <span className="servicios-multi-check__name">{opt.nombre}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="drawer-actions">
        <button
          type="submit"
          className="btn primary btn-lg"
          disabled={Boolean(citaSolapeTurno)}
          title={citaSolapeTurno ? "Resolvé el solapamiento cambiando hora, duración o empleado" : undefined}
        >
          {editingId ? "Guardar" : "Agendar"}
        </button>
        {editingId != null ? (
          <button type="button" className="btn ghost danger-text" onClick={() => void onDelete(editingId)}>
            Eliminar
          </button>
        ) : null}
      </div>
    </form>
  );

  const agendaDiariaHeadYTimeline = (
    <>
      <div className="card-head agenda-card-head-agenda">
        <h2 className="card-title">Agenda diaria</h2>
      </div>
      <div className="agenda-toolbar-primera">
        <label className="field-inline agenda-date-label">
          <span>Fecha</span>
          <input
            type="date"
            value={fechaDia}
            onChange={(e) => setFechaDia(e.target.value)}
          />
        </label>
        <label className="field-inline agenda-empleado-agenda-label">
          <span>Agenda por empleado</span>
          <select
            value={filtroProf === "todos" ? "" : String(filtroProf)}
            onChange={(e) => {
              const v = e.target.value;
              setFiltroProf(v === "" ? "todos" : Number(v));
            }}
            aria-label="Filtrar la vista de agenda por empleado"
          >
            <option value="">Todos los profesionales</option>
            {equipo.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre || p.email}
              </option>
            ))}
          </select>
        </label>
        {filtroProf === "todos" ? (
          <p className="muted small agenda-ocupacion-leyenda agenda-ocupacion-leyenda--solo-texto">
            Elegí un empleado para ver su grilla con turnos de Empleados y la ocupación por bloques de 5 minutos.
          </p>
        ) : null}
      </div>
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : filtroProf === "todos" ? (
        <div className="banner banner-info agenda-requiere-empleado-grilla" role="status">
          <strong>Seleccioná un profesional</strong> en «Agenda por empleado» para ver la grilla del día: los
          bloques de 5 minutos muestran en color si el horario está libre u ocupado por citas; tocá o arrastrá
          en un hueco libre para elegir la hora de la cita.
        </div>
      ) : (
        <DailyTimeline
          fechaDia={fechaDia}
          citasDelDia={citasTimeline}
          citasOcupacionEmpleado={citasOcupacionEmpleadoDia}
          mostrarOcupacionEmpleado
          ventana={ventanaAgendaDia}
          marcaSlotMinutos={marcaMinutoSeleccion}
          marcaDuracionMinutos={drawerOpen ? parseIntLoose(duracionStr, 60) : null}
          onEmptySlot={(isoLocal) => {
            if (!drawerOpen) openNewDrawerFromSlot(isoLocal);
            else setInicio(isoLocal);
          }}
          onSlotTimeWhilePointer={(isoLocal) => {
            if (drawerOpen) setInicio(isoLocal);
          }}
          onEditCita={(c) => openEditDrawer(c)}
        />
      )}
    </>
  );

  return (
    <>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="card citas-filtros-lista" aria-label="Filtros de citas por rango y empleado">
        <div className="card-head">
          <h2 className="card-title">Filtros de lista</h2>
        </div>
        <div className="citas-filtros-grid">
          <label className="field">
            <span>Desde</span>
            <input
              type="date"
              value={filtroListaDesde}
              onChange={(e) => setFiltroListaDesde(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Hasta</span>
            <input
              type="date"
              value={filtroListaHasta}
              onChange={(e) => setFiltroListaHasta(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Empleado</span>
            <select
              value={filtroListaEmpleado === "todos" ? "" : String(filtroListaEmpleado)}
              onChange={(e) =>
                setFiltroListaEmpleado(e.target.value === "" ? "todos" : Number(e.target.value))
              }
            >
              <option value="">Todos los empleados</option>
              {equipo.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre || p.email}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <SubNav
        moduleId="citas"
        enableNumberShortcuts={!drawerOpen && !cuadriculaHorasAbierta && !busquedaMenu}
        items={[
          { id: "calendario", label: "Calendario", to: rutaCalendario },
          { id: "buscar", label: "Buscar citas", to: "/citas/buscar" },
        ]}
      />

      {tab === "calendario" ? (
        <>
          <section className="card agenda-section agenda-section--calendario">
            <MonthCalendar
              citas={citas}
              dayMetaByKey={calDayMeta}
              hintDescansoPorTurnos={
                filtroListaEmpleado !== "todos" &&
                calTurnosEstado.modo === "empleado" &&
                !calTurnosEstado.cargando
              }
              viewMonth={viewMonth}
              selectedDay={fechaDia}
              onPrevMonth={() => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              onNextMonth={() => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              onSelectDay={abrirDiaDesdeCalendario}
            />
          </section>
        </>
      ) : (
        <section className="card citas-busqueda-card" aria-label="Búsqueda y gestión de citas">
          <div className="card-head citas-busqueda-head">
            <h2 className="card-title">Buscar citas</h2>
            <p className="muted small citas-busqueda-hint">
              Se listan las citas del rango y empleado elegidos arriba. Usá el botón de tres puntos en la columna
              Acciones o <strong>clic derecho</strong> en la fila para ver Editar, Confirmar, Cobrar en POS o
              Cancelar (en Ventas se precargan cliente y servicio; si el servicio coincide con un producto del
              inventario, también el producto).
            </p>
          </div>
          {proximasCitas.length > 0 ? (
            <div className="citas-busqueda-proximas" role="region" aria-labelledby="citas-busqueda-proximas-title">
              <h3 id="citas-busqueda-proximas-title" className="citas-busqueda-proximas__title">
                Próximas citas
              </h3>
              <ul className="agenda-proximas-list citas-busqueda-proximas__list">
                {proximasCitas.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="agenda-proximas-item"
                      onClick={() => openEditDrawer(c)}
                    >
                      <span className="mono citas-busqueda-proximas__fecha">
                        {new Date(c.inicio).toLocaleString([], {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="agenda-proximas-name">{c.cliente_nombre}</span>
                      <span className="muted citas-busqueda-proximas__svc">{c.servicio ?? "—"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="citas-busqueda-toolbar">
            <label className="field citas-busqueda-field-grow">
              <span>Buscar</span>
              <input
                type="search"
                value={busquedaTexto}
                onChange={(e) => setBusquedaTexto(e.target.value)}
                placeholder="Cliente, servicio, profesional o estado…"
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Estado</span>
              <select
                value={busquedaEstado}
                onChange={(e) =>
                  setBusquedaEstado(
                    e.target.value as
                      | "todos"
                      | "pendiente"
                      | "confirmado"
                      | "cancelado"
                      | "activas"
                  )
                }
              >
                <option value="todos">Todos</option>
                <option value="activas">Activas (no canceladas)</option>
                <option value="pendiente">Pendientes</option>
                <option value="confirmado">Confirmadas</option>
                <option value="cancelado">Canceladas</option>
              </select>
            </label>
          </div>
          {loading ? (
            <p className="muted">Cargando…</p>
          ) : citasResultadoBusqueda.length === 0 ? (
            <p className="muted">No hay citas que coincidan con los filtros.</p>
          ) : (
            <div className="citas-busqueda-table-wrap">
              <table className="citas-busqueda-table">
                <thead>
                  <tr>
                    <th>Fecha y hora</th>
                    <th>Cliente</th>
                    <th>Servicio</th>
                    <th>Profesional</th>
                    <th>Estado</th>
                    <th className="citas-busqueda-col-acciones">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {citasResultadoBusqueda.map((c) => {
                    const menuAbierto = busquedaMenu?.c.id === c.id;
                    return (
                      <tr
                        key={c.id}
                        className="citas-busqueda-tr"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setBusquedaMenu({ c, ...posicionMenuBusqueda(e.clientX, e.clientY) });
                        }}
                      >
                        <td className="mono">
                          {new Date(c.inicio).toLocaleString("es", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td>{c.cliente_nombre}</td>
                        <td>{c.servicio ?? "—"}</td>
                        <td>{c.empleado_nombre?.trim() || "—"}</td>
                        <td>
                          <span className="citas-busqueda-estado">{c.estado}</span>
                        </td>
                        <td className="citas-busqueda-td-acciones">
                          <button
                            type="button"
                            className="btn ghost small citas-busqueda-menu-trigger"
                            aria-haspopup="true"
                            aria-expanded={menuAbierto}
                            aria-label={`Más acciones: cita ${new Date(c.inicio).toLocaleString("es", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })} · ${c.cliente_nombre}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const el = e.currentTarget;
                              const r = el.getBoundingClientRect();
                              setBusquedaMenu((prev) => {
                                if (prev?.c.id === c.id) return null;
                                return { c, ...posicionMenuBusqueda(r.left, r.bottom + 4) };
                              });
                            }}
                          >
                            <span className="citas-busqueda-menu-trigger-dots" aria-hidden>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" focusable="false">
                                <circle cx="12" cy="5" r="2" />
                                <circle cx="12" cy="12" r="2" />
                                <circle cx="12" cy="19" r="2" />
                              </svg>
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {modalDescansoDia ? (
        <div
          className="citas-descanso-modal-root"
          role="dialog"
          aria-modal="true"
          aria-labelledby="citas-descanso-modal-title"
        >
          <button
            type="button"
            className="citas-descanso-modal-backdrop"
            onClick={() => !creandoDiaDescanso && setModalDescansoDia(null)}
            aria-label="Cerrar"
          />
          <div className="citas-descanso-modal-panel">
            <h2 id="citas-descanso-modal-title" className="citas-descanso-modal-title">
              Crear día en el horario
            </h2>
            <p className="citas-descanso-modal-body">
              <strong>{nombreEmpleadoFiltroLista}</strong> no tiene turno cargado para el{" "}
              <strong>
                {new Date(modalDescansoDia + "T12:00:00").toLocaleDateString("es", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </strong>
              . ¿Querés crear el horario del negocio ({minutosAHm(negocioDiaMin.s)}–
              {minutosAHm(negocioDiaMin.e)}) para ese día y abrir la grilla de citas?
            </p>
            <div className="citas-descanso-modal-actions">
              <button
                type="button"
                className="btn ghost"
                disabled={creandoDiaDescanso}
                onClick={() => setModalDescansoDia(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={creandoDiaDescanso}
                onClick={() => void confirmarCrearDiaSinTurno()}
              >
                {creandoDiaDescanso ? "Creando…" : "Crear horario y abrir"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cuadriculaHorasAbierta ? (
        <div
          className="agenda-hours-modal-root"
          role="dialog"
          aria-modal="true"
          aria-labelledby="agenda-hours-modal-title"
        >
          <button
            type="button"
            className="agenda-hours-modal-backdrop"
            onClick={cerrarModalHoras}
            aria-label="Cerrar panel de horas"
          />
          <div
            className={`agenda-hours-modal-row ${drawerOpen ? "agenda-hours-modal-row--split" : ""}`}
          >
            <button
              type="button"
              className="btn ghost small agenda-hours-modal-close-all"
              onClick={cerrarModalHoras}
              aria-label="Cerrar agenda y formulario"
            >
              Cerrar <kbd className="kbd-mini">Esc</kbd>
            </button>
            <div className="agenda-hours-modal-panel">
              <header className="agenda-hours-modal-header">
                <h2 id="agenda-hours-modal-title" className="agenda-hours-modal-title">
                  {tituloModalHoras}
                </h2>
              </header>
              <div className="agenda-hours-modal-body">{agendaDiariaHeadYTimeline}</div>
            </div>
            {drawerOpen ? (
              <Drawer
                variant="split"
                open
                hideHeaderClose
                onClose={() => {
                  setDrawerOpen(false);
                  reset();
                }}
                title={editingId ? "Editar cita" : "Crear cita"}
                wide
              >
                {drawerForm}
              </Drawer>
            ) : null}
          </div>
        </div>
      ) : null}

      {drawerOpen && !cuadriculaHorasAbierta ? (
        <Drawer
          open
          onClose={() => {
            setDrawerOpen(false);
            reset();
          }}
          title={editingId ? "Editar cita" : "Crear cita"}
          wide
        >
          {drawerForm}
        </Drawer>
      ) : null}

      {busquedaMenu
        ? createPortal(
            <CitasBusquedaAccionesMenu
              c={busquedaMenu.c}
              left={busquedaMenu.left}
              top={busquedaMenu.top}
              onClose={() => setBusquedaMenu(null)}
              onEdit={openEditDrawer}
              onConfirm={confirmarCitaBusqueda}
              onPos={irAVentaDesdeCita}
              onCancel={cancelarCitaBusqueda}
            />,
            document.body
          )
        : null}
    </>
  );
}
