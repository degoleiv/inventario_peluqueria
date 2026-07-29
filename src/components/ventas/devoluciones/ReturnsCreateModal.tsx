import { useCallback, useEffect, useState } from "react";
import {
  fetchVenta,
  fetchVentaLineasDevueltas,
  fetchDevolucionMotivos,
  createDevolucion,
} from "../../../api";
import type {
  VentaDetalle,
  VentaLineasDevueltas,
  DevolucionMotivo,
} from "../../../api";
import { useToast } from "../../../context/ToastContext";
import { formatCurrency } from "./utils";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

type ProductLine = {
  venta_linea_id: number;
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
  max_qty: number;
  precio_unitario: number;
  checked: boolean;
};

type ServiceLine = {
  venta_servicio_id: number;
  servicio_nombre: string;
  profesional_nombre: string | null;
  cantidad: number;
  max_qty: number;
  valor_unitario: number;
  checked: boolean;
};

export function ReturnsCreateModal({ open, onClose, onCreated }: Props) {
  const toast = useToast();

  // ── Step navigation ──
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ── Step 1 state ──
  const [ventaIdInput, setVentaIdInput] = useState("");
  const [ventaDetalle, setVentaDetalle] = useState<VentaDetalle | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ── Step 2 state ──
  const [devueltoMap, setDevueltoMap] = useState<VentaLineasDevueltas | null>(null);
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [step2Loading, setStep2Loading] = useState(false);

  // ── Step 3 state ──
  const [motivos, setMotivos] = useState<DevolucionMotivo[] | null>(null);
  const [motivoId, setMotivoId] = useState("");
  const [notas, setNotas] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Reset everything when modal opens/closes ──
  useEffect(() => {
    if (!open) {
      setStep(1);
      setVentaIdInput("");
      setVentaDetalle(null);
      setSearchLoading(false);
      setSearchError(null);
      setDevueltoMap(null);
      setProductLines([]);
      setServiceLines([]);
      setStep2Loading(false);
      setMotivoId("");
      setNotas("");
      setCreating(false);
    }
  }, [open]);

  // ── Escape to close ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // ── Step 1: Search sale ──
  const handleSearch = useCallback(async () => {
    const id = Number(ventaIdInput);
    if (!id || id <= 0) {
      setSearchError("Ingresá un ID de venta válido.");
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    setVentaDetalle(null);
    try {
      const detail = await fetchVenta(id);
      if (detail.estado === "cancelada") {
        setSearchError("Esta venta está anulada y no permite devoluciones.");
        return;
      }
      setVentaDetalle(detail);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "No se encontró la venta.";
      setSearchError(msg);
    } finally {
      setSearchLoading(false);
    }
  }, [ventaIdInput]);

  // ── Transition to Step 2: fetch devuelto map & build lines ──
  const goToStep2 = useCallback(async () => {
    if (!ventaDetalle) return;
    setStep2Loading(true);
    try {
      const devuelto = await fetchVentaLineasDevueltas(ventaDetalle.id);
      setDevueltoMap(devuelto);

      // Build product lines
      const pLines: ProductLine[] = ventaDetalle.lineas.map((l) => {
        const alreadyReturned = devuelto.producto[l.id] ?? 0;
        const maxQty = l.cantidad - alreadyReturned;
        return {
          venta_linea_id: l.id,
          producto_id: l.producto_id,
          producto_nombre: l.producto_nombre,
          cantidad: maxQty > 0 ? 1 : 0,
          max_qty: maxQty,
          precio_unitario: l.precio_unitario,
          checked: false,
        };
      });
      setProductLines(pLines);

      // Build service lines
      const sLines: ServiceLine[] = (ventaDetalle.servicios ?? []).map((s) => {
        const alreadyReturned = devuelto.servicio[s.id] ?? 0;
        const maxQty = s.cantidad - alreadyReturned;
        return {
          venta_servicio_id: s.id,
          servicio_nombre: s.servicio_nombre,
          profesional_nombre: s.profesional_nombre ?? null,
          cantidad: maxQty > 0 ? 1 : 0,
          max_qty: maxQty,
          valor_unitario: s.valor_unitario,
          checked: false,
        };
      });
      setServiceLines(sLines);

      setStep(2);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al cargar datos de la venta.";
      toast(msg, "error");
    } finally {
      setStep2Loading(false);
    }
  }, [ventaDetalle, toast]);

  // ── Transition to Step 3: fetch motivos if needed ──
  const goToStep3 = useCallback(async () => {
    if (!motivos) {
      try {
        const m = await fetchDevolucionMotivos();
        setMotivos(m);
      } catch {
        toast("Error al cargar motivos.", "error");
        return;
      }
    }
    setStep(3);
  }, [motivos, toast]);

  // ── Product line helpers ──
  const toggleProduct = (idx: number) => {
    setProductLines((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, checked: !p.checked } : p))
    );
  };

  const setProductQty = (idx: number, qty: number) => {
    setProductLines((prev) =>
      prev.map((p, i) =>
        i === idx ? { ...p, cantidad: Math.max(1, Math.min(qty, p.max_qty)) } : p
      )
    );
  };

  // ── Service line helpers ──
  const toggleService = (idx: number) => {
    setServiceLines((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, checked: !s.checked } : s))
    );
  };

  const setServiceQty = (idx: number, qty: number) => {
    setServiceLines((prev) =>
      prev.map((s, i) =>
        i === idx ? { ...s, cantidad: Math.max(1, Math.min(qty, s.max_qty)) } : s
      )
    );
  };

  // ── Computed values ──
  const selectedProducts = productLines.filter((p) => p.checked);
  const selectedServices = serviceLines.filter((s) => s.checked);
  const hasSelection = selectedProducts.length > 0 || selectedServices.length > 0;

  const runningTotal =
    selectedProducts.reduce((sum, p) => sum + p.cantidad * p.precio_unitario, 0) +
    selectedServices.reduce((sum, s) => sum + s.cantidad * s.valor_unitario, 0);

  // ── Step 3: create ──
  const selectedMotivo = motivos?.find((m) => String(m.id) === motivoId);

  const handleCreate = useCallback(async () => {
    if (!ventaDetalle || !selectedMotivo) return;
    setCreating(true);
    try {
      await createDevolucion({
        venta_id: ventaDetalle.id,
        motivo: selectedMotivo.nombre,
        notas: notas.trim() || null,
        productos: selectedProducts.map((p) => ({
          venta_linea_id: p.venta_linea_id,
          producto_id: p.producto_id,
          cantidad: p.cantidad,
          precio_unitario: p.precio_unitario,
          motivo_id: selectedMotivo.id,
        })),
        servicios:
          selectedServices.length > 0
            ? selectedServices.map((s) => ({
                venta_servicio_id: s.venta_servicio_id,
                servicio_nombre: s.servicio_nombre,
                cantidad: s.cantidad,
                valor_unitario: s.valor_unitario,
                motivo_id: selectedMotivo.id,
              }))
            : undefined,
      });
      toast("Devolución creada correctamente.", "success");
      onCreated();
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Error al crear la devolución.";
      toast(msg, "error");
    } finally {
      setCreating(false);
    }
  }, [ventaDetalle, selectedMotivo, notas, selectedProducts, selectedServices, toast, onCreated, onClose]);

  // ── Sale summary helper ──
  const totalItems = ventaDetalle
    ? (ventaDetalle.lineas?.length ?? 0) + (ventaDetalle.servicios?.length ?? 0)
    : 0;

  if (!open) return null;

  return (
    <div className="returns-create-root" role="dialog" aria-modal="true">
      <div className="returns-create-backdrop" onClick={onClose} />
      <div className="returns-create-panel">
        <header className="returns-create-header">
          <h2>Nueva devolución</h2>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <div className="returns-create-body">
          {/* ════════ Step 1: Select Sale ════════ */}
          {step === 1 && (
            <section className="returns-step">
              <h3 className="returns-step__title">Paso 1 — Seleccionar venta</h3>

              <div className="returns-step__row">
                <label htmlFor="rc-venta-id" className="returns-step__label">
                  ID de venta
                </label>
                <input
                  id="rc-venta-id"
                  type="number"
                  min={1}
                  className="input"
                  placeholder="Ej: 142"
                  value={ventaIdInput}
                  onChange={(e) => {
                    setVentaIdInput(e.target.value);
                    setSearchError(null);
                    setVentaDetalle(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                />
                <button
                  type="button"
                  className="btn primary small"
                  disabled={searchLoading || !ventaIdInput}
                  onClick={handleSearch}
                >
                  {searchLoading ? "Buscando…" : "Buscar"}
                </button>
              </div>

              {searchError && (
                <p className="returns-step__error" role="alert">
                  {searchError}
                </p>
              )}

              {ventaDetalle && (
                <div className="returns-step__summary">
                  <h4>Venta encontrada</h4>
                  <dl className="returns-dl">
                    <dt>ID</dt>
                    <dd>#{ventaDetalle.id}</dd>
                    <dt>Cliente</dt>
                    <dd>{ventaDetalle.cliente_nombre?.trim() || "Cliente ocasional"}</dd>
                    <dt>Fecha</dt>
                    <dd>{new Date(ventaDetalle.fecha).toLocaleDateString("es")}</dd>
                    <dt>Total</dt>
                    <dd>{formatCurrency(Number(ventaDetalle.total))}</dd>
                    <dt>Items</dt>
                    <dd>{totalItems}</dd>
                  </dl>
                </div>
              )}

              <div className="returns-step__actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={!ventaDetalle || step2Loading}
                  onClick={goToStep2}
                >
                  {step2Loading ? "Cargando…" : "Siguiente"}
                </button>
              </div>
            </section>
          )}

          {/* ════════ Step 2: Select Items ════════ */}
          {step === 2 && (
            <section className="returns-step">
              <h3 className="returns-step__title">Paso 2 — Seleccionar ítems</h3>

              {/* Products */}
              {productLines.length > 0 && (
                <div className="returns-step__group">
                  <h4>Productos</h4>
                  <table className="returns-table">
                    <thead>
                      <tr>
                        <th />
                        <th>Producto</th>
                        <th>Disponible</th>
                        <th>Cantidad</th>
                        <th>Precio unit.</th>
                        <th>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productLines.map((p, idx) => {
                        const disabled = p.max_qty <= 0;
                        return (
                          <tr key={p.venta_linea_id} className={disabled ? "returns-row--disabled" : ""}>
                            <td>
                              <input
                                type="checkbox"
                                checked={p.checked}
                                disabled={disabled}
                                onChange={() => toggleProduct(idx)}
                              />
                            </td>
                            <td>{p.producto_nombre}</td>
                            <td>{p.max_qty}</td>
                            <td>
                              <input
                                type="number"
                                className="input input--sm"
                                min={1}
                                max={p.max_qty}
                                value={p.cantidad}
                                disabled={disabled || !p.checked}
                                onChange={(e) => setProductQty(idx, Number(e.target.value))}
                              />
                            </td>
                            <td>{formatCurrency(p.precio_unitario)}</td>
                            <td>
                              {p.checked
                                ? formatCurrency(p.cantidad * p.precio_unitario)
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Services */}
              {serviceLines.length > 0 && (
                <div className="returns-step__group">
                  <h4>Servicios</h4>
                  <table className="returns-table">
                    <thead>
                      <tr>
                        <th />
                        <th>Servicio</th>
                        <th>Profesional</th>
                        <th>Disponible</th>
                        <th>Cantidad</th>
                        <th>Valor unit.</th>
                        <th>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceLines.map((s, idx) => {
                        const disabled = s.max_qty <= 0;
                        return (
                          <tr key={s.venta_servicio_id} className={disabled ? "returns-row--disabled" : ""}>
                            <td>
                              <input
                                type="checkbox"
                                checked={s.checked}
                                disabled={disabled}
                                onChange={() => toggleService(idx)}
                              />
                            </td>
                            <td>{s.servicio_nombre}</td>
                            <td>{s.profesional_nombre ?? "—"}</td>
                            <td>{s.max_qty}</td>
                            <td>
                              <input
                                type="number"
                                className="input input--sm"
                                min={1}
                                max={s.max_qty}
                                value={s.cantidad}
                                disabled={disabled || !s.checked}
                                onChange={(e) => setServiceQty(idx, Number(e.target.value))}
                              />
                            </td>
                            <td>{formatCurrency(s.valor_unitario)}</td>
                            <td>
                              {s.checked
                                ? formatCurrency(s.cantidad * s.valor_unitario)
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Running total */}
              <div className="returns-step__total">
                <strong>Total a devolver:</strong>{" "}
                <span className="returns-step__total-value">{formatCurrency(runningTotal)}</span>
              </div>

              <div className="returns-step__actions">
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setStep(1)}
                >
                  Atrás
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!hasSelection}
                  onClick={goToStep3}
                >
                  Siguiente
                </button>
              </div>
            </section>
          )}

          {/* ════════ Step 3: Reason & Confirm ════════ */}
          {step === 3 && (
            <section className="returns-step">
              <h3 className="returns-step__title">Paso 3 — Motivo y confirmación</h3>

              <div className="returns-step__field">
                <label htmlFor="rc-motivo" className="returns-step__label">
                  Motivo <span className="required">*</span>
                </label>
                <select
                  id="rc-motivo"
                  className="input"
                  value={motivoId}
                  onChange={(e) => setMotivoId(e.target.value)}
                >
                  <option value="">Seleccionar motivo…</option>
                  {(motivos ?? [])
                    .filter((m) => m.activo)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                      </option>
                    ))}
                </select>
              </div>

              <div className="returns-step__field">
                <label htmlFor="rc-notas" className="returns-step__label">
                  Notas (opcional)
                </label>
                <textarea
                  id="rc-notas"
                  className="input"
                  rows={3}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Observaciones adicionales…"
                />
              </div>

              {/* Summary */}
              <div className="returns-step__confirm-summary">
                <h4>Resumen</h4>
                {selectedProducts.length > 0 && (
                  <ul className="returns-confirm-list">
                    {selectedProducts.map((p) => (
                      <li key={p.venta_linea_id}>
                        {p.producto_nombre} x{p.cantidad} — {formatCurrency(p.cantidad * p.precio_unitario)}
                      </li>
                    ))}
                  </ul>
                )}
                {selectedServices.length > 0 && (
                  <ul className="returns-confirm-list">
                    {selectedServices.map((s) => (
                      <li key={s.venta_servicio_id}>
                        {s.servicio_nombre}
                        {s.profesional_nombre ? ` (${s.profesional_nombre})` : ""} x{s.cantidad} — {formatCurrency(s.cantidad * s.valor_unitario)}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="returns-step__total">
                  <strong>Total:</strong>{" "}
                  <span className="returns-step__total-value">{formatCurrency(runningTotal)}</span>
                </p>
              </div>

              <div className="returns-step__actions">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={creating}
                  onClick={onClose}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={creating}
                  onClick={() => setStep(2)}
                >
                  Atrás
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!motivoId || creating}
                  onClick={handleCreate}
                >
                  {creating ? "Creando…" : "Crear devolución"}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
