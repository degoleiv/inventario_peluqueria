import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { filterIntegerTyping } from "../lib/decimalInput";
import { SearchableSelect } from "./SearchableSelect";
import { useToast } from "../context/ToastContext";

const MAX_PRODUCTO_IMG_BYTES = 700 * 1024;
const ACCEPT_PRODUCTO_IMG = "image/png,image/jpeg,image/webp,image/gif";

function ImagenProductoPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [value]);

  const trimmed = value.trim();
  const showImg = Boolean(trimmed && !broken);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Elegí un archivo de imagen (PNG, JPG, WEBP o GIF).", "warning");
      return;
    }
    if (file.size > MAX_PRODUCTO_IMG_BYTES) {
      toast("La imagen es demasiado grande (máx. 700 KB).", "warning");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r === "string") onChange(r);
    };
    reader.onerror = () => toast("No se pudo leer la imagen.", "error");
    reader.readAsDataURL(file);
  }

  return (
    <div className="field producto-img-field">
      <span>Imagen del producto</span>
      <div
        className="producto-img-picker"
        style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}
      >
        <div
          className="producto-img-picker__preview"
          style={{
            width: 72,
            height: 72,
            borderRadius: 12,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface-2, #f1f3f5)",
            border: "1px solid var(--border, rgba(0,0,0,0.08))",
            flex: "0 0 auto",
          }}
        >
          {showImg ? (
            <img
              src={trimmed}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={() => setBroken(true)}
            />
          ) : (
            <span aria-hidden style={{ fontSize: "1.6rem" }}>
              📦
            </span>
          )}
        </div>
        <div
          className="producto-img-picker__actions"
          style={{ display: "flex", flexDirection: "column", gap: "0.35rem", flex: "1 1 auto" }}
        >
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_PRODUCTO_IMG}
            onChange={onPickFile}
            style={{ display: "none" }}
            tabIndex={-1}
            aria-hidden
          />
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn secondary small"
              onClick={() => fileRef.current?.click()}
            >
              {trimmed ? "Cambiar imagen" : "Seleccionar archivo"}
            </button>
            {trimmed ? (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => onChange("")}
              >
                Quitar
              </button>
            ) : null}
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            PNG, JPG, WEBP o GIF (máx. 700 KB).
          </p>
        </div>
      </div>
    </div>
  );
}

export type ProductoCatalogoFields = {
  codigo: string;
  nombre: string;
  marca: string;
  categoria: string;
  /** Proveedor elegido como marca (solo flujo inventario con catálogo). */
  proveedorId: number | "";
  descripcion: string;
  imagenUrl: string;
  stock: number | "";
  precioCompra: number | "";
  precioVenta: number | "";
  stockMinimo: number | "";
  fechaVencimiento: string;
};

export const emptyProductoCatalogoFields = (): ProductoCatalogoFields => ({
  codigo: "",
  nombre: "",
  marca: "",
  categoria: "",
  proveedorId: "",
  descripcion: "",
  imagenUrl: "",
  stock: 0,
  precioCompra: "",
  precioVenta: "",
  stockMinimo: "",
  fechaVencimiento: "",
});

export type InventarioCatalogoFormProps = {
  loading: boolean;
  error: string | null;
  categorias: { id: number; nombre_categoria: string }[];
  proveedores: { id: number; nombre: string }[];
  /** Al abrir marca o categoría se actualiza el catálogo (p. ej. tras crear registros en otro módulo). */
  onCatalogPanelOpen?: () => void;
};

type ProveedorResumen = {
  nombre: string;
  nit?: string | null;
  telefono?: string | null;
  email?: string | null;
};

type BarcodeLookupProps = {
  loading: boolean;
  hint: string | null;
  onLookupClick: () => void;
};

type Props = {
  values: ProductoCatalogoFields;
  onChange: (patch: Partial<ProductoCatalogoFields>) => void;
  /** create: muestra ayuda de código y fila de búsqueda externa */
  mode: "create" | "edit";
  barcodeLookup?: BarcodeLookupProps;
  /** Proveedor fijo (solo lectura), p. ej. alta desde pedido */
  proveedorResumen?: ProveedorResumen | null;
  /** Oculta búsqueda por código (p. ej. modal pedido sin APIs) */
  hideBarcodeLookup?: boolean;
  /** Modo rápido desde pedidos: no muestra campos de inventario */
  quickCreateFromPedido?: boolean;
  /** Catálogo categorías activas + proveedores activos (inventario). */
  inventarioCatalogo?: InventarioCatalogoFormProps | null;
};

export function ProductoCatalogoForm({
  values,
  onChange,
  mode,
  barcodeLookup,
  proveedorResumen,
  hideBarcodeLookup,
  quickCreateFromPedido,
  inventarioCatalogo,
}: Props) {
  const cat = inventarioCatalogo;
  const catEmptySlot = (
    <div className="searchable-select__empty-actions">
      <p className="muted small" style={{ marginBottom: "0.5rem" }}>
        No hay categorías activas. Creá al menos una en Configuración → Parámetros generales → Categorías de
        producto.
      </p>
      <Link to="/configuracion/parametros" className="btn secondary small">
        Ir a categorías
      </Link>
    </div>
  );
  const provEmptySlot = (
    <div className="searchable-select__empty-actions">
      <p className="muted small" style={{ marginBottom: "0.5rem" }}>
        No hay proveedores activos. Registrá uno en el módulo Proveedores.
      </p>
      <Link to="/proveedores" className="btn secondary small">
        Ir a proveedores
      </Link>
    </div>
  );

  return (
    <>
      {proveedorResumen ? (
        <div className="card inner-line" style={{ margin: quickCreateFromPedido ? "0 0 0.5rem" : "0 0 1rem" }}>
          <p className="muted small">Proveedor (no editable)</p>
          <strong>{proveedorResumen.nombre}</strong>
          {quickCreateFromPedido ? (
            <p className="muted small" style={{ marginTop: "0.35rem" }}>
              NIT: {proveedorResumen.nit || "—"}
            </p>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: "0.45rem" }}>
                NIT: {proveedorResumen.nit || "—"} · Tel: {proveedorResumen.telefono || "—"}
              </p>
              <p className="muted small">Email: {proveedorResumen.email || "—"}</p>
            </>
          )}
        </div>
      ) : null}

      {!quickCreateFromPedido ? (
        !hideBarcodeLookup ? (
          <>
            <div className="field-row">
              <label className="field">
                <span>Código de barras</span>
                <input
                  value={values.codigo}
                  onChange={(e) => onChange({ codigo: e.target.value })}
                  placeholder="EAN-13 / escáner"
                  autoComplete="off"
                />
              </label>
              {barcodeLookup ? (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => barcodeLookup.onLookupClick()}
                  disabled={barcodeLookup.loading}
                >
                  {barcodeLookup.loading ? "Buscando…" : "Buscar datos"}
                </button>
              ) : null}
            </div>
            {mode === "create" ? (
              <p className="muted" style={{ marginTop: "-0.25rem", marginBottom: "0.35rem" }}>
                Con código de al menos 8 caracteres se consultan APIs externas y caché.
              </p>
            ) : null}
            {barcodeLookup?.hint ? <p className="hint">{barcodeLookup.hint}</p> : null}
          </>
        ) : (
          <label className="field">
            <span>Código de barras</span>
            <input
              value={values.codigo}
              onChange={(e) => onChange({ codigo: e.target.value })}
              placeholder="Opcional"
              autoComplete="off"
            />
          </label>
        )
      ) : null}

      {quickCreateFromPedido ? (
        <div className="grid-2">
          <label className="field">
            <span>Nombre *</span>
            <input
              value={values.nombre}
              onChange={(e) => onChange({ nombre: e.target.value })}
              required
              placeholder="Nombre del producto"
            />
          </label>
          <label className="field">
            <span>Categoría</span>
            <input value={values.categoria} onChange={(e) => onChange({ categoria: e.target.value })} />
          </label>
        </div>
      ) : (
        <>
          <label className="field">
            <span>Nombre *</span>
            <input
              value={values.nombre}
              onChange={(e) => onChange({ nombre: e.target.value })}
              required
              placeholder="Nombre del producto"
            />
          </label>
          {cat ? (
            <>
              {cat.error ? (
                <div className="banner banner-error" role="alert">
                  {cat.error}
                </div>
              ) : null}
              <div className="grid-2">
                <SearchableSelect
                  label="Marca (proveedor) *"
                  value={values.proveedorId === "" ? "" : String(values.proveedorId)}
                  onChange={(v) => {
                    if (v === "") {
                      onChange({ proveedorId: "", marca: "" });
                      return;
                    }
                    const id = Number(v);
                    const pr = cat.proveedores.find((p) => p.id === id);
                    onChange({ proveedorId: id, marca: pr?.nombre ?? "" });
                  }}
                  options={cat.proveedores.map((p) => ({
                    value: String(p.id),
                    label: p.nombre,
                  }))}
                  disabled={cat.loading}
                  onPanelOpen={cat.onCatalogPanelOpen}
                  emptySlot={provEmptySlot}
                  hint={cat.loading ? "Cargando proveedores…" : null}
                />
                <SearchableSelect
                  label="Categoría *"
                  value={values.categoria}
                  onChange={(v) => onChange({ categoria: v })}
                  options={cat.categorias.map((c) => ({
                    value: c.nombre_categoria,
                    label: c.nombre_categoria,
                  }))}
                  disabled={cat.loading}
                  onPanelOpen={cat.onCatalogPanelOpen}
                  emptySlot={catEmptySlot}
                  hint={cat.loading ? "Cargando categorías…" : null}
                />
              </div>
            </>
          ) : (
            <div className="grid-2">
              <label className="field">
                <span>Marca</span>
                <input value={values.marca} onChange={(e) => onChange({ marca: e.target.value })} />
              </label>
              <label className="field">
                <span>Categoría</span>
                <input value={values.categoria} onChange={(e) => onChange({ categoria: e.target.value })} />
              </label>
            </div>
          )}
        </>
      )}

      {quickCreateFromPedido ? (
        <label className="field">
          <span>Descripción</span>
          <textarea
            value={values.descripcion}
            onChange={(e) => onChange({ descripcion: e.target.value })}
            rows={2}
          />
        </label>
      ) : null}

      {!quickCreateFromPedido ? (
        <ImagenProductoPicker
          value={values.imagenUrl}
          onChange={(v) => onChange({ imagenUrl: v })}
        />
      ) : null}

      {quickCreateFromPedido ? (
        <label className="field">
          <span>Precio compra</span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={values.precioCompra}
            onChange={(e) =>
              onChange({ precioCompra: e.target.value === "" ? "" : Number(e.target.value) })
            }
          />
        </label>
      ) : (
        <label className="field">
          <span>Precio venta *</span>
          <input
            type="number"
            step="0.01"
            min={0}
            required
            value={values.precioVenta}
            onChange={(e) =>
              onChange({ precioVenta: e.target.value === "" ? "" : Number(e.target.value) })
            }
            placeholder="Ej. 15000"
          />
        </label>
      )}

      {!quickCreateFromPedido ? (
        <div className="grid-2">
          <label className="field">
            <span>Stock</span>
            <input
              type="number"
              min={0}
              value={values.stock === "" ? "" : values.stock}
              onChange={(e) => {
                const raw = filterIntegerTyping(e.target.value);
                onChange({ stock: raw === "" ? "" : Number(raw) });
              }}
            />
          </label>
          <label className="field">
            <span>Stock mínimo (alerta)</span>
            <input
              type="number"
              min={0}
              value={values.stockMinimo}
              onChange={(e) =>
                onChange({ stockMinimo: e.target.value === "" ? "" : Number(e.target.value) })
              }
            />
          </label>
        </div>
      ) : null}
    </>
  );
}

export function catalogoFieldsToCreateBody(f: ProductoCatalogoFields): Record<string, unknown> {
  const proveedor_id =
    f.proveedorId === "" || f.proveedorId === undefined ? null : Number(f.proveedorId);
  return {
    codigo_barras: f.codigo.trim() || null,
    nombre: f.nombre.trim(),
    marca: f.marca.trim() || null,
    categoria: f.categoria.trim() || null,
    proveedor_id,
    descripcion: f.descripcion.trim() || null,
    imagen_url: f.imagenUrl.trim() || null,
    stock: f.stock === "" ? 0 : Number(f.stock),
    precio_compra: f.precioCompra === "" ? null : Number(f.precioCompra),
    precio_venta: f.precioVenta === "" ? null : Number(f.precioVenta),
    stock_minimo: f.stockMinimo === "" ? undefined : Number(f.stockMinimo),
    fecha_vencimiento: f.fechaVencimiento.trim() || null,
  };
}
