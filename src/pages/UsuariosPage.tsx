import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createRole,
  createUsuario,
  deleteRole,
  deleteUsuario,
  fetchRoles,
  fetchUsuarios,
  updateRole,
  updateUsuario,
  type RolDefinicion,
  type UsuarioListado,
} from "../api";
import { NAV_LABEL, PERMISO_MODULOS, type PermisoModulo } from "../nav";
import { useToast } from "../context/ToastContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PromptDialog } from "../components/PromptDialog";

type Props = { onChanged?: () => void };

type RolEditUi =
  | { kind: "idle" }
  | { kind: "nombre"; rol: RolDefinicion }
  | { kind: "star"; rol: RolDefinicion; nombre: string }
  | { kind: "modulos"; rol: RolDefinicion; nombre: string };

export function UsuariosPage({ onChanged }: Props) {
  const toast = useToast();
  const [roles, setRoles] = useState<RolDefinicion[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([]);
  const [loading, setLoading] = useState(true);

  const [newUsuario, setNewUsuario] = useState({
    email: "",
    password: "",
    nombre: "",
    rol: "empleado",
  });
  const [newRol, setNewRol] = useState({
    slug: "",
    nombre: "",
    todo: false,
    mods: {} as Record<PermisoModulo, boolean>,
  });

  const [rolEditUi, setRolEditUi] = useState<RolEditUi>({ kind: "idle" });
  const [confirmDeleteRolSlug, setConfirmDeleteRolSlug] = useState<string | null>(null);
  const [confirmDeleteUsuario, setConfirmDeleteUsuario] = useState<UsuarioListado | null>(null);
  const [adminDialogBusy, setAdminDialogBusy] = useState(false);

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

  const listaModulosPrompt = useMemo((): ReactNode => {
    return (
      <div>
        <p style={{ marginTop: 0 }}>Escribí los números separados por coma de los módulos a habilitar (ej. 1,2,3).</p>
        <ol style={{ margin: "0.35rem 0 0 1.1rem", padding: 0 }}>
          {PERMISO_MODULOS.map((m, i) => (
            <li key={m}>
              {i + 1}. {NAV_LABEL[m]} ({m})
            </li>
          ))}
        </ol>
      </div>
    );
  }, []);

  async function aplicarRolPermisos(rol: RolDefinicion, nombre: string, permisos: string[]) {
    setAdminDialogBusy(true);
    try {
      await updateRole(rol.slug, {
        nombre: nombre.trim(),
        permisos: rol.slug === "admin" ? ["*"] : permisos,
      });
      toast("Rol actualizado.", "success");
      setRolEditUi({ kind: "idle" });
      void load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setAdminDialogBusy(false);
    }
  }

  function startEditarRol(r: RolDefinicion) {
    setRolEditUi({ kind: "nombre", rol: r });
  }

  function parseModulosSeleccion(sel: string): { ok: true; permisos: string[] } | { ok: false; error: string } {
    const nums = sel.split(/[,;\s]+/).map((x) => Number(x.trim()));
    const permisos: string[] = [];
    for (const n of nums) {
      if (Number.isFinite(n) && n >= 1 && n <= PERMISO_MODULOS.length) {
        permisos.push(PERMISO_MODULOS[n - 1]!);
      }
    }
    const uniq = [...new Set(permisos)];
    if (uniq.length === 0) {
      return { ok: false, error: "Seleccioná al menos un módulo válido (números de la lista)." };
    }
    return { ok: true, permisos: uniq };
  }

  async function crearRolSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        toast("Marcá al menos un módulo o «Acceso total».", "warning");
        return;
      }
    }
    try {
      await createRole({ slug, nombre, permisos });
      toast("Rol creado.", "success");
      setNewRol({
        slug: "",
        nombre: "",
        todo: false,
        mods: {} as Record<PermisoModulo, boolean>,
      });
      void load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  async function crearUsuarioSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createUsuario({
        email: newUsuario.email.trim(),
        password: newUsuario.password,
        nombre: newUsuario.nombre.trim() || undefined,
        rol: newUsuario.rol,
      });
      toast("Usuario creado.", "success");
      setNewUsuario({ email: "", password: "", nombre: "", rol: newUsuario.rol });
      void load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  function requestBorrarRol(slug: string) {
    setConfirmDeleteRolSlug(slug);
  }

  async function confirmBorrarRolAction() {
    const slug = confirmDeleteRolSlug;
    if (!slug) return;
    setAdminDialogBusy(true);
    try {
      await deleteRole(slug);
      setConfirmDeleteRolSlug(null);
      toast("Rol eliminado.", "success");
      void load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setAdminDialogBusy(false);
    }
  }

  function borrarRol(slug: string) {
    requestBorrarRol(slug);
  }

  async function cambiarRolUsuario(u: UsuarioListado, rol: string) {
    try {
      await updateUsuario(u.id, { rol });
      toast("Rol de usuario actualizado.", "success");
      void load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  function requestBorrarUsuario(u: UsuarioListado) {
    setConfirmDeleteUsuario(u);
  }

  async function confirmBorrarUsuarioAction() {
    const u = confirmDeleteUsuario;
    if (!u) return;
    setAdminDialogBusy(true);
    try {
      await deleteUsuario(u.id);
      setConfirmDeleteUsuario(null);
      toast("Usuario eliminado.", "success");
      void load();
      onChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setAdminDialogBusy(false);
    }
  }

  function borrarUsuario(u: UsuarioListado) {
    requestBorrarUsuario(u);
  }

  if (loading && roles.length === 0) {
    return <p className="muted">Cargando administración…</p>;
  }

  return (
    <>
      <section className="card" style={{ marginBottom: "1rem" }}>
        <div className="card-head">
          <h2 className="card-title">Roles</h2>
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
        <p className="hint">
          Cada rol define qué secciones puede ver un usuario. «Acceso total» (<code>*</code>) es solo
          para administración completa (usuarios, SMTP, auditoría, etc.). El rol{" "}
          <strong>admin</strong> siempre conserva acceso total.
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
                  {r.permisos.includes("*") ? (
                    <strong>*</strong>
                  ) : (
                    r.permisos.join(", ")
                  )}
                </td>
                <td className="row-actions">
                  <button type="button" className="link" onClick={() => startEditarRol(r)}>
                    Editar
                  </button>
                  {r.slug !== "admin" ? (
                    <button type="button" className="link" onClick={() => borrarRol(r.slug)}>
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
              <span>Slug (id)</span>
              <input
                value={newRol.slug}
                onChange={(e) => setNewRol((x) => ({ ...x, slug: e.target.value }))}
                placeholder="recepcion"
                autoComplete="off"
              />
            </label>
            <label className="field">
              <span>Nombre visible</span>
              <input
                value={newRol.nombre}
                onChange={(e) => setNewRol((x) => ({ ...x, nombre: e.target.value }))}
                placeholder="Recepción"
              />
            </label>
          </div>
          <label className="field inline-check">
            <input
              type="checkbox"
              checked={newRol.todo}
              onChange={(e) => setNewRol((x) => ({ ...x, todo: e.target.checked }))}
            />
            <span>Acceso total (administrador del sistema)</span>
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

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Usuarios</h2>
        </div>
        <form className="form" onSubmit={crearUsuarioSubmit} style={{ marginBottom: "1.25rem" }}>
          <div className="field-row">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                required
                value={newUsuario.email}
                onChange={(e) => setNewUsuario((x) => ({ ...x, email: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <input
                type="password"
                required
                minLength={6}
                value={newUsuario.password}
                onChange={(e) => setNewUsuario((x) => ({ ...x, password: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Nombre (opcional)</span>
              <input
                value={newUsuario.nombre}
                onChange={(e) => setNewUsuario((x) => ({ ...x, nombre: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Rol</span>
              <select
                value={newUsuario.rol}
                onChange={(e) => setNewUsuario((x) => ({ ...x, rol: e.target.value }))}
              >
                {roles.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.nombre} ({r.slug})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className="btn primary">
            Crear usuario
          </button>
        </form>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.nombre ?? "—"}</td>
                  <td>
                    <select
                      value={u.rol}
                      onChange={(e) => void cambiarRolUsuario(u, e.target.value)}
                      aria-label={`Rol de ${u.email}`}
                    >
                      {roles.map((r) => (
                        <option key={r.slug} value={r.slug}>
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button type="button" className="link" onClick={() => borrarUsuario(u)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PromptDialog
        open={rolEditUi.kind === "nombre"}
        title="Nombre visible del rol"
        description="Este nombre se muestra en listas y selectores."
        inputLabel="Nombre"
        defaultValue={rolEditUi.kind === "nombre" ? rolEditUi.rol.nombre : ""}
        confirmLabel="Continuar"
        cancelLabel="Cancelar"
        busy={adminDialogBusy}
        validate={(t) => (!t.trim() ? "El nombre no puede quedar vacío." : null)}
        onCancel={() => !adminDialogBusy && setRolEditUi({ kind: "idle" })}
        onConfirm={(t) => {
          setRolEditUi((cur) => (cur.kind === "nombre" ? { kind: "star", rol: cur.rol, nombre: t.trim() } : cur));
        }}
      />

      <ConfirmDialog
        open={rolEditUi.kind === "star"}
        title="Permisos del rol"
        description={
          <>
            ¿Asignar acceso total (<code>*</code>) como administrador de sistema?
            <br />
            <span className="muted">Si no, podés elegir módulos por número en el siguiente paso.</span>
          </>
        }
        confirmLabel="Sí, acceso total (*)"
        cancelLabel="No, elegir módulos…"
        busy={adminDialogBusy}
        onCancel={() => {
          if (adminDialogBusy) return;
          setRolEditUi((cur) =>
            cur.kind === "star" ? { kind: "modulos", rol: cur.rol, nombre: cur.nombre } : cur
          );
        }}
        onConfirm={() => {
          if (rolEditUi.kind !== "star") return;
          void aplicarRolPermisos(rolEditUi.rol, rolEditUi.nombre, ["*"]);
        }}
      />

      <PromptDialog
        open={rolEditUi.kind === "modulos"}
        title="Módulos habilitados"
        description={listaModulosPrompt}
        inputLabel="Números (ej. 1,2,3)"
        defaultValue=""
        placeholder="1,2,3"
        confirmLabel="Guardar rol"
        cancelLabel="Cancelar"
        busy={adminDialogBusy}
        validate={(t) => {
          const parsed = parseModulosSeleccion(t);
          return parsed.ok ? null : parsed.error;
        }}
        onCancel={() => !adminDialogBusy && setRolEditUi({ kind: "idle" })}
        onConfirm={(t) => {
          if (rolEditUi.kind !== "modulos") return;
          const parsed = parseModulosSeleccion(t);
          if (!parsed.ok) return;
          void aplicarRolPermisos(rolEditUi.rol, rolEditUi.nombre, parsed.permisos);
        }}
      />

      <ConfirmDialog
        open={confirmDeleteRolSlug != null}
        title="Eliminar rol"
        description={
          confirmDeleteRolSlug ? (
            <>
              ¿Eliminar el rol <strong>«{confirmDeleteRolSlug}»</strong>? Los usuarios con ese rol deberán
              reasignarse.
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        busy={adminDialogBusy}
        onCancel={() => !adminDialogBusy && setConfirmDeleteRolSlug(null)}
        onConfirm={() => void confirmBorrarRolAction()}
      />

      <ConfirmDialog
        open={confirmDeleteUsuario != null}
        title="Eliminar usuario"
        description={
          confirmDeleteUsuario ? (
            <>
              ¿Eliminar a <strong>{confirmDeleteUsuario.email}</strong>? Esta acción no se puede deshacer.
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        busy={adminDialogBusy}
        onCancel={() => !adminDialogBusy && setConfirmDeleteUsuario(null)}
        onConfirm={() => void confirmBorrarUsuarioAction()}
      />
    </>
  );
}
