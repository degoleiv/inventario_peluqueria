import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  createEmpleadoMovimiento,
  createRole,
  createTurnoEmpleado,
  createUsuario,
  deleteRole,
  deleteTurnoEmpleado,
  deleteUsuario,
  downloadCertificadoLaboral,
  fetchAuthMe,
  fetchEmpleadoLiquidacionComisiones,
  fetchEmpleadoResumen,
  fetchEmpleadosMovimientos,
  fetchEmpleadosTurnos,
  fetchRoles,
  fetchUsuarios,
  updateEmpleadoMovimientoEstado,
  updateRole,
  updateUsuario,
  type EmpleadoMovimiento,
  type EmpleadoResumen,
  type RolDefinicion,
  type LiquidacionComisionesResponse,
  type TurnoEmpleado,
  type TurnoPlantillaInicial,
  type UsuarioListado,
} from "../api";
import { Drawer } from "../components/Drawer";
import { SubNav } from "../components/SubNav";
import { EMPLEADOS_TABS, readEmpleadosTab, type EmpleadosTab } from "../lib/moduleRoutes";
import { NAV_LABEL, PERMISO_MODULOS, type PermisoModulo } from "../nav";
import { useToast } from "../context/ToastContext";
import { CircleNotch, Download, PencilSimple, Plus, Trash } from "@phosphor-icons/react";

type Props = { onChanged?: () => void };

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function countIsoDaysInclusive(from: string, to: string): number {
  const a = from.split("-").map(Number);
  const b = to.split("-").map(Number);
  const d0 = new Date(a[0], a[1] - 1, a[2]);
  const d1 = new Date(b[0], b[1] - 1, b[2]);
  if (d1 < d0) return -1;
  let n = 0;
  for (let c = new Date(d0.getTime()); c <= d1; c.setDate(c.getDate() + 1)) {
    n++;
    if (n > 200) return 200;
  }
  return n;
}

/** Orden Lun→Dom; valores como `Date.getDay()` (0 dom … 6 sáb). */
const TURNO_DIAS_SEMANA_OPTS: { v: number; lab: string }[] = [
  { v: 1, lab: "Lun" },
  { v: 2, lab: "Mar" },
  { v: 3, lab: "Mié" },
  { v: 4, lab: "Jue" },
  { v: 5, lab: "Vie" },
  { v: 6, lab: "Sáb" },
  { v: 0, lab: "Dom" },
];

function isoMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Inicio de ventana de N días hacia atrás desde hoy (inclusive). */
function isoDesdeHaceDiasInclusive(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - (dias - 1));
  return d.toISOString().slice(0, 10);
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
}

function emptyPermMods(): Record<PermisoModulo, boolean> {
  return PERMISO_MODULOS.reduce(
    (acc, m) => ({ ...acc, [m]: false }),
    {} as Record<PermisoModulo, boolean>
  );
}

function permisosToMods(permisos: string[]): Record<PermisoModulo, boolean> {
  const mods = emptyPermMods();
  if (permisos.includes("*")) return mods;
  for (const p of permisos) {
    if (PERMISO_MODULOS.includes(p as PermisoModulo)) mods[p as PermisoModulo] = true;
  }
  return mods;
}

type EmpleadoEstadoFiltro = "todos" | "activo" | "inactivo";

/** Filtrado de lista de empleados (solo lectura; no muta `rows`). */
function applyFilters(rows: UsuarioListado[], search: string, estado: EmpleadoEstadoFiltro): UsuarioListado[] {
  const q = search.trim().toLowerCase();
  return rows.filter((emp) => {
    const nombre = (emp.nombre ?? "").toLowerCase();
    const email = (emp.email ?? "").toLowerCase();
    const matchSearch = q === "" || nombre.includes(q) || email.includes(q);
    const matchEstado =
      estado === "todos" ||
      (estado === "activo" && emp.activo === 1) ||
      (estado === "inactivo" && emp.activo !== 1);
    return matchSearch && matchEstado;
  });
}

export function EmpleadosPage({ onChanged }: Props) {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const nuevoHandled = useRef(false);

  const [roles, setRoles] = useState<RolDefinicion[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([]);
  const [loading, setLoading] = useState(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<UsuarioListado | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    nombre: "",
    rol: "empleado",
    telefono: "",
    color_agenda: "#b8956a",
    foto_url: "",
    tipo_comision: "porcentaje" as "porcentaje" | "fijo",
    valor_comision: "0",
    activo: true,
    registrar_turnos_plantilla: true,
    turno_fecha_desde: isoToday(),
    turno_fecha_hasta: addDaysIso(isoToday(), 55),
    turno_hora_inicio: "09:00",
    turno_hora_fin: "18:00",
    /** Días laborables iniciales: Lun–Vie */
    turno_dias_semana: [1, 2, 3, 4, 5] as number[],
  });

  const [filtDesde, setFiltDesde] = useState(isoMonthStart);
  const [filtHasta, setFiltHasta] = useState(isoToday);
  const [filtUsuario, setFiltUsuario] = useState<number | "">("");

  const [liqDesde, setLiqDesde] = useState(() => isoDesdeHaceDiasInclusive(15));
  const [liqHasta, setLiqHasta] = useState(isoToday);
  const [liqData, setLiqData] = useState<LiquidacionComisionesResponse | null>(null);
  const [liqLoading, setLiqLoading] = useState(false);

  const [turnosRows, setTurnosRows] = useState<TurnoEmpleado[]>([]);
  const [movimientosRows, setMovimientosRows] = useState<EmpleadoMovimiento[]>([]);
  const [resumenEmp, setResumenEmp] = useState<EmpleadoResumen | null>(null);

  const [turnoDrawerOpen, setTurnoDrawerOpen] = useState(false);
  const [turnoDrawerBusy, setTurnoDrawerBusy] = useState(false);
  const [turnoForm, setTurnoForm] = useState({
    empleado_id: "" as number | "",
    fecha: isoToday(),
    hora_inicio: "09:00",
    hora_fin: "13:00",
    estado: "activo" as "activo" | "finalizado",
  });

  const [movForm, setMovForm] = useState({
    empleado_id: "" as number | "",
    monto: "",
    tipo: "adelanto" as "adelanto" | "descuento",
    notas: "",
  });

  const [puedeCertificado, setPuedeCertificado] = useState(false);
  /** Feedback UI mientras el API genera el PDF del certificado. */
  const [certBusy, setCertBusy] = useState<{ id: number } | null>(null);
  const certLockRef = useRef(false);

  const [rolDrawerOpen, setRolDrawerOpen] = useState(false);
  const [rolSaving, setRolSaving] = useState(false);
  const [rolForm, setRolForm] = useState({
    editingSlug: null as string | null,
    slug: "",
    nombre: "",
    todo: false,
    mods: emptyPermMods(),
  });

  const [empleadoBusqueda, setEmpleadoBusqueda] = useState("");
  const [empleadoBusquedaDebounced, setEmpleadoBusquedaDebounced] = useState("");
  const [empleadoEstadoFiltro, setEmpleadoEstadoFiltro] = useState<EmpleadoEstadoFiltro>("todos");

  useEffect(() => {
    const t = window.setTimeout(() => setEmpleadoBusquedaDebounced(empleadoBusqueda), 300);
    return () => window.clearTimeout(t);
  }, [empleadoBusqueda]);

  const usuariosFiltrados = useMemo(
    () => applyFilters(usuarios, empleadoBusquedaDebounced, empleadoEstadoFiltro),
    [usuarios, empleadoBusquedaDebounced, empleadoEstadoFiltro]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await fetchAuthMe();
      setPuedeCertificado(!!me.user.permisos?.includes("*"));
      if (!me.user.permisos?.includes("*")) {
        setRoles([]);
        setUsuarios([]);
        navigate("/inicio", { replace: true });
        return;
      }
      const [r, u] = await Promise.all([fetchRoles(), fetchUsuarios()]);
      setRoles(r);
      setUsuarios(u);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
      setPuedeCertificado(false);
      setRoles([]);
      setUsuarios([]);
    } finally {
      setLoading(false);
    }
  }, [toast, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Al actualizar usuario/rol desde este módulo, volver a cargar lista y roles */
  useEffect(() => {
    const fn = () => void load();
    window.addEventListener("peluqueria-auth-refresh", fn);
    return () => window.removeEventListener("peluqueria-auth-refresh", fn);
  }, [load]);

  const defaultRol = useMemo(
    () => (roles.some((x) => x.slug === "empleado") ? "empleado" : roles[0]?.slug ?? "empleado"),
    [roles]
  );

  const openNew = useCallback(() => {
    setEditing(null);
    setForm({
      email: "",
      password: "",
      nombre: "",
      rol: defaultRol,
      telefono: "",
      color_agenda: "#b8956a",
      foto_url: "",
      tipo_comision: "porcentaje",
      valor_comision: "0",
      activo: true,
      registrar_turnos_plantilla: true,
      turno_fecha_desde: isoToday(),
      turno_fecha_hasta: addDaysIso(isoToday(), 55),
      turno_hora_inicio: "09:00",
      turno_hora_fin: "18:00",
      turno_dias_semana: [1, 2, 3, 4, 5],
    });
    setDrawerOpen(true);
  }, [defaultRol]);

  function openEdit(u: UsuarioListado) {
    setEditing(u);
    setForm({
      email: u.email,
      password: "",
      nombre: u.nombre ?? "",
      rol: u.rol,
      telefono: u.telefono ?? "",
      color_agenda: u.color_agenda?.trim() || "#b8956a",
      foto_url: u.foto_url ?? "",
      tipo_comision:
        u.tipo_comision === "fijo" ? "fijo" : ("porcentaje" as const),
      valor_comision: String(u.valor_comision ?? 0),
      activo: u.activo === 1,
      registrar_turnos_plantilla: true,
      turno_fecha_desde: isoToday(),
      turno_fecha_hasta: addDaysIso(isoToday(), 55),
      turno_hora_inicio: "09:00",
      turno_hora_fin: "18:00",
      turno_dias_semana: [1, 2, 3, 4, 5],
    });
    setDrawerOpen(true);
  }

  useEffect(() => {
    if (tabParam !== "nuevo") {
      nuevoHandled.current = false;
      return;
    }
    if (!nuevoHandled.current) {
      nuevoHandled.current = true;
      openNew();
    }
  }, [tabParam, openNew]);

  async function onSubmitDrawer(e: React.FormEvent) {
    e.preventDefault();
    try {
      const vc = Number(form.valor_comision.replace(",", "."));
      if (editing) {
        await updateUsuario(editing.id, {
          nombre: form.nombre.trim() || null,
          rol: form.rol,
          password: form.password.trim() || undefined,
          telefono: form.telefono.trim() || null,
          color_agenda: form.color_agenda.trim() || null,
          foto_url: form.foto_url.trim() || null,
          tipo_comision: form.tipo_comision,
          valor_comision: Number.isFinite(vc) ? vc : 0,
          activo: form.activo,
        });
        toast("Empleado actualizado.", "success");
      } else {
        let turno_inicial: TurnoPlantillaInicial | undefined;
        if (form.registrar_turnos_plantilla) {
          if (form.turno_dias_semana.length === 0) {
            toast("Elegí al menos un día de la semana para los turnos iniciales.", "error");
            return;
          }
          const span = countIsoDaysInclusive(form.turno_fecha_desde, form.turno_fecha_hasta);
          if (span < 0) {
            toast("La fecha hasta no puede ser anterior a la fecha desde.", "error");
            return;
          }
          if (span > 120) {
            toast("El rango de fechas no puede superar 120 días.", "error");
            return;
          }
          turno_inicial = {
            fecha_desde: form.turno_fecha_desde,
            fecha_hasta: form.turno_fecha_hasta,
            dias_semana: [...form.turno_dias_semana].sort((a, b) => a - b),
            hora_inicio: form.turno_hora_inicio.trim(),
            hora_fin: form.turno_hora_fin.trim(),
          };
        }
        const created = await createUsuario({
          email: form.email.trim(),
          password: form.password,
          nombre: form.nombre.trim() || undefined,
          rol: form.rol,
          telefono: form.telefono.trim() || null,
          color_agenda: form.color_agenda.trim() || null,
          foto_url: form.foto_url.trim() || null,
          tipo_comision: form.tipo_comision,
          valor_comision: Number.isFinite(vc) ? vc : 0,
          turno_inicial,
        });
        if (created.turnos_creados != null) {
          if (created.turnos_creados === 0) {
            toast(
              "Empleado creado. No hubo fechas en el rango que coincidan con los días elegidos; podés cargar turnos en la pestaña Turnos.",
              "info"
            );
          } else {
            toast(`Empleado creado. Se registraron ${created.turnos_creados} turnos.`, "success");
          }
        } else {
          toast("Empleado creado.", "success");
        }
      }
      setDrawerOpen(false);
      void load();
      onChanged?.();
      navigate(`/empleados/lista`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  async function runCertificadoDescarga(u: UsuarioListado) {
    if (certLockRef.current) return;
    certLockRef.current = true;
    setCertBusy({ id: u.id });
    toast("Generando PDF en el servidor (puede tardar hasta 3 min). Luego se inicia la descarga…", "info", {
      durationMs: 28_000,
    });
    try {
      await downloadCertificadoLaboral(u.id);
      toast("Listo: revisá la carpeta de descargas.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error con el certificado", "error", { durationMs: 14_000 });
    } finally {
      certLockRef.current = false;
      setCertBusy(null);
    }
  }

  async function onDelete(u: UsuarioListado) {
    if (!window.confirm(`¿Eliminar ${u.email}?`)) return;
    try {
      await deleteUsuario(u.id);
      toast("Eliminado.", "info");
      void load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  function openRolDrawerNuevo() {
    setRolForm({
      editingSlug: null,
      slug: "",
      nombre: "",
      todo: false,
      mods: emptyPermMods(),
    });
    setRolDrawerOpen(true);
  }

  function openRolDrawerEditar(r: RolDefinicion) {
    const todo = r.permisos.includes("*");
    setRolForm({
      editingSlug: r.slug,
      slug: r.slug,
      nombre: r.nombre,
      todo,
      mods: permisosToMods(r.permisos),
    });
    setRolDrawerOpen(true);
  }

  function cerrarRolDrawer() {
    if (rolSaving) return;
    setRolDrawerOpen(false);
  }

  async function onSubmitRolDrawer(ev: React.FormEvent) {
    ev.preventDefault();
    const nombre = rolForm.nombre.trim();
    if (!nombre) {
      toast("El nombre es obligatorio.", "warning");
      return;
    }
    let permisos: string[];
    if (rolForm.editingSlug === "admin" || rolForm.todo) {
      permisos = ["*"];
    } else {
      permisos = PERMISO_MODULOS.filter((m) => rolForm.mods[m]);
      if (permisos.length === 0) {
        toast("Marcá al menos un módulo o activá acceso total.", "warning");
        return;
      }
    }
    setRolSaving(true);
    try {
      if (rolForm.editingSlug) {
        await updateRole(rolForm.editingSlug, {
          nombre,
          permisos: rolForm.editingSlug === "admin" ? ["*"] : permisos,
        });
        toast("Rol actualizado.", "success");
      } else {
        const slug = rolForm.slug.trim().toLowerCase();
        if (!slug) {
          toast("El slug es obligatorio.", "warning");
          setRolSaving(false);
          return;
        }
        await createRole({ slug, nombre, permisos });
        toast("Rol creado.", "success");
      }
      setRolDrawerOpen(false);
      setRolForm({
        editingSlug: null,
        slug: "",
        nombre: "",
        todo: false,
        mods: emptyPermMods(),
      });
      void load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setRolSaving(false);
    }
  }

  async function borrarRol(slug: string) {
    if (!window.confirm(`¿Eliminar rol «${slug}»?`)) return;
    try {
      await deleteRole(slug);
      toast("Rol eliminado.", "success");
      void load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  function onFotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    if (f.size > 200 * 1024) {
      toast("Foto muy grande (máx. ~200 KB).", "warning");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((x) => ({ ...x, foto_url: String(reader.result ?? "") }));
    reader.readAsDataURL(f);
    e.target.value = "";
  }

  const loadTurnos = useCallback(async () => {
    try {
      const uid = filtUsuario === "" ? undefined : filtUsuario;
      const rows = await fetchEmpleadosTurnos({
        desde: filtDesde,
        hasta: filtHasta,
        usuario_id: uid,
      });
      setTurnosRows(rows);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    }
  }, [filtDesde, filtHasta, filtUsuario, toast]);

  const loadMovimientosTab = useCallback(async () => {
    try {
      const uid = filtUsuario === "" ? undefined : filtUsuario;
      const m = await fetchEmpleadosMovimientos(uid);
      setMovimientosRows(m);
      if (typeof filtUsuario === "number") {
        const r = await fetchEmpleadoResumen(filtUsuario, {
          desde: filtDesde,
          hasta: filtHasta,
        });
        setResumenEmp(r);
      } else {
        setResumenEmp(null);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    }
  }, [filtDesde, filtHasta, filtUsuario, toast]);

  useEffect(() => {
    if (tabParam !== "turnos") return;
    void loadTurnos();
  }, [tabParam, loadTurnos]);

  useEffect(() => {
    if (tabParam !== "turnos") setTurnoDrawerOpen(false);
  }, [tabParam]);

  useEffect(() => {
    if (tabParam !== "movimientos") return;
    void loadMovimientosTab();
  }, [tabParam, loadMovimientosTab]);

  useEffect(() => {
    if (tabParam !== "roles") setRolDrawerOpen(false);
  }, [tabParam]);

  const loadLiquidacion = useCallback(async () => {
    setLiqLoading(true);
    try {
      const data = await fetchEmpleadoLiquidacionComisiones(liqDesde, liqHasta);
      setLiqData(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
      setLiqData(null);
    } finally {
      setLiqLoading(false);
    }
  }, [liqDesde, liqHasta, toast]);

  useEffect(() => {
    if (tabParam !== "liquidacion") return;
    void loadLiquidacion();
  }, [tabParam, loadLiquidacion]);

  const tabOk =
    tabParam != null &&
    (EMPLEADOS_TABS.includes(tabParam as EmpleadosTab) || tabParam === "nuevo");
  if (!tabOk) {
    return <Navigate to={`/empleados/${readEmpleadosTab()}`} replace />;
  }
  const tab = tabParam as EmpleadosTab | "nuevo";

  return (
    <>
      <SubNav
        moduleId="empleados"
        items={[
          { id: "lista", label: "Empleados", to: "/empleados/lista" },
          { id: "turnos", label: "Turnos", to: "/empleados/turnos" },
          { id: "movimientos", label: "Movimientos", to: "/empleados/movimientos" },
          { id: "liquidacion", label: "Liquidación", to: "/empleados/liquidacion" },
          { id: "roles", label: "Roles", to: "/empleados/roles" },
        ]}
      />

      {tab === "lista" ? (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Equipo</h2>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button type="button" className="btn secondary small" onClick={() => navigate("/empleados/nuevo")}>
                Nuevo empleado
              </button>
              <button type="button" className="btn ghost small" onClick={() => void load()}>
                Actualizar
              </button>
            </div>
          </div>
          {loading ? (
            <p className="muted">Cargando…</p>
          ) : (
            <>
              <div className="empleados-filtros field-row">
                <label className="field empleados-filtros-busqueda">
                  <span>Buscador</span>
                  <input
                    type="search"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Buscar por nombre o correo..."
                    value={empleadoBusqueda}
                    onChange={(e) => setEmpleadoBusqueda(e.target.value)}
                    aria-label="Buscar empleados por nombre o correo electrónico"
                  />
                </label>
                <label className="field empleados-filtros-estado">
                  <span>Estado</span>
                  <select
                    value={empleadoEstadoFiltro}
                    onChange={(e) => setEmpleadoEstadoFiltro(e.target.value as EmpleadoEstadoFiltro)}
                    aria-label="Filtrar empleados por estado (activo o inactivo)"
                  >
                    <option value="todos">Todos</option>
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </label>
              </div>
              {usuariosFiltrados.length === 0 ? (
                <p className="muted empleados-sin-resultados" role="status">
                  No se encontraron empleados
                </p>
              ) : (
            <ul className="empleados-cards-grid" role="list">
              {usuariosFiltrados.map((u) => {
                const inicial = (u.nombre || u.email).slice(0, 1).toUpperCase();
                const activo = u.activo === 1;
                return (
                  <li
                    key={u.id}
                    className={`empleado-card ${activo ? "empleado-card--activo" : "empleado-card--inactivo"}`}
                  >
                    <div className="empleado-card__avatar">
                      {u.foto_url ? (
                        <img
                          src={u.foto_url}
                          alt=""
                          className="empleado-avatar empleado-avatar--xl"
                          width={96}
                          height={96}
                        />
                      ) : (
                        <span className="empleado-avatar empleado-avatar--ph empleado-avatar--xl">
                          {inicial}
                        </span>
                      )}
                    </div>

                    <p className="empleado-card__nombre" title={u.nombre || u.email}>
                      {u.nombre || "—"}
                    </p>

                    {activo ? (
                      <span className="badge-ok empleado-card__estado">Activo</span>
                    ) : (
                      <span className="empleado-card__estado empleado-card__estado--off">
                        Inactivo
                      </span>
                    )}

                    {certBusy?.id === u.id ? (
                      <p className="empleado-card__cert-wait" aria-live="polite">
                        <CircleNotch
                          className="empleado-cert-spinner"
                          size={14}
                          weight="bold"
                          aria-hidden
                        />
                        Generando…
                      </p>
                    ) : null}

                    <div className="empleado-card__acciones">
                      <button
                        type="button"
                        className="btn-icon-row btn-icon-row--edit"
                        title="Editar empleado"
                        aria-label="Editar empleado"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openEdit(u);
                        }}
                      >
                        <PencilSimple size={18} weight="regular" aria-hidden />
                      </button>
                      {puedeCertificado ? (
                        <button
                          type="button"
                          className="btn-icon-row btn-icon-row--download"
                          title="Descargar certificado"
                          aria-label="Descargar certificado"
                          disabled={certBusy !== null}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void runCertificadoDescarga(u);
                          }}
                        >
                          <Download size={18} weight="regular" aria-hidden />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-icon-row btn-icon-row--delete"
                        title="Eliminar empleado"
                        aria-label="Eliminar empleado"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void onDelete(u);
                        }}
                      >
                        <Trash size={18} weight="regular" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
              )}
            </>
          )}
        </section>
      ) : null}

      {tab === "turnos" ? (
        <>
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Turnos</h2>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                <button type="button" className="btn ghost small" onClick={() => void loadTurnos()}>
                  Actualizar
                </button>
                <button
                  type="button"
                  className="btn primary small"
                  onClick={() => {
                    setTurnoForm({
                      empleado_id: typeof filtUsuario === "number" ? filtUsuario : "",
                      fecha: isoToday(),
                      hora_inicio: "09:00",
                      hora_fin: "13:00",
                      estado: "activo",
                    });
                    setTurnoDrawerOpen(true);
                  }}
                >
                  Agregar turno
                </button>
              </div>
            </div>
            <p className="hint">
              Horarios laborales por empleado. No se permiten solapes el mismo día. Usá HH:MM (ej. 09:00).
            </p>
            <div className="field-row" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
              <label className="field">
                <span>Empleado</span>
                <select
                  value={filtUsuario === "" ? "" : String(filtUsuario)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFiltUsuario(v === "" ? "" : Number(v));
                  }}
                >
                  <option value="">Todos</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre || u.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Desde</span>
                <input
                  type="date"
                  value={filtDesde}
                  onChange={(e) => setFiltDesde(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Hasta</span>
                <input
                  type="date"
                  value={filtHasta}
                  onChange={(e) => setFiltHasta(e.target.value)}
                />
              </label>
            </div>
            <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Empleado</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {turnosRows.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.fecha}</td>
                    <td>{t.empleado_nombre ?? "—"}</td>
                    <td className="mono">{t.hora_inicio}</td>
                    <td className="mono">{t.hora_fin}</td>
                    <td>{t.estado}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="link danger"
                        onClick={async () => {
                          if (!window.confirm("¿Eliminar este turno?")) return;
                          try {
                            await deleteTurnoEmpleado(t.id);
                            toast("Turno eliminado.", "info");
                            void loadTurnos();
                          } catch (err) {
                            toast(err instanceof Error ? err.message : "Error", "error");
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <Drawer
          open={turnoDrawerOpen}
          onClose={() => {
            if (turnoDrawerBusy) return;
            setTurnoDrawerOpen(false);
          }}
          title="Nuevo turno"
        >
          <form
            className="form drawer-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (turnoForm.empleado_id === "") {
                toast("Elegí empleado.", "warning");
                return;
              }
              setTurnoDrawerBusy(true);
              try {
                await createTurnoEmpleado({
                  empleado_id: Number(turnoForm.empleado_id),
                  fecha: turnoForm.fecha,
                  hora_inicio: turnoForm.hora_inicio,
                  hora_fin: turnoForm.hora_fin,
                  estado: turnoForm.estado,
                });
                toast("Turno creado.", "success");
                setTurnoDrawerOpen(false);
                void loadTurnos();
              } catch (err) {
                toast(err instanceof Error ? err.message : "Error", "error");
              } finally {
                setTurnoDrawerBusy(false);
              }
            }}
          >
            <label className="field">
              <span>Empleado</span>
              <select
                required
                value={turnoForm.empleado_id === "" ? "" : String(turnoForm.empleado_id)}
                onChange={(e) =>
                  setTurnoForm((x) => ({
                    ...x,
                    empleado_id: e.target.value === "" ? "" : Number(e.target.value),
                  }))
                }
              >
                <option value="">—</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre || u.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Fecha</span>
              <input
                type="date"
                value={turnoForm.fecha}
                onChange={(e) => setTurnoForm((x) => ({ ...x, fecha: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Hora inicio</span>
              <input
                value={turnoForm.hora_inicio}
                onChange={(e) => setTurnoForm((x) => ({ ...x, hora_inicio: e.target.value }))}
                placeholder="09:00"
              />
            </label>
            <label className="field">
              <span>Hora fin</span>
              <input
                value={turnoForm.hora_fin}
                onChange={(e) => setTurnoForm((x) => ({ ...x, hora_fin: e.target.value }))}
                placeholder="17:00"
              />
            </label>
            <label className="field">
              <span>Estado</span>
              <select
                value={turnoForm.estado}
                onChange={(e) =>
                  setTurnoForm((x) => ({
                    ...x,
                    estado: e.target.value as "activo" | "finalizado",
                  }))
                }
              >
                <option value="activo">activo</option>
                <option value="finalizado">finalizado</option>
              </select>
            </label>
            <div className="drawer-actions">
              <button
                type="button"
                className="btn ghost"
                disabled={turnoDrawerBusy}
                onClick={() => setTurnoDrawerOpen(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn primary btn-lg" disabled={turnoDrawerBusy}>
                {turnoDrawerBusy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </Drawer>
        </>
      ) : null}

      {tab === "movimientos" ? (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Adelantos y descuentos</h2>
            <button type="button" className="btn ghost small" onClick={() => void loadMovimientosTab()}>
              Actualizar
            </button>
          </div>
          <p className="hint">
            Pendientes se descuentan del saldo respecto de comisiones del período:{" "}
            <strong>saldo ≈ comisiones − adelantos pendientes</strong>.
          </p>
          <div className="field-row" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
            <label className="field">
              <span>Desde (resumen)</span>
              <input
                type="date"
                value={filtDesde}
                onChange={(e) => setFiltDesde(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Hasta</span>
              <input
                type="date"
                value={filtHasta}
                onChange={(e) => setFiltHasta(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Empleado</span>
              <select
                value={filtUsuario === "" ? "" : String(filtUsuario)}
                onChange={(e) => {
                  const v = e.target.value;
                  setFiltUsuario(v === "" ? "" : Number(v));
                }}
              >
                <option value="">Todos (movimientos)</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre || u.email}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {resumenEmp ? (
            <div
              className="panel-like"
              style={{
                padding: "1rem",
                marginBottom: "1rem",
                border: "1px solid var(--border)",
                borderRadius: "8px",
              }}
            >
              <strong>{resumenEmp.empleado_nombre ?? "Empleado"}</strong>
              <div className="muted small">
                Comisiones (período): {formatMoney(resumenEmp.total_comisiones_periodo)} · Pendiente
                descuentos/adelantos: {formatMoney(resumenEmp.adelantos_y_descuentos_pendiente)} ·{" "}
                <strong>Saldo: {formatMoney(resumenEmp.saldo_final)}</strong>
              </div>
            </div>
          ) : (
            <p className="muted small" style={{ marginBottom: "1rem" }}>
              Elegí un empleado para ver resumen del período.
            </p>
          )}
          <form
            className="form"
            style={{ marginBottom: "1.25rem", padding: "1rem", background: "var(--panel)" }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (movForm.empleado_id === "") {
                toast("Elegí empleado.", "warning");
                return;
              }
              const monto = Number(movForm.monto.replace(",", "."));
              if (!Number.isFinite(monto) || monto <= 0) {
                toast("Monto inválido.", "warning");
                return;
              }
              try {
                await createEmpleadoMovimiento({
                  empleado_id: Number(movForm.empleado_id),
                  monto,
                  tipo: movForm.tipo,
                  notas: movForm.notas.trim() || null,
                });
                toast("Movimiento registrado.", "success");
                setMovForm((x) => ({ ...x, monto: "", notas: "" }));
                void loadMovimientosTab();
              } catch (err) {
                toast(err instanceof Error ? err.message : "Error", "error");
              }
            }}
          >
            <div className="field-row" style={{ flexWrap: "wrap" }}>
              <label className="field">
                <span>Empleado</span>
                <select
                  required
                  value={movForm.empleado_id === "" ? "" : String(movForm.empleado_id)}
                  onChange={(e) =>
                    setMovForm((x) => ({
                      ...x,
                      empleado_id: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                >
                  <option value="">—</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre || u.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Monto</span>
                <input
                  value={movForm.monto}
                  onChange={(e) => setMovForm((x) => ({ ...x, monto: e.target.value }))}
                />
              </label>
              <label className="field">
                <span>Tipo</span>
                <select
                  value={movForm.tipo}
                  onChange={(e) =>
                    setMovForm((x) => ({
                      ...x,
                      tipo: e.target.value as "adelanto" | "descuento",
                    }))
                  }
                >
                  <option value="adelanto">adelanto</option>
                  <option value="descuento">descuento</option>
                </select>
              </label>
              <label className="field" style={{ flex: 1, minWidth: "12rem" }}>
                <span>Notas</span>
                <input
                  value={movForm.notas}
                  onChange={(e) => setMovForm((x) => ({ ...x, notas: e.target.value }))}
                />
              </label>
            </div>
            <button type="submit" className="btn primary">
              Registrar
            </button>
          </form>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Empleado</th>
                  <th>Tipo</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {movimientosRows.map((m) => (
                  <tr key={m.id}>
                    <td className="mono small">{m.created_at.slice(0, 16).replace("T", " ")}</td>
                    <td>{m.empleado_nombre ?? "—"}</td>
                    <td>{m.tipo}</td>
                    <td>{formatMoney(m.monto)}</td>
                    <td>{m.estado}</td>
                    <td className="row-actions">
                      {m.estado === "pendiente" ? (
                        <button
                          type="button"
                          className="link"
                          onClick={async () => {
                            try {
                              await updateEmpleadoMovimientoEstado(m.id, "pagado");
                              toast("Marcado pagado.", "success");
                              void loadMovimientosTab();
                            } catch (err) {
                              toast(err instanceof Error ? err.message : "Error", "error");
                            }
                          }}
                        >
                          Marcar pagado
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "liquidacion" ? (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Liquidación de comisiones</h2>
            <button type="button" className="btn ghost small" onClick={() => void loadLiquidacion()}>
              Actualizar
            </button>
          </div>
          <p className="hint">
            Las citas en estado <strong>realizado</strong> con importe cobrado generan comisión con el porcentaje
            o monto fijo configurado en cada empleado (igual que las ventas en POS). Acá ves el total a pagar por
            persona, el detalle por venta/cita y los bloques de turno de agenda registrados en el mismo período.
          </p>
          <div className="field-row" style={{ marginBottom: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="field">
              <span>Desde</span>
              <input type="date" value={liqDesde} max={liqHasta} onChange={(e) => setLiqDesde(e.target.value)} />
            </label>
            <label className="field">
              <span>Hasta</span>
              <input type="date" value={liqHasta} min={liqDesde} onChange={(e) => setLiqHasta(e.target.value)} />
            </label>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setLiqDesde(isoDesdeHaceDiasInclusive(15));
                setLiqHasta(isoToday());
              }}
            >
              Últimos 15 días
            </button>
            <button type="button" className="btn primary" onClick={() => void loadLiquidacion()}>
              Aplicar rango
            </button>
          </div>
          {liqLoading ? (
            <p className="muted">Cargando…</p>
          ) : liqData ? (
            <>
              <div
                className="panel-like"
                style={{
                  padding: "1rem",
                  marginBottom: "1.25rem",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  background: "var(--panel)",
                }}
              >
                <div className="muted small">
                  Período {liqData.periodo.desde} — {liqData.periodo.hasta}
                </div>
                <div style={{ fontSize: "1.25rem", marginTop: "0.35rem" }}>
                  Total comisiones (todas):{" "}
                  <strong>
                    {new Intl.NumberFormat("es-AR", {
                      style: "currency",
                      currency: "ARS",
                      minimumFractionDigits: 2,
                    }).format(liqData.total_general)}
                  </strong>
                </div>
              </div>
              {liqData.empleados.length === 0 ? (
                <p className="muted">No hay datos en este rango.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  {liqData.empleados.map((emp) => (
                    <div
                      key={emp.empleado_id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        padding: "1rem",
                      }}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.5rem" }}>
                        <div>
                          <strong>{emp.empleado_nombre ?? `Empleado #${emp.empleado_id}`}</strong>
                          {emp.tipo_comision ? (
                            <div className="muted small">
                              Comisión:{" "}
                              {emp.tipo_comision === "fijo"
                                ? `fijo ${formatMoney(emp.valor_comision)} por operación`
                                : `${emp.valor_comision} % sobre base`}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="muted small">A pagar (comisiones período)</div>
                          <div style={{ fontSize: "1.15rem" }}>
                            <strong>
                              {new Intl.NumberFormat("es-AR", {
                                style: "currency",
                                currency: "ARS",
                                minimumFractionDigits: 2,
                              }).format(emp.total_comisiones)}
                            </strong>
                          </div>
                        </div>
                      </div>
                      {emp.lineas.length > 0 ? (
                        <>
                          <h3 className="card-title" style={{ fontSize: "0.95rem", marginTop: "1rem" }}>
                            Detalle comisiones
                          </h3>
                          <div className="table-wrap">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Fecha</th>
                                  <th>Origen</th>
                                  <th>Detalle</th>
                                  <th>Base</th>
                                  <th>Comisión</th>
                                </tr>
                              </thead>
                              <tbody>
                                {emp.lineas.map((ln) => (
                                  <tr key={ln.comision_id}>
                                    <td className="mono small">{ln.fecha}</td>
                                    <td>{ln.origen === "venta" ? "Venta" : "Cita"}</td>
                                    <td>{ln.detalle}</td>
                                    <td>
                                      {ln.base != null
                                        ? new Intl.NumberFormat("es-AR", {
                                            style: "currency",
                                            currency: "ARS",
                                            minimumFractionDigits: 2,
                                          }).format(ln.base)
                                        : "—"}
                                    </td>
                                    <td>
                                      {new Intl.NumberFormat("es-AR", {
                                        style: "currency",
                                        currency: "ARS",
                                        minimumFractionDigits: 2,
                                      }).format(ln.monto)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <p className="muted small" style={{ marginTop: "0.75rem" }}>
                          Sin líneas de comisión en el período.
                        </p>
                      )}
                      {emp.turnos_agenda.length > 0 ? (
                        <>
                          <h3 className="card-title" style={{ fontSize: "0.95rem", marginTop: "1rem" }}>
                            Turnos de agenda (bloques horarios)
                          </h3>
                          <div className="table-wrap">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Fecha</th>
                                  <th>Inicio</th>
                                  <th>Fin</th>
                                  <th>Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {emp.turnos_agenda.map((t) => (
                                  <tr key={t.id}>
                                    <td className="mono small">{t.fecha}</td>
                                    <td>{t.hora_inicio}</td>
                                    <td>{t.hora_fin}</td>
                                    <td>{t.estado}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="muted">Sin datos.</p>
          )}
        </section>
      ) : null}

      {tab === "roles" ? (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Roles y permisos</h2>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
              <button type="button" className="btn ghost small" onClick={() => void load()}>
                Actualizar
              </button>
              <button type="button" className="btn primary small" onClick={openRolDrawerNuevo}>
                <Plus size={18} weight="bold" aria-hidden style={{ verticalAlign: "middle", marginRight: 4 }} />
                Nuevo rol
              </button>
            </div>
          </div>
          <p className="hint">
            Los permisos controlan qué módulos ve cada usuario. Solo quien tiene acceso total (<code>*</code>)
            puede abrir Configuración y Equipo.
          </p>
          <table className="table table-wrap">
            <thead>
              <tr>
                <th>Rol</th>
                <th>Permisos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.slug}>
                  <td>
                    <span className="mono">{r.slug}</span>
                    <div className="muted small">{r.nombre}</div>
                  </td>
                  <td className="small">
                    {r.permisos.includes("*") ? <strong>*</strong> : r.permisos.join(", ")}
                  </td>
                  <td className="row-actions">
                    <button type="button" className="link" onClick={() => openRolDrawerEditar(r)}>
                      Editar
                    </button>
                    {r.slug !== "admin" ? (
                      <button type="button" className="link" onClick={() => void borrarRol(r.slug)}>
                        Eliminar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <Drawer
        open={rolDrawerOpen}
        onClose={cerrarRolDrawer}
        title={rolForm.editingSlug ? "Editar rol" : "Nuevo rol"}
        wide
      >
        <form className="form drawer-form" onSubmit={onSubmitRolDrawer}>
          <p className="muted small" style={{ marginTop: 0 }}>
            {rolForm.editingSlug
              ? "Modificá el nombre visible y los permisos. El slug no se puede cambiar."
              : "Definí un identificador único (slug), el nombre que verán los usuarios y los módulos permitidos."}
          </p>
          <label className="field">
            <span>Slug *</span>
            <input
              value={rolForm.slug}
              onChange={(e) => setRolForm((x) => ({ ...x, slug: e.target.value }))}
              placeholder="recepcion"
              autoComplete="off"
              disabled={rolForm.editingSlug != null}
              required={rolForm.editingSlug == null}
            />
            {rolForm.editingSlug ? (
              <span className="muted small">No se puede modificar el identificador del rol.</span>
            ) : (
              <span className="muted small">Solo letras minúsculas, números y guiones. Se usa en el sistema.</span>
            )}
          </label>
          <label className="field">
            <span>Nombre visible *</span>
            <input
              value={rolForm.nombre}
              onChange={(e) => setRolForm((x) => ({ ...x, nombre: e.target.value }))}
              placeholder="Recepción"
              required
              autoComplete="off"
            />
          </label>
          {rolForm.editingSlug === "admin" ? (
            <p className="muted small" style={{ margin: "0.25rem 0 0.75rem" }}>
              El rol administrador siempre tiene acceso total (<code>*</code>). Solo podés cambiar el nombre
              visible.
            </p>
          ) : (
            <>
              <label className="field inline-check">
                <input
                  type="checkbox"
                  checked={rolForm.todo}
                  onChange={(e) => setRolForm((x) => ({ ...x, todo: e.target.checked }))}
                />
                <span>Acceso total (*)</span>
              </label>
              {!rolForm.todo ? (
                <fieldset className="rol-perm-fieldset" style={{ border: "none", padding: 0, margin: 0 }}>
                  <legend className="field-label-strong" style={{ marginBottom: "0.35rem" }}>
                    Módulos permitidos
                  </legend>
                  <div
                    className="perm-grid rol-perm-grid"
                    style={{ display: "grid", gap: "0.35rem", marginBottom: "0.75rem" }}
                  >
                    {PERMISO_MODULOS.map((m) => (
                      <label key={m} className="field inline-check">
                        <input
                          type="checkbox"
                          checked={!!rolForm.mods[m]}
                          onChange={(e) =>
                            setRolForm((x) => ({
                              ...x,
                              mods: { ...x.mods, [m]: e.target.checked },
                            }))
                          }
                        />
                        <span>{NAV_LABEL[m]}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </>
          )}
          <div className="drawer-actions">
            <button type="button" className="btn ghost" disabled={rolSaving} onClick={cerrarRolDrawer}>
              Cancelar
            </button>
            <button type="submit" className="btn primary btn-lg" disabled={rolSaving}>
              {rolSaving ? "Guardando…" : rolForm.editingSlug ? "Guardar cambios" : "Crear rol"}
            </button>
          </div>
        </form>
      </Drawer>

      {tab === "nuevo" ? (
        <section className="card">
          <p className="muted">Se abrió el panel lateral para dar de alta un empleado con login propio.</p>
          <button type="button" className="btn secondary" onClick={openNew}>
            Abrir formulario otra vez
          </button>
        </section>
      ) : null}

      <Drawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          if (tabParam === "nuevo") navigate("/empleados/lista");
        }}
        title={editing ? "Editar empleado" : "Nuevo empleado"}
        wide
      >
        <form className="form drawer-form" onSubmit={onSubmitDrawer}>
          {!editing ? (
            <label className="field">
              <span>Email *</span>
              <input
                type="email"
                required
                autoComplete="off"
                value={form.email}
                onChange={(e) => setForm((x) => ({ ...x, email: e.target.value }))}
              />
            </label>
          ) : null}
          <label className="field">
            <span>{editing ? "Nueva contraseña (opcional)" : "Contraseña *"}</span>
            <input
              type="password"
              required={!editing}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((x) => ({ ...x, password: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Nombre</span>
            <input
              value={form.nombre}
              onChange={(e) => setForm((x) => ({ ...x, nombre: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Rol *</span>
            <select
              required
              value={form.rol}
              onChange={(e) => setForm((x) => ({ ...x, rol: e.target.value }))}
            >
              {roles.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.nombre} ({r.slug})
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Tipo de comisión</span>
              <select
                value={form.tipo_comision}
                onChange={(e) =>
                  setForm((x) => ({
                    ...x,
                    tipo_comision: e.target.value as "porcentaje" | "fijo",
                  }))
                }
              >
                <option value="porcentaje">Porcentaje sobre venta</option>
                <option value="fijo">Monto fijo por venta</option>
              </select>
            </label>
            <label className="field">
              <span>{form.tipo_comision === "fijo" ? "Monto fijo" : "Porcentaje (%)"}</span>
              <input
                inputMode="decimal"
                value={form.valor_comision}
                onChange={(e) => setForm((x) => ({ ...x, valor_comision: e.target.value }))}
              />
            </label>
          </div>
          <label className="field">
            <span>Teléfono</span>
            <input
              value={form.telefono}
              onChange={(e) => setForm((x) => ({ ...x, telefono: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Color en agenda</span>
            <input
              type="color"
              value={form.color_agenda}
              onChange={(e) => setForm((x) => ({ ...x, color_agenda: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>Foto (archivo)</span>
            <input type="file" accept="image/*" onChange={onFotoFile} />
          </label>
          {form.foto_url ? (
            <p className="muted small">
              Foto cargada ({form.foto_url.length > 80 ? "data:image…" : form.foto_url})
            </p>
          ) : null}
          {editing ? (
            <div className="field empleado-edit-activo-row">
              <div className="empleado-edit-activo-row__text">
                <span className="empleado-edit-activo-row__title">Empleado activo</span>
                <span className="muted small">
                  Si lo desactivás, no podrá iniciar sesión ni aparecerá en la agenda.
                </span>
              </div>
              <label
                className="ui-switch"
                title={form.activo ? "Empleado activo" : "Empleado inactivo"}
              >
                <input
                  type="checkbox"
                  className="ui-switch__input"
                  checked={form.activo}
                  onChange={(e) => setForm((x) => ({ ...x, activo: e.target.checked }))}
                  aria-label="Empleado activo en el sistema"
                />
                <span className="ui-switch__track" aria-hidden />
              </label>
            </div>
          ) : null}
          {!editing ? (
            <fieldset className="card" style={{ padding: "0.75rem", marginTop: "0.5rem", border: "1px solid var(--border)" }}>
              <legend className="muted small" style={{ padding: "0 0.35rem" }}>
                Horario en Turnos
              </legend>
              <label className="field inline-check" style={{ marginBottom: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={form.registrar_turnos_plantilla}
                  onChange={(e) =>
                    setForm((x) => ({ ...x, registrar_turnos_plantilla: e.target.checked }))
                  }
                />
                <span>Cargar turnos al guardar (mismo horario en los días elegidos)</span>
              </label>
              {form.registrar_turnos_plantilla ? (
                <>
                  <div className="field-row">
                    <label className="field">
                      <span>Desde</span>
                      <input
                        type="date"
                        value={form.turno_fecha_desde}
                        onChange={(e) => setForm((x) => ({ ...x, turno_fecha_desde: e.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Hasta</span>
                      <input
                        type="date"
                        value={form.turno_fecha_hasta}
                        onChange={(e) => setForm((x) => ({ ...x, turno_fecha_hasta: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="field-row">
                    <label className="field">
                      <span>Hora inicio</span>
                      <input
                        type="time"
                        value={form.turno_hora_inicio}
                        onChange={(e) => setForm((x) => ({ ...x, turno_hora_inicio: e.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Hora fin</span>
                      <input
                        type="time"
                        value={form.turno_hora_fin}
                        onChange={(e) => setForm((x) => ({ ...x, turno_hora_fin: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="field" style={{ marginBottom: "0.35rem" }}>
                    <span className="block" style={{ marginBottom: "0.25rem" }}>
                      Días
                    </span>
                    <div className="perm-grid" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {TURNO_DIAS_SEMANA_OPTS.map(({ v, lab }) => (
                        <label key={v} className="field inline-check">
                          <input
                            type="checkbox"
                            checked={form.turno_dias_semana.includes(v)}
                            onChange={() =>
                              setForm((x) => ({
                                ...x,
                                turno_dias_semana: x.turno_dias_semana.includes(v)
                                  ? x.turno_dias_semana.filter((d) => d !== v)
                                  : [...x.turno_dias_semana, v].sort((a, b) => a - b),
                              }))
                            }
                          />
                          <span>{lab}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <p className="muted small" style={{ margin: 0 }}>
                    Máximo 120 días de rango. Se crea un turno por cada fecha que coincida con los días marcados.
                  </p>
                </>
              ) : null}
            </fieldset>
          ) : null}
          <div className="drawer-actions">
            <button type="submit" className="btn primary btn-lg">
              Guardar
            </button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
