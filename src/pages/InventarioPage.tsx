import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  createProducto,
  deleteProducto,
  fetchInventarioCatalogo,
  fetchProductos,
  lookupBarcode,
  patchProductoEstado,
  resolveImageSrc,
  updateProducto,
  type InventarioCatalogo,
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
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Drawer } from "../components/Drawer";
import { SkeletonCard } from "../components/Skeleton";
import { useToast } from "../context/ToastContext";
import { SubNav } from "../components/SubNav";
import { INVENTARIO_TABS, readInventarioTab, type InventarioTab } from "../lib/moduleRoutes";

function productoStockBadgeClass(p: Producto): string {
  if (p.stock === 0) return "stock-badge stock-badge--out";
  if (p.stock_minimo != null && p.stock <= p.stock_minimo) return "stock-badge stock-badge--low";
  return "stock-badge";
}

function labelFuenteLookup(fuente: string) {
  if (fuente === "inventario") return "Datos desde tu inventario local";
  if (fuente === "cache") return "Datos desde caché (consulta previa)";
  if (fuente === "openfoodfacts") return "Datos desde Open Food Facts";
  if (fuente === "openbeautyfacts") return "Datos desde Open Beauty Facts (cosmética / peluquería)";
  if (fuente === "upcitemdb") return "Datos desde UPCitemdb (catálogo comercial, trial gratuito)";
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
  const [proveedorId, setProveedorId] = useState<number | "">("");

  const [inventarioCatalogo, setInventarioCatalogo] = useState<InventarioCatalogo | null>(null);
  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [viewingProduct, setViewingProduct] = useState<Producto | null>(null);
  const [estadoSavingId, setEstadoSavingId] = useState<number | null>(null);
  const [filtroBusqueda, setFiltroBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "activo" | "inactivo">("todos");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; p: Producto } | null>(null);
  /** Si no es null, el drawer de creación está rellenado desde este producto (flujo “Duplicar”). */
  const [duplicateDraftSource, setDuplicateDraftSource] = useState<Producto | null>(null);
  const [confirmDeleteProducto, setConfirmDeleteProducto] = useState<Producto | null>(null);
  const [deleteProductoBusy, setDeleteProductoBusy] = useState(false);
  const formDrawerRef = useRef<HTMLFormElement>(null);
  const codigoRef = useRef(codigo);
  const inventarioCatalogoRef = useRef(inventarioCatalogo);
  inventarioCatalogoRef.current = inventarioCatalogo;

  codigoRef.current = codigo;

  const loadInventarioCatalogo = useCallback(
    async (mode: "initial" | "silent" = "initial") => {
      const silent = mode === "silent";
      setCatalogoError(null);
      if (!silent) setCatalogoLoading(true);
      try {
        const data = await fetchInventarioCatalogo();
        setInventarioCatalogo(data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Error al cargar catálogo";
        setCatalogoError(msg);
        toast(msg, "error");
      } finally {
        if (!silent) setCatalogoLoading(false);
      }
    },
    [toast]
  );

  const aplicarRespuestaBarcode = useCallback(
    (res: LookupOk | LookupManual) => {
      if (res.ok) {
        const d = res.data;
        setNombre(d.nombre);
        setMarca(d.marca ?? "");
        setCategoria(d.categoria ?? "");
        setDescripcion(d.descripcion ?? "");
        setImagenUrl(d.imagen_url ?? "");
        setLookupHint(labelFuenteLookup(d.fuente));

        const cat = inventarioCatalogoRef.current;
        if (cat) {
          const mar = (d.marca ?? "").trim().toLowerCase();
          const hitP = cat.proveedores.find((p) => p.nombre.trim().toLowerCase() === mar);
          if (hitP) {
            setProveedorId(hitP.id);
            setMarca(hitP.nombre);
          } else {
            setProveedorId("");
          }
          const cNom = (d.categoria ?? "").trim().toLowerCase();
          const hitC = cat.categorias.find((c) => c.nombre_categoria.trim().toLowerCase() === cNom);
          if (hitC) setCategoria(hitC.nombre_categoria);
        }
      } else {
        setLookupHint(
          "No se encontró producto en base de datos."
        );
      }
    },
    []
  );

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const rows = await fetchProductos();
      setProductos(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al cargar productos";
      setError(msg);
      toast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
    setProveedorId("");
    setLookupHint(null);
    setEditingId(null);
    setCreatingNew(false);
    setDuplicateDraftSource(null);
  }

  const drawerOpen = editingId !== null || creatingNew;

  useEffect(() => {
    if (!drawerOpen) return;
    void loadInventarioCatalogo("initial");
  }, [drawerOpen, loadInventarioCatalogo]);

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
    proveedorId,
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
    if (patch.proveedorId !== undefined) setProveedorId(patch.proveedorId);
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
    if (!categoria.trim() || proveedorId === "") {
      toast("Seleccioná categoría y marca (proveedor activo)", "warning");
      return;
    }
    if (precioVenta === "" || Number(precioVenta) <= 0) {
      toast("Ingresá un precio de venta mayor a 0", "warning");
      return;
    }
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

  function onVisualizar(p: Producto) {
    setViewingProduct(p);
  }

  function cerrarVisualizar() {
    setViewingProduct(null);
  }

  function onEditar(p: Producto) {
    setViewingProduct(null);
    setDuplicateDraftSource(null);
    setCreatingNew(false);
    setEditingId(p.id);
    setCodigo(p.codigo_barras ?? "");
    setNombre(p.nombre);
    setMarca(p.marca ?? "");
    setCategoria(p.categoria ?? "");
    setProveedorId(
      p.proveedor_id != null && Number.isFinite(Number(p.proveedor_id)) && Number(p.proveedor_id) > 0
        ? Number(p.proveedor_id)
        : ""
    );
    setDescripcion(p.descripcion ?? "");
    setImagenUrl(p.imagen_url ?? "");
    setStock(p.stock);
    setPrecioCompra(p.precio_compra ?? "");
    setPrecioVenta(p.precio_venta ?? p.precio ?? "");
    setStockMinimo(p.stock_minimo ?? "");
    setFechaVencimiento(p.fecha_vencimiento?.slice(0, 10) ?? "");
    setLookupHint(null);
  }

  function abrirDuplicarProducto(p: Producto) {
    setViewingProduct(null);
    setCtxMenu(null);
    setDuplicateDraftSource(p);
    setEditingId(null);
    setCreatingNew(true);
    setCodigo("");
    const baseNombre = p.nombre.trim();
    setNombre(baseNombre ? `${baseNombre} (copia)` : "(copia)");
    setMarca(p.marca ?? "");
    setCategoria(p.categoria ?? "");
    setProveedorId(
      p.proveedor_id != null && Number.isFinite(Number(p.proveedor_id)) && Number(p.proveedor_id) > 0
        ? Number(p.proveedor_id)
        : ""
    );
    setDescripcion(p.descripcion ?? "");
    setImagenUrl(p.imagen_url ?? "");
    setStock(0);
    setPrecioCompra(p.precio_compra ?? "");
    setPrecioVenta(p.precio_venta ?? p.precio ?? "");
    setStockMinimo(p.stock_minimo ?? "");
    setFechaVencimiento(p.fecha_vencimiento?.slice(0, 10) ?? "");
    setLookupHint(
      "Copiado del producto original: revisá el nombre y el código de barras; categoría, proveedor y precios podés mantenerlos o ajustarlos."
    );
    if (
      p.proveedor_id == null ||
      !Number.isFinite(Number(p.proveedor_id)) ||
      Number(p.proveedor_id) <= 0
    ) {
      toast("Este producto no tenía proveedor (marca) asignado: elegí uno en el formulario antes de guardar.", "info");
    }
  }

  function requestEliminarProducto(p: Producto) {
    setConfirmDeleteProducto(p);
  }

  async function confirmDeleteProductoAction() {
    const p = confirmDeleteProducto;
    if (!p) return;
    const snapshot = p;
    setDeleteProductoBusy(true);
    setError(null);
    setProductos((rows) => rows.filter((x) => x.id !== p.id));
    if (editingId === p.id) resetForm();
    try {
      await deleteProducto(p.id);
      setConfirmDeleteProducto(null);
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
                proveedor_id: snapshot.proveedor_id ?? undefined,
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
    } finally {
      setDeleteProductoBusy(false);
    }
  }

  async function setProductoEstado(p: Producto, proximo: "activo" | "inactivo") {
    const actual = p.estado === "inactivo" ? "inactivo" : "activo";
    if (actual === proximo) return;
    setEstadoSavingId(p.id);
    setProductos((rows) => rows.map((x) => (x.id === p.id ? { ...x, estado: proximo } : x)));
    setViewingProduct((curr) =>
      curr && curr.id === p.id ? { ...curr, estado: proximo } : curr
    );
    try {
      const upd = await patchProductoEstado(p.id, proximo);
      setProductos((rows) => rows.map((x) => (x.id === p.id ? { ...x, ...upd } : x)));
      setViewingProduct((curr) => (curr && curr.id === p.id ? { ...curr, ...upd } : curr));
      toast(proximo === "activo" ? "Producto activado" : "Producto inactivado", "success");
    } catch (err) {
      setProductos((rows) => rows.map((x) => (x.id === p.id ? { ...x, estado: actual } : x)));
      setViewingProduct((curr) =>
        curr && curr.id === p.id ? { ...curr, estado: actual } : curr
      );
      toast(err instanceof Error ? err.message : "No se pudo cambiar el estado", "error");
    } finally {
      setEstadoSavingId((cur) => (cur === p.id ? null : cur));
    }
  }

  function buildCtxItems(p: Producto): ContextMenuItem[] {
    return [
      { label: "Visualizar", onSelect: () => onVisualizar(p) },
      { label: "Editar", onSelect: () => onEditar(p) },
      { label: "Duplicar…", onSelect: () => abrirDuplicarProducto(p) },
      {
        label: "Eliminar",
        danger: true,
        onSelect: () => requestEliminarProducto(p),
      },
    ];
  }

  function onEliminarDesdeVisualizar() {
    const p = viewingProduct;
    if (!p) return;
    cerrarVisualizar();
    requestEliminarProducto(p);
  }

  const productosFiltrados = useMemo(() => {
    const q = filtroBusqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (filtroEstado === "activo" && p.estado === "inactivo") return false;
      if (filtroEstado === "inactivo" && p.estado !== "inactivo") return false;
      if (!q) return true;
      const nombre = p.nombre?.toLowerCase() ?? "";
      const codigo = p.codigo_barras?.toLowerCase() ?? "";
      return nombre.includes(q) || codigo.includes(q);
    });
  }, [productos, filtroBusqueda, filtroEstado]);

  const productosOrdenados = useMemo(() => {
    return [...productosFiltrados].sort((a, b) => {
      const aInactivo = a.estado === "inactivo" ? 1 : 0;
      const bInactivo = b.estado === "inactivo" ? 1 : 0;
      if (aInactivo !== bInactivo) return aInactivo - bInactivo;
      const ua = a.updated_at ?? "";
      const ub = b.updated_at ?? "";
      return ub.localeCompare(ua);
    });
  }, [productosFiltrados]);

  const alertasProductos = useMemo(() => {
    return productos.filter((p) => {
      if (p.stock === 0) return true;
      if (p.stock_minimo != null && p.stock <= p.stock_minimo) return true;
      return false;
    });
  }, [productos]);

  const tabOk = tabParam != null && INVENTARIO_TABS.includes(tabParam as InventarioTab);
  if (!tabOk) {
    return <Navigate to={`/inventario/${readInventarioTab()}`} replace />;
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
        title={
          editingId != null ? "Editar producto" : duplicateDraftSource ? "Duplicar producto" : "Nuevo producto"
        }
        wide
      >
        <form
          ref={formDrawerRef}
          id="drawer-producto-form"
          className="form drawer-form"
          onSubmit={onGuardar}
        >
          {duplicateDraftSource ? (
            <p className="muted small" style={{ margin: "0 0 0.75rem" }}>
              Copia basada en <strong>{duplicateDraftSource.nombre}</strong>. El código de barras quedó vacío para
              evitar duplicados; el stock inicia en 0.
            </p>
          ) : null}
          <ProductoCatalogoForm
            values={catalogoValues}
            onChange={patchCatalogo}
            mode={editingId != null ? "edit" : "create"}
            barcodeLookup={{
              loading: lookupLoading,
              hint: lookupHint,
              onLookupClick: () => void onBuscarCodigo(),
            }}
            inventarioCatalogo={{
              loading: catalogoLoading,
              error: catalogoError,
              categorias: inventarioCatalogo?.categorias ?? [],
              proveedores: inventarioCatalogo?.proveedores ?? [],
              onCatalogPanelOpen: () => void loadInventarioCatalogo("silent"),
            }}
          />

          {(() => {
            if (editingId == null) return null;
            const editado = productos.find((x) => x.id === editingId);
            if (!editado) return null;
            const activo = editado.estado !== "inactivo";
            return (
              <div className="field producto-estado-field">
                <span>Estado</span>
                <label
                  className="ui-switch producto-estado-switch"
                  title={activo ? "Activo" : "Inactivo"}
                >
                  <input
                    type="checkbox"
                    className="ui-switch__input"
                    checked={activo}
                    disabled={estadoSavingId === editado.id}
                    onChange={(e) =>
                      void setProductoEstado(editado, e.target.checked ? "activo" : "inactivo")
                    }
                  />
                  <span className="ui-switch__track" aria-hidden />
                  <span className="producto-estado-switch__text muted small">
                    {activo ? "Activo" : "Inactivo"}
                  </span>
                </label>
                <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
                  Los productos inactivos no aparecen en ventas pero conservan su historial.
                </p>
              </div>
            );
          })()}

          <div className="drawer-actions">
            <button type="submit" className="btn primary btn-lg">
              {editingId != null ? "Guardar" : duplicateDraftSource ? "Crear producto" : "Añadir al inventario"}
            </button>
            <button type="button" className="btn ghost" onClick={cerrarDrawer}>
              Cancelar
            </button>
          </div>
        </form>
      </Drawer>

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
        <div className="inventario-filtros">
          <label className="field inventario-filtros__buscar">
            <span>Buscar</span>
            <input
              type="search"
              value={filtroBusqueda}
              onChange={(e) => setFiltroBusqueda(e.target.value)}
              placeholder="Nombre o código de barras…"
              autoComplete="off"
            />
          </label>
          <label className="field inventario-filtros__estado">
            <span>Estado</span>
            <select
              value={filtroEstado}
              onChange={(e) =>
                setFiltroEstado(e.target.value as "todos" | "activo" | "inactivo")
              }
            >
              <option value="todos">Todos</option>
              <option value="activo">Activos</option>
              <option value="inactivo">Inactivos</option>
            </select>
          </label>
          {(filtroBusqueda || filtroEstado !== "todos") && !loading ? (
            <span className="muted small inventario-filtros__count">
              {productosFiltrados.length} de {productos.length}
            </span>
          ) : null}
          {filtroBusqueda || filtroEstado !== "todos" ? (
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                setFiltroBusqueda("");
                setFiltroEstado("todos");
              }}
            >
              Limpiar
            </button>
          ) : null}
        </div>
        {loading ? (
          <div className="proveedores-grid inventario-productos-grid" aria-busy="true">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : productos.length === 0 ? (
          <div className="empty-state empty-state--compact card-pro">
            <p>No hay productos todavía.</p>
            <p className="muted">Cargá el catálogo o creá el primero en segundos.</p>
            <button type="button" className="btn primary" onClick={openNuevoProducto}>
              Crear producto
            </button>
          </div>
        ) : productosOrdenados.length === 0 ? (
          <div className="empty-state empty-state--compact card-pro">
            <p>No hay productos que coincidan con los filtros.</p>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                setFiltroBusqueda("");
                setFiltroEstado("todos");
              }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="proveedores-grid inventario-productos-grid" role="list">
            {productosOrdenados.map((p) => (
              <article
                key={p.id}
                className={
                  "prov-card prov-card--stacked prov-card--clickable inventario-producto-card" +
                  (p.estado === "inactivo" ? " inventario-producto-card--inactivo" : "")
                }
                role="listitem"
                tabIndex={0}
                title="Clic: visualizar · Clic derecho: menú (duplicar, editar…)"
                onClick={() => onVisualizar(p)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, p });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onVisualizar(p);
                  }
                }}
              >
                <div className="prov-card__media-wrap">
                  {p.imagen_url ? (
                    <img
                      src={resolveImageSrc(p.imagen_url) ?? p.imagen_url}
                      alt=""
                      className="prov-card__img"
                      width={112}
                      height={112}
                    />
                  ) : (
                    <div className="prov-card__avatar prov-card__avatar--ph" aria-hidden>
                      {p.nombre.trim().slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <h3 className="prov-card__nombre-text">{p.nombre}</h3>
                <p className="cliente-card-meta inventario-producto-card__meta">
                  <span className="inventario-producto-card__stats">
                    <span className="inventario-producto-card__stat">
                      <span className={productoStockBadgeClass(p)}>{p.stock}</span>
                    </span>
                    <span className="inventario-producto-card__stat">
                      <span className="inventario-producto-card__precio">
                        {(p.precio_venta ?? p.precio) != null
                          ? `$${Math.round(p.precio_venta ?? p.precio ?? 0).toLocaleString("es-CO")}`
                          : "—"}
                      </span>
                    </span>
                  </span>
                </p>
              </article>
            ))}
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

      <Drawer
        open={viewingProduct != null}
        onClose={cerrarVisualizar}
        title={viewingProduct ? viewingProduct.nombre : "Producto"}
      >
        {viewingProduct ? (
          <div className="form drawer-form">
            <div
              style={{
                display: "flex",
                gap: "1rem",
                alignItems: "flex-start",
                marginBottom: "0.5rem",
              }}
            >
              <div
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "var(--surface-2, #f1f3f5)",
                  border: "1px solid var(--border, rgba(0,0,0,0.08))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                }}
              >
                {viewingProduct.imagen_url ? (
                  <img
                    src={resolveImageSrc(viewingProduct.imagen_url) ?? viewingProduct.imagen_url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span aria-hidden style={{ fontSize: "2rem" }}>
                    📦
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <strong style={{ fontSize: "1.05rem" }}>{viewingProduct.nombre}</strong>
                {viewingProduct.marca ? (
                  <span className="muted small">{viewingProduct.marca}</span>
                ) : null}
                <span className={productoStockBadgeClass(viewingProduct)} style={{ alignSelf: "flex-start" }}>
                  Cantidad: {viewingProduct.stock}
                </span>
              </div>
            </div>

            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "max-content 1fr",
                rowGap: "0.5rem",
                columnGap: "1rem",
                margin: 0,
              }}
            >
              <dt className="muted small">Estado</dt>
              <dd style={{ margin: 0 }}>
                {viewingProduct.estado === "inactivo" ? "Inactivo" : "Activo"}
              </dd>

              <dt className="muted small">Categoría</dt>
              <dd style={{ margin: 0 }}>{viewingProduct.categoria || "—"}</dd>

              <dt className="muted small">Código de barras</dt>
              <dd className="mono" style={{ margin: 0 }}>
                {viewingProduct.codigo_barras?.trim() || "—"}
              </dd>

              <dt className="muted small">Stock mínimo</dt>
              <dd style={{ margin: 0 }}>
                {viewingProduct.stock_minimo != null ? viewingProduct.stock_minimo : "—"}
              </dd>

              <dt className="muted small">Precio venta</dt>
              <dd style={{ margin: 0 }}>
                {(viewingProduct.precio_venta ?? viewingProduct.precio) != null
                  ? (viewingProduct.precio_venta ?? viewingProduct.precio)!.toFixed(2)
                  : "—"}
              </dd>

              {viewingProduct.descripcion?.trim() ? (
                <>
                  <dt className="muted small">Descripción</dt>
                  <dd style={{ margin: 0, whiteSpace: "pre-wrap" }}>{viewingProduct.descripcion}</dd>
                </>
              ) : null}
            </dl>

              <div className="drawer-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => abrirDuplicarProducto(viewingProduct)}
              >
                Duplicar…
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => onEditar(viewingProduct)}
              >
                Editar
              </button>
              <button
                type="button"
                className="btn ghost danger-ghost"
                onClick={() => void onEliminarDesdeVisualizar()}
              >
                Eliminar
              </button>
              <button type="button" className="btn ghost" onClick={cerrarVisualizar}>
                Cerrar
              </button>
            </div>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={confirmDeleteProducto != null}
        title="Eliminar producto"
        description={
          confirmDeleteProducto ? (
            <>
              ¿Eliminar <strong>{confirmDeleteProducto.nombre}</strong>? Esta acción no se puede deshacer
              (salvo con Deshacer en el aviso).
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        busy={deleteProductoBusy}
        onCancel={() => !deleteProductoBusy && setConfirmDeleteProducto(null)}
        onConfirm={() => void confirmDeleteProductoAction()}
      />

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
