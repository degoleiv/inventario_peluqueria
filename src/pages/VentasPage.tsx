import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createVenta,
  fetchClientes,
  fetchPuntosConfig,
  fetchProductos,
  fetchVentas,
  lookupBarcode,
  type Cliente,
  type Producto,
  type PuntosConfig,
  type Venta,
} from "../api";
import { SkeletonCard } from "../components/Skeleton";
import { useToast } from "../context/ToastContext";
import {
  getPinnedClienteIds,
  getPinnedProductIds,
  getRecentClienteIds,
  getRecentProductIds,
  isProductPinned,
  recordRecentCliente,
  recordRecentProduct,
  togglePinProduct,
} from "../lib/recentPins";

type CartLine = {
  producto_id: number;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  stock_max: number;
};

export function VentasPage() {
  const toast = useToast();
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);

  const [clienteId, setClienteId] = useState<number | "">("");
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [notasVenta, setNotasVenta] = useState("");
  const [emitirFactura, setEmitirFactura] = useState(true);
  const [puntosCfg, setPuntosCfg] = useState<PuntosConfig | null>(null);
  const [puntosCanjeados, setPuntosCanjeados] = useState<number | "">("");
  const [pinTick, setPinTick] = useState(0);
  const [flashId, setFlashId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, p, c, pc] = await Promise.all([
        fetchVentas(),
        fetchProductos(),
        fetchClientes(),
        fetchPuntosConfig().catch(() => null),
      ]);
      setVentas(v);
      setProductos(p);
      setClientes(c);
      if (pc) setPuntosCfg(pc);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => barcodeRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q
      ? productos.slice(0, 56)
      : productos
          .filter(
            (p) =>
              p.nombre.toLowerCase().includes(q) ||
              (p.codigo_barras && p.codigo_barras.includes(q)) ||
              (p.marca && p.marca.toLowerCase().includes(q))
          )
          .slice(0, 56);
    const pins = new Set(getPinnedProductIds());
    const recent = getRecentProductIds();
    const score = (p: Producto) => {
      let s = 0;
      if (pins.has(p.id)) s += 2000;
      const ri = recent.indexOf(p.id);
      if (ri >= 0) s += 80 - ri * 2;
      return s;
    };
    return [...base].sort((a, b) => score(b) - score(a));
  }, [productos, search, pinTick]);

  const clientesOrdenados = useMemo(() => {
    const pins = new Set(getPinnedClienteIds());
    const recent = getRecentClienteIds();
    const score = (c: Cliente) => {
      let s = 0;
      if (pins.has(c.id)) s += 2000;
      const ri = recent.indexOf(c.id);
      if (ri >= 0) s += 80 - ri * 2;
      return s;
    };
    return [...clientes].sort((a, b) => score(b) - score(a));
  }, [clientes]);

  function precioLista(p: Producto) {
    return p.precio_venta ?? p.precio ?? 0;
  }

  function addProduct(p: Producto) {
    const lista = precioLista(p);
    if (p.stock <= 0) {
      toast("Sin stock de «" + p.nombre + "»", "warning");
      return;
    }
    setCart((prev) => {
      const i = prev.findIndex((x) => x.producto_id === p.id);
      if (i >= 0) {
        const next = [...prev];
        if (next[i].cantidad >= p.stock) {
          toast("Stock máximo alcanzado", "warning");
          return prev;
        }
        next[i] = { ...next[i], cantidad: next[i].cantidad + 1 };
        return next;
      }
      return [
        ...prev,
        {
          producto_id: p.id,
          nombre: p.nombre,
          cantidad: 1,
          precio_unitario: lista,
          stock_max: p.stock,
        },
      ];
    });
    recordRecentProduct(p.id);
    setFlashId(p.id);
    window.setTimeout(() => {
      setFlashId((cur) => (cur === p.id ? null : cur));
    }, 380);
    barcodeRef.current?.focus();
  }

  function bumpQty(producto_id: number, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.producto_id !== producto_id) return l;
          const next = l.cantidad + delta;
          if (next <= 0) return null;
          if (next > l.stock_max) {
            toast("Stock máximo: " + l.stock_max, "warning");
            return l;
          }
          return { ...l, cantidad: next };
        })
        .filter(Boolean) as CartLine[]
    );
    barcodeRef.current?.focus();
  }

  function removeLine(producto_id: number) {
    setCart((prev) => prev.filter((l) => l.producto_id !== producto_id));
    barcodeRef.current?.focus();
  }

  const total = useMemo(
    () => cart.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0),
    [cart]
  );

  async function onBarcodeEnter() {
    const raw = search.trim();
    if (!raw) return;
    const byBc = productos.find((p) => p.codigo_barras === raw);
    if (byBc) {
      addProduct(byBc);
      setSearch("");
      return;
    }
    if (raw.length >= 8) {
      setLookupBusy(true);
      try {
        const res = await lookupBarcode(raw);
        if (res.ok) {
          const match = productos.find(
            (p) =>
              p.codigo_barras === raw ||
              p.nombre.toLowerCase() === res.data.nombre.toLowerCase()
          );
          if (match) {
            addProduct(match);
            setSearch("");
            setLookupBusy(false);
            return;
          }
          toast("Producto no está en inventario. Agregalo desde Inventario.", "warning");
        }
      } catch {
        toast("Sin conexión al buscar código", "error");
      } finally {
        setLookupBusy(false);
      }
    }
  }

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    const built = cart.map((l) => ({
      producto_id: l.producto_id,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
    }));
    if (built.length === 0) {
      toast("Agregá productos al carrito", "warning");
      return;
    }
    try {
      const r = await createVenta({
        cliente_id: clienteId === "" ? null : clienteId,
        metodo_pago: metodoPago,
        notas: notasVenta.trim() || null,
        lineas: built,
        emitir_factura: emitirFactura,
        puntos_canjeados:
          clienteId !== "" && puntosCanjeados !== ""
            ? Math.floor(Number(puntosCanjeados))
            : undefined,
      });
      if (r.factura_error) {
        toast("Venta ok. Factura: " + r.factura_error, "warning");
      } else {
        toast("Venta " + (r.total as number).toFixed(2) + " — listo", "success");
      }
      if (r.puntos_otorgados && r.puntos_otorgados > 0) {
        toast("+" + r.puntos_otorgados + " puntos al cliente", "info");
      }
      setCart([]);
      setClienteId("");
      setNotasVenta("");
      setPuntosCanjeados("");
      setMetodoPago("efectivo");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al vender", "error");
    }
    barcodeRef.current?.focus();
  }

  return (
    <div className="page-pos">
      <section className="pos-shell card-pro">
        <div className="pos-scan-row">
          <label className="pos-scan">
            <span className="pos-scan-label">Código / buscar</span>
            <input
              ref={barcodeRef}
              className="pos-scan-input input-xl"
              placeholder="Escaneá o escribí y Enter…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onBarcodeEnter();
              }}
              autoComplete="off"
            />
          </label>
          {lookupBusy ? <span className="muted">Buscando…</span> : null}
        </div>

        <div className="pos-split">
          <div className="pos-products">
            <div className="pos-products-head">
              <h3 className="pos-panel-title">Productos</h3>
              <span className="muted">{filteredProducts.length} visibles</span>
            </div>
            {loading ? (
              <div className="pos-skel-grid">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="empty-state">
                <p>No hay coincidencias.</p>
                <p className="muted">Probá otro término o cargá productos en Inventario.</p>
              </div>
            ) : (
              <div className="product-grid">
                {filteredProducts.map((p) => {
                  const pv = precioLista(p);
                  const disabled = p.stock <= 0;
                  const pinned = isProductPinned(p.id);
                  return (
                    <div key={p.id} className="product-tile-wrap">
                      <button
                        type="button"
                        className={`product-tile ${disabled ? "product-tile--disabled" : ""} ${flashId === p.id ? "product-tile--flash" : ""}`}
                        onClick={() => !disabled && addProduct(p)}
                        disabled={disabled}
                      >
                        <span className="product-tile-name">{p.nombre}</span>
                        <span className="product-tile-meta">
                          {pv.toFixed(2)} · stock {p.stock}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`product-tile-fav ${pinned ? "product-tile-fav--on" : ""}`}
                        title={pinned ? "Quitar de favoritos" : "Fijar arriba"}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinProduct(p.id);
                          setPinTick((t) => t + 1);
                        }}
                      >
                        ★
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pos-cart">
            <h3 className="pos-panel-title">Carrito</h3>
            <form className="pos-cart-inner" onSubmit={pagar}>
              <div className="cart-lines">
                {cart.length === 0 ? (
                  <div className="empty-state empty-state--compact">
                    <p>Vacío — escaneá o tocá un producto.</p>
                  </div>
                ) : (
                  cart.map((l) => (
                    <div key={l.producto_id} className="cart-line">
                      <div className="cart-line-info">
                        <span className="cart-line-name">{l.nombre}</span>
                        <span className="cart-line-sub">
                          {(l.precio_unitario * l.cantidad).toFixed(2)}
                        </span>
                      </div>
                      <div className="cart-line-actions">
                        <button type="button" className="btn qty-btn" onClick={() => bumpQty(l.producto_id, -1)}>
                          −
                        </button>
                        <span className="cart-qty">{l.cantidad}</span>
                        <button type="button" className="btn qty-btn" onClick={() => bumpQty(l.producto_id, 1)}>
                          +
                        </button>
                        <button
                          type="button"
                          className="link danger cart-remove"
                          onClick={() => removeLine(l.producto_id)}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="cart-total-block">
                <span className="cart-total-label">Total</span>
                <span className="cart-total-value">{total.toFixed(2)}</span>
              </div>

              <div className="pos-options">
                <label className="field-inline">
                  <span>Cliente</span>
                  <select
                    value={clienteId === "" ? "" : String(clienteId)}
                    onChange={(e) => {
                      const v = e.target.value === "" ? "" : Number(e.target.value);
                      setClienteId(v);
                      if (v !== "") recordRecentCliente(v);
                    }}
                  >
                    <option value="">Sin cliente</option>
                    {clientesOrdenados.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-inline">
                  <span>Pago</span>
                  <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </label>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={emitirFactura}
                    onChange={(e) => setEmitirFactura(e.target.checked)}
                  />
                  Factura electrónica
                </label>
                {clienteId !== "" &&
                puntosCfg &&
                (puntosCfg.valor_redencion_moneda ?? 0) > 0 ? (
                  <label className="field-inline">
                    <span>
                      Puntos ({clientes.find((c) => c.id === clienteId)?.puntos ?? 0})
                    </span>
                    <input
                      type="number"
                      min={0}
                      className="input-compact"
                      value={puntosCanjeados}
                      onChange={(e) =>
                        setPuntosCanjeados(e.target.value === "" ? "" : Number(e.target.value))
                      }
                    />
                  </label>
                ) : null}
                <label className="field-inline field-inline--grow">
                  <span>Notas</span>
                  <input
                    value={notasVenta}
                    onChange={(e) => setNotasVenta(e.target.value)}
                    placeholder="Opcional"
                  />
                </label>
              </div>

              <button type="submit" className="btn btn-pay btn-xl" disabled={cart.length === 0}>
                Cobrar
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="card-pro">
        <div className="card-pro-head">
          <h2 className="card-pro-title">Últimas ventas</h2>
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
        {loading ? (
          <p className="muted">…</p>
        ) : ventas.length === 0 ? (
          <div className="empty-state">
            <p>Sin ventas aún.</p>
          </div>
        ) : (
          <ul className="sale-list">
            {ventas.slice(0, 15).map((v) => (
              <li key={v.id} className="sale-list-item">
                <span className="sale-list-date">{new Date(v.fecha).toLocaleString()}</span>
                <span className="sale-list-client">{v.cliente_nombre ?? "—"}</span>
                <span className="sale-list-total">{v.total.toFixed(2)}</span>
                <span className="muted">{v.metodo_pago}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
