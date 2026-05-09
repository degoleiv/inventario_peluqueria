import { filterIntegerTyping } from "../lib/decimalInput";

export type ProductoCatalogoFields = {
  codigo: string;
  nombre: string;
  marca: string;
  categoria: string;
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
  descripcion: "",
  imagenUrl: "",
  stock: 0,
  precioCompra: "",
  precioVenta: "",
  stockMinimo: "",
  fechaVencimiento: "",
});

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
};

export function ProductoCatalogoForm({
  values,
  onChange,
  mode,
  barcodeLookup,
  proveedorResumen,
  hideBarcodeLookup,
  quickCreateFromPedido,
}: Props) {
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
        </>
      )}

      <label className="field">
        <span>Descripción</span>
        <textarea
          value={values.descripcion}
          onChange={(e) => onChange({ descripcion: e.target.value })}
          rows={quickCreateFromPedido ? 2 : 3}
        />
      </label>

      {!quickCreateFromPedido ? (
        <label className="field">
          <span>URL imagen</span>
          <input value={values.imagenUrl} onChange={(e) => onChange({ imagenUrl: e.target.value })} />
        </label>
      ) : null}

      <div className="grid-2">
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
        {!quickCreateFromPedido ? (
          <label className="field">
            <span>Precio venta</span>
            <input
              type="number"
              step="0.01"
              min={0}
              value={values.precioVenta}
              onChange={(e) =>
                onChange({ precioVenta: e.target.value === "" ? "" : Number(e.target.value) })
              }
            />
          </label>
        ) : null}
      </div>

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

      {!quickCreateFromPedido ? (
        <label className="field">
          <span>Vencimiento (opcional)</span>
          <input
            type="date"
            value={values.fechaVencimiento}
            onChange={(e) => onChange({ fechaVencimiento: e.target.value })}
          />
        </label>
      ) : null}
    </>
  );
}

export function catalogoFieldsToCreateBody(f: ProductoCatalogoFields): Record<string, unknown> {
  return {
    codigo_barras: f.codigo.trim() || null,
    nombre: f.nombre.trim(),
    marca: f.marca.trim() || null,
    categoria: f.categoria.trim() || null,
    descripcion: f.descripcion.trim() || null,
    imagen_url: f.imagenUrl.trim() || null,
    stock: f.stock === "" ? 0 : Number(f.stock),
    precio_compra: f.precioCompra === "" ? null : Number(f.precioCompra),
    precio_venta: f.precioVenta === "" ? null : Number(f.precioVenta),
    stock_minimo: f.stockMinimo === "" ? undefined : Number(f.stockMinimo),
    fecha_vencimiento: f.fechaVencimiento.trim() || null,
  };
}
