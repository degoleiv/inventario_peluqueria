import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  createProducto,
  deleteProducto,
  fetchProductos,
  lookupBarcode,
  registrarAjusteStock,
  updateProducto,
  type LookupManual,
  type LookupOk,
  type Producto,
} from "../api";
import { ContextMenu, type ContextMenuItem } from "../components/ContextMenu";
import {
  ProductoCatalogoForm,
  catalogoFieldsToCreateBody,
  type ProductoCatalogoFields,
} from "../components/ProductoCatalogoForm";
import { Drawer } from "../components/Drawer";
import { useToast } from "../context/ToastContext";
import { SubNav } from "../components/SubNav";
import { INVENTARIO_TABS, readLastTab, type InventarioTab } from "../lib/moduleRoutes";

function labelFuenteLookup(fuente: string) {
  if (fuente === "inventario") return "Datos desde tu inventario local";
  if (fuente === "cache") return "Datos desde caché (consulta previa)";
  if (fuente === "openfoodfacts") return "Datos desde Open Food Facts";
  if (fuente === "openbeautyfacts") return "Datos desde Open Beauty Facts (cosmética / peluquería)";
  if (fuente === "ean_search") return "Datos desde EAN-Search.org (token)";
  return "Datos externos";
}

export function InventarioPage() {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const toast = useToast();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [marca, setMarca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [imagenUrl, setImagenUrl] = useState("");
  const [stock, setStock] = useState<number | "">(0);
  const [precioCompra, setPrecioCompra] = useState<number | "">("");
  const [precioVenta, setPrecioVenta] = useState<number | "">("");
  const [stockMinimo, setStockMinimo] = useState<number | "">("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [ajustePid, setAjustePid] = useState(0);
  const [ajusteReal, setAjusteReal] = useState<number | "">("");
  const [ajusteMotivo, setAjusteMotivo] = useState("");
  const [ajusteMsg, setAjusteMsg] = useState<string | null>(null);
  const [priceEdit, setPriceEdit] = useState<{ id: number; draft: string } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; p: Producto } | null>(null);
  const formDrawerRef = useRef<HTMLFormElement>(null);
  const codigoRef = useRef(codigo);

  codigoRef.current = codigo;

  const aplicarRespuestaBarcode = useCallback((res: LookupOk | LookupManual) => {
    if (res.ok) {
      const d = res.data;
      setNombre(d.nombre);
      setMarca(d.marca ?? "");
      setCategoria(d.categoria ?? "");
      setDescripcion(d.descripcion ?? "");
      setImagenUrl(d.imagen_url ?? "");
      setLookupHint(labelFuenteLookup(d.fuente));
    } else {
      setLookupHint(
        "Sin datos automáticos (ni en Open Food Facts, Open Beauty Facts ni EAN-Search). Completá el producto a mano; opcional: variable EAN_SEARCH_ORG_TOKEN en el servidor."
      );
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const rows = await fetchProductos();
      setProductos(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar productos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);


  /** Al cargar un código nuevo (≥8 caracteres), consulta automática tras un breve debounce. */
  useEffect(() => {
    const code = codigo.trim();
    if (editingId != null) return;
    if (code.length < 8) return;

    const t = window.setTimeout(async () => {
      if (codigoRef.current.trim() !== code) return;
      setLookupLoading(true);
      setLookupHint(null);
      try {
        const res = await lookupBarcode(code);
        if (codigoRef.current.trim() !== code) return;
        aplicarRespuestaBarcode(res);
      } catch {
        if (codigoRef.current.trim() === code) {
          setLookupHint("No se pudo consultar las APIs (¿sin internet o servidor?). Probá de nuevo.");
        }
      } finally {
        if (codigoRef.current.trim() === code) {
          setLookupLoading(false);
        }
      }
    }, 550);

    return () => clearTimeout(t);
  }, [codigo, editingId, aplicarRespuestaBarcode]);

  async function onBuscarCodigo() {
    setLookupHint(null);
    if (!codigo.trim()) {
      setLookupHint("Ingresá o escaneá un código de barras");
      return;
    }
    setLookupLoading(true);
    try {
      const res = await lookupBarcode(codigo.trim());
      aplicarRespuestaBarcode(res);
    } catch {
      setLookupHint("No se pudo consultar. Completá manualmente.");
    } finally {
      setLookupLoading(false);
    }
  }

  function resetForm() {
    setCodigo("");
    setNombre("");
    setMarca("");
    setCategoria("");
    setDescripcion("");
    setImagenUrl("");
    setStock(0);
    setPrecioCompra("");
    setPrecioVenta("");
    setStockMinimo("");
    setFechaVencimiento("");
    setLookupHint(null);
    setEditingId(null);
    setCreatingNew(false);
  }

  const drawerOpen = editingId !== null || creatingNew;

  function openNuevoProducto() {
    resetForm();
    setCreatingNew(true);
  }

  function cerrarDrawer() {
    resetForm();
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        formDrawerRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const catalogoValues: ProductoCatalogoFields = {
    codigo,
    nombre,
    marca,
    categoria,
    descripcion,
    imagenUrl,
    stock,
    precioCompra,
    precioVenta,
    stockMinimo,
    fechaVencimiento,
  };

  function patchCatalogo(patch: Partial<ProductoCatalogoFields>) {
    if (patch.codigo !== undefined) setCodigo(patch.codigo);
    if (patch.nombre !== undefined) setNombre(patch.nombre);
    if (patch.marca !== undefined) setMarca(patch.marca);
    if (patch.categoria !== undefined) setCategoria(patch.categoria);
    if (patch.descripcion !== undefined) setDescripcion(patch.descripcion);
    if (patch.imagenUrl !== undefined) setImagenUrl(patch.imagenUrl);
    if (patch.stock !== undefined) setStock(patch.stock);
    if (patch.precioCompra !== undefined) setPrecioCompra(patch.precioCompra);
    if (patch.precioVenta !== undefined) setPrecioVenta(patch.precioVenta);
    if (patch.stockMinimo !== undefined) setStockMinimo(patch.stockMinimo);
    if (patch.fechaVencimiento !== undefined) setFechaVencimiento(patch.fechaVencimiento);
  }

  async function onGuardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    const body = catalogoFieldsToCreateBody(catalogoValues);
    setError(null);
    try {
      if (editingId != null) {
        await updateProducto(editingId, body);
      } else {
        await createProducto(body);
      }
      toast(editingId != null ? "Producto actualizado" : "Producto creado", "success");
      cerrarDrawer();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  function onEditar(p: Producto) {
    setCreatingNew(false);
    setEditingId(p.id);
    setCodigo(p.codigo_barras ?? "");
    setNombre(p.nombre);
    setMarca(p.marca ?? "");
    setCategoria(p.categoria ?? "");
    setDescripcion(p.descripcion ?? "");
    setImagenUrl(p.imagen_url ?? "");
    setStock(p.stock);
    setPrecioCompra(p.precio_compra ?? "");
    setPrecioVenta(p.precio_venta ?? p.precio ?? "");
    setStockMinimo(p.stock_minimo ?? "");
    setFechaVencimiento(p.fecha_vencimiento?.slice(0, 10) ?? "");
    setLookupHint(null);
  }

  async function onAjusteFisico(e: React.FormEvent) {
    e.preventDefault();
    if (ajustePid <= 0 || ajusteReal === "") return;
    setAjusteMsg(null);
    setError(null);
    try {
      await registrarAjusteStock({
        producto_id: ajustePid,
        stock_real: Number(ajusteReal),
        motivo: ajusteMotivo.trim() || null,
      });
      setAjusteMsg("Ajuste registrado.");
      setAjusteReal("");
      setAjusteMotivo("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en ajuste");
    }
  }

  async function duplicarProducto(p: Producto) {
    setError(null);
    try {
      await createProducto({
        codigo_barras: null,
        nombre: `${p.nombre} (copia)`,
        marca: p.marca,
        categoria: p.categoria,
        descripcion: p.descripcion,
        imagen_url: p.imagen_url,
        stock: 0,
        precio_compra: p.precio_compra,
        precio_venta: p.precio_venta ?? p.precio,
        stock_minimo: p.stock_minimo,
        fecha_vencimiento: p.fecha_vencimiento,
      });
      toast("Producto duplicado", "success");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al duplicar");
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  function startPriceEdit(p: Producto) {
    const v = p.precio_venta ?? p.precio;
    setPriceEdit({ id: p.id, draft: v != null ? String(v) : "" });
  }

  async function commitPrice(p: Producto) {
    const pe = priceEdit;
    if (!pe || pe.id !== p.id) return;
    const num = pe.draft.trim() === "" ? null : Number(pe.draft);
    if (num != null && (Number.isNaN(num) || num < 0)) {
      toast("Precio inválido", "warning");
      return;
    }
    setPriceEdit(null);
    const prevVenta = p.precio_venta;
    const prevPrecio = p.precio;
    setProductos((rows) =>
      rows.map((x) =>
        x.id === p.id
          ? { ...x, precio_venta: num, precio: num != null ? num : x.precio }
          : x
      )
    );
    try {
      await updateProducto(p.id, { precio_venta: num, precio: num });
      toast("Precio actualizado", "success");
    } catch (err) {
      setProductos((rows) =>
        rows.map((x) =>
          x.id === p.id ? { ...x, precio_venta: prevVenta, precio: prevPrecio } : x
        )
      );
      await load();
      toast(err instanceof Error ? err.message : "Error al guardar precio", "error");
    }
  }

  async function onEliminarProducto(p: Producto) {
    if (!window.confirm("¿Eliminar este producto?")) return;
    const snapshot = p;
    setError(null);
    setProductos((rows) => rows.filter((x) => x.id !== p.id));
    if (editingId === p.id) resetForm();
    try {
      await deleteProducto(p.id);
      toast("Producto eliminado", "success", {
        action: {
          label: "Deshacer",
          onAction: async () => {
            try {
              await createProducto({
                codigo_barras: snapshot.codigo_barras,
                nombre: snapshot.nombre,
                marca: snapshot.marca,
                categoria: snapshot.categoria,
                descripcion: snapshot.descripcion,
                imagen_url: snapshot.imagen_url,
                stock: snapshot.stock,
                precio_compra: snapshot.precio_compra,
                precio_venta: snapshot.precio_venta ?? snapshot.precio,
                stock_minimo: snapshot.stock_minimo,
                fecha_vencimiento: snapshot.fecha_vencimiento,
              });
              toast("Producto restaurado (nuevo ítem)", "info");
              await load();
            } catch (e) {
              toast(e instanceof Error ? e.message : "No se pudo restaurar", "error");
              await load();
            }
          },
        },
      });
      await load();
    } catch (err) {
      setProductos((rows) => [...rows, snapshot].sort((a, b) => a.id - b.id));
      setError(err instanceof Error ? err.message : "Error al eliminar");
      toast(err instanceof Error ? err.message : "Error al eliminar", "error");
    }
  }

  function buildCtxItems(p: Producto): ContextMenuItem[] {
    return [
      { label: "Editar", onSelect: () => onEditar(p) },
      { label: "Duplicar", onSelect: () => void duplicarProducto(p) },
      {
        label: "Eliminar",
        danger: true,
        onSelect: () => void onEliminarProducto(p),
      },
    ];
  }

  const alertasProductos = useMemo(() => {
    return productos.filter((p) => {
      if (p.stock === 0) return true;
      if (p.stock_minimo != null && p.stock <= p.stock_minimo) return true;
      return false;
    });
  }, [productos]);

  const tabOk = tabParam != null && INVENTARIO_TABS.includes(tabParam as InventarioTab);
  if (!tabOk) {
    return <Navigate to={`/inventario/${readLastTab("inventario", "productos")}`} replace />;
  }
  const tab = tabParam as InventarioTab;

  return (
    <>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <SubNav
        moduleId="inventario"
        items={[
          { id: "productos", label: "Productos", to: "/inventario/productos" },
          { id: "movimientos", label: "Movimientos", to: "/inventario/movimientos" },
          { id: "alertas", label: "Alertas", to: "/inventario/alertas" },
        ]}
        quickActions={
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Actualizar
          </button>
        }
      />

      <Drawer
        open={drawerOpen}
        onClose={cerrarDrawer}
        title={editingId ? "Editar producto" : "Nuevo producto"}
        wide
      >
        <form
          ref={formDrawerRef}
          id="drawer-producto-form"
          className="form drawer-form"
          onSubmit={onGuardar}
        >
          <ProductoCatalogoForm
            values={catalogoValues}
            onChange={patchCatalogo}
            mode={editingId != null ? "edit" : "create"}
            barcodeLookup={{
              loading: lookupLoading,
              hint: lookupHint,
              onLookupClick: () => void onBuscarCodigo(),
            }}
          />

          <div className="drawer-actions">
            <button type="submit" className="btn primary btn-lg">
              {editingId ? "Guardar cambios" : "Añadir al inventario"}
            </button>
            <span className="muted shortcut-hint">
              <kbd className="kbd-mini">Ctrl</kbd>
              <kbd className="kbd-mini">S</kbd> guardar
            </span>
            <button type="button" className="btn ghost" onClick={cerrarDrawer}>
              Cancelar
            </button>
          </div>
        </form>
      </Drawer>

      {tab === "movimientos" ? (
      <section className="card">
        <h2 className="card-title">Ajuste de stock (conteo físico)</h2>
        <p className="muted">
          Registra diferencias entre stock real y sistema. Queda trazado en auditoría (admin).
        </p>
        {ajusteMsg ? <div className="banner banner-info">{ajusteMsg}</div> : null}
        <form className="form" onSubmit={onAjusteFisico}>
          <div className="grid-2">
            <label className="field">
              <span>Producto</span>
              <select
                value={ajustePid || ""}
                onChange={(e) => setAjustePid(Number(e.target.value) || 0)}
                required
              >
                <option value={0}>—</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} (sist. {p.stock})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Stock real contado</span>
              <input
                type="number"
                min={0}
                value={ajusteReal}
                onChange={(e) =>
                  setAjusteReal(e.target.value === "" ? "" : Number(e.target.value))
                }
                required
              />
            </label>
          </div>
          <label className="field">
            <span>Motivo (opcional)</span>
            <input value={ajusteMotivo} onChange={(e) => setAjusteMotivo(e.target.value)} />
          </label>
          <button type="submit" className="btn secondary">
            Registrar ajuste
          </button>
        </form>
      </section>
      ) : null}

      {tab === "productos" ? (
      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Inventario</h2>
          <div className="toolbar-inline">
            <button type="button" className="btn primary" onClick={openNuevoProducto}>
              Nuevo producto
            </button>
            <button type="button" className="btn ghost small" onClick={() => void load()}>
              Actualizar
            </button>
          </div>
        </div>
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : productos.length === 0 ? (
          <div className="empty-state empty-state--compact card-pro">
            <p>No hay productos todavía.</p>
            <p className="muted">Cargá el catálogo o creá el primero en segundos.</p>
            <button type="button" className="btn primary" onClick={openNuevoProducto}>
              Crear producto
            </button>
          </div>
        ) : (
          <div className="table-wrap table--cards-sm">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Código</th>
                  <th>Stock</th>
                  <th>P. venta</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr
                    key={p.id}
                    className="table-row-click table-row-pro"
                    onClick={() => onEditar(p)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, p });
                    }}
                    title="Clic: editar · Clic derecho: menú"
                  >
                    <td data-label="Producto">
                      <div className="cell-with-meta">
                        <div>
                          <div className="cell-main">{p.nombre}</div>
                          {p.marca ? <div className="cell-sub">{p.marca}</div> : null}
                        </div>
                        <div
                          className="row-quick-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="btn-xxs"
                            onClick={() => onEditar(p)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn-xxs"
                            onClick={() => void duplicarProducto(p)}
                          >
                            Duplicar
                          </button>
                          <button
                            type="button"
                            className="btn-xxs danger-ghost"
                            onClick={() => void onEliminarProducto(p)}
                          >
                            Borrar
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="mono" data-label="Código">
                      {p.codigo_barras ?? "—"}
                    </td>
                    <td data-label="Stock">
                      <span
                        className={
                          p.stock === 0
                            ? "stock-badge stock-badge--out"
                            : p.stock_minimo != null && p.stock <= p.stock_minimo
                              ? "stock-badge stock-badge--low"
                              : "stock-badge"
                        }
                      >
                        {p.stock}
                      </span>
                    </td>
                    <td data-label="P. venta" onClick={(e) => e.stopPropagation()}>
                      {priceEdit?.id === p.id ? (
                        <input
                          className="input-inline-price"
                          autoFocus
                          value={priceEdit.draft}
                          onChange={(e) =>
                            setPriceEdit({ id: p.id, draft: e.target.value })
                          }
                          onBlur={() => void commitPrice(p)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setPriceEdit(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="link-inline-price"
                          onClick={() => startPriceEdit(p)}
                        >
                          {(p.precio_venta ?? p.precio) != null
                            ? (p.precio_venta ?? p.precio)!.toFixed(2)
                            : "—"}
                        </button>
                      )}
                    </td>
                    <td
                      className="row-actions"
                      data-label="Acciones"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button type="button" className="link" onClick={() => onEditar(p)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="link danger"
                        onClick={() => void onEliminarProducto(p)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      {tab === "alertas" ? (
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Alertas de stock</h2>
            <span className="muted">{alertasProductos.length} productos</span>
          </div>
          {alertasProductos.length === 0 ? (
            <p className="muted">No hay alertas: todo por encima del mínimo.</p>
          ) : (
            <div className="table-wrap table--cards-sm">
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Stock</th>
                    <th>Mínimo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {alertasProductos.map((p) => (
                    <tr key={p.id}>
                      <td data-label="Producto">{p.nombre}</td>
                      <td data-label="Stock">
                        <span
                          className={
                            p.stock === 0
                              ? "stock-badge stock-badge--out"
                              : "stock-badge stock-badge--low"
                          }
                        >
                          {p.stock}
                        </span>
                      </td>
                      <td data-label="Mínimo">{p.stock_minimo ?? "—"}</td>
                      <td className="row-actions" data-label="Acciones">
                        <button type="button" className="link" onClick={() => onEditar(p)}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <ContextMenu
        open={ctxMenu != null}
        x={ctxMenu?.x ?? 0}
        y={ctxMenu?.y ?? 0}
        items={ctxMenu ? buildCtxItems(ctxMenu.p) : []}
        onClose={() => setCtxMenu(null)}
      />
    </>
  );
}
