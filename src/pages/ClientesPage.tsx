import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function ClientesPage() {
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

  return (
    <div className="page-clientes">
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
        <div className="cards-grid">
          {displayRows.map((c) => (
            <div key={c.id} className="cliente-card-wrap">
              <button type="button" className="cliente-card" onClick={() => openEdit(c)}>
                <span className="cliente-card-name">{c.nombre}</span>
                <span className="cliente-card-meta">{c.telefono ?? "Sin teléfono"}</span>
                {c.puntos != null && c.puntos > 0 ? (
                  <span className="cliente-card-badge">{c.puntos} pts</span>
                ) : null}
              </button>
              <button
                type="button"
                className={`cliente-fav ${isClientePinned(c.id) ? "cliente-fav--on" : ""}`}
                title={isClientePinned(c.id) ? "Quitar favorito" : "Cliente frecuente"}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePinCliente(c.id);
                  setPinTick((t) => t + 1);
                }}
              >
                ★
              </button>
            </div>
          ))}
        </div>
      )}

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
