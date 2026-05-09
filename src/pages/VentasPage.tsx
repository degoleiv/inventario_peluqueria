import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams, useLocation, useNavigate } from "react-router-dom";
import {
  Barcode,
  ClockCounterClockwise,
  LockSimple,
  MagnifyingGlass,
  Minus,
  Plus,
  ShoppingCart,
  Trash,
} from "@phosphor-icons/react";

import {
  createVenta,
  fetchAuthMe,
  fetchClientes,
  fetchEquipo,
  fetchProductos,
  fetchVentas,
  lookupBarcode,
  type Cliente,
  type EquipoMiembro,
  type Producto,
  type Venta,
} from "../api";
import { CreateClienteDrawer } from "../components/CreateClienteDrawer";
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
import { readVentasTab, VENTAS_TABS, type VentasTab } from "../lib/moduleRoutes";
import { publishPosClienteDisplay } from "../lib/posClientDisplay";
import { parsePosPreloadCita } from "../lib/posPrecargaDesdeCita";

type CartLine = {
  producto_id: number;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  stock_max: number;
};

function mergeClienteLista(prev: Cliente[], c: Cliente): Cliente[] {
  const rest = prev.filter((x) => x.id !== c.id);
  return [...rest, c].sort((a, b) =>
    (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" })
  );
}

export function VentasPage() {
  const { tab: tabParam } = useParams<{ tab: string }>();
  const location = useLocation();
  const navigate = useNavigate();
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
  const [emitirFactura] = useState(true);
  const [puntosCanjeados, setPuntosCanjeados] = useState<number | "">("");
  const [vendedorId, setVendedorId] = useState<number | "">("");
  const [pinTick, setPinTick] = useState(0);
  const [flashId, setFlashId] = useState<number | null>(null);
  /** Índice de línea seleccionada en carrito (↑↓); null = modo solo escáner */
  const [cartSel, setCartSel] = useState<number | null>(null);
  const [categoriaCatalogo, setCategoriaCatalogo] = useState<"todos" | string>("todos");
  const [catalogTake, setCatalogTake] = useState(48);
  const [clienteBusqueda, setClienteBusqueda] = useState("");
  const [createClienteOpen, setCreateClienteOpen] = useState(false);
  const [equipo, setEquipo] = useState<EquipoMiembro[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, p, c] = await Promise.all([fetchVentas(), fetchProductos(), fetchClientes()]);
      setVentas(v);
      setProductos(p);
      setClientes(c);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchAuthMe()
      .then((m) => setVendedorId(m.user.id))
      .catch(() => {});
  }, []);

  useEffect(() => {
    void fetchEquipo()
      .then(setEquipo)
      .catch(() => {});
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Precarga desde Citas → «Cobrar en POS» (cliente, vendedor, notas; producto si coincide el nombre del servicio). */
  useEffect(() => {
    if (tabParam !== "pos" || loading) return;
    const raw = (location.state as { posPrecargaCita?: unknown } | null)?.posPrecargaCita;
    const p = parsePosPreloadCita(raw);
    if (!p) return;
    navigate(".", { replace: true, state: null });

    setClienteId(p.clienteId);
    recordRecentCliente(p.clienteId);
    if (p.usuarioId != null && equipo.some((e) => e.id === p.usuarioId)) {
      setVendedorId(p.usuarioId);
    }
    const serv = (p.servicio ?? "").trim();
    const fechaTxt =
      p.inicioIso && !Number.isNaN(new Date(p.inicioIso).getTime())
        ? new Date(p.inicioIso).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })
        : "";
    setNotasVenta(`Cita #${p.citaId}${serv ? ` · ${serv}` : ""}${fechaTxt ? ` · ${fechaTxt}` : ""}`);

    const norm = serv.toLowerCase();
    if (norm && productos.length > 0) {
      const exact = productos.find((x) => x.nombre.trim().toLowerCase() === norm);
      const candidates = productos.filter((x) => x.nombre.toLowerCase().includes(norm));
      const one = exact ?? (candidates.length === 1 ? candidates[0] : undefined);
      if (one && one.stock > 0) {
        const lista = one.precio_venta ?? one.precio ?? 0;
        setCart([
          {
            producto_id: one.id,
            nombre: one.nombre,
            cantidad: 1,
            precio_unitario: lista,
            stock_max: one.stock,
          },
        ]);
        recordRecentProduct(one.id);
        setSearch("");
        setCartSel(null);
      }
    }
    toast("Cita cargada en el POS: revisá el carrito y cobrá cuando quieras.", "info");
  }, [tabParam, loading, location.state, productos, equipo, navigate, toast]);

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

  const productosActivos = useMemo(
    () => productos.filter((p) => p.estado !== "inactivo"),
    [productos]
  );

  const categoriasCatalogo = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of productosActivos) {
      const c = p.categoria?.trim() || "Sin categoría";
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [productosActivos]);

  const { filteredProducts, catalogMatchCount } = useMemo(() => {
    const q = search.trim().toLowerCase();
    let pool = productosActivos;
    if (categoriaCatalogo !== "todos") {
      pool = pool.filter((p) => (p.categoria?.trim() || "Sin categoría") === categoriaCatalogo);
    }
    const matched = !q
      ? pool
      : pool.filter(
          (p) =>
            p.nombre.toLowerCase().includes(q) ||
            (p.codigo_barras && p.codigo_barras.includes(q)) ||
            (p.marca && p.marca.toLowerCase().includes(q))
        );
    const pins = new Set(getPinnedProductIds());
    const recent = getRecentProductIds();
    const score = (p: Producto) => {
      let s = 0;
      if (pins.has(p.id)) s += 2000;
      const ri = recent.indexOf(p.id);
      if (ri >= 0) s += 80 - ri * 2;
      return s;
    };
    const sorted = [...matched].sort((a, b) => score(b) - score(a));
    return {
      filteredProducts: sorted.slice(0, catalogTake),
      catalogMatchCount: matched.length,
    };
  }, [productosActivos, search, pinTick, categoriaCatalogo, catalogTake]);

  useEffect(() => {
    setCatalogTake(48);
  }, [search, categoriaCatalogo]);

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

  const clientesFiltradosLista = useMemo(() => {
    const q = clienteBusqueda.trim().toLowerCase();
    if (q === "") return clientesOrdenados;
    return clientesOrdenados.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.telefono && String(c.telefono).includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
    );
  }, [clientesOrdenados, clienteBusqueda]);

  function precioLista(p: Producto) {
    return p.precio_venta ?? p.precio ?? 0;
  }

  function formatMoney(n: number) {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function stockBajo(p: Producto) {
    const min = p.stock_minimo ?? 3;
    return p.stock > 0 && p.stock <= min;
  }

  function addProduct(p: Producto) {
    const lista = precioLista(p);
    if (p.estado === "inactivo") {
      posBeepErr();
      toast("«" + p.nombre + "» está inactivo y no se puede vender", "warning");
      return;
    }
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

  useEffect(() => {
    publishPosClienteDisplay({
      lines: cart.map((l) => ({
        nombre: l.nombre,
        cantidad: l.cantidad,
        importe: l.precio_unitario * l.cantidad,
      })),
      subtotal: total,
    });
  }, [cart, total]);

  const abrirPantallaCliente = useCallback(() => {
    try {
      const u = new URL(window.location.href);
      u.hash = "#/ventas/pantalla-cliente";
      window.open(u.toString(), "peluqueria_pos_cliente", "noopener,noreferrer");
    } catch {
      window.open("#/ventas/pantalla-cliente", "peluqueria_pos_cliente", "noopener,noreferrer");
    }
  }, []);

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
    return <Navigate to={`/ventas/${readVentasTab()}`} replace />;
  }
  const tab = tabParam as VentasTab;

  return (
    <>
      <SubNav
        moduleId="ventas"
        items={[
          { id: "ventas", label: "Ventas", to: "/ventas/ventas" },
          { id: "historial", label: "Historial", to: "/ventas/historial" },
          { id: "devoluciones", label: "Devoluciones", to: "/ventas/devoluciones" },
        ]}
        quickActions={
          tab === "ventas" ? (
            <>
              <button type="button" className="btn ghost small" onClick={abrirPantallaCliente}>
                Pantalla cliente
              </button>
              <button type="button" className="btn ghost small" onClick={() => void load()}>
                Sincronizar datos
              </button>
            </>
          ) : null
        }
      />

      {tab === "ventas" ? (
        <div className="page-pos page-pos--saas">
          <header className="pos-saas-head">
            <div className="pos-saas-head-text">
              <h1 className="pos-saas-head-title">
                <ShoppingCart className="pos-saas-head-icon" size={28} weight="duotone" aria-hidden />
                Nueva venta
              </h1>
            </div>
            <div className="pos-saas-head-actions">
              <Link to="/ventas/historial" className="btn ghost small pos-saas-link-history">
                <ClockCounterClockwise size={18} aria-hidden />
                Historial de ventas
              </Link>
            </div>
          </header>

          <form ref={saleFormRef} className="pos-saas-grid pos-sale-form" onSubmit={pagar}>
            <div className="pos-saas-col pos-saas-col--main">
              <section className="pos-saas-card">
                <div className="pos-saas-card-head pos-saas-card-head--row">
                  <div className="pos-saas-card-head-textblock">
                    <div className="pos-saas-card-head-left">
                      <span className="pos-saas-step">1</span>
                      <h2 className="pos-saas-card-title">Productos seleccionados</h2>
                    </div>
                    <p className="pos-saas-card-desc muted">Revisá cantidades antes de cobrar.</p>
                  </div>
                  {cart.length > 0 ? (
                    <button
                      type="button"
                      className="pos-saas-link-clear link danger"
                      onClick={() => {
                        setCart([]);
                        setCartSel(null);
                        posBeepOk();
                        window.setTimeout(() => barcodeRef.current?.focus(), 0);
                      }}
                    >
                      <Trash size={16} aria-hidden />
                      Vaciar carrito
                    </button>
                  ) : null}
                </div>
                <div className="pos-saas-table-wrap">
                  {cart.length === 0 ? (
                    <div className="pos-saas-empty-cart">
                      <p>Todavía no hay productos.</p>
                      <p className="muted small">Agregalos desde el catálogo más abajo.</p>
                    </div>
                  ) : (
                    <table className="pos-saas-table">
                      <thead>
                        <tr>
                          <th className="pos-saas-th-thumb" scope="col" />
                          <th scope="col">Producto</th>
                          <th scope="col">Precio</th>
                          <th scope="col">Cant.</th>
                          <th scope="col">Subtotal</th>
                          <th scope="col" className="pos-saas-th-actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {cart.map((l, idx) => {
                          const prod = productos.find((x) => x.id === l.producto_id);
                          const sub = l.precio_unitario * l.cantidad;
                          return (
                            <tr
                              key={l.producto_id}
                              className={cartSel === idx ? "pos-saas-tr--selected" : undefined}
                            >
                              <td>
                                <div className="pos-saas-thumb">
                                  {prod?.imagen_url ? (
                                    <img src={prod.imagen_url} alt="" loading="lazy" />
                                  ) : (
                                    <span className="pos-saas-thumb-ph" aria-hidden />
                                  )}
                                </div>
                              </td>
                              <td>
                                <span className="pos-saas-td-name">{l.nombre}</span>
                              </td>
                              <td className="mono muted">{formatMoney(l.precio_unitario)}</td>
                              <td>
                                <div className="pos-saas-qty">
                                  <button
                                    type="button"
                                    className="pos-saas-qty-btn"
                                    tabIndex={-1}
                                    onClick={() => bumpQty(l.producto_id, -1)}
                                    aria-label="Menos"
                                  >
                                    <Minus size={14} weight="bold" />
                                  </button>
                                  <span className="pos-saas-qty-val mono">{l.cantidad}</span>
                                  <button
                                    type="button"
                                    className="pos-saas-qty-btn"
                                    tabIndex={-1}
                                    onClick={() => bumpQty(l.producto_id, 1)}
                                    aria-label="Más"
                                  >
                                    <Plus size={14} weight="bold" />
                                  </button>
                                </div>
                              </td>
                              <td className="mono pos-saas-td-strong">{formatMoney(sub)}</td>
                              <td>
                                <button
                                  type="button"
                                  className="pos-saas-icon-btn danger"
                                  tabIndex={-1}
                                  title="Quitar línea"
                                  onClick={() => removeLine(l.producto_id)}
                                >
                                  <Trash size={18} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="pos-saas-totals pos-saas-totals--one-line">
                  <div className="pos-saas-total-pair">
                    <span>Total productos</span>
                    <span className="mono">{formatMoney(total)}</span>
                  </div>
                  <div className="pos-saas-total-pair">
                    <span>Descuento</span>
                    <button
                      type="button"
                      className="pos-saas-add-discount"
                      onClick={() => toast("Descuentos en venta: próximamente.", "info")}
                    >
                      + Agregar descuento
                    </button>
                  </div>
                </div>
              </section>

              <section className="pos-saas-card pos-saas-card--catalog">
                <div className="pos-saas-card-head pos-saas-card-head--stack">
                  <h2 className="pos-saas-card-title pos-saas-card-title--plain">Catálogo de productos</h2>
                  <p className="pos-saas-card-desc muted">Buscá, filtrá por categoría y tocá para agregar.</p>
                </div>
                <div className="pos-saas-search-row">
                  <div className="pos-saas-search-wrap">
                    <MagnifyingGlass className="pos-saas-search-ico" size={22} aria-hidden />
                    <input
                      ref={barcodeRef}
                      className="pos-saas-search-input"
                      placeholder="Buscar por código, nombre o escanear código de barras"
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
                      aria-label="Buscar productos o código de barras"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn secondary pos-saas-scan-side"
                    title="Confirmar búsqueda o código"
                    onClick={() => void onBarcodeEnter()}
                  >
                    <Barcode size={22} weight="duotone" aria-hidden />
                  </button>
                  {lookupBusy ? <span className="muted pos-saas-busy">Buscando…</span> : null}
                </div>

                <div className="pos-saas-chips" role="tablist" aria-label="Categorías">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={categoriaCatalogo === "todos"}
                    className={`pos-saas-chip ${categoriaCatalogo === "todos" ? "pos-saas-chip--on" : ""}`}
                    onClick={() => setCategoriaCatalogo("todos")}
                  >
                    Todos
                  </button>
                  {categoriasCatalogo.map(([nombre, count]) => (
                    <button
                      key={nombre}
                      type="button"
                      role="tab"
                      aria-selected={categoriaCatalogo === nombre}
                      className={`pos-saas-chip ${categoriaCatalogo === nombre ? "pos-saas-chip--on" : ""}`}
                      onClick={() => setCategoriaCatalogo(nombre)}
                    >
                      {nombre}
                      <span className="pos-saas-chip-count">{count}</span>
                    </button>
                  ))}
                </div>

                {loading ? (
                  <div className="pos-saas-pro-grid pos-saas-pro-grid--skel">
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="pos-saas-empty-catalog">
                    <p>No hay productos para mostrar.</p>
                    <p className="muted small">Probá otra categoría o otra búsqueda.</p>
                  </div>
                ) : (
                  <>
                    <div className="pos-saas-pro-grid">
                      {filteredProducts.map((p) => {
                        const pv = precioLista(p);
                        const disabled = p.stock <= 0;
                        const pinned = isProductPinned(p.id);
                        const low = stockBajo(p);
                        return (
                          <div
                            key={p.id}
                            className={`pos-saas-pro-card ${disabled ? "pos-saas-pro-card--disabled" : ""} ${flashId === p.id ? "pos-saas-pro-card--flash" : ""}`}
                          >
                            <button
                              type="button"
                              className="pos-saas-pro-card-main"
                              tabIndex={-1}
                              onClick={() => !disabled && addProduct(p)}
                              disabled={disabled}
                            >
                              <div className="pos-saas-pro-img-wrap">
                                {p.imagen_url ? (
                                  <img src={p.imagen_url} alt="" className="pos-saas-pro-img" loading="lazy" />
                                ) : (
                                  <div className="pos-saas-pro-img-ph" aria-hidden />
                                )}
                              </div>
                              <span className="pos-saas-pro-name">{p.nombre}</span>
                              <span className="pos-saas-pro-price mono">{formatMoney(pv)}</span>
                              <span
                                className={`pos-saas-pro-stock ${low ? "pos-saas-pro-stock--low" : "pos-saas-pro-stock--ok"}`}
                              >
                                Stock: {p.stock}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="pos-saas-pro-add"
                              tabIndex={-1}
                              title="Agregar"
                              disabled={disabled}
                              onClick={() => !disabled && addProduct(p)}
                            >
                              <Plus size={20} weight="bold" />
                            </button>
                            <button
                              type="button"
                              className={`pos-saas-pro-fav ${pinned ? "pos-saas-pro-fav--on" : ""}`}
                              tabIndex={-1}
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
                    {catalogMatchCount > catalogTake ? (
                      <div className="pos-saas-more-wrap">
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => setCatalogTake((n) => n + 48)}
                        >
                          Cargar más productos
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            </div>

            <div className="pos-saas-col pos-saas-col--aside">
              <section className="pos-saas-card pos-saas-card--sticky">
                <div className="pos-saas-card-head pos-saas-card-head--stack">
                  <div className="pos-saas-card-head-left">
                    <span className="pos-saas-step">2</span>
                    <h2 className="pos-saas-card-title">Cliente y método de pago</h2>
                  </div>
                  <p className="pos-saas-card-desc muted">Completá antes de cobrar.</p>
                </div>

                <div className="pos-saas-aside-block">
                  <span className="pos-saas-field-label">Cliente</span>
                  <input
                    type="search"
                    className="pos-saas-input"
                    placeholder="Buscar cliente por nombre, teléfono o documento…"
                    value={clienteBusqueda}
                    onChange={(e) => setClienteBusqueda(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Filtrar lista de clientes"
                  />
                  <select
                    id="venta-cliente-select"
                    className="pos-saas-select"
                    value={clienteId === "" ? "" : String(clienteId)}
                    onChange={(e) => {
                      const v = e.target.value === "" ? "" : Number(e.target.value);
                      setClienteId(v);
                      if (v !== "") recordRecentCliente(v);
                    }}
                  >
                    <option value="">Elegir cliente…</option>
                    {clientesFiltradosLista.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                        {c.tipo_cliente === "temporal" ? " · ocasional" : ""}
                      </option>
                    ))}
                  </select>
                  <div className="pos-saas-cliente-actions">
                    <button
                      type="button"
                      className="btn secondary pos-saas-btn-registrar-cliente"
                      onClick={() => setCreateClienteOpen(true)}
                    >
                      Registrar nuevo cliente
                    </button>
                  </div>
                </div>

                <span className="pos-saas-field-label pos-saas-field-label--spaced">Método de pago</span>
                <div className="pos-saas-pay-grid pos-saas-pay-grid--aside" role="group" aria-label="Método de pago">
                  {(
                    [
                      { id: "efectivo", label: "💵 Efectivo" },
                      { id: "tarjeta", label: "💳 Tarjeta" },
                      { id: "transferencia", label: "🏦 Transferencia" },
                      { id: "mixto", label: "🔀 Mixto" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`pos-saas-pay-card ${metodoPago === opt.id ? "pos-saas-pay-card--on" : ""}`}
                      onClick={() => {
                        setMetodoPago(opt.id);
                        posBeepOk();
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="pos-saas-pay-summary">
                  <span className="pos-saas-pay-summary-label">Total a pagar</span>
                  <span className="pos-saas-pay-summary-value">{formatMoney(total)}</span>
                </div>

                <button type="submit" className="pos-saas-cobrar btn primary" disabled={cart.length === 0}>
                  <LockSimple size={20} weight="fill" className="pos-saas-cobrar-icon" aria-hidden />
                  Cobrar {formatMoney(total)}
                </button>
              </section>
            </div>
          </form>

          <CreateClienteDrawer
            open={createClienteOpen}
            onClose={() => setCreateClienteOpen(false)}
            onCreated={(c) => {
              setClientes((prev) => mergeClienteLista(prev, c));
              setClienteId(c.id);
              recordRecentCliente(c.id);
              setClienteBusqueda("");
            }}
          />
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
