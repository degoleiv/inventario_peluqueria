import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { createCliente, deleteCliente, fetchClientes, updateCliente, type Cliente } from "../api";
import { Drawer } from "../components/Drawer";
import { SkeletonCard } from "../components/Skeleton";
import { useToast } from "../context/ToastContext";
import {
  getPinnedClienteIds,
  getRecentClienteIds,
  isClientePinned,
  recordRecentCliente,
  togglePinCliente,
} from "../lib/recentPins";
import { SubNav } from "../components/SubNav";
import { CLIENTES_TABS, readLastTab, type ClientesTab } from "../lib/moduleRoutes";

export function ClientesPage() {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const toast = useToast();
  const [rows, setRows] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pinTick, setPinTick] = useState(0);
  const focusHandled = useRef(false);

  const load = useCallback(
    async (q?: string) => {
      setLoading(true);
      try {
        setRows(await fetchClientes(q));
      } catch (e) {
        toast(e instanceof Error ? e.message : "Error", "error");
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    const q = busqueda.trim();
    const delay = q ? 280 : 0;
    const t = window.setTimeout(() => {
      void load(q || undefined);
    }, delay);
    return () => clearTimeout(t);
  }, [busqueda, load]);

  useEffect(() => {
    if (focusHandled.current || rows.length === 0) return;
    try {
      const raw = sessionStorage.getItem("peluqueria_focus_cliente_id");
      if (!raw) return;
      sessionStorage.removeItem("peluqueria_focus_cliente_id");
      const id = Number(raw);
      if (!Number.isFinite(id)) return;
      const c = rows.find((r) => r.id === id);
      if (c) {
        focusHandled.current = true;
        openEdit(c);
      }
    } catch {
      /* ignore */
    }
  }, [rows]);

  function openNew() {
    setEditingId(null);
    setNombre("");
    setTelefono("");
    setEmail("");
    setNotas("");
    setDrawerOpen(true);
  }

  function openEdit(c: Cliente) {
    recordRecentCliente(c.id);
    setEditingId(c.id);
    setNombre(c.nombre);
    setTelefono(c.telefono ?? "");
    setEmail(c.email ?? "");
    setNotas(c.notas ?? "");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    try {
      if (editingId != null) {
        await updateCliente(editingId, {
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          notas: notas.trim() || null,
        });
        toast("Cliente actualizado", "success");
      } else {
        await createCliente({
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          notas: notas.trim() || null,
        });
        toast("Cliente creado", "success");
      }
      closeDrawer();
      void load(busqueda.trim() || undefined);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    }
  }

  const displayRows = useMemo(() => {
    const pins = new Set(getPinnedClienteIds());
    const recent = getRecentClienteIds();
    const score = (c: Cliente) => {
      let s = 0;
      if (pins.has(c.id)) s += 2000;
      const ri = recent.indexOf(c.id);
      if (ri >= 0) s += 80 - ri * 2;
      return s;
    };
    return [...rows].sort((a, b) => score(b) - score(a));
  }, [rows, pinTick]);

  const displayRowsHistorial = useMemo(() => {
    return [...rows].sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [rows]);

  async function onDelete(id: number) {
    if (!window.confirm("¿Eliminar cliente y sus citas?")) return;
    try {
      await deleteCliente(id);
      toast("Cliente eliminado", "info");
      if (editingId === id) closeDrawer();
      void load(busqueda.trim() || undefined);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  useEffect(() => {
    if (tabParam === "nuevo") {
      openNew();
    }
  }, [tabParam]);

  const tabOk = tabParam != null && CLIENTES_TABS.includes(tabParam as ClientesTab);
  if (!tabOk) {
    return <Navigate to={`/clientes/${readLastTab("clientes", "lista")}`} replace />;
  }
  const tab = tabParam as ClientesTab;

  return (
    <div className="page-clientes">
      <SubNav
        moduleId="clientes"
        items={[
          { id: "lista", label: "Lista", to: "/clientes/lista" },
          { id: "nuevo", label: "Nuevo cliente", to: "/clientes/nuevo" },
          { id: "historial", label: "Historial", to: "/clientes/historial" },
        ]}
      />

      {tab === "lista" ? (
        <>
      <div className="toolbar-pro">
        <label className="search-hero">
          <span className="search-hero-icon" aria-hidden>
            🔍
          </span>
          <input
            className="search-hero-input input-xl"
            placeholder="Buscar por nombre o teléfono…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        <button type="button" className="btn primary btn-lg" onClick={openNew}>
          Nuevo cliente
        </button>
      </div>

      {loading ? (
        <div className="cards-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : displayRows.length === 0 ? (
        <div className="empty-state card-pro">
          <p>No hay clientes.</p>
          <p className="muted">Creá uno nuevo o ajustá la búsqueda.</p>
          <button type="button" className="btn primary" onClick={openNew}>
            Agregar cliente
          </button>
        </div>
      ) : (
        <section className="card-pro clientes-tabla-wrap">
          <div className="table-wrap">
            <table className="table clientes-table">
              <thead>
                <tr>
                  <th className="clientes-table-col-fav" scope="col" aria-label="Favorito" />
                  <th scope="col">Nombre</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col">Email</th>
                  <th scope="col" className="clientes-table-col-narrow">
                    Puntos
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((c) => (
                  <tr
                    key={c.id}
                    className="table-row-click"
                    onClick={() => openEdit(c)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEdit(c);
                      }
                    }}
                  >
                    <td className="clientes-table-col-fav">
                      <button
                        type="button"
                        className={`cliente-fav-inline ${isClientePinned(c.id) ? "cliente-fav-inline--on" : ""}`}
                        title={isClientePinned(c.id) ? "Quitar favorito" : "Cliente frecuente"}
                        aria-pressed={isClientePinned(c.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinCliente(c.id);
                          setPinTick((t) => t + 1);
                        }}
                      >
                        ★
                      </button>
                    </td>
                    <td>
                      <span className="cell-main">{c.nombre}</span>
                    </td>
                    <td>
                      <span className="mono">{c.telefono?.trim() ? c.telefono : "—"}</span>
                    </td>
                    <td>
                      <span className="cell-sub">{c.email?.trim() ? c.email : "—"}</span>
                    </td>
                    <td className="clientes-table-col-narrow mono">
                      {c.puntos != null && c.puntos > 0 ? `${c.puntos}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
        </>
      ) : null}

      {tab === "historial" ? (
        <section className="card-pro" style={{ marginBottom: "1rem" }}>
          <h2 className="card-pro-title">Historial (última actividad)</h2>
          <p className="muted">Orden por fecha de actualización en el sistema.</p>
          {loading ? (
            <div className="cards-grid">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : displayRowsHistorial.length === 0 ? (
            <p className="muted">Sin clientes.</p>
          ) : (
            <div className="table-wrap">
              <table className="table clientes-table">
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Teléfono</th>
                    <th scope="col">Última actividad</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRowsHistorial.map((c) => (
                    <tr
                      key={c.id}
                      className="table-row-click"
                      tabIndex={0}
                      onClick={() => openEdit(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openEdit(c);
                        }
                      }}
                    >
                      <td>
                        <span className="cell-main">{c.nombre}</span>
                      </td>
                      <td>
                        <span className="mono">{c.telefono?.trim() ? c.telefono : "—"}</span>
                      </td>
                      <td>
                        <span className="muted small">
                          {new Date(c.updated_at).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "nuevo" ? (
        <section className="card-pro">
          <h2 className="card-pro-title">Nuevo cliente</h2>
          <p className="muted">
            Se abrió el panel lateral con el formulario. Completá los datos y guardá; podés cerrar
            este mensaje y seguir en otra pestaña cuando termines.
          </p>
          <button type="button" className="btn primary" onClick={openNew}>
            Abrir de nuevo el formulario
          </button>
        </section>
      ) : null}

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingId ? "Editar cliente" : "Nuevo cliente"}
        wide
      >
        <form className="form drawer-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Nombre *</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Teléfono</span>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Notas</span>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
          </label>
          <div className="drawer-actions">
            <button type="submit" className="btn primary btn-lg">
              Guardar
            </button>
            {editingId != null ? (
              <button
                type="button"
                className="btn ghost danger-text"
                onClick={() => void onDelete(editingId)}
              >
                Eliminar
              </button>
            ) : null}
          </div>
        </form>
      </Drawer>
    </div>
  );
}
