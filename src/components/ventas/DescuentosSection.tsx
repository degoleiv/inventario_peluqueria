import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowClockwise, Pencil, Plus, Trash } from "@phosphor-icons/react";
import {
  createDescuento,
  deleteDescuento,
  fetchClientes,
  fetchDescuentoAplicaciones,
  fetchDescuentoAuditoria,
  fetchDescuentos,
  fetchProductos,
  patchDescuentoEstado,
  updateDescuento,
  type Cliente,
  type Descuento,
  type DescuentoAlcance,
  type DescuentoAplicacion,
  type DescuentoAuditoriaEntrada,
  type DescuentoTipo,
  type Producto,
} from "../../api";
import { useToast } from "../../context/ToastContext";
import { ConfirmDialog } from "../ConfirmDialog";
import { SearchableSelect } from "../SearchableSelect";
import { formatMoney } from "../../lib/money";

type SubTab = "config" | "historial" | "auditoria";

const SUB_TABS: Array<{ id: SubTab; label: string }> = [
  { id: "config", label: "Descuentos configurados" },
  { id: "historial", label: "Historial de aplicaciones" },
  { id: "auditoria", label: "Auditoría de cambios" },
];

type FormState = {
  alcance: DescuentoAlcance;
  cliente_id: string;
  producto_id: string;
  tipo: DescuentoTipo;
  valor: string;
  nombre: string;
  descripcion: string;
  vigente_desde: string;
  vigente_hasta: string;
  activo: boolean;
};

const FORM_INICIAL: FormState = {
  alcance: "cliente",
  cliente_id: "",
  producto_id: "",
  tipo: "porcentaje",
  valor: "",
  nombre: "",
  descripcion: "",
  vigente_desde: "",
  vigente_hasta: "",
  activo: true,
};

function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16);
}

function labelOrigen(o: string): string {
  if (o === "cliente") return "Cliente";
  if (o === "producto") return "Producto";
  if (o === "manual") return "Manual";
  return o;
}

type SectionProps = {
  puedeCrear: boolean;
  puedeEditar: boolean;
  puedeEliminar: boolean;
};

export function DescuentosSection({ puedeCrear, puedeEditar, puedeEliminar }: SectionProps) {
  const toast = useToast();
  const [subTab, setSubTab] = useState<SubTab>("config");
  const [descuentos, setDescuentos] = useState<Descuento[]>([]);
  const [aplicaciones, setAplicaciones] = useState<DescuentoAplicacion[]>([]);
  const [auditoria, setAuditoria] = useState<DescuentoAuditoriaEntrada[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingApli, setLoadingApli] = useState(false);
  const [loadingAud, setLoadingAud] = useState(false);
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [search, setSearch] = useState("");

  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState<"todos" | "cliente" | "producto" | "manual">(
    "todos"
  );

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ ...FORM_INICIAL });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [aBorrar, setABorrar] = useState<Descuento | null>(null);

  const cargarDescuentos = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchDescuentos({
        incluir_inactivos: incluirInactivos,
        search: search.trim() || undefined,
      });
      setDescuentos(rows);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar descuentos", "error");
    } finally {
      setLoading(false);
    }
  }, [incluirInactivos, search, toast]);

  const cargarAplicaciones = useCallback(async () => {
    setLoadingApli(true);
    try {
      const rows = await fetchDescuentoAplicaciones({
        desde: filtroDesde || undefined,
        hasta: filtroHasta || undefined,
        origen: filtroOrigen === "todos" ? undefined : filtroOrigen,
      });
      setAplicaciones(rows);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar historial", "error");
    } finally {
      setLoadingApli(false);
    }
  }, [filtroDesde, filtroHasta, filtroOrigen, toast]);

  const cargarAuditoria = useCallback(async () => {
    setLoadingAud(true);
    try {
      const rows = await fetchDescuentoAuditoria({});
      setAuditoria(rows);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cargar auditoría", "error");
    } finally {
      setLoadingAud(false);
    }
  }, [toast]);

  useEffect(() => {
    void cargarDescuentos();
  }, [cargarDescuentos]);

  useEffect(() => {
    if (subTab === "historial") void cargarAplicaciones();
    if (subTab === "auditoria") void cargarAuditoria();
  }, [subTab, cargarAplicaciones, cargarAuditoria]);

  useEffect(() => {
    let cancelado = false;
    fetchClientes()
      .then((rows) => {
        if (!cancelado) setClientes(rows);
      })
      .catch(() => {
        /* silencio: los combos quedan vacíos si falla */
      });
    fetchProductos()
      .then((rows) => {
        if (!cancelado) setProductos(rows);
      })
      .catch(() => {
        /* idem */
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const clientesOpts = useMemo(
    () => clientes.map((c) => ({ value: String(c.id), label: c.nombre })),
    [clientes]
  );
  const productosOpts = useMemo(
    () => productos.map((p) => ({ value: String(p.id), label: p.nombre })),
    [productos]
  );

  function abrirNuevo() {
    setForm({ ...FORM_INICIAL });
    setEditingId(null);
    setFormOpen(true);
  }

  function abrirEditar(d: Descuento) {
    setEditingId(d.id);
    setForm({
      alcance: d.alcance,
      cliente_id: d.cliente_id != null ? String(d.cliente_id) : "",
      producto_id: d.producto_id != null ? String(d.producto_id) : "",
      tipo: d.tipo,
      valor: String(d.valor),
      nombre: d.nombre,
      descripcion: d.descripcion ?? "",
      vigente_desde: d.vigente_desde ?? "",
      vigente_hasta: d.vigente_hasta ?? "",
      activo: d.activo === 1,
    });
    setFormOpen(true);
  }

  async function guardar() {
    const valorNum = Number(form.valor);
    if (!form.nombre.trim()) {
      toast("Ingresá un nombre para el descuento", "warning");
      return;
    }
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      toast("El valor del descuento debe ser mayor a 0", "warning");
      return;
    }
    if (form.tipo === "porcentaje" && valorNum > 100) {
      toast("El % no puede superar 100", "warning");
      return;
    }
    if (form.alcance === "cliente" && !form.cliente_id) {
      toast("Elegí el cliente", "warning");
      return;
    }
    if (form.alcance === "producto" && !form.producto_id) {
      toast("Elegí el producto", "warning");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        alcance: form.alcance,
        cliente_id: form.alcance === "cliente" ? Number(form.cliente_id) : null,
        producto_id: form.alcance === "producto" ? Number(form.producto_id) : null,
        tipo: form.tipo,
        valor: valorNum,
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        vigente_desde: form.vigente_desde || null,
        vigente_hasta: form.vigente_hasta || null,
        activo: form.activo,
      };
      if (editingId != null) {
        await updateDescuento(editingId, payload);
        toast("Descuento actualizado", "success");
      } else {
        await createDescuento(payload);
        toast("Descuento creado", "success");
      }
      setFormOpen(false);
      setEditingId(null);
      setForm({ ...FORM_INICIAL });
      await cargarDescuentos();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActivo(d: Descuento) {
    try {
      await patchDescuentoEstado(d.id, d.activo !== 1);
      await cargarDescuentos();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al cambiar estado", "error");
    }
  }

  async function confirmarBorrar() {
    if (!aBorrar) return;
    try {
      await deleteDescuento(aBorrar.id);
      toast("Descuento eliminado", "success");
      setABorrar(null);
      await cargarDescuentos();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al eliminar", "error");
    }
  }

  return (
    <div className="sales-history-page" style={{ padding: 16 }}>
      <header className="sales-history-header">
        <div className="sales-history-header-actions">
          {subTab === "config" ? (
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => void cargarDescuentos()}
                disabled={loading}
              >
                <ArrowClockwise size={18} aria-hidden />
                Actualizar
              </button>
              {puedeCrear ? (
                <button type="button" className="btn primary" onClick={abrirNuevo}>
                  <Plus size={18} weight="bold" aria-hidden />
                  Nuevo descuento
                </button>
              ) : null}
            </>
          ) : subTab === "historial" ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => void cargarAplicaciones()}
              disabled={loadingApli}
            >
              <ArrowClockwise size={18} aria-hidden />
              Actualizar
            </button>
          ) : (
            <button
              type="button"
              className="btn ghost"
              onClick={() => void cargarAuditoria()}
              disabled={loadingAud}
            >
              <ArrowClockwise size={18} aria-hidden />
              Actualizar
            </button>
          )}
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Sub-pestañas de descuentos"
        style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--color-border, #ddd)", margin: "10px 0" }}
      >
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={subTab === t.id}
            className={`btn small ${subTab === t.id ? "primary" : "ghost"}`}
            onClick={() => setSubTab(t.id)}
            style={{ borderRadius: "6px 6px 0 0" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "config" ? (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <input
              type="text"
              className="pos-saas-input"
              placeholder="Buscar por nombre, cliente o producto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 240 }}
            />
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={incluirInactivos}
                onChange={(e) => setIncluirInactivos(e.target.checked)}
              />
              Mostrar inactivos
            </label>
          </div>

          {loading && descuentos.length === 0 ? (
            <p className="muted">Cargando…</p>
          ) : descuentos.length === 0 ? (
            <p className="muted">Todavía no hay descuentos configurados.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Nombre</th>
                    <th style={{ textAlign: "left" }}>Alcance</th>
                    <th style={{ textAlign: "left" }}>Destino</th>
                    <th style={{ textAlign: "right" }}>Valor</th>
                    <th style={{ textAlign: "left" }}>Vigencia</th>
                    <th style={{ textAlign: "center" }}>Activo</th>
                    <th style={{ textAlign: "right" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {descuentos.map((d) => (
                    <tr key={d.id} style={{ borderTop: "1px solid var(--color-border, #eee)" }}>
                      <td>
                        <strong>{d.nombre}</strong>
                        {d.descripcion ? (
                          <div className="muted small">{d.descripcion}</div>
                        ) : null}
                      </td>
                      <td>{d.alcance === "cliente" ? "Cliente" : "Producto"}</td>
                      <td>
                        {d.alcance === "cliente"
                          ? d.cliente_nombre ?? "—"
                          : d.producto_nombre ?? "—"}
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {d.tipo === "porcentaje" ? `${d.valor}%` : formatMoney(d.valor)}
                      </td>
                      <td className="small muted">
                        {d.vigente_desde || "—"} → {d.vigente_hasta || "sin fin"}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={d.activo === 1}
                          onChange={() => void toggleActivo(d)}
                          aria-label="Activar/desactivar"
                          disabled={!puedeEditar}
                        />
                      </td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {puedeEditar ? (
                          <button
                            type="button"
                            className="btn small ghost"
                            onClick={() => abrirEditar(d)}
                            title="Editar"
                          >
                            <Pencil size={16} aria-hidden /> Editar
                          </button>
                        ) : null}
                        {puedeEditar && puedeEliminar ? " " : null}
                        {puedeEliminar ? (
                          <button
                            type="button"
                            className="btn small ghost"
                            onClick={() => setABorrar(d)}
                            title="Eliminar"
                          >
                            <Trash size={16} aria-hidden /> Eliminar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {subTab === "historial" ? (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <span className="small muted">Desde</span>
              <input
                type="date"
                className="pos-saas-input"
                value={filtroDesde}
                onChange={(e) => setFiltroDesde(e.target.value)}
              />
            </label>
            <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <span className="small muted">Hasta</span>
              <input
                type="date"
                className="pos-saas-input"
                value={filtroHasta}
                onChange={(e) => setFiltroHasta(e.target.value)}
              />
            </label>
            <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <span className="small muted">Origen</span>
              <select
                className="pos-saas-input"
                value={filtroOrigen}
                onChange={(e) =>
                  setFiltroOrigen(e.target.value as "todos" | "cliente" | "producto" | "manual")
                }
              >
                <option value="todos">Todos</option>
                <option value="cliente">Cliente</option>
                <option value="producto">Producto</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <button
              type="button"
              className="btn small primary"
              onClick={() => void cargarAplicaciones()}
              disabled={loadingApli}
            >
              Aplicar filtros
            </button>
          </div>

          {loadingApli ? (
            <p className="muted">Cargando…</p>
          ) : aplicaciones.length === 0 ? (
            <p className="muted">No se registraron descuentos aplicados con esos filtros.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Fecha</th>
                    <th style={{ textAlign: "left" }}>Venta</th>
                    <th style={{ textAlign: "left" }}>Cliente</th>
                    <th style={{ textAlign: "left" }}>Producto</th>
                    <th style={{ textAlign: "left" }}>Origen</th>
                    <th style={{ textAlign: "left" }}>Descripción</th>
                    <th style={{ textAlign: "right" }}>Valor</th>
                    <th style={{ textAlign: "right" }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {aplicaciones.map((a) => (
                    <tr key={a.id} style={{ borderTop: "1px solid var(--color-border, #eee)" }}>
                      <td className="small">{formatFecha(a.created_at)}</td>
                      <td>#{a.venta_id}</td>
                      <td>{a.cliente_nombre ?? "—"}</td>
                      <td>{a.producto_nombre ?? "—"}</td>
                      <td>{labelOrigen(a.origen)}</td>
                      <td>{a.descripcion ?? a.descuento_nombre ?? "—"}</td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        {a.tipo === "porcentaje" ? `${a.valor}%` : formatMoney(a.valor)}
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>
                        −{formatMoney(a.monto_aplicado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {subTab === "auditoria" ? (
        <>
          {loadingAud ? (
            <p className="muted">Cargando…</p>
          ) : auditoria.length === 0 ? (
            <p className="muted">Sin cambios registrados sobre los descuentos.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Fecha</th>
                    <th style={{ textAlign: "left" }}>Descuento</th>
                    <th style={{ textAlign: "left" }}>Acción</th>
                    <th style={{ textAlign: "left" }}>Usuario</th>
                    <th style={{ textAlign: "left" }}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {auditoria.map((a) => (
                    <tr key={a.id} style={{ borderTop: "1px solid var(--color-border, #eee)" }}>
                      <td className="small">{formatFecha(a.created_at)}</td>
                      <td>{a.descuento_nombre ?? `#${a.descuento_id ?? "?"}`}</td>
                      <td>{a.accion}</td>
                      <td>{a.usuario_nombre ?? "—"}</td>
                      <td className="small">
                        {a.detalle_json ? (
                          <code style={{ whiteSpace: "pre-wrap" }}>{a.detalle_json}</code>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {formOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setFormOpen(false);
          }}
        >
          <div
            style={{
              background: "var(--color-surface, #fff)",
              color: "var(--color-text, #222)",
              padding: 16,
              borderRadius: 8,
              width: "min(560px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              {editingId != null ? "Editar descuento" : "Nuevo descuento"}
            </h2>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="pos-saas-field-label">Alcance</span>
                <div style={{ display: "flex", gap: 12 }}>
                  <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                    <input
                      type="radio"
                      name="alcance"
                      value="cliente"
                      checked={form.alcance === "cliente"}
                      onChange={() => setForm((f) => ({ ...f, alcance: "cliente" }))}
                    />
                    Cliente
                  </label>
                  <label style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                    <input
                      type="radio"
                      name="alcance"
                      value="producto"
                      checked={form.alcance === "producto"}
                      onChange={() => setForm((f) => ({ ...f, alcance: "producto" }))}
                    />
                    Producto
                  </label>
                </div>
              </label>

              {form.alcance === "cliente" ? (
                <SearchableSelect
                  label={<span className="pos-saas-field-label">Cliente</span>}
                  value={form.cliente_id}
                  onChange={(v) => setForm((f) => ({ ...f, cliente_id: v }))}
                  options={clientesOpts}
                  placeholder="Buscar cliente…"
                />
              ) : (
                <SearchableSelect
                  label={<span className="pos-saas-field-label">Producto</span>}
                  value={form.producto_id}
                  onChange={(v) => setForm((f) => ({ ...f, producto_id: v }))}
                  options={productosOpts}
                  placeholder="Buscar producto…"
                />
              )}

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="pos-saas-field-label">Nombre</span>
                <input
                  className="pos-saas-input"
                  value={form.nombre}
                  onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Descuento cliente frecuente"
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="pos-saas-field-label">Tipo</span>
                  <select
                    className="pos-saas-input"
                    value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as DescuentoTipo }))}
                  >
                    <option value="porcentaje">Porcentaje (%)</option>
                    <option value="monto">Monto fijo (Gs.)</option>
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="pos-saas-field-label">Valor</span>
                  <input
                    className="pos-saas-input"
                    inputMode="numeric"
                    value={form.valor}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d]/g, "");
                      setForm((f) => ({ ...f, valor: raw }));
                    }}
                    placeholder={form.tipo === "porcentaje" ? "0-100" : "Ej: 5000"}
                  />
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="pos-saas-field-label">Descripción (opcional)</span>
                <input
                  className="pos-saas-input"
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="pos-saas-field-label">Vigente desde</span>
                  <input
                    type="date"
                    className="pos-saas-input"
                    value={form.vigente_desde}
                    onChange={(e) => setForm((f) => ({ ...f, vigente_desde: e.target.value }))}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="pos-saas-field-label">Vigente hasta</span>
                  <input
                    type="date"
                    className="pos-saas-input"
                    value={form.vigente_hasta}
                    onChange={(e) => setForm((f) => ({ ...f, vigente_hasta: e.target.value }))}
                  />
                </label>
              </div>

              <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
                />
                Activo
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setFormOpen(false);
                  setEditingId(null);
                }}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void guardar()}
                disabled={saving}
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={aBorrar != null}
        title="Eliminar descuento"
        description={
          aBorrar
            ? `¿Eliminar el descuento «${aBorrar.nombre}»? Esta acción también borra su historial de aplicaciones.`
            : ""
        }
        confirmLabel="Eliminar"
        variant="danger"
        onCancel={() => setABorrar(null)}
        onConfirm={() => void confirmarBorrar()}
      />
    </div>
  );
}
