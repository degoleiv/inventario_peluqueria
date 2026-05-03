import { useCallback, useEffect, useState } from "react";
import {
  createPedidoProveedor,
  createProveedor,
  fetchPedidosProveedores,
  fetchProductos,
  fetchProveedores,
  updatePedidoProveedorMeta,
  type PedidoProveedor,
  type Producto,
  type Proveedor,
} from "../api";

type Modo = "existente" | "nuevo";

type Linea = {
  modo: Modo;
  producto_id: number;
  cantidad: number;
  costo_unitario: number | "";
  actualizar_precios: boolean;
  precio_venta_lista: number | "";
  nuevo_nombre: string;
  nuevo_precio_venta: number | "";
  nuevo_codigo: string;
};

const lineaVacia = (): Linea => ({
  modo: "existente",
  producto_id: 0,
  cantidad: 1,
  costo_unitario: "",
  actualizar_precios: true,
  precio_venta_lista: "",
  nuevo_nombre: "",
  nuevo_precio_venta: "",
  nuevo_codigo: "",
});

function labelIndicador(k: string | undefined): string {
  switch (k) {
    case "pagado":
      return "Pagado";
    case "en_descuento":
      return "En ventana con descuento";
    case "fuera_descuento_en_plazo":
      return "Sin descuento, aún en plazo";
    case "vencido":
      return "Vencido";
    case "sin_plazos_configurados":
      return "Sin fechas de pago";
    case "sin_descuento_configurado":
      return "Solo plazo general";
    case "pendiente":
      return "Pendiente";
    default:
      return k ?? "—";
  }
}

export function PedidosProveedoresPage() {
  const [pedidos, setPedidos] = useState<PedidoProveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [provNombre, setProvNombre] = useState("");
  const [provTel, setProvTel] = useState("");
  const [provEmail, setProvEmail] = useState("");
  const [provNotas, setProvNotas] = useState("");
  const [provBusy, setProvBusy] = useState(false);

  const [proveedorId, setProveedorId] = useState<number | "">("");
  const [fechaPedido, setFechaPedido] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaPagoDesc, setFechaPagoDesc] = useState("");
  const [fechaPagoMax, setFechaPagoMax] = useState("");
  const [valorDesc, setValorDesc] = useState<number | "">("");
  const [valorSinDesc, setValorSinDesc] = useState<number | "">("");
  const [estadoNuevo, setEstadoNuevo] = useState("pendiente");
  const [notas, setNotas] = useState("");
  const [referencia, setReferencia] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);

  const [edit, setEdit] = useState<PedidoProveedor | null>(null);
  const [editFecha, setEditFecha] = useState("");
  const [editFd, setEditFd] = useState("");
  const [editFm, setEditFm] = useState("");
  const [editVd, setEditVd] = useState<number | "">("");
  const [editVs, setEditVs] = useState<number | "">("");
  const [editEstado, setEditEstado] = useState("pendiente");
  const [editNotas, setEditNotas] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [p, pr, prod] = await Promise.all([
        fetchPedidosProveedores(),
        fetchProveedores(),
        fetchProductos(),
      ]);
      setPedidos(p);
      setProveedores(pr);
      setProductos(prod);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function setLinea(i: number, patch: Partial<Linea>) {
    setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function addLinea() {
    setLineas((prev) => [...prev, lineaVacia()]);
  }

  function removeLinea(i: number) {
    setLineas((prev) => prev.filter((_, j) => j !== i));
  }

  async function onProveedorSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!provNombre.trim()) {
      setError("Nombre del proveedor es obligatorio");
      return;
    }
    setProvBusy(true);
    setError(null);
    try {
      await createProveedor({
        nombre: provNombre.trim(),
        telefono: provTel.trim() || null,
        email: provEmail.trim() || null,
        notas: provNotas.trim() || null,
      });
      setOkMsg("Proveedor guardado. Podés asignarlo al pedido abajo.");
      setProvNombre("");
      setProvTel("");
      setProvEmail("");
      setProvNotas("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear proveedor");
    } finally {
      setProvBusy(false);
    }
  }

  async function onPedidoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOkMsg(null);
    if (proveedorId === "") {
      setError("Elegí un proveedor de la lista (formulario separado arriba para altas nuevas).");
      return;
    }
    const built: Record<string, unknown>[] = [];
    for (const ln of lineas) {
      const cant = Number(ln.cantidad);
      const costo = ln.costo_unitario === "" ? NaN : Number(ln.costo_unitario);
      if (!Number.isFinite(cant) || cant <= 0 || !Number.isFinite(costo) || costo < 0) {
        setError("Revisá cantidad y costo en cada línea");
        return;
      }
      if (ln.modo === "nuevo") {
        const pv = ln.nuevo_precio_venta === "" ? NaN : Number(ln.nuevo_precio_venta);
        if (!ln.nuevo_nombre.trim() || !Number.isFinite(pv)) {
          setError("Producto nuevo: nombre y precio de venta obligatorios");
          return;
        }
        built.push({
          cantidad: cant,
          costo_unitario: costo,
          actualizar_precios: ln.actualizar_precios,
          precio_venta_lista: ln.precio_venta_lista === "" ? undefined : Number(ln.precio_venta_lista),
          nuevo_producto: {
            nombre: ln.nuevo_nombre.trim(),
            codigo_barras: ln.nuevo_codigo.trim() || null,
            precio_venta: pv,
            marca: null,
          },
        });
      } else {
        if (!ln.producto_id) {
          setError("Seleccioná un producto en cada línea existente");
          return;
        }
        built.push({
          producto_id: ln.producto_id,
          cantidad: cant,
          costo_unitario: costo,
          actualizar_precios: ln.actualizar_precios,
          precio_venta_lista: ln.precio_venta_lista === "" ? undefined : Number(ln.precio_venta_lista),
        });
      }
    }

    setError(null);
    try {
      await createPedidoProveedor({
        proveedor_id: proveedorId,
        fecha: fechaPedido,
        fecha_pago_con_descuento: fechaPagoDesc.trim() || null,
        fecha_pago_maxima: fechaPagoMax.trim() || null,
        valor_pago_con_descuento: valorDesc === "" ? null : Number(valorDesc),
        valor_pago_sin_descuento: valorSinDesc === "" ? null : Number(valorSinDesc),
        estado: estadoNuevo,
        notas: notas.trim() || null,
        referencia: referencia.trim() || null,
        lineas: built,
      });
      setOkMsg("Pedido registrado; stock actualizado (ENTRADA).");
      setProveedorId("");
      setFechaPedido(new Date().toISOString().slice(0, 10));
      setFechaPagoDesc("");
      setFechaPagoMax("");
      setValorDesc("");
      setValorSinDesc("");
      setEstadoNuevo("pendiente");
      setNotas("");
      setReferencia("");
      setLineas([lineaVacia()]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar pedido");
    }
  }

  function openEdit(p: PedidoProveedor) {
    setEdit(p);
    setEditFecha(String(p.fecha).slice(0, 10));
    setEditFd(p.fecha_pago_con_descuento?.slice(0, 10) ?? "");
    setEditFm(p.fecha_pago_maxima?.slice(0, 10) ?? "");
    setEditVd(p.valor_pago_con_descuento ?? "");
    setEditVs(p.valor_pago_sin_descuento ?? "");
    setEditEstado(p.estado ?? "pendiente");
    setEditNotas(p.notas ?? "");
    setEditRef(p.referencia ?? "");
  }

  async function onEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setEditBusy(true);
    setError(null);
    try {
      await updatePedidoProveedorMeta(edit.id, {
        fecha: editFecha,
        fecha_pago_con_descuento: editFd.trim() || null,
        fecha_pago_maxima: editFm.trim() || null,
        valor_pago_con_descuento: editVd === "" ? null : Number(editVd),
        valor_pago_sin_descuento: editVs === "" ? null : Number(editVs),
        estado: editEstado,
        notas: editNotas.trim() || null,
        referencia: editRef.trim() || null,
      });
      setEdit(null);
      setOkMsg("Pedido actualizado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      {okMsg ? (
        <div className="banner" style={{ background: "#e8f5e9", border: "1px solid #c8e6c9" }}>
          {okMsg}
        </div>
      ) : null}

      <section className="card">
        <h2 className="card-title">Proveedores</h2>
        <p className="hint">
          Alta de proveedores en este formulario. Los pedidos se arman aparte y siempre enlazan un
          proveedor ya guardado.
        </p>
        <form className="form" onSubmit={onProveedorSubmit}>
          <div className="grid-2">
            <label className="field">
              <span>Nombre *</span>
              <input value={provNombre} onChange={(e) => setProvNombre(e.target.value)} required />
            </label>
            <label className="field">
              <span>Teléfono</span>
              <input value={provTel} onChange={(e) => setProvTel(e.target.value)} />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={provEmail} onChange={(e) => setProvEmail(e.target.value)} />
            </label>
            <label className="field">
              <span>Notas</span>
              <input value={provNotas} onChange={(e) => setProvNotas(e.target.value)} />
            </label>
          </div>
          <div className="actions">
            <button type="submit" className="btn primary" disabled={provBusy}>
              Guardar proveedor
            </button>
          </div>
        </form>
        {proveedores.length > 0 ? (
          <ul className="muted" style={{ marginTop: "1rem", columns: 2 }}>
            {proveedores.map((p) => (
              <li key={p.id}>
                {p.nombre}
                {p.telefono ? ` · ${p.telefono}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Sin proveedores aún.</p>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Nuevo pedido a proveedor</h2>
        <p className="hint">
          Cada pedido debe tener un proveedor de la lista. Actualiza stock (ENTRADA) y opcionalmente
          precios de compra / venta por línea.
        </p>
        <form className="form" onSubmit={onPedidoSubmit}>
          <div className="grid-2">
            <label className="field">
              <span>Proveedor *</span>
              <select
                value={proveedorId === "" ? "" : String(proveedorId)}
                onChange={(e) =>
                  setProveedorId(e.target.value === "" ? "" : Number(e.target.value))
                }
                required
              >
                <option value="">— Elegir —</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Fecha del pedido *</span>
              <input
                type="date"
                value={fechaPedido}
                onChange={(e) => setFechaPedido(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Fecha límite pago con descuento</span>
              <input type="date" value={fechaPagoDesc} onChange={(e) => setFechaPagoDesc(e.target.value)} />
            </label>
            <label className="field">
              <span>Fecha máxima de pago (sin descuento)</span>
              <input type="date" value={fechaPagoMax} onChange={(e) => setFechaPagoMax(e.target.value)} />
            </label>
            <label className="field">
              <span>Valor a pagar con descuento</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={valorDesc}
                onChange={(e) => setValorDesc(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Valor a pagar sin descuento</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={valorSinDesc}
                onChange={(e) => setValorSinDesc(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Estado</span>
              <select value={estadoNuevo} onChange={(e) => setEstadoNuevo(e.target.value)}>
                <option value="pendiente">Pendiente</option>
                <option value="pagado">Pagado</option>
                <option value="vencido">Vencido</option>
              </select>
            </label>
            <label className="field">
              <span>Referencia / remito</span>
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </label>
            <label className="field">
              <span>Notas</span>
              <input value={notas} onChange={(e) => setNotas(e.target.value)} />
            </label>
          </div>

          <div className="lineas-head">
            <span className="field-label-strong">Líneas del pedido</span>
            <button type="button" className="btn ghost small" onClick={addLinea}>
              + Línea
            </button>
          </div>

          {lineas.map((ln, i) => (
            <div key={i} className="card inner-line">
              <div className="field-row">
                <label className="field">
                  <span>Modo</span>
                  <select
                    value={ln.modo}
                    onChange={(e) => setLinea(i, { modo: e.target.value as Modo })}
                  >
                    <option value="existente">Producto existente</option>
                    <option value="nuevo">Alta producto nuevo</option>
                  </select>
                </label>
              </div>
              {ln.modo === "existente" ? (
                <div className="grid-3 compra-grid">
                  <label className="field">
                    <span>Producto</span>
                    <select
                      value={ln.producto_id || ""}
                      onChange={(e) => setLinea(i, { producto_id: Number(e.target.value) || 0 })}
                    >
                      <option value="">—</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Cantidad</span>
                    <input
                      type="number"
                      min={1}
                      value={ln.cantidad}
                      onChange={(e) => setLinea(i, { cantidad: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span>Costo unit.</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={ln.costo_unitario}
                      onChange={(e) =>
                        setLinea(i, {
                          costo_unitario: e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              ) : (
                <div className="grid-2">
                  <label className="field">
                    <span>Nombre nuevo producto *</span>
                    <input
                      value={ln.nuevo_nombre}
                      onChange={(e) => setLinea(i, { nuevo_nombre: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Precio venta lista *</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={ln.nuevo_precio_venta}
                      onChange={(e) =>
                        setLinea(i, {
                          nuevo_precio_venta: e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Código barras</span>
                    <input
                      value={ln.nuevo_codigo}
                      onChange={(e) => setLinea(i, { nuevo_codigo: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Cantidad</span>
                    <input
                      type="number"
                      min={1}
                      value={ln.cantidad}
                      onChange={(e) => setLinea(i, { cantidad: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span>Costo unit.</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={ln.costo_unitario}
                      onChange={(e) =>
                        setLinea(i, {
                          costo_unitario: e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              )}
              <label className="field inline-check">
                <input
                  type="checkbox"
                  checked={ln.actualizar_precios}
                  onChange={(e) => setLinea(i, { actualizar_precios: e.target.checked })}
                />
                <span>Actualizar precio compra (y opcional lista venta) según esta línea</span>
              </label>
              {ln.modo === "existente" ? (
                <label className="field">
                  <span>Nuevo precio venta lista (opcional)</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={ln.precio_venta_lista}
                    onChange={(e) =>
                      setLinea(i, {
                        precio_venta_lista: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                  />
                </label>
              ) : null}
              {lineas.length > 1 ? (
                <button type="button" className="btn ghost small" onClick={() => removeLinea(i)}>
                  Quitar línea
                </button>
              ) : null}
            </div>
          ))}

          <div className="actions">
            <button type="submit" className="btn primary">
              Registrar pedido
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Historial de pedidos</h2>
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : pedidos.length === 0 ? (
          <p className="muted">Sin pedidos registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha pedido</th>
                  <th>Proveedor</th>
                  <th>Total ítems</th>
                  <th>Estado</th>
                  <th>Indicador pago</th>
                  <th>Ref.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{String(c.fecha).slice(0, 10)}</td>
                    <td>{c.proveedor_nombre_ref ?? c.proveedor_nombre ?? "—"}</td>
                    <td>{Number(c.total).toFixed(2)}</td>
                    <td>{c.estado ?? "—"}</td>
                    <td>{labelIndicador(c.indicador_pago)}</td>
                    <td>{c.referencia ?? "—"}</td>
                    <td>
                      <button type="button" className="btn ghost small" onClick={() => openEdit(c)}>
                        Editar plazos / montos
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {edit ? (
        <div
          className="drawer-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          role="dialog"
          aria-modal
          aria-labelledby="edit-pedido-title"
        >
          <div
            className="card"
            style={{ maxWidth: 520, width: "100%", maxHeight: "90vh", overflow: "auto" }}
          >
            <h3 id="edit-pedido-title" className="card-title">
              Editar pedido #{edit.id}
            </h3>
            <p className="muted small">
              Solo fechas de pago, montos acordados, estado y notas. Las líneas y el proveedor no se
              modifican aquí.
            </p>
            <form className="form" onSubmit={onEditSave}>
              <label className="field">
                <span>Fecha del pedido</span>
                <input type="date" value={editFecha} onChange={(e) => setEditFecha(e.target.value)} required />
              </label>
              <label className="field">
                <span>Fecha pago con descuento</span>
                <input type="date" value={editFd} onChange={(e) => setEditFd(e.target.value)} />
              </label>
              <label className="field">
                <span>Fecha máxima de pago</span>
                <input type="date" value={editFm} onChange={(e) => setEditFm(e.target.value)} />
              </label>
              <label className="field">
                <span>Valor con descuento</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={editVd}
                  onChange={(e) => setEditVd(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Valor sin descuento</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={editVs}
                  onChange={(e) => setEditVs(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Estado</span>
                <select value={editEstado} onChange={(e) => setEditEstado(e.target.value)}>
                  <option value="pendiente">Pendiente</option>
                  <option value="pagado">Pagado</option>
                  <option value="vencido">Vencido</option>
                </select>
              </label>
              <label className="field">
                <span>Referencia</span>
                <input value={editRef} onChange={(e) => setEditRef(e.target.value)} />
              </label>
              <label className="field">
                <span>Notas</span>
                <input value={editNotas} onChange={(e) => setEditNotas(e.target.value)} />
              </label>
              <div className="actions">
                <button type="button" className="btn ghost" onClick={() => setEdit(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={editBusy}>
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
