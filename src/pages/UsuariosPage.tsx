import { useCallback, useEffect, useState } from "react";
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

type Props = { onChanged?: () => void };

export function UsuariosPage({ onChanged }: Props) {
  const toast = useToast();
  const [roles, setRoles] = useState<RolDefinicion[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioListado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [r, u] = await Promise.all([fetchRoles(), fetchUsuarios()]);
      setRoles(r);
      setUsuarios(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function editarRolSimple(r: RolDefinicion) {
    const nombre = window.prompt("Nombre visible del rol", r.nombre);
    if (nombre === null || !nombre.trim()) return;
    const usarTodo = confirm(
      "¿Acceso total (*) como administrador de sistema?\n\nCancelá para definir módulos en la siguiente pantalla."
    );
    let permisos: string[];
    if (usarTodo) {
      permisos = ["*"];
    } else {
      const lines = PERMISO_MODULOS.map(
        (m, i) => `${i + 1}. ${NAV_LABEL[m]} (${m})`
      ).join("\n");
      const sel = window.prompt(
        `Escribí los números separados por coma de los módulos a habilitar:\n\n${lines}\n\nEj: 1,2,3`
      );
      if (sel === null) return;
      const nums = sel.split(/[,;\s]+/).map((x) => Number(x.trim()));
      permisos = [];
      for (const n of nums) {
        if (Number.isFinite(n) && n >= 1 && n <= PERMISO_MODULOS.length) {
          permisos.push(PERMISO_MODULOS[n - 1]!);
        }
      }
      const uniq = [...new Set(permisos)];
      if (uniq.length === 0) {
        toast.push("Seleccioná al menos un módulo.", "warning");
        return;
      }
      permisos = uniq;
    }
    try {
      await updateRole(r.slug, {
        nombre: nombre.trim(),
        permisos: r.slug === "admin" ? ["*"] : permisos,
      });
      toast.push("Rol actualizado.", "success");
      void load();
      onChanged?.();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Error", "error");
    }
  }

  async function crearRolSubmit(e: React.FormEvent) {
    e.preventDefault();
    const slug = newRol.slug.trim().toLowerCase();
    const nombre = newRol.nombre.trim();
    if (!slug || !nombre) {
      toast.push("Slug y nombre requeridos.", "warning");
      return;
    }
    let permisos: string[];
    if (newRol.todo) {
      permisos = ["*"];
    } else {
      permisos = PERMISO_MODULOS.filter((m) => newRol.mods[m]);
      if (permisos.length === 0) {
        toast.push("Marcá al menos un módulo o «Acceso total».", "warning");
        return;
      }
    }
    try {
      await createRole({ slug, nombre, permisos });
      toast.push("Rol creado.", "success");
      setNewRol({
        slug: "",
        nombre: "",
        todo: false,
        mods: {} as Record<PermisoModulo, boolean>,
      });
      void load();
      onChanged?.();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Error", "error");
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
      toast.push("Usuario creado.", "success");
      setNewUsuario({ email: "", password: "", nombre: "", rol: newUsuario.rol });
      void load();
      onChanged?.();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Error", "error");
    }
  }

  async function borrarRol(slug: string) {
    if (!window.confirm(`¿Eliminar el rol «${slug}»?`)) return;
    try {
      await deleteRole(slug);
      toast.push("Rol eliminado.", "success");
      void load();
      onChanged?.();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Error", "error");
    }
  }

  async function cambiarRolUsuario(u: UsuarioListado, rol: string) {
    try {
      await updateUsuario(u.id, { rol });
      toast.push("Rol de usuario actualizado.", "success");
      void load();
      onChanged?.();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Error", "error");
    }
  }

  async function borrarUsuario(u: UsuarioListado) {
    if (!window.confirm(`¿Eliminar usuario ${u.email}?`)) return;
    try {
      await deleteUsuario(u.id);
      toast.push("Usuario eliminado.", "success");
      void load();
      onChanged?.();
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Error", "error");
    }
  }

  if (loading && roles.length === 0) {
    return <p className="muted">Cargando administración…</p>;
  }

  return (
    <>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

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
                    <button type="button" className="link" onClick={() => void borrarUsuario(u)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
