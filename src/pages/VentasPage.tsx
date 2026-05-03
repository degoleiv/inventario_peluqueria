import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  createClienteTemporal,
  createVenta,
  fetchAuthMe,
  fetchClientes,
  fetchEquipo,
  fetchPuntosConfig,
  fetchProductos,
  fetchVentas,
  lookupBarcode,
  type Cliente,
  type EquipoMiembro,
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
import { posBeepErr, posBeepOk } from "../lib/posSounds";
import { SubNav } from "../components/SubNav";
import { readLastTab, VENTAS_TABS, type VentasTab } from "../lib/moduleRoutes";

type CartLine = {
  producto_id: number;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  stock_max: number;
};

export function VentasPage() {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const toast = useToast();
  const barcodeRef = useRef<HTMLInputElement>(null);
  const saleFormRef = useRef<HTMLFormElement>(null);
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
  const [vendedorId, setVendedorId] = useState<number | "">("");
  const [equipo, setEquipo] = useState<EquipoMiembro[]>([]);
  const [pinTick, setPinTick] = useState(0);
  const [flashId, setFlashId] = useState<number | null>(null);
  /** Índice de línea seleccionada en carrito (↑↓); null = modo solo escáner */
  const [cartSel, setCartSel] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, p, c, pc, eq] = await Promise.all([
        fetchVentas(),
        fetchProductos(),
        fetchClientes(),
        fetchPuntosConfig().catch(() => null),
        fetchEquipo().catch(() => []),
      ]);
      setVentas(v);
      setProductos(p);
      setClientes(c);
      if (pc) setPuntosCfg(pc);
      setEquipo(eq);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const agregarClienteOcasional = useCallback(async () => {
    try {
      const { cliente, reutilizado } = await createClienteTemporal();
      setClienteId(cliente.id);
      recordRecentCliente(cliente.id);
      await load();
      toast(
        reutilizado
          ? "Ya existía un contacto con ese teléfono; se seleccionó ese cliente."
          : "Cliente ocasional — podés cobrar sin registrar datos completos.",
        reutilizado ? "info" : "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    }
  }, [load, toast]);

  useEffect(() => {
    void fetchAuthMe()
      .then((m) => setVendedorId(m.user.id))
      .catch(() => {});
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => barcodeRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    setCartSel((sel) => {
      if (cart.length === 0) return null;
      if (sel === null) return null;
      return Math.min(sel, cart.length - 1);
    });
  }, [cart]);

  useEffect(() => {
    setCartSel(null);
  }, [search]);

  const nuevaVenta = useCallback(() => {
    setCart([]);
    setSearch("");
    setCartSel(null);
    setClienteId("");
    setNotasVenta("");
    setPuntosCanjeados("");
    setMetodoPago("efectivo");
    toast("Nueva venta lista", "info");
    window.setTimeout(() => barcodeRef.current?.focus(), 0);
  }, [toast]);

  const cancelarVenta = useCallback(() => {
    if (cart.length === 0 && !search.trim()) return;
    setCart([]);
    setSearch("");
    setCartSel(null);
    toast("Venta cancelada", "warning");
    window.setTimeout(() => barcodeRef.current?.focus(), 0);
  }, [cart.length, search, toast]);

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
      posBeepErr();
      toast("Sin stock de «" + p.nombre + "»", "warning");
      return;
    }
    const line = cart.find((l) => l.producto_id === p.id);
    if (line && line.cantidad >= p.stock) {
      posBeepErr();
      toast("Stock máximo alcanzado", "warning");
      return;
    }
    setCart((prev) => {
      const i = prev.findIndex((x) => x.producto_id === p.id);
      if (i >= 0) {
        const next = [...prev];
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
    setCartSel(null);
    window.setTimeout(() => {
      setFlashId((cur) => (cur === p.id ? null : cur));
    }, 380);
    posBeepOk();
    barcodeRef.current?.focus();
  }

  function bumpQty(producto_id: number, delta: number) {
    const line = cart.find((l) => l.producto_id === producto_id);
    if (line && delta > 0 && line.cantidad >= line.stock_max) {
      posBeepErr();
      toast("Stock máximo: " + line.stock_max, "warning");
      barcodeRef.current?.focus();
      return;
    }
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.producto_id !== producto_id) return l;
          const next = l.cantidad + delta;
          if (next <= 0) return null;
          if (next > l.stock_max) {
            posBeepErr();
            toast("Stock máximo: " + l.stock_max, "warning");
            return l;
          }
          return { ...l, cantidad: next };
        })
        .filter(Boolean) as CartLine[]
    );
    posBeepOk();
    barcodeRef.current?.focus();
  }

  function removeLine(producto_id: number) {
    setCart((prev) => prev.filter((l) => l.producto_id !== producto_id));
    posBeepOk();
    barcodeRef.current?.focus();
  }

  useEffect(() => {
    const onDocKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const inExempt = el?.closest?.(".pos-exempt-focus");
      if (
        inExempt &&
        e.ctrlKey &&
        (e.key.toLowerCase() === "n" || e.key.toLowerCase() === "c")
      ) {
        return;
      }

      if (e.ctrlKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        nuevaVenta();
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        cancelarVenta();
        return;
      }
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        saleFormRef.current?.requestSubmit();
        return;
      }

      if (e.code === "F1") {
        e.preventDefault();
        setMetodoPago("efectivo");
        posBeepOk();
        return;
      }
      if (e.code === "F2") {
        e.preventDefault();
        setMetodoPago("transferencia");
        posBeepOk();
        return;
      }
      if (e.code === "F3") {
        e.preventDefault();
        setMetodoPago("mixto");
        posBeepOk();
        return;
      }
      if (e.code === "F10") {
        e.preventDefault();
        saleFormRef.current?.requestSubmit();
        return;
      }
      if (e.code === "F4") {
        e.preventDefault();
        barcodeRef.current?.focus();
        return;
      }

      if (
        e.key === "Delete" &&
        cartSel !== null &&
        cart[cartSel] &&
        document.activeElement === barcodeRef.current
      ) {
        e.preventDefault();
        const pid = cart[cartSel]!.producto_id;
        setCart((prev) => prev.filter((l) => l.producto_id !== pid));
        posBeepOk();
        barcodeRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onDocKey);
    return () => window.removeEventListener("keydown", onDocKey);
  }, [nuevaVenta, cancelarVenta, cartSel, cart]);

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
    if (filteredProducts.length === 1 && raw.length >= 1) {
      addProduct(filteredProducts[0]!);
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
            return;
          }
          posBeepErr();
          toast("Producto no está en inventario. Agregalo desde Inventario.", "warning");
          return;
        }
        posBeepErr();
        toast("Código sin datos automáticos. Cargalo en Inventario.", "warning");
      } catch {
        posBeepErr();
        toast("Sin conexión al buscar código", "error");
      } finally {
        setLookupBusy(false);
      }
      return;
    }

    posBeepErr();
    toast("Sin coincidencia. Escribí más o escaneá el código (≥8 dígitos).", "warning");
  }

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    const built = cart.map((l) => ({
      producto_id: l.producto_id,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
    }));
    if (built.length === 0) {
      posBeepErr();
      toast("Agregá productos al carrito", "warning");
      return;
    }
    if (vendedorId === "") {
      posBeepErr();
      toast("Seleccioná el vendedor", "warning");
      return;
    }
    try {
      const r = await createVenta({
        cliente_id: clienteId === "" ? null : clienteId,
        usuario_id: Number(vendedorId),
        metodo_pago: metodoPago,
        notas: notasVenta.trim() || null,
        lineas: built,
        emitir_factura: emitirFactura,
        puntos_canjeados:
          clienteId !== "" && puntosCanjeados !== ""
            ? Math.floor(Number(puntosCanjeados))
            : undefined,
      });
      posBeepOk();
      if (r.factura_error) {
        toast("Venta ok. Factura: " + r.factura_error, "warning");
      } else {
        toast("Venta " + (r.total as number).toFixed(2) + " — listo", "success");
      }
      if (r.puntos_otorgados && r.puntos_otorgados > 0) {
        toast("+" + r.puntos_otorgados + " puntos al cliente", "info");
      }
      setCart([]);
      setCartSel(null);
      setClienteId("");
      setNotasVenta("");
      setPuntosCanjeados("");
      setMetodoPago("efectivo");
      await load();
    } catch (err) {
      posBeepErr();
      toast(err instanceof Error ? err.message : "Error al vender", "error");
    }
    barcodeRef.current?.focus();
  }

  const tabOk = tabParam != null && VENTAS_TABS.includes(tabParam as VentasTab);
  if (!tabOk) {
    return <Navigate to={`/ventas/${readLastTab("ventas", "pos")}`} replace />;
  }
  const tab = tabParam as VentasTab;

  return (
    <>
      <SubNav
        moduleId="ventas"
        items={[
          { id: "pos", label: "POS", to: "/ventas/pos" },
          { id: "historial", label: "Historial", to: "/ventas/historial" },
          { id: "devoluciones", label: "Devoluciones", to: "/ventas/devoluciones" },
        ]}
        quickActions={
          tab === "pos" ? (
            <button type="button" className="btn ghost small" onClick={() => void load()}>
              Sincronizar datos
            </button>
          ) : null
        }
      />

      {tab === "pos" ? (
    <div className="page-pos">
      <section className="pos-shell card-pro pos-shell--keyboard">
        <div className="pos-scan-row">
          <label className="pos-scan">
            <span className="pos-scan-label">Código / buscar (siempre activo)</span>
            <input
              ref={barcodeRef}
              className="pos-scan-input input-xl"
              placeholder="Escáner o teclado → Enter para agregar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onBarcodeEnter();
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSearch("");
                  setCartSel(null);
                  return;
                }
                if (!search.trim() && cart.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCartSel((s) =>
                      s === null ? 0 : Math.min(s + 1, cart.length - 1)
                    );
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCartSel((s) =>
                      s === null ? cart.length - 1 : Math.max(s - 1, 0)
                    );
                    return;
                  }
                }
              }}
              autoComplete="off"
              spellCheck={false}
              aria-label="Código de barras o búsqueda"
            />
          </label>
          {lookupBusy ? <span className="muted">Buscando…</span> : null}
        </div>

        <p className="pos-shortcuts-hint" aria-hidden>
          <kbd className="kbd-mini">Enter</kbd> agregar · <kbd className="kbd-mini">Esc</kbd> limpiar ·{" "}
          <kbd className="kbd-mini">↑</kbd>
          <kbd className="kbd-mini">↓</kbd> carrito · <kbd className="kbd-mini">Del</kbd> quitar línea ·{" "}
          <kbd className="kbd-mini">F1</kbd> efectivo · <kbd className="kbd-mini">F2</kbd> transfer. ·{" "}
          <kbd className="kbd-mini">F3</kbd> mixto · <kbd className="kbd-mini">F10</kbd> /{" "}
          <kbd className="kbd-mini">Ctrl</kbd>+<kbd className="kbd-mini">Enter</kbd> cobrar ·{" "}
          <kbd className="kbd-mini">Ctrl</kbd>+<kbd className="kbd-mini">N</kbd> nueva ·{" "}
          <kbd className="kbd-mini">Ctrl</kbd>+<kbd className="kbd-mini">C</kbd> cancelar ·{" "}
          <kbd className="kbd-mini">F4</kbd> foco aquí
        </p>

        <div className="pos-split pos-split--keyboard">
          <form
            ref={saleFormRef}
            className="pos-cart-column pos-sale-form pos-exempt-focus"
            onSubmit={pagar}
          >
            <h3 className="pos-panel-title">Carrito</h3>
            <div className="cart-lines cart-lines--main">
              {cart.length === 0 ? (
                <div className="empty-state empty-state--compact">
                  <p>Listo para escanear.</p>
                  <p className="muted">Enter agrega · una sola coincidencia también.</p>
                </div>
              ) : (
                cart.map((l, idx) => (
                  <div
                    key={l.producto_id}
                    className={`cart-line ${cartSel === idx ? "cart-line--selected" : ""}`}
                  >
                    <div className="cart-line-info">
                      <span className="cart-line-name">{l.nombre}</span>
                      <span className="cart-line-sub mono">
                        {(l.precio_unitario * l.cantidad).toFixed(2)}
                      </span>
                    </div>
                    <div className="cart-line-actions">
                      <button
                        type="button"
                        className="btn qty-btn"
                        tabIndex={-1}
                        onClick={() => bumpQty(l.producto_id, -1)}
                      >
                        −
                      </button>
                      <span className="cart-qty mono">{l.cantidad}</span>
                      <button
                        type="button"
                        className="btn qty-btn"
                        tabIndex={-1}
                        onClick={() => bumpQty(l.producto_id, 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="link danger cart-remove"
                        tabIndex={-1}
                        onClick={() => removeLine(l.producto_id)}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="cart-total-block cart-total-block--hero">
              <span className="cart-total-label">Total</span>
              <span className="cart-total-value mono">{total.toFixed(2)}</span>
            </div>

            <div className="pos-pay-strip" role="group" aria-label="Atajos de pago">
              <button
                type="button"
                className={`pos-pay-chip ${metodoPago === "efectivo" ? "pos-pay-chip--on" : ""}`}
                onClick={() => {
                  setMetodoPago("efectivo");
                  posBeepOk();
                }}
              >
                F1 Efectivo
              </button>
              <button
                type="button"
                className={`pos-pay-chip ${metodoPago === "transferencia" ? "pos-pay-chip--on" : ""}`}
                onClick={() => {
                  setMetodoPago("transferencia");
                  posBeepOk();
                }}
              >
                F2 Transferencia
              </button>
              <button
                type="button"
                className={`pos-pay-chip ${metodoPago === "mixto" ? "pos-pay-chip--on" : ""}`}
                onClick={() => {
                  setMetodoPago("mixto");
                  posBeepOk();
                }}
              >
                F3 Mixto
              </button>
            </div>

            <button type="submit" className="btn btn-pay btn-xl" disabled={cart.length === 0}>
              Cobrar <span className="btn-pay-keys">F10 · Ctrl+Enter</span>
            </button>

            <div className="pos-options pos-options--panel">
              <label className="field-inline">
                <span>Vendedor</span>
                <select
                  value={vendedorId === "" ? "" : String(vendedorId)}
                  onChange={(e) =>
                    setVendedorId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                >
                  <option value="">Seleccionar…</option>
                  {equipo.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre || p.email}
                    </option>
                  ))}
                </select>
              </label>
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
                      {c.tipo_cliente === "temporal" ? " · ocasional" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn secondary small"
                title="Crea un contacto mínimo para la venta"
                onClick={() => void agregarClienteOcasional()}
              >
                Cliente ocasional
              </button>
              <label className="field-inline">
                <span>Pago (detalle)</span>
                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="mixto">Mixto</option>
                  <option value="tarjeta">Tarjeta</option>
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
          </form>

          <div className="pos-products">
            <div className="pos-products-head">
              <h3 className="pos-panel-title">Catálogo</h3>
              <span className="muted">{filteredProducts.length} visibles</span>
            </div>
            {loading ? (
              <div className="pos-skel-grid">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="empty-state empty-state--compact">
                <p>Sin coincidencias.</p>
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
                        tabIndex={-1}
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
                        tabIndex={-1}
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
        </div>
      </section>
    </div>
      ) : null}

      {tab === "historial" ? (
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
            {ventas.slice(0, 50).map((v) => (
              <li key={v.id} className="sale-list-item">
                <span className="sale-list-date">{new Date(v.fecha).toLocaleString()}</span>
                <span className="sale-list-client">{v.cliente_nombre ?? "—"}</span>
                <span className="muted small">{v.vendedor_nombre ?? "—"}</span>
                <span className="sale-list-total">{v.total.toFixed(2)}</span>
                <span className="muted">{v.metodo_pago}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      ) : null}

      {tab === "devoluciones" ? (
        <section className="card-pro">
          <h2 className="card-pro-title">Devoluciones</h2>
          <p className="muted">
            Módulo de devoluciones y notas de crédito: próximamente. Por ahora gestioná ajustes desde{" "}
            <strong>Inventario</strong> o contactá soporte.
          </p>
        </section>
      ) : null}
    </>
  );
}
