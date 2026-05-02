import { useCallback, useEffect, useState } from "react";
import {
  createCompra,
  fetchCompras,
  fetchProductos,
  fetchProveedores,
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

export function ComprasPage() {
  const [compras, setCompras] = useState<unknown[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [proveedorId, setProveedorId] = useState<number | "">("");
  const [proveedorNombreLibre, setProveedorNombreLibre] = useState("");
  const [notas, setNotas] = useState("");
  const [referencia, setReferencia] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [c, p, pr] = await Promise.all([fetchCompras(), fetchProductos(), fetchProveedores()]);
      setCompras(c as unknown[]);
      setProductos(p);
      setProveedores(pr);
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOkMsg(null);
    const built: Record<string, unknown>[] = [];
    for (const ln of lineas) {
      const cant = Number(ln.cantidad);
      const costo =
        ln.costo_unitario === "" ? NaN : Number(ln.costo_unitario);
      if (!Number.isFinite(cant) || cant <= 0 || !Number.isFinite(costo) || costo < 0) {
        setError("Revisá cantidad y costo en cada línea");
        return;
      }
      if (ln.modo === "nuevo") {
        const pv =
          ln.nuevo_precio_venta === "" ? NaN : Number(ln.nuevo_precio_venta);
        if (!ln.nuevo_nombre.trim() || !Number.isFinite(pv)) {
          setError("Producto nuevo: nombre y precio de venta obligatorios");
          return;
        }
        built.push({
          cantidad: cant,
          costo_unitario: costo,
          actualizar_precios: ln.actualizar_precios,
          precio_venta_lista:
            ln.precio_venta_lista === "" ? undefined : Number(ln.precio_venta_lista),
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
          precio_venta_lista:
            ln.precio_venta_lista === "" ? undefined : Number(ln.precio_venta_lista),
        });
      }
    }

    setError(null);
    try {
      await createCompra({
        proveedor_id: proveedorId === "" ? undefined : proveedorId,
        proveedor_nombre:
          proveedorId === "" && proveedorNombreLibre.trim()
            ? proveedorNombreLibre.trim()
            : undefined,
        notas: notas.trim() || null,
        referencia: referencia.trim() || null,
        lineas: built,
      });
      setOkMsg("Compra registrada; stock y movimientos ENTRADA actualizados.");
      setProveedorId("");
      setProveedorNombreLibre("");
      setNotas("");
      setReferencia("");
      setLineas([lineaVacia()]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar compra");
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
        <h2 className="card-title">Nueva compra a proveedor</h2>
        <p className="hint">
          Registrá costos: actualiza stock (ENTRADA), opcionalmente precio de compra y lista de venta.
          Podés dar de alta productos nuevos en la misma operación.
        </p>
        <form className="form" onSubmit={onSubmit}>
          <div className="grid-2">
            <label className="field">
              <span>Proveedor guardado</span>
              <select
                value={proveedorId === "" ? "" : String(proveedorId)}
                onChange={(e) =>
                  setProveedorId(e.target.value === "" ? "" : Number(e.target.value))
                }
              >
                <option value="">— O nombre libre abajo —</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>O nombre proveedor (texto libre)</span>
              <input
                value={proveedorNombreLibre}
                onChange={(e) => setProveedorNombreLibre(e.target.value)}
                disabled={proveedorId !== ""}
                placeholder="Si no elegiste lista"
              />
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Referencia pedido / remito</span>
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </label>
            <label className="field">
              <span>Notas</span>
              <input value={notas} onChange={(e) => setNotas(e.target.value)} />
            </label>
          </div>

          <div className="lineas-head">
            <span className="field-label-strong">Líneas de compra</span>
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
                    onChange={(e) =>
                      setLinea(i, { modo: e.target.value as Modo })
                    }
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
                      onChange={(e) =>
                        setLinea(i, { producto_id: Number(e.target.value) || 0 })
                      }
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
                          costo_unitario:
                            e.target.value === "" ? "" : Number(e.target.value),
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
                          nuevo_precio_venta:
                            e.target.value === "" ? "" : Number(e.target.value),
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
                    <span>Cantidad comprada</span>
                    <input
                      type="number"
                      min={1}
                      value={ln.cantidad}
                      onChange={(e) => setLinea(i, { cantidad: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span>Costo unit. compra</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={ln.costo_unitario}
                      onChange={(e) =>
                        setLinea(i, {
                          costo_unitario:
                            e.target.value === "" ? "" : Number(e.target.value),
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
                <span>
                  Actualizar precio compra (y opcional lista venta) según esta línea
                </span>
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
                        precio_venta_lista:
                          e.target.value === "" ? "" : Number(e.target.value),
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
              Registrar compra
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Historial de compras</h2>
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : compras.length === 0 ? (
          <p className="muted">Sin compras registradas.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Total</th>
                  <th>Ref.</th>
                </tr>
              </thead>
              <tbody>
                {(compras as Record<string, unknown>[]).map((c) => (
                  <tr key={String(c.id)}>
                    <td className="mono">{String(c.fecha)}</td>
                    <td>
                      {String(c.proveedor_nombre_ref ?? c.proveedor_nombre ?? "—")}
                    </td>
                    <td>{Number(c.total).toFixed(2)}</td>
                    <td>{c.referencia ? String(c.referencia) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
