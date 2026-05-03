import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createProveedor,
  deleteProveedor,
  fetchProveedores,
  patchProveedorEstado,
  updateProveedor,
  type Proveedor,
} from "../api";
import { useToast } from "../context/ToastContext";

function fmtFecha(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type EstadoFiltro = "todos" | "activo" | "inactivo";

function matchesSearch(p: Proveedor, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  if (p.nombre.toLowerCase().includes(s)) return true;
  if (p.estado.toLowerCase().includes(s)) return true;
  return false;
}

function matchesEstadoFiltro(p: Proveedor, filtro: EstadoFiltro): boolean {
  if (filtro === "todos") return true;
  return p.estado === filtro;
}

export function ProveedoresPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoFiltro>("todos");

  const [deleteTarget, setDeleteTarget] = useState<Proveedor | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [estadoSavingId, setEstadoSavingId] = useState<number | null>(null);

  const [nombre, setNombre] = useState("");
  const [nit, setNit] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [direccion, setDireccion] = useState("");
  const [estado, setEstado] = useState<"activo" | "inactivo">("activo");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchProveedores({ incluirInactivos: true }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar proveedores", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    return rows.filter((p) => matchesEstadoFiltro(p, estadoFiltro) && matchesSearch(p, searchText));
  }, [rows, estadoFiltro, searchText]);

  useEffect(() => {
    if (!modalOpen && !deleteTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalOpen(false);
        setDeleteTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, deleteTarget]);

  function openCreate() {
    setEditingId(null);
    setNombre("");
    setNit("");
    setTelefono("");
    setEmail("");
    setDireccion("");
    setEstado("activo");
    setModalOpen(true);
  }

  function openEdit(p: Proveedor) {
    setEditingId(p.id);
    setNombre(p.nombre);
    setNit(p.nit);
    setTelefono(p.telefono ?? "");
    setEmail(p.email ?? "");
    setDireccion(p.direccion ?? "");
    setEstado(p.estado);
    setModalOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !nit.trim()) {
      toast("Nombre y NIT son obligatorios", "error");
      return;
    }
    setBusy(true);
    try {
      if (editingId == null) {
        await createProveedor({
          nombre: nombre.trim(),
          nit: nit.trim(),
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          direccion: direccion.trim() || null,
          estado,
        });
        toast("Proveedor creado", "success");
      } else {
        await updateProveedor(editingId, {
          nombre: nombre.trim(),
          nit: nit.trim(),
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          direccion: direccion.trim() || null,
          estado,
        });
        toast("Proveedor actualizado", "success");
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActivo(p: Proveedor, nextActivo: boolean) {
    const next = nextActivo ? "activo" : "inactivo";
    if (next === "inactivo") {
      const ok = window.confirm(
        `¿Desactivar a «${p.nombre}»? No aparecerá en nuevos pedidos a proveedor.`
      );
      if (!ok) return;
    }
    const snapshot = rows;
    setEstadoSavingId(p.id);
    setRows((r) => r.map((x) => (x.id === p.id ? { ...x, estado: next } : x)));
    try {
      const updated = await patchProveedorEstado(p.id, next);
      setRows((r) => r.map((x) => (x.id === p.id ? updated : x)));
      toast(next === "activo" ? "Proveedor activado." : "Proveedor desactivado.", "success");
    } catch (e) {
      setRows(snapshot);
      toast(e instanceof Error ? e.message : "No se pudo actualizar el estado", "error");
    } finally {
      setEstadoSavingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteProveedor(deleteTarget.id);
      toast("Proveedor eliminado.", "success");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo eliminar", "error");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <div className="card-head" style={{ flexWrap: "wrap" }}>
          <h2 className="card-title">Proveedores</h2>
          <button type="button" className="btn primary" onClick={openCreate}>
            Nuevo proveedor
          </button>
        </div>
        <p className="hint">
          Alta y mantenimiento de contactos comerciales. Los pedidos a proveedor solo pueden elegir
          contactos activos.
        </p>

        {!loading && rows.length > 0 ? (
          <div
            className="prov-filters"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem 1rem",
              alignItems: "flex-end",
              marginBottom: "1rem",
            }}
          >
            <label className="field" style={{ flex: "1 1 220px", minWidth: 0, marginBottom: 0 }}>
              <span id="prov-search-label">Búsqueda</span>
              <input
                id="prov-search-input"
                type="search"
                autoComplete="off"
                placeholder="Buscar por nombre o estado..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                aria-labelledby="prov-search-label"
              />
            </label>
            <label className="field" style={{ flex: "0 1 200px", marginBottom: 0 }}>
              <span id="prov-estado-filtro-label">Estado</span>
              <select
                id="prov-estado-filtro"
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value as EstadoFiltro)}
                aria-labelledby="prov-estado-filtro-label"
              >
                <option value="todos">Todos</option>
                <option value="activo">Activos</option>
                <option value="inactivo">Inactivos</option>
              </select>
            </label>
          </div>
        ) : null}

        {loading ? (
          <p className="muted">Cargando…</p>
        ) : rows.length === 0 ? (
          <div className="clay-empty" role="status">
            No hay proveedores registrados. Usá «Nuevo proveedor» para agregar el primero.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="clay-empty" role="status">
            Ningún proveedor coincide con los filtros. Probá otra búsqueda o cambiá el estado.
          </div>
        ) : (
          <div className="table-wrap table--cards-sm">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>NIT</th>
                  <th>Teléfono</th>
                  <th>Email</th>
                  <th>Estado</th>
                  <th>Actualizado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Nombre">
                      <span className="cell-main">{p.nombre}</span>
                      {p.direccion?.trim() ? (
                        <span className="muted small" style={{ display: "block" }}>
                          {p.direccion}
                        </span>
                      ) : null}
                    </td>
                    <td className="mono" data-label="NIT">
                      {p.nit}
                    </td>
                    <td className="mono" data-label="Teléfono">
                      {p.telefono?.trim() ? p.telefono : "—"}
                    </td>
                    <td data-label="Email">{p.email?.trim() ? p.email : "—"}</td>
                    <td data-label="Estado">
                      <label className="ui-switch" title={p.estado === "activo" ? "Activo" : "Inactivo"}>
                        <input
                          type="checkbox"
                          className="ui-switch__input"
                          checked={p.estado === "activo"}
                          disabled={estadoSavingId === p.id}
                          aria-label={`${p.nombre}: marcar como activo o inactivo`}
                          onChange={(e) => void onToggleActivo(p, e.target.checked)}
                        />
                        <span className="ui-switch__track" aria-hidden />
                      </label>
                      <span
                        className={`small ${p.estado === "activo" ? "badge-ok" : "muted"}`}
                        style={{ marginLeft: "0.5rem", verticalAlign: "middle" }}
                      >
                        {p.estado === "activo" ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="muted small" data-label="Actualizado">
                      {fmtFecha(p.fecha_actualizacion)}
                    </td>
                    <td data-label="Acciones">
                      <div className="toolbar-inline" style={{ flexWrap: "wrap", gap: "0.35rem" }}>
                        <button type="button" className="btn ghost small" onClick={() => openEdit(p)}>
                          Editar
                        </button>
                        <button type="button" className="btn ghost small danger-ghost" onClick={() => setDeleteTarget(p)}>
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen ? (
        <div
          className="drawer-overlay"
          role="dialog"
          aria-modal
          aria-labelledby="prov-form-title"
          onClick={() => setModalOpen(false)}
        >
          <div className="card drawer-overlay-card" onClick={(e) => e.stopPropagation()}>
            <h3 id="prov-form-title" className="card-title">
              {editingId == null ? "Nuevo proveedor" : `Editar proveedor #${editingId}`}
            </h3>
            <p className="muted small">
              Ingrese la información del proveedor. Los campos obligatorios deben completarse para poder
              registrarlo correctamente.
            </p>
            <form className="form" onSubmit={onSubmit}>
              <div className="grid-2">
                <label className="field">
                  <span>Nombre *</span>
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
                </label>
                <label className="field">
                  <span>NIT *</span>
                  <input value={nit} onChange={(e) => setNit(e.target.value)} required />
                </label>
                <label className="field">
                  <span>Teléfono</span>
                  <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span>Dirección</span>
                  <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
                </label>
                <label className="field">
                  <span>Estado</span>
                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value as "activo" | "inactivo")}
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                </label>
              </div>
              <div className="actions">
                <button type="button" className="btn ghost" onClick={() => setModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={busy}>
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="drawer-overlay"
          role="dialog"
          aria-modal
          aria-labelledby="prov-delete-title"
          onClick={() => !deleteBusy && setDeleteTarget(null)}
        >
          <div className="card drawer-overlay-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 id="prov-delete-title" className="card-title">
              ¿Eliminar proveedor?
            </h3>
            <p className="muted">
              ¿Estás seguro de eliminar el proveedor <strong>«{deleteTarget.nombre}»</strong>? Esta acción no se
              puede deshacer. Si tiene pedidos asociados, el sistema no permitirá borrarlo.
            </p>
            <div className="actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="btn ghost" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={deleteBusy}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
