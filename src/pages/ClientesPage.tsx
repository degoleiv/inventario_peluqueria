import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  convertirClienteRegistrado,
  createCliente,
  deleteCliente,
  fetchClientes,
  updateCliente,
  type Cliente,
} from "../api";
import { ClienteCardToolbar } from "../components/ClienteCardToolbar";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
const TIPO_DOCUMENTO_OPTS = [
  { value: "", label: "—" },
  { value: "CC", label: "CC" },
  { value: "CE", label: "CE" },
  { value: "Pasaporte", label: "Pasaporte" },
  { value: "NIT", label: "NIT" },
  { value: "Otro", label: "Otro" },
] as const;

function validEmail(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

type TipoClienteFiltro = "todos" | "registrado" | "temporal";

function matchesSearchCliente(c: Cliente, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  if (c.nombre.toLowerCase().includes(s)) return true;
  if (c.telefono?.toLowerCase().includes(s)) return true;
  if (c.email?.toLowerCase().includes(s)) return true;
  if (c.numero_documento?.toLowerCase().includes(s)) return true;
  return false;
}

function matchesTipoCliente(c: Cliente, f: TipoClienteFiltro): boolean {
  if (f === "todos") return true;
  if (f === "registrado") return c.tipo_cliente !== "temporal";
  return c.tipo_cliente === "temporal";
}

function ClienteCardAvatar({ nombre }: { nombre: string }) {
  return (
    <div className="prov-card__avatar prov-card__avatar--ph prov-card__media-wrap" aria-hidden>
      {nombre.trim().slice(0, 1).toUpperCase()}
    </div>
  );
}

export function ClientesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [tipoClienteFiltro, setTipoClienteFiltro] = useState<TipoClienteFiltro>("todos");

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState("");
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmDeleteCliente, setConfirmDeleteCliente] = useState<Cliente | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pinTick, setPinTick] = useState(0);
  const focusHandled = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchClientes());
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

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
    setTipoDocumento("");
    setNumeroDocumento("");
    setDrawerOpen(true);
  }

  function openEdit(c: Cliente) {
    recordRecentCliente(c.id);
    setEditingId(c.id);
    setNombre(c.nombre);
    setTelefono(c.telefono ?? "");
    setEmail(c.email ?? "");
    setTipoDocumento(c.tipo_documento ?? "");
    setNumeroDocumento(c.numero_documento ?? "");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    if (!validEmail(email)) {
      toast("Revisá el formato del correo electrónico.", "warning");
      return;
    }
    try {
      if (editingId != null) {
        await updateCliente(editingId, {
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          tipo_documento: tipoDocumento.trim() || null,
          numero_documento: numeroDocumento.trim() || null,
        });
        toast("Cliente actualizado correctamente.", "success");
      } else {
        await createCliente({
          nombre: nombre.trim(),
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          tipo_documento: tipoDocumento.trim() || null,
          numero_documento: numeroDocumento.trim() || null,
        });
        toast("Cliente creado correctamente.", "success");
      }
      closeDrawer();
      void load();
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

  const filteredListaRows = useMemo(() => {
    return displayRows.filter(
      (c) => matchesSearchCliente(c, searchText) && matchesTipoCliente(c, tipoClienteFiltro)
    );
  }, [displayRows, searchText, tipoClienteFiltro]);

  const editingTemporal =
    editingId != null &&
    rows.find((r) => r.id === editingId)?.tipo_cliente === "temporal";

  async function onConvertirRegistrado(e: React.MouseEvent) {
    e.preventDefault();
    if (editingId == null) return;
    if (!nombre.trim()) {
      toast("Completá el nombre para registrar al cliente.", "warning");
      return;
    }
    try {
      await convertirClienteRegistrado(editingId, {
        nombre: nombre.trim(),
        telefono: telefono.trim() || null,
        email: email.trim() || null,
      });
      toast("Cliente registrado. Ventas y citas previas siguen vinculadas.", "success");
      closeDrawer();
      void load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  function requestDeleteCliente(c: Cliente) {
    setConfirmDeleteCliente(c);
  }

  async function confirmDeleteClienteAction() {
    const c = confirmDeleteCliente;
    if (!c) return;
    setDeleteBusy(true);
    try {
      await deleteCliente(c.id);
      toast("Cliente eliminado correctamente.", "success");
      if (editingId === c.id) closeDrawer();
      setConfirmDeleteCliente(null);
      void load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo eliminar el cliente", "error");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="page-clientes">
        <section className="card">
          <div className="card-head" style={{ flexWrap: "wrap" }}>
            <h2 className="card-title">Clientes</h2>
            <button type="button" className="btn primary" onClick={openNew}>
              Nuevo cliente
            </button>
          </div>
          <p className="hint">
            Contactos para ventas y citas. Los favoritos y recientes se muestran primero; tocá una tarjeta
            para editar o usá los iconos de la fila inferior.
          </p>

          {!loading && rows.length > 0 ? (
            <div className="module-filters-bar">
              <label className="field" style={{ flex: "1 1 220px", minWidth: 0 }}>
                <span id="cli-search-label">Búsqueda</span>
                <input
                  id="cli-search-input"
                  type="search"
                  autoComplete="off"
                  placeholder="Nombre, teléfono, email o documento…"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  aria-labelledby="cli-search-label"
                />
              </label>
              <label className="field" style={{ flex: "0 1 200px" }}>
                <span id="cli-tipo-label">Tipo</span>
                <select
                  id="cli-tipo-filtro"
                  value={tipoClienteFiltro}
                  onChange={(e) => setTipoClienteFiltro(e.target.value as TipoClienteFiltro)}
                  aria-labelledby="cli-tipo-label"
                >
                  <option value="todos">Todos</option>
                  <option value="registrado">Registrados</option>
                  <option value="temporal">Ocasionales</option>
                </select>
              </label>
            </div>
          ) : null}

          {loading ? (
            <div className="cards-grid">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : rows.length === 0 ? (
            <div className="clay-empty" role="status">
              No hay clientes cargados. Usá «Nuevo cliente» para agregar el primero.
            </div>
          ) : filteredListaRows.length === 0 ? (
            <div className="clay-empty" role="status">
              Ningún cliente coincide con los filtros. Probá otra búsqueda o cambiá el tipo.
            </div>
          ) : (
            <div className="proveedores-grid" role="list">
              {filteredListaRows.map((c) => (
                <article
                  key={c.id}
                  className="prov-card prov-card--stacked prov-card--clickable"
                  role="listitem"
                  tabIndex={0}
                  aria-label={`Ver o editar ${c.nombre}`}
                  onClick={() => openEdit(c)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEdit(c);
                    }
                  }}
                >
                  <ClienteCardAvatar nombre={c.nombre} />
                  <h3 className="prov-card__nombre-text">{c.nombre}</h3>
                  {c.tipo_cliente === "temporal" ? (
                    <span className="prov-card__badge prov-card__badge--ok" style={{ fontSize: "0.72rem" }}>
                      ocasional
                    </span>
                  ) : null}
                  <p className="cliente-card-meta">
                    <span className="cliente-card-meta-line mono">
                      {c.telefono?.trim() ? c.telefono : "Sin teléfono"}
                    </span>
                    {c.email?.trim() ? (
                      <span className="cliente-card-meta-line">{c.email}</span>
                    ) : null}
                    {c.puntos != null && c.puntos > 0 ? (
                      <span className="cliente-card-meta-line">
                        <strong>{c.puntos}</strong> puntos
                      </span>
                    ) : null}
                  </p>
                  <ClienteCardToolbar
                    nombreCliente={c.nombre}
                    pinned={isClientePinned(c.id)}
                    onEdit={() => openEdit(c)}
                    onDelete={() => requestDeleteCliente(c)}
                    onTogglePin={() => {
                      togglePinCliente(c.id);
                      setPinTick((t) => t + 1);
                    }}
                  />
                </article>
              ))}
            </div>
          )}
        </section>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={
          editingId
            ? editingTemporal
              ? "Cliente ocasional"
              : "Editar cliente"
            : "Nuevo cliente"
        }
        wide
      >
        <form className="form drawer-form create-cliente-drawer-form" onSubmit={onSubmit}>
          {editingTemporal ? (
            <p className="hint">
              Contacto rápido sin registro completo. Cuando quieras, completá datos y pulsá{" "}
              <strong>Registrar formalmente</strong> para fidelizar sin duplicar en el listado.
            </p>
          ) : null}
          <label className="field">
            <span>Nombre completo *</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="name"
              required
            />
          </label>
          <div className="field-row create-cliente-drawer-doc">
            <label className="field">
              <span>Tipo documento</span>
              <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)}>
                {TIPO_DOCUMENTO_OPTS.map((o) => (
                  <option key={o.value || "empty"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Número documento</span>
              <input
                value={numeroDocumento}
                onChange={(e) => setNumeroDocumento(e.target.value)}
                autoComplete="off"
              />
            </label>
          </div>
          <label className="field">
            <span>Teléfono</span>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              autoComplete="tel"
            />
          </label>
          <label className="field">
            <span>Correo</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <div className="drawer-actions">
            {editingTemporal ? (
              <button type="button" className="btn primary btn-lg" onClick={onConvertirRegistrado}>
                Registrar formalmente
              </button>
            ) : null}
            <button type="submit" className="btn primary btn-lg">
              {editingTemporal ? "Guardar cambios (sigue ocasional)" : "Guardar"}
            </button>
            {editingId != null ? (
              <button
                type="button"
                className="btn ghost danger-text"
                title="Eliminar cliente"
                onClick={() => {
                  const c = rows.find((r) => r.id === editingId);
                  if (c) requestDeleteCliente(c);
                }}
              >
                🗑️ Eliminar
              </button>
            ) : null}
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={confirmDeleteCliente != null}
        title="Eliminar cliente"
        description={
          confirmDeleteCliente ? (
            <>
              ¿Eliminar a <strong>{confirmDeleteCliente.nombre}</strong>? También se eliminarán las citas
              vinculadas. Esta acción no se puede deshacer.
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        busy={deleteBusy}
        onCancel={() => !deleteBusy && setConfirmDeleteCliente(null)}
        onConfirm={() => void confirmDeleteClienteAction()}
      />
    </div>
  );
}
