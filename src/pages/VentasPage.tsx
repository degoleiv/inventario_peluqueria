import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams, useLocation, useNavigate } from "react-router-dom";
import {
  CaretDown,
  CaretUp,
  Barcode,
  LockSimple,
  MagnifyingGlass,
  Minus,
  Plus,
  ArrowsIn,
  ArrowsOut,
  ClockCounterClockwise,
  ShoppingCart,
  Trash,
} from "@phosphor-icons/react";

import {
  createCita,
  createVenta,
  fetchAuthMe,
  fetchCategoriasServicio,
  fetchCitaCobro,
  fetchCitasAsociarVentas,
  fetchClientes,
  fetchDescuentosVigentes,
  fetchEquipo,
  fetchInventarioCatalogo,
  fetchProductos,
  fetchVentas,
  lookupBarcode,
  patchCitaServiciosDesdePos,
  resolveImageSrc,
  type CategoriaServicio,
  type Cita,
  type Cliente,
  type Descuento,
  type DescuentoTipo,
  type EquipoMiembro,
  type InventarioCatalogo,
  type Producto,
  type Venta,
} from "../api";
import { CreateClienteDrawer } from "../components/CreateClienteDrawer";
import { SearchableSelect } from "../components/SearchableSelect";
import { SkeletonCard } from "../components/Skeleton";
import { useToast } from "../context/ToastContext";
import { usePuede } from "../context/PermisosContext";
import { filterIntegerTyping } from "../lib/decimalInput";
import { formatMoney, formatMoneyForInput, parseMoneyInput } from "../lib/money";
import { usePosFocus } from "../context/PosFocusContext";
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
import {
  buildMetodoPagoParaApi,
  METODO_PAGO_VENTA_INICIAL,
  METODOS_PAGO_POS,
  validarMetodoPagoVenta,
  type MetodoPagoVentaInput,
} from "../lib/ventaMetodoPago";
import { PosMetodoPagoFields } from "../components/ventas/PosMetodoPagoFields";
import { useMediosPagoTransferencia } from "../hooks/useMediosPagoTransferencia";
import { SubNav } from "../components/SubNav";
import { SaleSuccessModal } from "../components/ventas/SaleSuccessModal";
import { VentasHistorialSection } from "../components/ventas/VentasHistorialSection";
import { DevolucionesSection } from "../components/ventas/DevolucionesSection";
import { VentasCierreSection } from "../components/ventas/VentasCierreSection";
import { DescuentosSection } from "../components/ventas/DescuentosSection";
import { readVentasTab, VENTAS_TABS, type VentasTab } from "../lib/moduleRoutes";
import { publishPosClienteDisplay } from "../lib/posClientDisplay";
import { lineasServicioDesdeTextoAgenda, parsePosPreloadCita } from "../lib/posPrecargaDesdeCita";
import {
  clearSessionDraft,
  loadSessionDraft,
  saveSessionDraft,
} from "../lib/sessionDraft";

type CartLine = {
  producto_id: number;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  stock_max: number;
};

/** Línea de servicio realizado precargada desde una cita (no descuenta stock). */
type ServicioLine = {
  nombre: string;
  profesional_id: number | "";
  valor_unitario: number;
};

type VentaStep = "items" | "pagos";

const POS_DRAFT_KEY = "peluqueria_pos_draft_v1";

type PosDraft = {
  cart?: CartLine[];
  cartServicios?: ServicioLine[];
  citaOrigenId?: number | null;
  citaOrigenInfo?: string | null;
  search?: string;
  clienteId?: number | "";
  clienteBusqueda?: string;
  metodoPagoVenta?: MetodoPagoVentaInput;
  notasVenta?: string;
  puntosCanjeados?: number | "";
  vendedorId?: number | "";
  ventaStep?: VentaStep;
  descuentoManualTipo?: DescuentoTipo;
  descuentoManualValor?: number | "";
  descuentoManualMotivo?: string;
};

function readPosDraft(): PosDraft | null {
  const d = loadSessionDraft<PosDraft>(POS_DRAFT_KEY);
  if (!d || typeof d !== "object") return null;
  return d;
}

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
  const puedeCrearVenta = usePuede("ventas", "crear");
  const puedeEditarVenta = usePuede("ventas", "editar");
  const puedeEliminarVenta = usePuede("ventas", "eliminar");
  const puedeCrearCliente = usePuede("clientes", "crear");
  const { medios: mediosTransferencia } = useMediosPagoTransferencia();
  const barcodeRef = useRef<HTMLInputElement>(null);
  const saleFormRef = useRef<HTMLFormElement>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const posDraft0 = useMemo(() => readPosDraft(), []);
  const [cart, setCart] = useState<CartLine[]>(() =>
    Array.isArray(posDraft0?.cart) ? posDraft0.cart : []
  );
  const [cartServicios, setCartServicios] = useState<ServicioLine[]>(() =>
    Array.isArray(posDraft0?.cartServicios) ? posDraft0.cartServicios : []
  );
  const [serviciosCatalogo, setServiciosCatalogo] = useState<CategoriaServicio[]>([]);
  const [citaOrigenId, setCitaOrigenId] = useState<number | null>(() =>
    typeof posDraft0?.citaOrigenId === "number" ? posDraft0.citaOrigenId : posDraft0?.citaOrigenId === null ? null : null
  );
  const [citaOrigenInfo, setCitaOrigenInfo] = useState<string | null>(() =>
    typeof posDraft0?.citaOrigenInfo === "string" ? posDraft0.citaOrigenInfo : null
  );
  const [citasParaAsociar, setCitasParaAsociar] = useState<Cita[]>([]);
  const citaSyncTimerRef = useRef<number | null>(null);
  const [search, setSearch] = useState(() => (typeof posDraft0?.search === "string" ? posDraft0.search : ""));
  const [lookupBusy, setLookupBusy] = useState(false);

  const [clienteId, setClienteId] = useState<number | "">(() =>
    posDraft0?.clienteId === "" || typeof posDraft0?.clienteId === "number" ? posDraft0.clienteId : ""
  );
  const [metodoPagoVenta, setMetodoPagoVenta] = useState<MetodoPagoVentaInput>(() => ({
    ...METODO_PAGO_VENTA_INICIAL,
    ...(posDraft0?.metodoPagoVenta && typeof posDraft0.metodoPagoVenta === "object"
      ? posDraft0.metodoPagoVenta
      : {}),
  }));
  const [notasVenta, setNotasVenta] = useState(() =>
    typeof posDraft0?.notasVenta === "string" ? posDraft0.notasVenta : ""
  );
  const [emitirFactura] = useState(true);
  const [puntosCanjeados, setPuntosCanjeados] = useState<number | "">(() =>
    posDraft0?.puntosCanjeados === "" || typeof posDraft0?.puntosCanjeados === "number"
      ? posDraft0.puntosCanjeados
      : ""
  );
  const [descuentoManualTipo, setDescuentoManualTipo] = useState<DescuentoTipo>(
    posDraft0?.descuentoManualTipo === "monto" || posDraft0?.descuentoManualTipo === "porcentaje"
      ? posDraft0.descuentoManualTipo
      : "porcentaje"
  );
  const [descuentoManualValor, setDescuentoManualValor] = useState<number | "">(
    posDraft0?.descuentoManualValor === "" || typeof posDraft0?.descuentoManualValor === "number"
      ? posDraft0.descuentoManualValor
      : ""
  );
  const [descuentoManualMotivo, setDescuentoManualMotivo] = useState<string>(
    typeof posDraft0?.descuentoManualMotivo === "string" ? posDraft0.descuentoManualMotivo : ""
  );
  const [descuentosVigentes, setDescuentosVigentes] = useState<Descuento[]>([]);
  const [vendedorId, setVendedorId] = useState<number | "">(() =>
    posDraft0?.vendedorId === "" || typeof posDraft0?.vendedorId === "number" ? posDraft0.vendedorId : ""
  );
  const [pinTick, setPinTick] = useState(0);
  const [flashId, setFlashId] = useState<number | null>(null);
  /** Índice de línea seleccionada en carrito (↑↓); null = modo solo escáner */
  const [cartSel, setCartSel] = useState<number | null>(null);
  const [catalogTake, setCatalogTake] = useState(48);
  const [filtroCategoriaCatalogo, setFiltroCategoriaCatalogo] = useState("todos");
  const [filtroProveedorCatalogo, setFiltroProveedorCatalogo] = useState("todos");
  const [inventarioCatalogo, setInventarioCatalogo] = useState<InventarioCatalogo | null>(null);
  const [clienteBusqueda, setClienteBusqueda] = useState(() =>
    typeof posDraft0?.clienteBusqueda === "string" ? posDraft0.clienteBusqueda : ""
  );
  const [createClienteOpen, setCreateClienteOpen] = useState(false);
  const [equipo, setEquipo] = useState<EquipoMiembro[]>([]);
  const [nuevaCitaOpen, setNuevaCitaOpen] = useState(false);
  const [nuevaCitaFecha, setNuevaCitaFecha] = useState("");
  const [nuevaCitaHora, setNuevaCitaHora] = useState("");
  const [nuevaCitaDuracion, setNuevaCitaDuracion] = useState("60");
  const [nuevaCitaServicio, setNuevaCitaServicio] = useState("");
  const [nuevaCitaProfesional, setNuevaCitaProfesional] = useState<number | "">("");
  const [nuevaCitaSubmitting, setNuevaCitaSubmitting] = useState(false);
  const [clienteOpen, setClienteOpen] = useState(false);
  const [clienteHover, setClienteHover] = useState(0);
  const clienteComboRef = useRef<HTMLDivElement>(null);
  const [ventaStep, setVentaStep] = useState<VentaStep>(() =>
    posDraft0?.ventaStep === "pagos" || posDraft0?.ventaStep === "items" ? posDraft0.ventaStep : "items"
  );
  /** En pantalla estrecha: pestaña activa del carrito (productos | servicios). */
  const [cartMobileTab, setCartMobileTab] = useState<"prods" | "svcs">("prods");
  /** En pantalla estrecha: acordeón de productos (escritorio). */
  const [cartProdsOpen, setCartProdsOpen] = useState(false);
  const [cartSvcsOpen, setCartSvcsOpen] = useState(true);
  const [successModal, setSuccessModal] = useState<{
    open: boolean;
    total: number;
    invoiceNumber: string | number | null;
  }>({ open: false, total: 0, invoiceNumber: null });

  useEffect(() => {
    if (cart.length > 0) setCartProdsOpen(true);
  }, [cart.length]);

  useEffect(() => {
    if (cartServicios.length > 0) {
      setCartSvcsOpen(true);
      if (cart.length === 0) setCartMobileTab("svcs");
    }
  }, [cartServicios.length, cart.length]);

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
    if (tabParam !== "ventas") return;
    let cancelled = false;
    void fetchCategoriasServicio({ estado: "activo", page_size: 500 })
      .then((r) => {
        if (!cancelled) setServiciosCatalogo(r.items);
      })
      .catch(() => {
        if (!cancelled) setServiciosCatalogo([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tabParam]);

  useEffect(() => {
    if (citaOrigenId == null) return;
    if (citaSyncTimerRef.current != null) window.clearTimeout(citaSyncTimerRef.current);
    citaSyncTimerRef.current = window.setTimeout(() => {
      citaSyncTimerRef.current = null;
      const nombres = cartServicios.map((s) => s.nombre.trim()).filter(Boolean);
      void patchCitaServiciosDesdePos(citaOrigenId, nombres).catch((e) =>
        toast(e instanceof Error ? e.message : "No se pudo actualizar la agenda", "error")
      );
    }, 500);
    return () => {
      if (citaSyncTimerRef.current != null) window.clearTimeout(citaSyncTimerRef.current);
    };
  }, [cartServicios, citaOrigenId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tabParam !== "ventas") return;
    let cancel = false;
    void fetchInventarioCatalogo()
      .then((data) => {
        if (!cancel) setInventarioCatalogo(data);
      })
      .catch(() => {
        if (!cancel) setInventarioCatalogo(null);
      });
    return () => {
      cancel = true;
    };
  }, [tabParam]);

  /**
   * Precarga desde Citas → «Cobrar en POS»: cliente, profesional, notas, vínculo a la cita
   * y los servicios realizados como nueva sección (no como productos del inventario).
   */
  useEffect(() => {
    if (tabParam !== "ventas" || loading) return;
    const raw = (location.state as { posPrecargaCita?: unknown } | null)?.posPrecargaCita;
    const p = parsePosPreloadCita(raw);
    if (!p) return;
    navigate(".", { replace: true, state: null });

    void (async () => {
      let yaCobrada: { ya_cobrada: boolean; venta_id: number | null } | null = null;
      try {
        const r = await fetchCitaCobro(p.citaId);
        yaCobrada = { ya_cobrada: r.ya_cobrada, venta_id: r.venta_id };
      } catch {
        /* permitimos la precarga aunque el chequeo remoto falle; el backend volverá a validar al cobrar */
      }

      if (yaCobrada?.ya_cobrada && yaCobrada.venta_id != null) {
        toast(
          `Esta cita ya fue cobrada en la venta #${yaCobrada.venta_id}. Anulala primero si querés re-cobrarla.`,
          "warning"
        );
        return;
      }

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
      setNotasVenta(
        `Cita #${p.citaId}${serv ? ` · ${serv}` : ""}${fechaTxt ? ` · ${fechaTxt}` : ""}`
      );
      setCitaOrigenId(p.citaId);
      setCitaOrigenInfo(
        `Cita #${p.citaId}${serv ? ` · ${serv}` : ""}${fechaTxt ? ` · ${fechaTxt}` : ""}`
      );

      const lineasServ = (p.servicios && p.servicios.length > 0
        ? p.servicios
        : serv
          ? [{ nombre: serv, usuarioId: p.usuarioId, cantidad: 1, valorUnitario: 0 }]
          : []
      ).map<ServicioLine>((s) => ({
        nombre: s.nombre,
        profesional_id: s.usuarioId ?? p.usuarioId ?? "",
        valor_unitario: Math.max(0, Number(s.valorUnitario ?? 0)),
      }));
      setCartServicios(lineasServ);

      toast(
        lineasServ.length > 0
          ? "Cita cargada: revisá los servicios, sumá productos si hace falta y cobrá."
          : "Cita cargada en el POS: revisá el carrito y cobrá cuando quieras.",
        "info"
      );
    })();
  }, [tabParam, loading, location.state, equipo, navigate, toast]);

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

  useEffect(() => {
    const t = window.setTimeout(() => {
      const empty =
        cart.length === 0 &&
        cartServicios.length === 0 &&
        !search.trim() &&
        !clienteId &&
        !notasVenta.trim() &&
        ventaStep === "items";
      if (empty) {
        clearSessionDraft(POS_DRAFT_KEY);
        return;
      }
      saveSessionDraft(POS_DRAFT_KEY, {
        cart,
        cartServicios,
        citaOrigenId,
        citaOrigenInfo,
        search,
        clienteId,
        clienteBusqueda,
        metodoPagoVenta,
        notasVenta,
        puntosCanjeados,
        vendedorId,
        ventaStep,
        descuentoManualTipo,
        descuentoManualValor,
        descuentoManualMotivo,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [
    cart,
    cartServicios,
    citaOrigenId,
    citaOrigenInfo,
    search,
    clienteId,
    clienteBusqueda,
    metodoPagoVenta,
    notasVenta,
    puntosCanjeados,
    vendedorId,
    ventaStep,
    descuentoManualTipo,
    descuentoManualValor,
    descuentoManualMotivo,
  ]);

  const nuevaVenta = useCallback(() => {
    setCart([]);
    setCartServicios([]);
    setCitaOrigenId(null);
    setCitaOrigenInfo(null);
    setSearch("");
    setCartSel(null);
    setClienteId("");
    setClienteBusqueda("");
    setClienteOpen(false);
    setNotasVenta("");
    setPuntosCanjeados("");
    setMetodoPagoVenta({ ...METODO_PAGO_VENTA_INICIAL });
    setDescuentoManualTipo("porcentaje");
    setDescuentoManualValor("");
    setDescuentoManualMotivo("");
    setVentaStep("items");
    clearSessionDraft(POS_DRAFT_KEY);
    toast("Nueva venta lista", "info");
    window.setTimeout(() => barcodeRef.current?.focus(), 0);
  }, [toast]);

  const cancelarVenta = useCallback(() => {
    if (cart.length === 0 && cartServicios.length === 0 && !search.trim()) return;
    setCart([]);
    setCartServicios([]);
    setCitaOrigenId(null);
    setCitaOrigenInfo(null);
    setSearch("");
    setCartSel(null);
    setVentaStep("items");
    clearSessionDraft(POS_DRAFT_KEY);
    toast("Venta cancelada", "warning");
    window.setTimeout(() => barcodeRef.current?.focus(), 0);
  }, [cart.length, cartServicios.length, search, toast]);

  const onSuccessModalClose = useCallback(() => {
    setSuccessModal({ open: false, total: 0, invoiceNumber: null });
    setCart([]);
    setCartServicios([]);
    setCitaOrigenId(null);
    setCitaOrigenInfo(null);
    setCartSel(null);
    setClienteId("");
    setClienteBusqueda("");
    setClienteOpen(false);
    setNotasVenta("");
    setPuntosCanjeados("");
    setMetodoPagoVenta({ ...METODO_PAGO_VENTA_INICIAL });
    setVentaStep("items");
    clearSessionDraft(POS_DRAFT_KEY);
    void load();
    window.setTimeout(() => barcodeRef.current?.focus(), 0);
  }, [load]);

  const agregarLineaServicio = useCallback(() => {
    setCartMobileTab("svcs");
    setCartServicios((prev) => [
      ...prev,
      {
        nombre: "",
        profesional_id: vendedorId === "" ? "" : vendedorId,
        valor_unitario: 0,
      },
    ]);
    posBeepOk();
  }, [vendedorId]);

  const quitarTodosServiciosYCita = useCallback(() => {
    setCartServicios([]);
    setCitaOrigenId(null);
    setCitaOrigenInfo(null);
    setClienteId("");
    setClienteBusqueda("");
    setClienteOpen(false);
    posBeepOk();
  }, []);

  const productosActivos = useMemo(
    () => productos.filter((p) => p.estado !== "inactivo"),
    [productos]
  );

  const opcionesFiltroCategoriaCatalogo = useMemo(() => {
    const names = new Set<string>();
    for (const c of inventarioCatalogo?.categorias ?? []) {
      const n = c.nombre_categoria.trim();
      if (n) names.add(n);
    }
    for (const p of productosActivos) {
      const n = p.categoria?.trim();
      if (n) names.add(n);
    }
    const sorted = [...names].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
    return [
      { value: "todos", label: "Todas las categorías" },
      { value: "sin", label: "Sin categoría" },
      ...sorted.map((n) => ({ value: n, label: n })),
    ];
  }, [inventarioCatalogo, productosActivos]);

  const opcionesFiltroProveedorCatalogo = useMemo(() => {
    const provs = [...(inventarioCatalogo?.proveedores ?? [])].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
    );
    return [
      { value: "todos", label: "Todos los proveedores" },
      { value: "sin", label: "Sin proveedor" },
      ...provs.map((pr) => ({ value: String(pr.id), label: pr.nombre })),
    ];
  }, [inventarioCatalogo]);

  const opcionesServicioNuevaCita = useMemo(
    () =>
      serviciosCatalogo.map((s) => ({
        value: s.nombre_categoria,
        label: s.emoji ? `${s.emoji} ${s.nombre_categoria}` : s.nombre_categoria,
      })),
    [serviciosCatalogo]
  );

  const opcionesProfesionalNuevaCita = useMemo(
    () =>
      equipo.map((p) => ({
        value: String(p.id),
        label: p.nombre || p.email,
      })),
    [equipo]
  );

  const { filteredProducts, catalogMatchCount } = useMemo(() => {
    const q = search.trim().toLowerCase();
    let pool = productosActivos;
    if (filtroCategoriaCatalogo !== "todos") {
      if (filtroCategoriaCatalogo === "sin") {
        pool = pool.filter((p) => !(p.categoria?.trim() ?? ""));
      } else {
        pool = pool.filter(
          (p) => (p.categoria?.trim() ?? "").toLowerCase() === filtroCategoriaCatalogo.toLowerCase()
        );
      }
    }
    if (filtroProveedorCatalogo !== "todos") {
      if (filtroProveedorCatalogo === "sin") {
        pool = pool.filter((p) => {
          const id = p.proveedor_id;
          return id == null || !Number.isFinite(Number(id)) || Number(id) <= 0;
        });
      } else {
        const want = Number(filtroProveedorCatalogo);
        pool = pool.filter((p) => p.proveedor_id === want);
      }
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
  }, [productosActivos, search, pinTick, catalogTake, filtroCategoriaCatalogo, filtroProveedorCatalogo]);

  useEffect(() => {
    setCatalogTake(48);
  }, [search, filtroCategoriaCatalogo, filtroProveedorCatalogo]);

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

  const clienteSeleccionado = useMemo(
    () => (clienteId === "" ? null : clientes.find((c) => c.id === clienteId) ?? null),
    [clientes, clienteId]
  );

  const citasParaAsociarFiltradas = useMemo(() => {
    if (clienteId === "") return citasParaAsociar;
    return citasParaAsociar.filter((c) => Number(c.cliente_id) === Number(clienteId));
  }, [citasParaAsociar, clienteId]);

  const recargarCitasAsociar = useCallback(async () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - 3);
    const hasta = new Date();
    hasta.setDate(hasta.getDate() + 45);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    try {
      const rows = await fetchCitasAsociarVentas({ desde: fmt(desde), hasta: fmt(hasta) });
      setCitasParaAsociar(rows);
      return rows;
    } catch {
      return [] as Cita[];
    }
  }, []);

  useEffect(() => {
    if (tabParam !== "ventas") return;
    let cancelled = false;
    void recargarCitasAsociar().then(() => {
      if (cancelled) setCitasParaAsociar((prev) => prev);
    });
    return () => {
      cancelled = true;
    };
  }, [tabParam, recargarCitasAsociar]);

  const abrirNuevaCitaRapida = useCallback(() => {
    if (clienteId === "") {
      posBeepErr();
      toast("Elegí primero un cliente en la sección de productos y servicios.", "warning");
      return;
    }
    const ahora = new Date();
    ahora.setMinutes(ahora.getMinutes() + (5 - (ahora.getMinutes() % 5)));
    const yyyy = ahora.getFullYear();
    const mm = String(ahora.getMonth() + 1).padStart(2, "0");
    const dd = String(ahora.getDate()).padStart(2, "0");
    const hh = String(ahora.getHours()).padStart(2, "0");
    const mi = String(ahora.getMinutes()).padStart(2, "0");
    setNuevaCitaFecha(`${yyyy}-${mm}-${dd}`);
    setNuevaCitaHora(`${hh}:${mi}`);
    setNuevaCitaDuracion("60");
    setNuevaCitaServicio("");
    setNuevaCitaProfesional(vendedorId === "" ? "" : vendedorId);
    setNuevaCitaOpen(true);
  }, [clienteId, vendedorId, toast]);

  const cerrarNuevaCita = useCallback(() => {
    if (nuevaCitaSubmitting) return;
    setNuevaCitaOpen(false);
  }, [nuevaCitaSubmitting]);

  const guardarNuevaCita = useCallback(async () => {
    if (clienteId === "") return;
    if (!nuevaCitaFecha || !nuevaCitaHora) {
      toast("Indicá fecha y hora para la cita.", "warning");
      return;
    }
    const dur = Math.max(10, Math.floor(Number(nuevaCitaDuracion) || 0));
    if (dur % 5 !== 0) {
      toast("La duración debe ser múltiplo de 5 minutos.", "warning");
      return;
    }
    const profId = nuevaCitaProfesional === "" ? vendedorId : nuevaCitaProfesional;
    if (profId === "") {
      toast("Elegí un profesional para la cita.", "warning");
      return;
    }
    const inicioLocal = new Date(`${nuevaCitaFecha}T${nuevaCitaHora}:00`);
    if (Number.isNaN(inicioLocal.getTime())) {
      toast("Fecha u hora inválidas.", "warning");
      return;
    }
    setNuevaCitaSubmitting(true);
    try {
      const creada = await createCita({
        cliente_id: clienteId,
        usuario_id: Number(profId),
        inicio: inicioLocal.toISOString(),
        duracion_min: dur,
        servicio: nuevaCitaServicio.trim() || null,
        estado: "confirmado",
        desde_pos: true,
      } as Parameters<typeof createCita>[0]);
      const rows = await recargarCitasAsociar();
      const enLista = rows.find((r) => r.id === creada.id) ?? creada;
      setCitaOrigenId(creada.id);
      const fechaTxt = new Date(creada.inicio).toLocaleString("es", {
        dateStyle: "short",
        timeStyle: "short",
      });
      const servLabel = (creada.servicio ?? "").trim();
      setCitaOrigenInfo(
        `Cita #${creada.id}${servLabel ? ` · ${servLabel}` : ""} · ${fechaTxt}`
      );
      const lineas = lineasServicioDesdeTextoAgenda(creada.servicio, Number(profId));
      setCartServicios(
        lineas.length > 0
          ? lineas.map((ln) => ({
              nombre: ln.nombre,
              profesional_id: ln.usuarioId ?? Number(profId),
              valor_unitario: ln.valorUnitario,
            }))
          : [
              {
                nombre: nuevaCitaServicio.trim(),
                profesional_id: Number(profId),
                valor_unitario: 0,
              },
            ]
      );
      void enLista;
      toast(`Cita #${creada.id} creada y vinculada a la venta.`, "success");
      posBeepOk();
      setNuevaCitaOpen(false);
    } catch (e) {
      posBeepErr();
      toast(e instanceof Error ? e.message : "No se pudo crear la cita.", "error");
    } finally {
      setNuevaCitaSubmitting(false);
    }
  }, [
    clienteId,
    nuevaCitaFecha,
    nuevaCitaHora,
    nuevaCitaDuracion,
    nuevaCitaProfesional,
    nuevaCitaServicio,
    vendedorId,
    recargarCitasAsociar,
    toast,
  ]);

  const clienteInputValue = clienteOpen
    ? clienteBusqueda
    : clienteSeleccionado?.nombre ?? clienteBusqueda;

  const seleccionarCliente = useCallback(
    (id: number) => {
      setClienteId(id);
      recordRecentCliente(id);
      setClienteBusqueda("");
      setClienteOpen(false);
      setClienteHover(0);
    },
    []
  );

  const limpiarCliente = useCallback(() => {
    setClienteId("");
    setClienteBusqueda("");
    setClienteHover(0);
    setCitaOrigenId(null);
    setCitaOrigenInfo(null);
    setCartServicios([]);
  }, []);

  useEffect(() => {
    if (!clienteOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!clienteComboRef.current?.contains(e.target as Node)) {
        setClienteOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [clienteOpen]);

  useEffect(() => {
    setClienteHover(0);
  }, [clienteBusqueda, clienteOpen]);

  function precioLista(p: Producto) {
    return p.precio_venta ?? p.precio ?? 0;
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
    setCartMobileTab("prods");
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
        setMetodoPagoVenta((prev) => ({ ...prev, principal: "efectivo" }));
        posBeepOk();
        return;
      }
      if (e.code === "F2") {
        e.preventDefault();
        setMetodoPagoVenta((prev) => ({ ...prev, principal: "transferencia" }));
        posBeepOk();
        return;
      }
      if (e.code === "F3") {
        e.preventDefault();
        setMetodoPagoVenta((prev) => ({ ...prev, principal: "mixto" }));
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

  const totalProductos = useMemo(
    () => cart.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0),
    [cart]
  );
  const totalServicios = useMemo(
    () => cartServicios.reduce((s, sv) => s + Math.max(0, sv.valor_unitario), 0),
    [cartServicios]
  );
  const subtotalBruto = totalProductos + totalServicios;

  const productoIdsCarrito = useMemo(
    () => Array.from(new Set(cart.map((l) => l.producto_id))),
    [cart]
  );
  const productoIdsKey = productoIdsCarrito.join(",");

  useEffect(() => {
    let cancelado = false;
    if (clienteId === "" && productoIdsCarrito.length === 0) {
      setDescuentosVigentes([]);
      return;
    }
    fetchDescuentosVigentes({
      cliente_id: clienteId === "" ? null : Number(clienteId),
      producto_ids: productoIdsCarrito,
    })
      .then((rows) => {
        if (!cancelado) setDescuentosVigentes(rows);
      })
      .catch(() => {
        if (!cancelado) setDescuentosVigentes([]);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, productoIdsKey]);

  /** Preview local del cálculo de descuentos — el servidor recalcula igual al cobrar. */
  const descuentosCalc = useMemo(() => {
    const porProducto = new Map<number, Descuento>();
    let descCliente: Descuento | null = null;
    for (const d of descuentosVigentes) {
      if (d.activo !== 1) continue;
      if (d.alcance === "producto" && d.producto_id != null && !porProducto.has(d.producto_id)) {
        porProducto.set(d.producto_id, d);
      } else if (d.alcance === "cliente" && d.cliente_id != null && !descCliente) {
        descCliente = d;
      }
    }
    type Aplicado = {
      origen: "producto" | "cliente" | "manual";
      descripcion: string;
      monto: number;
      tipo: DescuentoTipo;
      valor: number;
    };
    const aplicados: Aplicado[] = [];
    let acumulado = 0;

    for (const l of cart) {
      const d = porProducto.get(l.producto_id);
      if (!d) continue;
      const subtotalLinea = l.precio_unitario * l.cantidad;
      const monto =
        d.tipo === "porcentaje"
          ? subtotalLinea * (d.valor / 100)
          : Math.min(d.valor, subtotalLinea);
      const montoR = Math.max(0, Math.round(monto));
      if (montoR <= 0) continue;
      aplicados.push({
        origen: "producto",
        descripcion: `${d.nombre} · ${l.nombre}`,
        monto: montoR,
        tipo: d.tipo,
        valor: d.valor,
      });
      acumulado += montoR;
    }

    if (descCliente) {
      const base = Math.max(0, subtotalBruto - acumulado);
      const monto =
        descCliente.tipo === "porcentaje"
          ? base * (descCliente.valor / 100)
          : Math.min(descCliente.valor, base);
      const montoR = Math.max(0, Math.round(monto));
      if (montoR > 0) {
        aplicados.push({
          origen: "cliente",
          descripcion: descCliente.nombre,
          monto: montoR,
          tipo: descCliente.tipo,
          valor: descCliente.valor,
        });
        acumulado += montoR;
      }
    }

    let manualMonto = 0;
    if (descuentoManualValor !== "" && Number(descuentoManualValor) > 0) {
      const base = Math.max(0, subtotalBruto - acumulado);
      const valor = Number(descuentoManualValor);
      const valorSaneado = descuentoManualTipo === "porcentaje" ? Math.min(100, valor) : valor;
      const monto =
        descuentoManualTipo === "porcentaje"
          ? base * (valorSaneado / 100)
          : Math.min(valorSaneado, base);
      manualMonto = Math.max(0, Math.round(monto));
      if (manualMonto > 0) {
        aplicados.push({
          origen: "manual",
          descripcion: descuentoManualMotivo.trim() || "Descuento manual",
          monto: manualMonto,
          tipo: descuentoManualTipo,
          valor: valorSaneado,
        });
        acumulado += manualMonto;
      }
    }

    const totalDescuento = Math.min(subtotalBruto, acumulado);
    const totalFinal = Math.max(0, subtotalBruto - totalDescuento);
    return { aplicados, totalDescuento, totalFinal, manualMonto };
  }, [
    descuentosVigentes,
    cart,
    subtotalBruto,
    descuentoManualTipo,
    descuentoManualValor,
    descuentoManualMotivo,
  ]);

  const total = descuentosCalc.totalFinal;
  const tieneItemsVenta = cart.length > 0 || cartServicios.length > 0;

  function irPasoPagos() {
    if (!tieneItemsVenta) {
      posBeepErr();
      toast("Agregá productos o servicios antes de pasar a pagos", "warning");
      return;
    }
    setVentaStep("pagos");
  }

  useEffect(() => {
    publishPosClienteDisplay({
      lines: [
        ...cart.map((l) => ({
          nombre: l.nombre,
          cantidad: l.cantidad,
          importe: l.precio_unitario * l.cantidad,
        })),
        ...cartServicios.map((sv) => ({
          nombre: `✂️ ${sv.nombre.trim() || "Servicio"}`,
          cantidad: 1,
          importe: sv.valor_unitario,
        })),
      ],
      subtotal: total,
    });
  }, [cart, cartServicios, total]);

  const abrirPantallaCliente = useCallback(async () => {
    const fallbackOpen = () => {
      try {
        const u = new URL(window.location.href);
        u.hash = "#/ventas/pantalla-cliente";
        window.open(u.toString(), "peluqueria_pos_cliente", "noopener,noreferrer");
      } catch {
        window.open("#/ventas/pantalla-cliente", "peluqueria_pos_cliente", "noopener,noreferrer");
      }
    };

    try {
      const u = new URL(window.location.href);
      u.hash = "#/ventas/pantalla-cliente";

      if (!("__TAURI_INTERNALS__" in window)) {
        fallbackOpen();
        return;
      }

      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const label = "peluqueria-pos-cliente";
      const existing =
        typeof WebviewWindow.getByLabel === "function"
          ? await WebviewWindow.getByLabel(label)
          : null;

      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }

      const win = new WebviewWindow(label, {
        url: u.toString(),
        title: "Pantalla cliente",
        width: 820,
        height: 520,
        minWidth: 520,
        minHeight: 320,
        resizable: true,
        center: true,
      });

      await new Promise<void>((resolve, reject) => {
        win.once("tauri://created", () => {
          void win.setFocus();
          resolve();
        });
        win.once("tauri://error", (event) => reject(event.payload));
      });
    } catch {
      fallbackOpen();
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
    const builtServicios = cartServicios
      .map((sv) => ({
        servicio_nombre: sv.nombre.trim(),
        usuario_id: sv.profesional_id === "" ? null : Number(sv.profesional_id),
        cantidad: 1,
        valor_unitario: Math.max(0, Number(sv.valor_unitario ?? 0)),
      }))
      .filter((sv) => sv.servicio_nombre.length > 0);
    if (built.length === 0 && builtServicios.length === 0) {
      posBeepErr();
      toast("Agregá productos o servicios antes de cobrar", "warning");
      return;
    }
    if (cartServicios.length > 0) {
      const incompleto = cartServicios.find(
        (sv) => !sv.nombre.trim() || sv.valor_unitario <= 0
      );
      if (incompleto) {
        posBeepErr();
        if (!incompleto.nombre.trim()) {
          toast("Indicá el nombre de cada servicio (elegí del catálogo o escribí libre).", "warning");
        } else {
          toast("Indicá un valor mayor a 0 para cada servicio realizado", "warning");
        }
        return;
      }
    }
    if (vendedorId === "") {
      posBeepErr();
      toast("No se pudo cargar el vendedor de la sesión. Recargá la página.", "warning");
      return;
    }
    const errPago = validarMetodoPagoVenta(metodoPagoVenta, mediosTransferencia, total);
    if (errPago) {
      posBeepErr();
      toast(errPago, "warning");
      return;
    }
    try {
      const descManualPayload =
        descuentoManualValor !== "" && Number(descuentoManualValor) > 0
          ? {
              tipo: descuentoManualTipo,
              valor:
                descuentoManualTipo === "porcentaje"
                  ? Math.min(100, Number(descuentoManualValor))
                  : Number(descuentoManualValor),
              motivo: descuentoManualMotivo.trim() || null,
            }
          : null;
      const r = await createVenta({
        cliente_id: clienteId === "" ? null : clienteId,
        usuario_id: Number(vendedorId),
        metodo_pago: buildMetodoPagoParaApi(metodoPagoVenta, mediosTransferencia, total),
        notas: notasVenta.trim() || null,
        lineas: built,
        servicios: builtServicios.length > 0 ? builtServicios : undefined,
        cita_id: citaOrigenId,
        emitir_factura: emitirFactura,
        puntos_canjeados:
          clienteId !== "" && puntosCanjeados !== ""
            ? Math.floor(Number(puntosCanjeados))
            : undefined,
        descuento_manual: descManualPayload,
      });
      posBeepOk();
      if (r.factura_error) {
        toast("Venta ok. Factura: " + r.factura_error, "warning");
      }
      if (r.puntos_otorgados && r.puntos_otorgados > 0) {
        toast("+" + r.puntos_otorgados + " puntos al cliente", "info");
      }
      const invoiceNum =
        (r as Record<string, unknown>).numero_factura ??
        (r as Record<string, unknown>).consecutivo ??
        r.id;
      setSuccessModal({
        open: true,
        total: r.total as number,
        invoiceNumber: invoiceNum as string | number | null,
      });
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
  // Tabs que exigen `ventas:crear` en el servidor; sin permiso, redirigir a historial (solo lectura).
  const tabRequiereCrear = tab === "ventas" || tab === "cierre";
  if (tabRequiereCrear && !puedeCrearVenta) {
    return <Navigate to="/ventas/historial" replace />;
  }
  const { posFocus, setPosFocus } = usePosFocus();

  const onTogglePosFocus = async () => {
    if (!posFocus) {
      setPosFocus(true);
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        /* sin permiso de pantalla completa del navegador */
      }
    } else {
      setPosFocus(false);
      if (document.fullscreenElement) void document.exitFullscreen();
    }
  };

  return (
    <>
      {!posFocus ? (
      <SubNav
        moduleId="ventas"
        items={[
          ...(puedeCrearVenta ? [{ id: "ventas", label: "Ventas", to: "/ventas/ventas" }] : []),
          { id: "historial", label: "Historial", to: "/ventas/historial" },
          ...(puedeCrearVenta ? [{ id: "cierre", label: "Cierre de día", to: "/ventas/cierre" }] : []),
          { id: "devoluciones", label: "Devoluciones", to: "/ventas/devoluciones" },
          ...(puedeEditarVenta || puedeCrearVenta || puedeEliminarVenta
            ? [{ id: "descuentos", label: "Descuentos", to: "/ventas/descuentos" }]
            : []),
        ]}
        quickActions={
          tab === "ventas" ? (
            <>
              <button type="button" className="btn ghost small" onClick={() => void abrirPantallaCliente()}>
                Pantalla cliente
              </button>
            </>
          ) : tab === "historial" ? (
            <Link to="/ventas/cierre" className="btn primary small">
              Cerrar día
            </Link>
          ) : null
        }
      />
      ) : null}

      {tab === "ventas" ? (
        <div className={`page-pos page-pos--saas page-pos--optimized${posFocus ? " page-pos--focus" : ""}`}>
          <header className="pos-saas-head pos-saas-head--compact">
            <div className="pos-saas-head-text">
              <h1 className="pos-saas-head-title">
                <ShoppingCart className="pos-saas-head-icon" size={28} weight="duotone" aria-hidden />
                Nueva venta
              </h1>
            </div>
            <div className="pos-saas-head-actions">
              <button
                type="button"
                className="btn ghost small pos-saas-btn-focus"
                onClick={() => void onTogglePosFocus()}
                title={posFocus ? "Salir de pantalla completa" : "Maximizar POS (ocultar menú)"}
              >
                {posFocus ? <ArrowsIn size={18} aria-hidden /> : <ArrowsOut size={18} aria-hidden />}
                {posFocus ? "Salir pantalla completa" : "Pantalla completa"}
              </button>
              <Link to="/ventas/historial" className="btn ghost small pos-saas-link-history">
                <ClockCounterClockwise size={18} aria-hidden />
                Historial de ventas
              </Link>
            </div>
          </header>

          <form
            ref={saleFormRef}
            className={`pos-saas-grid pos-saas-grid--triple pos-sale-form pos-sale-form--optimized ${
              ventaStep === "items" ? "pos-sale-form--items" : "pos-sale-form--pagos"
            }`}
            onSubmit={pagar}
          >
            <div className="pos-saas-col pos-saas-col--cart">
              <section
                className={`pos-saas-card pos-saas-card--cart pos-exempt-focus pos-cart-mobile-tabs-panel pos-cart-mobile-tabs-panel--${cartMobileTab}`}
              >
                <div className="pos-saas-card-head pos-saas-card-head--row">
                  <div className="pos-saas-card-head-textblock">
                    <div className="pos-saas-card-head-left">
                      <h2 className="pos-saas-card-title">Servicios y productos</h2>
                    </div>
                    <p className="pos-saas-card-desc muted">
                      {citaOrigenInfo
                        ? `Vinculados a ${citaOrigenInfo}. Revisá cantidades y servicios antes de cobrar.`
                        : "Revisá los productos y servicios agregados."}
                    </p>
                  </div>
                  {cart.length > 0 || cartServicios.length > 0 ? (
                    <button
                      type="button"
                      className="pos-saas-link-clear link danger"
                      onClick={() => {
                        setCart([]);
                        setCartServicios([]);
                        setCitaOrigenId(null);
                        setCitaOrigenInfo(null);
                        setCartSel(null);
                        posBeepOk();
                        window.setTimeout(() => barcodeRef.current?.focus(), 0);
                      }}
                    >
                      <Trash size={16} aria-hidden />
                      Vaciar todo
                    </button>
                  ) : null}
                </div>

                <div className="pos-pago-block pos-cart-cliente-block">
                  <span className="pos-saas-field-label">Cliente</span>
                  <div className="pos-pago-combo" ref={clienteComboRef}>
                    <div className="pos-pago-combo-row">
                      <div className="pos-pago-combo-input-wrap">
                        <input
                          id="venta-cliente-input"
                          type="text"
                          className="pos-saas-input pos-pago-combo-input"
                          placeholder="Buscar por nombre, teléfono o email…"
                          value={clienteInputValue}
                          onFocus={() => setClienteOpen(true)}
                          onChange={(e) => {
                            setClienteBusqueda(e.target.value);
                            setClienteOpen(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setClienteOpen(true);
                              setClienteHover((h) =>
                                Math.min(h + 1, Math.max(0, clientesFiltradosLista.length - 1))
                              );
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setClienteHover((h) => Math.max(h - 1, 0));
                            } else if (e.key === "Enter") {
                              if (clienteOpen && clientesFiltradosLista[clienteHover]) {
                                e.preventDefault();
                                seleccionarCliente(clientesFiltradosLista[clienteHover]!.id);
                              }
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              setClienteOpen(false);
                            }
                          }}
                          autoComplete="off"
                          spellCheck={false}
                          aria-label="Buscar y elegir cliente"
                          aria-expanded={clienteOpen}
                          aria-autocomplete="list"
                          role="combobox"
                        />
                        {clienteId !== "" && !clienteOpen ? (
                          <button
                            type="button"
                            className="pos-pago-combo-clear"
                            onClick={limpiarCliente}
                            title="Quitar cliente"
                            aria-label="Quitar cliente"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                      {puedeCrearCliente ? (
                        <button
                          type="button"
                          className="btn ghost small pos-pago-cliente-add pos-pago-cliente-add--icon"
                          onClick={() => setCreateClienteOpen(true)}
                          title="Registrar nuevo cliente"
                          aria-label="Registrar nuevo cliente"
                        >
                          <Plus size={16} weight="bold" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                    {clienteOpen ? (
                      <ul className="pos-pago-combo-list" role="listbox">
                        {clientesFiltradosLista.length === 0 ? (
                          <li className="pos-pago-combo-empty muted small">
                            {puedeCrearCliente
                              ? "Sin coincidencias. Tocá «Nuevo» para registrarlo."
                              : "Sin coincidencias."}
                          </li>
                        ) : (
                          clientesFiltradosLista.slice(0, 10).map((c, i) => (
                            <li
                              key={c.id}
                              className={`pos-pago-combo-item ${i === clienteHover ? "pos-pago-combo-item--active" : ""} ${clienteId === c.id ? "pos-pago-combo-item--current" : ""}`}
                              onMouseEnter={() => setClienteHover(i)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                seleccionarCliente(c.id);
                              }}
                              role="option"
                              aria-selected={clienteId === c.id}
                            >
                              <span className="pos-pago-combo-item-name">{c.nombre}</span>
                              <span className="pos-pago-combo-item-meta muted small">
                                {c.telefono ? `· ${c.telefono}` : ""}
                                {c.tipo_cliente === "temporal" ? " · ocasional" : ""}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </div>
                </div>

                <div className="pos-cart-mobile-tabs" role="tablist" aria-label="Sección del carrito">
                  <button
                    type="button"
                    role="tab"
                    className={`pos-cart-mobile-tab${cartMobileTab === "prods" ? " is-active" : ""}`}
                    aria-selected={cartMobileTab === "prods"}
                    onClick={() => setCartMobileTab("prods")}
                  >
                    Productos ({cart.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    className={`pos-cart-mobile-tab${cartMobileTab === "svcs" ? " is-active" : ""}`}
                    aria-selected={cartMobileTab === "svcs"}
                    onClick={() => setCartMobileTab("svcs")}
                  >
                    Servicios ({cartServicios.length})
                  </button>
                </div>

                <div className="pos-saas-panel-scroll pos-saas-panel-scroll--cart">
                <div
                  className={`pos-cart-subcard pos-cart-subcard--prods pos-cart-accordion${
                    cartProdsOpen ? " pos-cart-accordion--open" : " pos-cart-accordion--collapsed"
                  }`}
                >
                  <div className="pos-cart-subhead pos-cart-accordion-head">
                    <button
                      type="button"
                      className="pos-cart-accordion-toggle"
                      aria-expanded={cartProdsOpen}
                      aria-controls="pos-cart-prods-body"
                      onClick={() => setCartProdsOpen((o) => !o)}
                    >
                      <span className="pos-cart-accordion-chevron" aria-hidden>
                        {cartProdsOpen ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
                      </span>
                      <ShoppingCart size={14} weight="duotone" aria-hidden />
                      <span className="pos-cart-accordion-label">Productos ({cart.length})</span>
                      <span className="pos-cart-accordion-meta mono">{formatMoney(totalProductos)}</span>
                    </button>
                  </div>
                  <div className="pos-cart-accordion-body" id="pos-cart-prods-body">
                  {cart.length === 0 ? (
                    <p className="pos-cart-empty muted small">
                      Sin productos. Agregalos desde el catálogo.
                    </p>
                  ) : (
                    <ul className="pos-cart-lines">
                      {cart.map((l, idx) => {
                        const prod = productos.find((x) => x.id === l.producto_id);
                        const sub = l.precio_unitario * l.cantidad;
                        const inicial = (l.nombre.trim()[0] ?? "?").toUpperCase();
                        return (
                          <li
                            key={l.producto_id}
                            className={`pos-cart-line ${cartSel === idx ? "pos-cart-line--selected" : ""}`}
                          >
                            <div className="pos-cart-thumb" aria-hidden>
                              {prod?.imagen_url ? (
                                <img
                                  src={resolveImageSrc(prod.imagen_url) ?? prod.imagen_url}
                                  alt=""
                                  loading="lazy"
                                />
                              ) : (
                                <span className="pos-cart-thumb-initial">{inicial}</span>
                              )}
                            </div>
                            <div className="pos-cart-info">
                              <span className="pos-cart-name">{l.nombre}</span>
                              <span className="pos-cart-unit muted small mono">
                                {formatMoney(l.precio_unitario)}
                              </span>
                            </div>
                            <div className="pos-saas-qty pos-cart-qty">
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
                            <span className="pos-cart-sub mono">{formatMoney(sub)}</span>
                            <button
                              type="button"
                              className="pos-saas-icon-btn danger pos-cart-del"
                              tabIndex={-1}
                              title="Quitar línea"
                              onClick={() => removeLine(l.producto_id)}
                            >
                              <Trash size={16} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="pos-cart-subtotal">
                    <span className="muted small">Subtotal productos</span>
                    <span className="mono">{formatMoney(totalProductos)}</span>
                  </div>
                  </div>
                </div>

                <div className={`pos-cart-subcard pos-cart-subcard--svcs pos-cart-accordion${
                    cartSvcsOpen ? " pos-cart-accordion--open" : " pos-cart-accordion--collapsed"
                  }`}>
                  <div className="pos-cart-subhead pos-cart-accordion-head">
                    <button
                      type="button"
                      className="pos-cart-accordion-toggle"
                      aria-expanded={cartSvcsOpen}
                      aria-controls="pos-cart-svcs-body"
                      onClick={() => setCartSvcsOpen((o) => !o)}
                    >
                      <span className="pos-cart-accordion-chevron" aria-hidden>
                        {cartSvcsOpen ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
                      </span>
                      <span aria-hidden>✂️</span>
                      <span className="pos-cart-accordion-label">Servicios ({cartServicios.length})</span>
                      <span className="pos-cart-accordion-meta mono">{formatMoney(totalServicios)}</span>
                    </button>
                  </div>
                  <div className="pos-cart-accordion-body" id="pos-cart-svcs-body">
                  <div className="pos-cart-cita-row">
                    <span className="pos-saas-field-label">
                      Cita en agenda
                      {clienteId !== "" && clienteSeleccionado ? (
                        <span className="pos-cart-cita-cliente-tag muted small">
                          · {clienteSeleccionado.nombre}
                          <button
                            type="button"
                            className="pos-cart-cita-cliente-clear"
                            onClick={limpiarCliente}
                            title="Quitar cliente"
                            aria-label="Quitar cliente"
                          >
                            ×
                          </button>
                        </span>
                      ) : null}
                    </span>
                    <div className="pos-cart-cita-pickrow">
                      <select
                        className="pos-saas-select pos-cart-cita-select"
                        value={citaOrigenId == null ? "" : String(citaOrigenId)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            setCitaOrigenId(null);
                            setCitaOrigenInfo(null);
                            return;
                          }
                          const id = Number(raw);
                          const c =
                            citasParaAsociarFiltradas.find((x) => x.id === id) ??
                            citasParaAsociar.find((x) => x.id === id);
                          if (!c) {
                            if (citaOrigenId === id) return;
                            return;
                          }
                          setCitaOrigenId(id);
                          const fechaTxt =
                            c.inicio && !Number.isNaN(new Date(c.inicio).getTime())
                              ? new Date(c.inicio).toLocaleString("es", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })
                              : "";
                          const servLabel = (c.servicio ?? "").trim();
                          setCitaOrigenInfo(
                            `Cita #${id}${servLabel ? ` · ${servLabel}` : ""}${fechaTxt ? ` · ${fechaTxt}` : ""}`
                          );
                          const uid =
                            c.usuario_id != null && Number.isFinite(Number(c.usuario_id))
                              ? Number(c.usuario_id)
                              : null;
                          const lineas = lineasServicioDesdeTextoAgenda(c.servicio, uid);
                          setCartServicios(
                            lineas.length > 0
                              ? lineas.map((ln) => ({
                                  nombre: ln.nombre,
                                  profesional_id:
                                    ln.usuarioId ?? (vendedorId === "" ? "" : vendedorId),
                                  valor_unitario: ln.valorUnitario,
                                }))
                              : [
                                  {
                                    nombre: "",
                                    profesional_id: vendedorId === "" ? "" : vendedorId,
                                    valor_unitario: 0,
                                  },
                                ]
                          );
                          if (clienteId === "") setClienteId(c.cliente_id);
                          if (uid != null && equipo.some((em) => em.id === uid)) setVendedorId(uid);
                          posBeepOk();
                        }}
                        aria-label="Asociar venta a cita de agenda"
                      >
                        <option value="">
                          {clienteId !== ""
                            ? citasParaAsociarFiltradas.length === 0
                              ? "— Sin cita asociada —"
                              : "— Sin cita (opcional) —"
                            : "— Sin cita (opcional) —"}
                        </option>
                        {citaOrigenId != null &&
                        !citasParaAsociarFiltradas.some((x) => x.id === citaOrigenId) ? (
                          <option value={String(citaOrigenId)}>
                            {citaOrigenInfo ?? `Cita #${citaOrigenId} (precargada)`}
                          </option>
                        ) : null}
                        {citasParaAsociarFiltradas.map((c) => {
                          const t =
                            c.inicio && !Number.isNaN(new Date(c.inicio).getTime())
                              ? new Date(c.inicio).toLocaleString("es", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "";
                          const conCliente = clienteId === "";
                          return (
                            <option key={c.id} value={c.id}>
                              #{c.id}
                              {conCliente ? ` · ${c.cliente_nombre}` : ""} · {t}
                              {(c.servicio ?? "").trim()
                                ? ` · ${(c.servicio ?? "").trim().slice(0, 42)}`
                                : ""}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        type="button"
                        className="btn ghost small pos-cart-cita-add"
                        onClick={abrirNuevaCitaRapida}
                        title={
                          clienteId === ""
                            ? "Elegí primero un cliente para crear una cita"
                            : "Crear cita rápida y asociarla a esta venta"
                        }
                        aria-label="Crear cita rápida"
                        disabled={clienteId === ""}
                      >
                        <Plus size={16} weight="bold" aria-hidden />
                      </button>
                    </div>
                    {cartServicios.length > 0 && citaOrigenId == null ? (
                      <p className="pos-cart-cita-warn small muted">
                        Opcional: podés asociar una cita de la agenda si lo necesitás.
                      </p>
                    ) : null}
                  </div>
                  <div className="pos-cart-subhead pos-cart-svcs-actions-row">
                    <div className="pos-cart-subhead-actions">
                      <button
                        type="button"
                        className="pos-cart-add-svc"
                        onClick={agregarLineaServicio}
                      >
                        <Plus size={14} weight="bold" aria-hidden />
                        Agregar servicio
                      </button>
                      {cartServicios.length > 0 ? (
                        <button
                          type="button"
                          className="link danger small"
                          onClick={citaOrigenId != null ? quitarTodosServiciosYCita : () => {
                            setCartServicios([]);
                            posBeepOk();
                          }}
                        >
                          Vaciar
                        </button>
                      ) : null}
                    </div>
                  </div>

                {cartServicios.length === 0 ? (
                  <p className="pos-cart-empty muted small">
                    Sin servicios. Tocá «Agregar servicio» para sumar uno del catálogo o con nombre libre.
                  </p>
                ) : null}

                {cartServicios.length > 0 ? (
                  <div className="pos-saas-table-wrap">
                    <table className="pos-saas-table pos-servicios-table">
                      <thead>
                        <tr>
                          <th scope="col">Servicio</th>
                          <th scope="col">Profesional</th>
                          <th scope="col" className="pos-servicios-th-num">
                            Valor
                          </th>
                          <th scope="col" className="pos-saas-th-actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {cartServicios.map((sv, idx) => {
                          return (
                            <tr key={`svc-row-${idx}`}>
                              <td>
                                {(() => {
                                  const nombreActual = sv.nombre.trim();
                                  const enCatalogo =
                                    nombreActual !== "" &&
                                    serviciosCatalogo.some(
                                      (s) => s.nombre_categoria === nombreActual
                                    );
                                  return (
                                    <select
                                      className="pos-servicios-select pos-servicios-nombre"
                                      value={nombreActual}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setCartServicios((prev) =>
                                          prev.map((row, i) =>
                                            i === idx ? { ...row, nombre: v } : row
                                          )
                                        );
                                      }}
                                      aria-label={`Nombre del servicio ${idx + 1}`}
                                    >
                                      <option value="">— Elegí un servicio —</option>
                                      {nombreActual !== "" && !enCatalogo ? (
                                        <option value={nombreActual}>{nombreActual}</option>
                                      ) : null}
                                      {serviciosCatalogo.map((s) => {
                                        const label = s.emoji
                                          ? `${s.emoji} ${s.nombre_categoria}`
                                          : s.nombre_categoria;
                                        return (
                                          <option
                                            key={s.id}
                                            value={s.nombre_categoria}
                                          >
                                            {label}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  );
                                })()}
                              </td>
                              <td>
                                <select
                                  className="pos-servicios-select"
                                  value={sv.profesional_id === "" ? "" : String(sv.profesional_id)}
                                  onChange={(e) => {
                                    const v = e.target.value === "" ? "" : Number(e.target.value);
                                    setCartServicios((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, profesional_id: v } : row
                                      )
                                    );
                                  }}
                                  aria-label="Profesional asignado"
                                >
                                  <option value="">Sin asignar</option>
                                  {equipo.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.nombre || p.email}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="pos-servicios-td-num">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  autoComplete="off"
                                  className="pos-servicios-input pos-servicios-input--price mono input-numeric"
                                  value={
                                    sv.valor_unitario === 0
                                      ? ""
                                      : formatMoneyForInput(sv.valor_unitario)
                                  }
                                  placeholder="0"
                                  onChange={(e) => {
                                    const parsed = parseMoneyInput(e.target.value);
                                    const n = parsed === "" ? 0 : parsed;
                                    setCartServicios((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, valor_unitario: n } : row
                                      )
                                    );
                                  }}
                                  aria-label={`Valor del servicio ${idx + 1}`}
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="pos-saas-icon-btn danger"
                                  tabIndex={-1}
                                  title="Quitar servicio"
                                  onClick={() =>
                                    setCartServicios((prev) => prev.filter((_, i) => i !== idx))
                                  }
                                >
                                  <Trash size={18} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                  <div className="pos-cart-subtotal">
                    <span className="muted small">Subtotal servicios</span>
                    <span className="mono">{formatMoney(totalServicios)}</span>
                  </div>
                  </div>
                </div>

                <div className="pos-cart-grandtotal">
                  <span className="pos-cart-grandtotal-label">Total servicios + productos</span>
                  <span className="pos-cart-grandtotal-value mono">{formatMoney(total)}</span>
                </div>
                </div>
              </section>
            </div>

            <div className="pos-saas-col pos-saas-col--catalog">
              <section className="pos-saas-card pos-saas-card--catalog">
                <div className="pos-saas-panel-sticky">
                <div className="pos-saas-card-head pos-saas-card-head--stack">
                  <div className="pos-saas-card-head-left">
                    <h2 className="pos-saas-card-title">Catálogo de productos</h2>
                  </div>
                  <p className="pos-saas-card-desc muted">
                    Filtrá por categoría o proveedor, buscá o escaneá y tocá un producto para agregarlo.
                  </p>
                </div>
                <div className="pos-saas-catalog-toolbar">
                  <div className="pos-saas-search-wrap">
                    <MagnifyingGlass className="pos-saas-search-ico" size={20} aria-hidden />
                    <input
                      ref={barcodeRef}
                      className="pos-saas-search-input"
                      placeholder="Buscar o escanear código"
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
                    <Barcode size={20} weight="duotone" aria-hidden />
                  </button>
                  {lookupBusy ? <span className="muted pos-saas-busy">Buscando…</span> : null}
                </div>

                <div className="pos-saas-catalog-filters">
                  <div className="pos-saas-catalog-filters__field pos-saas-catalog-filters__combo">
                    <SearchableSelect
                      variant="combobox"
                      label="Categoría"
                      value={filtroCategoriaCatalogo}
                      onChange={setFiltroCategoriaCatalogo}
                      options={opcionesFiltroCategoriaCatalogo}
                      placeholder="Buscar categoría…"
                      idleTextWhenEmpty="Todas las categorías"
                    />
                  </div>
                  <div className="pos-saas-catalog-filters__field pos-saas-catalog-filters__combo">
                    <SearchableSelect
                      variant="combobox"
                      label="Proveedor"
                      value={filtroProveedorCatalogo}
                      onChange={setFiltroProveedorCatalogo}
                      options={opcionesFiltroProveedorCatalogo}
                      placeholder="Buscar proveedor…"
                      idleTextWhenEmpty="Todos los proveedores"
                    />
                  </div>
                  {(filtroCategoriaCatalogo !== "todos" || filtroProveedorCatalogo !== "todos") && (
                    <button
                      type="button"
                      className="btn ghost small pos-saas-catalog-filters__clear"
                      onClick={() => {
                        setFiltroCategoriaCatalogo("todos");
                        setFiltroProveedorCatalogo("todos");
                      }}
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>

                </div>
                <div className="pos-saas-panel-scroll pos-saas-catalog-scroll">
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
                    <p className="muted small">
                      Probá otros filtros, otra búsqueda o escaneá un código de barras.
                    </p>
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
                                  <img
                                    src={resolveImageSrc(p.imagen_url) ?? p.imagen_url}
                                    alt=""
                                    className="pos-saas-pro-img"
                                    loading="lazy"
                                  />
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
                </div>
              </section>
            </div>

            <div className="pos-sale-step-actions pos-sale-step-actions--items">
              <button type="button" className="btn primary" onClick={irPasoPagos}>
                Continuar a pagos
              </button>
            </div>

            <div className="pos-saas-col pos-saas-col--aside">
              <section className="pos-saas-card pos-saas-card--pago pos-saas-card--sticky pos-exempt-focus">
                <div className="pos-saas-card-head pos-saas-card-head--stack">
                  <div className="pos-saas-card-head-left">
                    <h2 className="pos-saas-card-title">Pago</h2>
                  </div>
                  <p className="pos-saas-card-desc muted">Elegí el método de pago y cobrá la venta.</p>
                </div>

                <div className="pos-saas-panel-scroll">
                <div className="pos-pago-resumen">
                  <div className="pos-pago-resumen-row">
                    <span className="muted">Subtotal productos</span>
                    <span className="mono">{formatMoney(totalProductos)}</span>
                  </div>
                  <div className="pos-pago-resumen-row">
                    <span className="muted">Subtotal servicios</span>
                    <span className="mono">{formatMoney(totalServicios)}</span>
                  </div>
                  {descuentosCalc.aplicados.map((a, i) => (
                    <div key={i} className="pos-pago-resumen-row">
                      <span className="muted">
                        {a.origen === "producto"
                          ? "Desc. producto"
                          : a.origen === "cliente"
                            ? "Desc. cliente"
                            : "Desc. manual"}
                        {": "}
                        {a.descripcion}
                        {a.tipo === "porcentaje" ? ` (${a.valor}%)` : ""}
                      </span>
                      <span className="mono" style={{ color: "var(--color-danger, #c0392b)" }}>
                        −{formatMoney(a.monto)}
                      </span>
                    </div>
                  ))}
                  <div className="pos-pago-block" style={{ marginTop: 8 }}>
                    <span className="pos-saas-field-label">Descuento manual</span>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <select
                        aria-label="Tipo de descuento manual"
                        className="pos-saas-input"
                        style={{ flex: "0 0 auto", width: 110 }}
                        value={descuentoManualTipo}
                        onChange={(e) =>
                          setDescuentoManualTipo(e.target.value as DescuentoTipo)
                        }
                      >
                        <option value="porcentaje">%</option>
                        <option value="monto">Gs.</option>
                      </select>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="pos-saas-input"
                        style={{ flex: 1 }}
                        placeholder={descuentoManualTipo === "porcentaje" ? "0-100" : "Monto"}
                        value={descuentoManualValor === "" ? "" : String(descuentoManualValor)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^\d]/g, "");
                          if (raw === "") {
                            setDescuentoManualValor("");
                            return;
                          }
                          const n = Number(raw);
                          if (!Number.isFinite(n)) return;
                          if (descuentoManualTipo === "porcentaje") {
                            setDescuentoManualValor(Math.min(100, n));
                          } else {
                            setDescuentoManualValor(n);
                          }
                        }}
                      />
                    </div>
                    <input
                      type="text"
                      className="pos-saas-input"
                      style={{ marginTop: 6 }}
                      placeholder="Motivo (opcional)"
                      value={descuentoManualMotivo}
                      maxLength={80}
                      onChange={(e) => setDescuentoManualMotivo(e.target.value)}
                    />
                  </div>
                  {descuentosCalc.totalDescuento > 0 ? (
                    <div className="pos-pago-resumen-row">
                      <span className="muted">Total descuentos</span>
                      <span className="mono" style={{ color: "var(--color-danger, #c0392b)" }}>
                        −{formatMoney(descuentosCalc.totalDescuento)}
                      </span>
                    </div>
                  ) : null}
                  <div className="pos-pago-resumen-divider" aria-hidden />
                  <div className="pos-pago-resumen-total">
                    <span className="pos-pago-resumen-total-label">Total a pagar</span>
                    <span className="pos-pago-resumen-total-value mono">{formatMoney(total)}</span>
                  </div>
                </div>

                <span className="pos-saas-field-label pos-saas-field-label--spaced">Método de pago</span>
                <div className="pos-saas-pay-grid pos-saas-pay-grid--aside" role="group" aria-label="Método de pago">
                  {METODOS_PAGO_POS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`pos-saas-pay-card ${
                        metodoPagoVenta.principal === opt.id ? "pos-saas-pay-card--on" : ""
                      }`}
                      onClick={() => {
                        setMetodoPagoVenta((prev) => ({
                          ...prev,
                          principal: opt.id,
                          transferenciaLlave:
                            opt.id === "transferencia" ? prev.transferenciaLlave : "",
                          mixto1Monto: opt.id === "mixto" ? "" : prev.mixto1Monto,
                        }));
                        posBeepOk();
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <PosMetodoPagoFields
                  value={metodoPagoVenta}
                  medios={mediosTransferencia}
                  totalVenta={total}
                  onChange={(patch) => setMetodoPagoVenta((prev) => ({ ...prev, ...patch }))}
                />

                <div className="pos-pago-block">
                  <label className="pos-saas-field-label" htmlFor="venta-notas">
                    Observaciones (opcional)
                  </label>
                  <input
                    id="venta-notas"
                    type="text"
                    className="pos-saas-input"
                    placeholder="Escribí una observación…"
                    value={notasVenta}
                    onChange={(e) => setNotasVenta(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="pos-saas-cobrar btn primary"
                  disabled={!tieneItemsVenta}
                >
                  <LockSimple size={20} weight="fill" className="pos-saas-cobrar-icon" aria-hidden />
                  Cobrar {formatMoney(total)}
                </button>

                <p className="pos-pago-secure muted small">
                  <span className="pos-pago-secure-dot" aria-hidden />
                  Tu venta está 100% segura
                </p>
                </div>
              </section>
            </div>

            <div className="pos-sale-step-actions pos-sale-step-actions--pagos">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setVentaStep("items")}
              >
                Volver a productos/servicios
              </button>
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

          {nuevaCitaOpen ? (
            <div
              className="pos-nueva-cita-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pos-nueva-cita-title"
            >
              <div className="pos-nueva-cita-modal pos-exempt-focus">
                <header className="pos-nueva-cita-head">
                  <h3 id="pos-nueva-cita-title" className="pos-nueva-cita-title">
                    Nueva cita rápida
                  </h3>
                  <button
                    type="button"
                    className="pos-nueva-cita-close"
                    onClick={cerrarNuevaCita}
                    aria-label="Cerrar"
                    disabled={nuevaCitaSubmitting}
                  >
                    ×
                  </button>
                </header>
                <p className="pos-nueva-cita-cliente muted small">
                  Cliente:{" "}
                  <strong>{clienteSeleccionado?.nombre ?? "—"}</strong>
                </p>
                <div className="pos-nueva-cita-grid">
                  <label className="pos-nueva-cita-field">
                    <span>Fecha</span>
                    <input
                      type="date"
                      className="pos-saas-input"
                      value={nuevaCitaFecha}
                      onChange={(e) => setNuevaCitaFecha(e.target.value)}
                    />
                  </label>
                  <label className="pos-nueva-cita-field">
                    <span>Hora</span>
                    <input
                      type="time"
                      step={300}
                      className="pos-saas-input"
                      value={nuevaCitaHora}
                      onChange={(e) => setNuevaCitaHora(e.target.value)}
                    />
                  </label>
                  <label className="pos-nueva-cita-field">
                    <span>Duración (min)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="pos-saas-input input-numeric"
                      value={nuevaCitaDuracion}
                      onChange={(e) => setNuevaCitaDuracion(filterIntegerTyping(e.target.value))}
                    />
                  </label>
                  <div className="pos-nueva-cita-field pos-nueva-cita-field--combo">
                    <SearchableSelect
                      label="Profesional"
                      value={nuevaCitaProfesional === "" ? "" : String(nuevaCitaProfesional)}
                      onChange={(v) => setNuevaCitaProfesional(v === "" ? "" : Number(v))}
                      options={opcionesProfesionalNuevaCita}
                      placeholder="Buscar profesional…"
                      idleTextWhenEmpty="— Elegí profesional —"
                      disabled={nuevaCitaSubmitting}
                    />
                  </div>
                  <div className="pos-nueva-cita-field pos-nueva-cita-field--full pos-nueva-cita-field--combo">
                    <SearchableSelect
                      variant="combobox"
                      allowCustom
                      label="Servicio (opcional)"
                      value={nuevaCitaServicio}
                      onChange={setNuevaCitaServicio}
                      options={opcionesServicioNuevaCita}
                      placeholder="Buscar servicio…"
                      idleTextWhenEmpty="Ej. Corte dama, Tinte…"
                      disabled={nuevaCitaSubmitting}
                    />
                  </div>
                </div>
                <div className="pos-nueva-cita-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={cerrarNuevaCita}
                    disabled={nuevaCitaSubmitting}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => void guardarNuevaCita()}
                    disabled={nuevaCitaSubmitting}
                  >
                    {nuevaCitaSubmitting ? "Creando…" : "Crear y asociar"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "historial" ? (
        <VentasHistorialSection
          puedeCrear={puedeCrearVenta}
          puedeEliminar={puedeEliminarVenta}
        />
      ) : null}

      {tab === "cierre" ? <VentasCierreSection /> : null}

      {tab === "devoluciones" ? (
        <DevolucionesSection
          puedeCrear={puedeCrearVenta}
          puedeEditar={puedeEditarVenta}
          puedeEliminar={puedeEliminarVenta}
        />
      ) : null}

      {tab === "descuentos" ? (
        <DescuentosSection
          puedeCrear={puedeCrearVenta}
          puedeEditar={puedeEditarVenta}
          puedeEliminar={puedeEliminarVenta}
        />
      ) : null}

      <SaleSuccessModal
        open={successModal.open}
        total={successModal.total}
        invoiceNumber={successModal.invoiceNumber}
        onClose={onSuccessModalClose}
      />
    </>
  );
}
