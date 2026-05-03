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
  fetchAuditoria,
  fetchEmpleadoResumen,
  fetchEmpleadosComisiones,
  fetchEmpleadosMovimientos,
  fetchEmpleadosTurnos,
  fetchRoles,
  fetchUsuarios,
  updateEmpleadoMovimientoEstado,
  updateRole,
  updateUsuario,
  type AuditoriaRow,
  type ComisionRow,
  type EmpleadoMovimiento,
  type EmpleadoResumen,
  type RolDefinicion,
  type TurnoEmpleado,
  type UsuarioListado,
} from "../api";
import { Drawer } from "../components/Drawer";
import { SubNav } from "../components/SubNav";
import { EMPLEADOS_TABS, readEmpleadosTab, type EmpleadosTab } from "../lib/moduleRoutes";
import { NAV_LABEL, PERMISO_MODULOS, type PermisoModulo } from "../nav";
import { useToast } from "../context/ToastContext";

type Props = { onChanged?: () => void };

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isoMonthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(n);
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
  });

  const [filtDesde, setFiltDesde] = useState(isoMonthStart);
  const [filtHasta, setFiltHasta] = useState(isoToday);
  const [filtUsuario, setFiltUsuario] = useState<number | "">("");

  const [auditoriaRows, setAuditoriaRows] = useState<AuditoriaRow[]>([]);
  const [turnosRows, setTurnosRows] = useState<TurnoEmpleado[]>([]);
  const [comisionesRows, setComisionesRows] = useState<ComisionRow[]>([]);
  const [movimientosRows, setMovimientosRows] = useState<EmpleadoMovimiento[]>([]);
  const [resumenEmp, setResumenEmp] = useState<EmpleadoResumen | null>(null);

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

  const [newRol, setNewRol] = useState({
    slug: "",
    nombre: "",
    todo: false,
    mods: {} as Record<PermisoModulo, boolean>,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u] = await Promise.all([fetchRoles(), fetchUsuarios()]);
      setRoles(r);
      setUsuarios(u);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
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
        });
        toast("Empleado actualizado.", "success");
      } else {
        await createUsuario({
          email: form.email.trim(),
          password: form.password,
          nombre: form.nombre.trim() || undefined,
          rol: form.rol,
          telefono: form.telefono.trim() || null,
          color_agenda: form.color_agenda.trim() || null,
          foto_url: form.foto_url.trim() || null,
          tipo_comision: form.tipo_comision,
          valor_comision: Number.isFinite(vc) ? vc : 0,
        });
        toast("Empleado creado.", "success");
      }
      setDrawerOpen(false);
      void load();
      onChanged?.();
      navigate(`/empleados/lista`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  async function toggleActivo(u: UsuarioListado) {
    try {
      await updateUsuario(u.id, { activo: u.activo === 1 ? false : true });
      toast(u.activo === 1 ? "Usuario desactivado." : "Usuario activado.", "info");
      void load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
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

  async function editarRolSimple(r: RolDefinicion) {
    const nombre = window.prompt("Nombre visible del rol", r.nombre);
    if (nombre === null || !nombre.trim()) return;
    const usarTodo = confirm(
      "¿Acceso total (*) como administrador?\n\nCancelá para elegir módulos por número."
    );
    let permisos: string[];
    if (usarTodo) {
      permisos = ["*"];
    } else {
      const lines = PERMISO_MODULOS.map((m, i) => `${i + 1}. ${NAV_LABEL[m]} (${m})`).join("\n");
      const sel = window.prompt(`Módulos (números separados por coma):\n\n${lines}`);
      if (sel === null) return;
      const nums = sel.split(/[,;\s]+/).map((x) => Number(x.trim()));
      permisos = [];
      for (const n of nums) {
        if (Number.isFinite(n) && n >= 1 && n <= PERMISO_MODULOS.length) {
          permisos.push(PERMISO_MODULOS[n - 1]!);
        }
      }
      if (permisos.length === 0) {
        toast("Seleccioná al menos un módulo.", "warning");
        return;
      }
      permisos = [...new Set(permisos)];
    }
    try {
      await updateRole(r.slug, {
        nombre: nombre.trim(),
        permisos: r.slug === "admin" ? ["*"] : permisos,
      });
      toast("Rol actualizado.", "success");
      void load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  async function crearRolSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const slug = newRol.slug.trim().toLowerCase();
    const nombre = newRol.nombre.trim();
    if (!slug || !nombre) {
      toast("Slug y nombre requeridos.", "warning");
      return;
    }
    let permisos: string[];
    if (newRol.todo) {
      permisos = ["*"];
    } else {
      permisos = PERMISO_MODULOS.filter((m) => newRol.mods[m]);
      if (permisos.length === 0) {
        toast("Marcá al menos un módulo.", "warning");
        return;
      }
    }
    try {
      await createRole({ slug, nombre, permisos });
      toast("Rol creado.", "success");
      setNewRol({ slug: "", nombre: "", todo: false, mods: {} as Record<PermisoModulo, boolean> });
      void load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
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

  const loadComisiones = useCallback(async () => {
    try {
      const uid = filtUsuario === "" ? undefined : filtUsuario;
      const rows = await fetchEmpleadosComisiones({
        desde: filtDesde,
        hasta: filtHasta,
        usuario_id: uid,
      });
      setComisionesRows(rows);
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

  const loadAuditoriaTab = useCallback(async () => {
    try {
      const rows = await fetchAuditoria(200);
      setAuditoriaRows(rows);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    }
  }, [toast]);

  useEffect(() => {
    if (tabParam !== "turnos") return;
    void loadTurnos();
  }, [tabParam, loadTurnos]);

  useEffect(() => {
    if (tabParam !== "comisiones") return;
    void loadComisiones();
  }, [tabParam, loadComisiones]);

  useEffect(() => {
    if (tabParam !== "movimientos") return;
    void loadMovimientosTab();
  }, [tabParam, loadMovimientosTab]);

  useEffect(() => {
    if (tabParam !== "auditoria") return;
    void loadAuditoriaTab();
  }, [tabParam, loadAuditoriaTab]);

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
          { id: "comisiones", label: "Comisiones", to: "/empleados/comisiones" },
          { id: "movimientos", label: "Movimientos", to: "/empleados/movimientos" },
          { id: "auditoria", label: "Auditoría", to: "/empleados/auditoria" },
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
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th />
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Rol</th>
                    <th>Comisión</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id}>
                      <td>
                        {u.foto_url ? (
                          <img src={u.foto_url} alt="" className="empleado-avatar" width={40} height={40} />
                        ) : (
                          <span className="empleado-avatar empleado-avatar--ph">
                            {(u.nombre || u.email).slice(0, 1).toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td>{u.nombre || "—"}</td>
                      <td className="mono small">{u.email}</td>
                      <td>
                        <span className="mono">{u.rol}</span>
                      </td>
                      <td className="small">
                        {u.tipo_comision === "fijo"
                          ? `Fijo ${formatMoney(Number(u.valor_comision ?? 0))}`
                          : `${Number(u.valor_comision ?? 0)} %`}
                      </td>
                      <td>{u.activo === 1 ? <span className="badge-ok">Activo</span> : <span className="muted">Inactivo</span>}</td>
                      <td className="row-actions">
                        <button type="button" className="link" onClick={() => openEdit(u)}>
                          Editar
                        </button>
                        <button type="button" className="link" onClick={() => void toggleActivo(u)}>
                          {u.activo === 1 ? "Desactivar" : "Activar"}
                        </button>
                        <button type="button" className="link danger" onClick={() => void onDelete(u)}>
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
      ) : null}

      {tab === "turnos" ? (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Turnos</h2>
            <button type="button" className="btn ghost small" onClick={() => void loadTurnos()}>
              Actualizar
            </button>
          </div>
          <p className="hint">
            Horarios laborales por empleado. No se permiten solapes el mismo día. Usá HH:MM (ej. 09:00).
          </p>
          <div className="field-row" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
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
          </div>
          <form
            className="form"
            style={{ marginBottom: "1.25rem", padding: "1rem", background: "var(--panel)" }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (turnoForm.empleado_id === "") {
                toast("Elegí empleado.", "warning");
                return;
              }
              try {
                await createTurnoEmpleado({
                  empleado_id: Number(turnoForm.empleado_id),
                  fecha: turnoForm.fecha,
                  hora_inicio: turnoForm.hora_inicio,
                  hora_fin: turnoForm.hora_fin,
                  estado: turnoForm.estado,
                });
                toast("Turno creado.", "success");
                void loadTurnos();
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
                <span>Inicio</span>
                <input
                  value={turnoForm.hora_inicio}
                  onChange={(e) => setTurnoForm((x) => ({ ...x, hora_inicio: e.target.value }))}
                  placeholder="09:00"
                />
              </label>
              <label className="field">
                <span>Fin</span>
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
            </div>
            <button type="submit" className="btn primary">
              Agregar turno
            </button>
          </form>
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
      ) : null}

      {tab === "comisiones" ? (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Comisiones por venta</h2>
            <button type="button" className="btn ghost small" onClick={() => void loadComisiones()}>
              Actualizar
            </button>
          </div>
          <div className="field-row" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
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
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Empleado</th>
                  <th>Venta</th>
                  <th>Monto comisión</th>
                </tr>
              </thead>
              <tbody>
                {comisionesRows.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.fecha}</td>
                    <td>{c.empleado_nombre ?? "—"}</td>
                    <td className="mono">#{c.venta_id}</td>
                    <td>{formatMoney(c.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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

      {tab === "auditoria" ? (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Auditoría</h2>
            <button type="button" className="btn ghost small" onClick={() => void loadAuditoriaTab()}>
              Actualizar
            </button>
          </div>
          <p className="hint">
            Acciones registradas: ventas, citas, productos y más. Las cancelaciones quedan trazadas con motivo.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {auditoriaRows.map((a) => (
                  <tr key={a.id}>
                    <td className="mono small">{a.created_at.slice(0, 19).replace("T", " ")}</td>
                    <td className="small">{a.usuario_email ?? "—"}</td>
                    <td>
                      <span className="mono">{a.accion}</span>
                    </td>
                    <td className="small">
                      {a.entidad} #{a.entidad_id ?? "—"}
                    </td>
                    <td className="small" style={{ maxWidth: "280px", wordBreak: "break-word" }}>
                      {a.detalle_json ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "roles" ? (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Roles y permisos</h2>
            <button type="button" className="btn ghost small" onClick={() => void load()}>
              Actualizar
            </button>
          </div>
          <p className="hint">
            Los permisos controlan qué módulos ve cada usuario. Solo quien tiene acceso total (<code>*</code>)
            puede abrir Configuración y Equipo.
          </p>
          <table className="table table-wrap" style={{ marginBottom: "1rem" }}>
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
                    <button type="button" className="link" onClick={() => void editarRolSimple(r)}>
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
          <h3 className="card-title" style={{ fontSize: "1rem" }}>
            Nuevo rol
          </h3>
          <form className="form" onSubmit={crearRolSubmit}>
            <div className="field-row">
              <label className="field">
                <span>Slug</span>
                <input
                  value={newRol.slug}
                  onChange={(e) => setNewRol((x) => ({ ...x, slug: e.target.value }))}
                  placeholder="recepcion"
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>Nombre</span>
                <input
                  value={newRol.nombre}
                  onChange={(e) => setNewRol((x) => ({ ...x, nombre: e.target.value }))}
                />
              </label>
            </div>
            <label className="field inline-check">
              <input
                type="checkbox"
                checked={newRol.todo}
                onChange={(e) => setNewRol((x) => ({ ...x, todo: e.target.checked }))}
              />
              <span>Acceso total (*)</span>
            </label>
            {!newRol.todo ? (
              <div className="perm-grid" style={{ display: "grid", gap: "0.35rem", marginBottom: "0.75rem" }}>
                {PERMISO_MODULOS.map((m) => (
                  <label key={m} className="field inline-check">
                    <input
                      type="checkbox"
                      checked={!!newRol.mods[m]}
                      onChange={(e) =>
                        setNewRol((x) => ({
                          ...x,
                          mods: { ...x.mods, [m]: e.target.checked },
                        }))
                      }
                    />
                    <span>{NAV_LABEL[m]}</span>
                  </label>
                ))}
              </div>
            ) : null}
            <button type="submit" className="btn primary">
              Crear rol
            </button>
          </form>
        </section>
      ) : null}

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
