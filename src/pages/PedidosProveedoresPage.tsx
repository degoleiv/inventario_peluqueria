import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Check, Info, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import {
  createInventarioCategoriaProducto,
  createPedidoProveedor,
  createProductoRapidoProveedor,
  deletePedidoProveedor,
  fetchInventarioCatalogo,
  fetchPedidoProveedor,
  fetchPedidosProveedores,
  fetchProductos,
  fetchProductosProveedor,
  fetchProveedores,
  lookupBarcode,
  resolveImageSrc,
  updatePedidoProveedorFull,
  updatePedidoProveedorMeta,
  updateProducto,
  type InventarioCatalogo,
  type LookupManual,
  type LookupOk,
  type PedidoProveedor,
  type Producto,
  type Proveedor,
} from "../api";
import {
  ProductoCatalogoForm,
  catalogoFieldsToCreateBody,
  emptyProductoCatalogoFields,
  type ProductoCatalogoFields,
} from "../components/ProductoCatalogoForm";
import { Drawer } from "../components/Drawer";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../context/ToastContext";
import { usePermisos, usePuede } from "../context/PermisosContext";
import {
  clearSessionDraft,
  loadSessionDraft,
  saveSessionDraft,
} from "../lib/sessionDraft";
import {
  filterIntegerTyping,
} from "../lib/decimalInput";
import {
  formatMoney,
  formatMoneyForInput,
  parseMoneyInput,
  roundMoney,
} from "../lib/money";
import { ProveedoresPage } from "./ProveedoresPage";

function labelFuenteLookup(fuente: string) {
  if (fuente === "inventario") return "Datos desde tu inventario local";
  if (fuente === "cache") return "Datos desde caché (consulta previa)";
  if (fuente === "openfoodfacts") return "Datos desde Open Food Facts";
  if (fuente === "openbeautyfacts") return "Datos desde Open Beauty Facts (cosmética / peluquería)";
  if (fuente === "upcitemdb") return "Datos desde UPCitemdb (catálogo comercial, trial gratuito)";
  if (fuente === "ean_search") return "Datos desde EAN-Search.org (token)";
  return "Datos externos";
}

type Linea = {
  producto_id: number;
  cantidad: number | "";
  costo_unitario: number | "";
  precio_venta: number | "";
};

type VistaTab = "pedido" | "proveedores" | "historial";

type HistorialFiltrosForm = {
  desde: string;
  hasta: string;
  proveedorId: string;
  referencia: string;
};

const HIST_FILTROS_VACIOS: HistorialFiltrosForm = {
  desde: "",
  hasta: "",
  proveedorId: "",
  referencia: "",
};

const PEDIDO_DRAFT_KEY = "peluqueria_pedido_draft_v1";

type PedidoWizardDraft = {
  vistaTab?: VistaTab;
  wizardStep?: number;
  proveedorSearch?: string;
  productoSearch?: string;
  proveedorId?: number | "";
  fechaPedido?: string;
  fechaPagoDesc?: string;
  fechaPagoMax?: string;
  valorDesc?: number | "";
  valorSinDesc?: number | "";
  valorSinDescManual?: boolean;
  tieneDescuento?: boolean;
  estadoNuevo?: string;
  notas?: string;
  referencia?: string;
  lineas?: Linea[];
};

function readPedidoDraft(): PedidoWizardDraft | null {
  const d = loadSessionDraft<PedidoWizardDraft>(PEDIDO_DRAFT_KEY);
  if (!d || typeof d !== "object") return null;
  return d;
}

const pasos = ["Proveedor", "Productos", "Pagos", "Resumen y notas"] as const;

/** Línea sin producto ni costo (p. ej. si se deselecciona el producto en el selector). */
function isLineaPlaceholderExistente(ln: Linea): boolean {
  return !ln.producto_id && ln.costo_unitario === "";
}

function fechaLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function matchesProveedorSearch(p: Proveedor, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    p.nombre.toLowerCase().includes(q) ||
    p.nit.toLowerCase().includes(q) ||
    (p.telefono ?? "").toLowerCase().includes(q) ||
    (p.email ?? "").toLowerCase().includes(q)
  );
}

function matchesProductoSearch(p: Producto, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    p.nombre.toLowerCase().includes(q) ||
    (p.marca ?? "").toLowerCase().includes(q) ||
    (p.codigo_barras ?? "").toLowerCase().includes(q) ||
    (p.categoria ?? "").toLowerCase().includes(q)
  );
}

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

function labelEstadoPago(estado: string): string {
  switch (estado) {
    case "pendiente":
      return "Pendiente";
    case "pagado":
      return "Pagado";
    case "vencido":
      return "Vencido";
    default:
      return estado || "—";
  }
}

function ProveedorSelectableMedia({ proveedor }: { proveedor: Proveedor }) {
  const [broken, setBroken] = useState(false);
  const url = proveedor.icono_url?.trim();
  if (url && !broken) {
    return (
      <div className="pedidos-prov-card__media">
        <img
          src={resolveImageSrc(url) ?? url}
          alt=""
          className="pedidos-prov-card__img"
          onError={() => setBroken(true)}
        />
      </div>
    );
  }
  return (
    <div className="pedidos-prov-card__avatar" aria-hidden>
      {proveedor.nombre.trim().slice(0, 1).toUpperCase()}
    </div>
  );
}

export function PedidosProveedoresPage() {
  const toast = useToast();
  const resumenFocusRef = useRef<HTMLDivElement | null>(null);
  const draft0 = useMemo(() => readPedidoDraft(), []);
  const prevWizardStepRef = useRef(
    typeof draft0?.wizardStep === "number" && draft0.wizardStep >= 0 && draft0.wizardStep <= 3
      ? draft0.wizardStep
      : 0
  );
  const [bloqueoRegistrarPedido, setBloqueoRegistrarPedido] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoProveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [catalogoProveedor, setCatalogoProveedor] = useState<Producto[]>([]);
  const [catalogoProveedorLoading, setCatalogoProveedorLoading] = useState(false);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);

  const [vistaTab, setVistaTab] = useState<VistaTab>(() =>
    draft0?.vistaTab === "pedido" || draft0?.vistaTab === "proveedores" || draft0?.vistaTab === "historial"
      ? draft0.vistaTab
      : "pedido"
  );
  const [wizardStep, setWizardStep] = useState(() => {
    const s = draft0?.wizardStep;
    return typeof s === "number" && s >= 0 && s <= 3 ? s : 0;
  });
  const [proveedorSearch, setProveedorSearch] = useState(() =>
    typeof draft0?.proveedorSearch === "string" ? draft0.proveedorSearch : ""
  );
  const [productoSearch, setProductoSearch] = useState(() =>
    typeof draft0?.productoSearch === "string" ? draft0.productoSearch : ""
  );

  const [proveedorId, setProveedorId] = useState<number | "">(() =>
    draft0?.proveedorId === "" || typeof draft0?.proveedorId === "number" ? draft0.proveedorId : ""
  );
  const [fechaPedido, setFechaPedido] = useState(() =>
    typeof draft0?.fechaPedido === "string" && draft0.fechaPedido ? draft0.fechaPedido : fechaLocalISO()
  );
  const [fechaPagoDesc, setFechaPagoDesc] = useState(() =>
    typeof draft0?.fechaPagoDesc === "string" ? draft0.fechaPagoDesc : ""
  );
  const [fechaPagoMax, setFechaPagoMax] = useState(() =>
    typeof draft0?.fechaPagoMax === "string" ? draft0.fechaPagoMax : ""
  );
  const [valorDesc, setValorDesc] = useState<number | "">(() =>
    draft0?.valorDesc === "" || typeof draft0?.valorDesc === "number" ? draft0.valorDesc : ""
  );
  const [valorSinDesc, setValorSinDesc] = useState<number | "">(() =>
    draft0?.valorSinDesc === "" || typeof draft0?.valorSinDesc === "number" ? draft0.valorSinDesc : ""
  );
  const [valorSinDescManual, setValorSinDescManual] = useState(() => Boolean(draft0?.valorSinDescManual));
  const [tieneDescuento, setTieneDescuento] = useState(() => Boolean(draft0?.tieneDescuento));
  const [estadoNuevo, setEstadoNuevo] = useState(() =>
    typeof draft0?.estadoNuevo === "string" && draft0.estadoNuevo ? draft0.estadoNuevo : "pendiente"
  );
  const [notas, setNotas] = useState(() => (typeof draft0?.notas === "string" ? draft0.notas : ""));
  const [referencia, setReferencia] = useState(() =>
    typeof draft0?.referencia === "string" ? draft0.referencia : ""
  );
  const [lineas, setLineas] = useState<Linea[]>(() =>
    Array.isArray(draft0?.lineas) ? draft0.lineas : []
  );

  const [drawerNuevoProducto, setDrawerNuevoProducto] = useState(false);
  const [nuevoProdBusy, setNuevoProdBusy] = useState(false);
  const [nuevoCatalogo, setNuevoCatalogo] = useState<ProductoCatalogoFields>(() =>
    emptyProductoCatalogoFields()
  );
  const [inventarioCatalogo, setInventarioCatalogo] = useState<InventarioCatalogo | null>(null);
  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupHint, setLookupHint] = useState<string | null>(null);
  const nuevoCodigoRef = useRef("");
  const inventarioCatalogoRef = useRef(inventarioCatalogo);
  inventarioCatalogoRef.current = inventarioCatalogo;
  nuevoCodigoRef.current = nuevoCatalogo.codigo;

  const { esAdmin: isAdmin } = usePermisos();
  const puedeCrear = usePuede("pedidos", "crear");
  const puedeEditarPedido = usePuede("pedidos", "editar");
  const puedeEliminarPedido = usePuede("pedidos", "eliminar");

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
  const [editProveedorId, setEditProveedorId] = useState<number | "">("");
  const [editLineas, setEditLineas] = useState<Linea[]>([]);
  const [editLoadingLineas, setEditLoadingLineas] = useState(false);
  const [editCatalogo, setEditCatalogo] = useState<Producto[]>([]);
  const [editCatalogoBusca, setEditCatalogoBusca] = useState("");
  const [editProveedorBusca, setEditProveedorBusca] = useState("");
  const [editWizardStep, setEditWizardStep] = useState(0);
  const [confirmDeletePedido, setConfirmDeletePedido] = useState<PedidoProveedor | null>(null);
  const [deletePedidoBusy, setDeletePedidoBusy] = useState(false);

  const historialFiltrosRef = useRef<HistorialFiltrosForm>({ ...HIST_FILTROS_VACIOS });
  const [historialForm, setHistorialForm] = useState<HistorialFiltrosForm>({ ...HIST_FILTROS_VACIOS });
  const [historialFiltrosActivos, setHistorialFiltrosActivos] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = historialFiltrosRef.current;
      const [p, pr, prod] = await Promise.all([
        fetchPedidosProveedores({
          desde: h.desde || undefined,
          hasta: h.hasta || undefined,
          proveedor_id: h.proveedorId.trim() ? Number(h.proveedorId) : undefined,
          referencia: h.referencia.trim() || undefined,
        }),
        fetchProveedores(),
        fetchProductos(),
      ]);
      setPedidos(p);
      setProveedores(pr);
      setProductos(prod);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  function aplicarFiltrosHistorialYRefrescar() {
    historialFiltrosRef.current = { ...historialForm };
    setHistorialFiltrosActivos(
      Boolean(
        historialForm.desde.trim() ||
          historialForm.hasta.trim() ||
          historialForm.proveedorId.trim() ||
          historialForm.referencia.trim()
      )
    );
    void load();
  }

  function limpiarHistorialFiltros() {
    setHistorialForm({ ...HIST_FILTROS_VACIOS });
    historialFiltrosRef.current = { ...HIST_FILTROS_VACIOS };
    setHistorialFiltrosActivos(false);
    void load();
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (vistaTab === "pedido" && !puedeCrear) setVistaTab("historial");
  }, [vistaTab, puedeCrear]);

  useEffect(() => {
    if (!edit || !isAdmin) {
      setEditCatalogo([]);
      return;
    }
    if (editProveedorId === "") {
      setEditCatalogo([]);
      return;
    }
    let cancelled = false;
    void fetchProductosProveedor(Number(editProveedorId), { limit: 500 })
      .then((rows) => {
        if (!cancelled) setEditCatalogo(rows);
      })
      .catch(() => {
        if (!cancelled) setEditCatalogo([]);
      });
    return () => {
      cancelled = true;
    };
  }, [edit, isAdmin, editProveedorId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const draft: PedidoWizardDraft = {
        vistaTab,
        wizardStep,
        proveedorSearch,
        productoSearch,
        proveedorId,
        fechaPedido,
        fechaPagoDesc,
        fechaPagoMax,
        valorDesc,
        valorSinDesc,
        valorSinDescManual,
        tieneDescuento,
        estadoNuevo,
        notas,
        referencia,
        lineas,
      };
      const empty =
        !proveedorId &&
        lineas.length === 0 &&
        !notas.trim() &&
        !referencia.trim() &&
        wizardStep === 0 &&
        vistaTab === "pedido";
      if (empty) clearSessionDraft(PEDIDO_DRAFT_KEY);
      else saveSessionDraft(PEDIDO_DRAFT_KEY, draft);
    }, 250);
    return () => clearTimeout(t);
  }, [
    vistaTab,
    wizardStep,
    proveedorSearch,
    productoSearch,
    proveedorId,
    fechaPedido,
    fechaPagoDesc,
    fechaPagoMax,
    valorDesc,
    valorSinDesc,
    valorSinDescManual,
    tieneDescuento,
    estadoNuevo,
    notas,
    referencia,
    lineas,
  ]);

  useEffect(() => {
    if (proveedorId === "") {
      setCatalogoProveedor([]);
      setCatalogoProveedorLoading(false);
      return;
    }
    let cancelled = false;
    setCatalogoProveedorLoading(true);
    void fetchProductosProveedor(Number(proveedorId), { limit: 500 })
      .then((rows) => {
        if (!cancelled) setCatalogoProveedor(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          toast(e instanceof Error ? e.message : "No se pudo cargar el catálogo", "error");
          setCatalogoProveedor([]);
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogoProveedorLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [proveedorId, toast]);

  /** Tras Pagos → Resumen el botón primario pasa de «Siguiente» a «Registrar» en el mismo lugar: evitamos doble clic accidental. */
  useLayoutEffect(() => {
    if (wizardStep === 3 && prevWizardStepRef.current === 2) {
      resumenFocusRef.current?.focus({ preventScroll: false });
      setBloqueoRegistrarPedido(true);
      const t = window.setTimeout(() => setBloqueoRegistrarPedido(false), 500);
      prevWizardStepRef.current = wizardStep;
      return () => clearTimeout(t);
    }
    prevWizardStepRef.current = wizardStep;
  }, [wizardStep]);

  useEffect(() => {
    if (!edit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEdit(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit]);

  const proveedoresActivos = useMemo(
    () => proveedores.filter((p) => p.estado === "activo"),
    [proveedores]
  );

  const proveedoresActivosFiltrados = useMemo(
    () => proveedoresActivos.filter((p) => matchesProveedorSearch(p, proveedorSearch)),
    [proveedoresActivos, proveedorSearch]
  );

  const proveedorSeleccionado = useMemo(
    () => (proveedorId === "" ? undefined : proveedores.find((p) => p.id === proveedorId)),
    [proveedorId, proveedores]
  );

  const productosCatalogoProveedor = useMemo(() => {
    if (proveedorId === "") return [];
    return catalogoProveedor;
  }, [catalogoProveedor, proveedorId]);

  const productosFiltrados = useMemo(
    () => productosCatalogoProveedor.filter((p) => matchesProductoSearch(p, productoSearch)),
    [productosCatalogoProveedor, productoSearch]
  );

  const totalGeneralPedido = useMemo(() => {
    let sum = 0;
    for (const ln of lineas) {
      const unit = ln.costo_unitario === "" ? NaN : Number(ln.costo_unitario);
      const qty = Math.max(1, Number(ln.cantidad) || 1);
      if (!Number.isFinite(unit) || unit < 0) continue;
      sum += qty * unit;
    }
    return sum;
  }, [lineas]);

  useEffect(() => {
    if (valorSinDescManual) return;
    const t = roundMoney(totalGeneralPedido);
    setValorSinDesc(t > 0 ? t : "");
  }, [totalGeneralPedido, valorSinDescManual]);

  function setLinea(i: number, patch: Partial<Linea>) {
    setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function patchNuevoCatalogo(patch: Partial<ProductoCatalogoFields>) {
    setNuevoCatalogo((prev) => ({ ...prev, ...patch }));
  }

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

  const crearCategoriaDesdeFormulario = useCallback(
    async (nombreCategoria: string) => {
      const row = await createInventarioCategoriaProducto({ nombre_categoria: nombreCategoria });
      setInventarioCatalogo((prev) => {
        if (!prev) return { categorias: [row], proveedores: [] };
        const exists = prev.categorias.some((c) => c.id === row.id);
        const categorias = exists
          ? prev.categorias.map((c) => (c.id === row.id ? row : c))
          : [...prev.categorias, row].sort((a, b) =>
              a.nombre_categoria.localeCompare(b.nombre_categoria, "es", { sensitivity: "base" })
            );
        return { ...prev, categorias };
      });
      await loadInventarioCatalogo("silent");
      toast("Categoría creada.", "success");
      return row.nombre_categoria;
    },
    [loadInventarioCatalogo, toast]
  );

  const aplicarRespuestaBarcode = useCallback((res: LookupOk | LookupManual) => {
    if (res.ok) {
      const d = res.data;
      const cat = inventarioCatalogoRef.current;
      let categoria = d.categoria ?? "";
      if (cat) {
        const cNom = categoria.trim().toLowerCase();
        const hitC = cat.categorias.find((c) => c.nombre_categoria.trim().toLowerCase() === cNom);
        if (hitC) categoria = hitC.nombre_categoria;
      }
      setNuevoCatalogo((prev) => ({
        ...prev,
        nombre: d.nombre,
        marca: d.marca ?? prev.marca,
        categoria,
        descripcion: d.descripcion ?? "",
        imagenUrl: d.imagen_url ?? "",
      }));
      setLookupHint(labelFuenteLookup(d.fuente));
    } else {
      setLookupHint("No se encontró producto en base de datos.");
    }
  }, []);

  useEffect(() => {
    if (!drawerNuevoProducto) return;
    void loadInventarioCatalogo("initial");
  }, [drawerNuevoProducto, loadInventarioCatalogo]);

  useEffect(() => {
    if (!drawerNuevoProducto) return;
    const code = nuevoCatalogo.codigo.trim();
    if (code.length < 8) return;
    const t = window.setTimeout(async () => {
      if (nuevoCodigoRef.current.trim() !== code) return;
      setLookupLoading(true);
      setLookupHint(null);
      try {
        const res = await lookupBarcode(code);
        if (nuevoCodigoRef.current.trim() !== code) return;
        aplicarRespuestaBarcode(res);
      } catch {
        if (nuevoCodigoRef.current.trim() === code) {
          setLookupHint("No se pudo consultar las APIs (¿sin internet o servidor?). Probá de nuevo.");
        }
      } finally {
        if (nuevoCodigoRef.current.trim() === code) setLookupLoading(false);
      }
    }, 550);
    return () => clearTimeout(t);
  }, [nuevoCatalogo.codigo, drawerNuevoProducto, aplicarRespuestaBarcode]);

  async function onBuscarCodigoNuevoProducto() {
    setLookupHint(null);
    if (!nuevoCatalogo.codigo.trim()) {
      setLookupHint("Ingresá o escaneá un código de barras");
      return;
    }
    setLookupLoading(true);
    try {
      const res = await lookupBarcode(nuevoCatalogo.codigo.trim());
      aplicarRespuestaBarcode(res);
    } catch {
      setLookupHint("No se pudo consultar. Completá manualmente.");
    } finally {
      setLookupLoading(false);
    }
  }

  function openDrawerNuevoProducto() {
    if (proveedorId === "") {
      toast("Elegí un proveedor en el paso 1.", "warning");
      return;
    }
    const pr = proveedores.find((p) => p.id === proveedorId);
    setNuevoCatalogo({
      ...emptyProductoCatalogoFields(),
      proveedorId: Number(proveedorId),
      marca: pr?.nombre ?? "",
      stock: 0,
    });
    setLookupHint(null);
    setDrawerNuevoProducto(true);
  }

  async function guardarNuevoProducto(e: FormEvent) {
    e.preventDefault();
    if (proveedorId === "") return;
    if (!nuevoCatalogo.nombre.trim()) {
      toast("Ingresá el nombre del producto.", "warning");
      return;
    }
    if (!nuevoCatalogo.codigo.trim()) {
      toast("Ingresá el código de barras", "warning");
      return;
    }
    if (!nuevoCatalogo.categoria.trim()) {
      toast("Seleccioná una categoría.", "warning");
      return;
    }
    if (nuevoCatalogo.precioVenta === "" || Number(nuevoCatalogo.precioVenta) <= 0) {
      toast("Ingresá un precio de venta mayor a 0", "warning");
      return;
    }
    const body = catalogoFieldsToCreateBody({
      ...nuevoCatalogo,
      proveedorId: Number(proveedorId),
      marca: proveedorSeleccionado?.nombre ?? nuevoCatalogo.marca,
    });
    setNuevoProdBusy(true);
    try {
      const created = await createProductoRapidoProveedor(Number(proveedorId), body);
      setCatalogoProveedor((prev) => {
        const sin = prev.filter((p) => p.id !== created.id);
        return [{ ...created, proveedor_id: created.proveedor_id ?? Number(proveedorId) }, ...sin];
      });
      await load();
      addProductoExistente({ ...created, proveedor_id: created.proveedor_id ?? Number(proveedorId) });
      toast("Producto creado en el catálogo del proveedor y sumado al pedido.", "success");
      setDrawerNuevoProducto(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo crear el producto", "error");
    } finally {
      setNuevoProdBusy(false);
    }
  }

  function removeLinea(i: number) {
    setLineas((prev) => prev.filter((_, j) => j !== i));
  }

  function addProductoExistente(producto: Producto) {
    setLineas((prev) => {
      const idx = prev.findIndex((ln) => ln.producto_id === producto.id);
      if (idx >= 0) {
        return prev.map((ln, i) =>
          i === idx ? { ...ln, cantidad: Math.max(1, Number(ln.cantidad) || 1) + 1 } : ln
        );
      }
      const nueva: Linea = {
        producto_id: producto.id,
        cantidad: 1,
        costo_unitario: Number(producto.precio_compra ?? producto.precio ?? 0),
        precio_venta: Number(producto.precio_venta ?? producto.precio ?? 0),
      };
      // Quitar filas placeholder (sin producto ni costo) para no dejar líneas inválidas junto a la nueva.
      const sinPlaceholders = prev.filter((ln) => !isLineaPlaceholderExistente(ln));
      return [...sinPlaceholders, nueva];
    });
  }

  function validateLineas(): string | null {
    if (!lineas.length) return "Agregá al menos una línea de producto.";
    for (const ln of lineas) {
      const cant = Number(ln.cantidad);
      const costo = ln.costo_unitario === "" ? NaN : Number(ln.costo_unitario);
      if (!Number.isFinite(cant) || cant <= 0 || !Number.isFinite(costo) || costo < 0) {
        return "Revisá cantidad y costo en cada línea.";
      }
      if (!ln.producto_id) {
        return "Seleccioná un producto en cada línea.";
      }
    }
    return null;
  }

  /** Solo lo mínimo para poder ver el paso Resumen; el resto se valida al registrar y aparece como aviso en el resumen. */
  function validatePagosForAdvance(): string | null {
    if (!fechaPedido.trim()) return "La fecha del pedido es obligatoria.";
    return null;
  }

  function validatePagos(): string | null {
    if (!fechaPedido.trim()) return "La fecha del pedido es obligatoria.";
    const fp = fechaPedido.trim().slice(0, 10);
    if (tieneDescuento && fechaPagoDesc.trim() && fp > fechaPagoDesc.trim()) {
      return "La fecha del pedido debe ser anterior o igual a la fecha límite con descuento.";
    }
    if (fechaPagoMax.trim() && fp > fechaPagoMax.trim()) {
      return "La fecha del pedido debe ser anterior o igual a la fecha máxima de pago.";
    }
    if (tieneDescuento && fechaPagoDesc.trim() && fechaPagoMax.trim() && fechaPagoDesc > fechaPagoMax) {
      return "La fecha de pago con descuento debe ser anterior o igual a la fecha máxima.";
    }
    if (tieneDescuento && valorDesc !== "" && (!Number.isFinite(Number(valorDesc)) || Number(valorDesc) < 0)) {
      return "El valor con descuento debe ser un número válido mayor o igual a 0.";
    }
    if (valorSinDesc !== "" && (!Number.isFinite(Number(valorSinDesc)) || Number(valorSinDesc) < 0)) {
      return "El valor sin descuento debe ser un número válido mayor o igual a 0.";
    }
    if (
      tieneDescuento &&
      valorDesc !== "" &&
      valorSinDesc !== "" &&
      Number.isFinite(Number(valorDesc)) &&
      Number.isFinite(Number(valorSinDesc)) &&
      Number(valorDesc) > Number(valorSinDesc)
    ) {
      return "El valor con descuento no puede ser mayor al valor sin descuento.";
    }
    return null;
  }

  function validateStep(step: number): string | null {
    if (step === 0) {
      if (proveedorId === "") {
        return "Elegí un proveedor activo de la lista o gestioná altas en el módulo Proveedores.";
      }
      if (!proveedorSeleccionado || proveedorSeleccionado.estado !== "activo") {
        return "El proveedor seleccionado debe estar activo.";
      }
      return null;
    }
    if (step === 1) return validateLineas();
    if (step === 2) return validatePagosForAdvance();
    return null;
  }

  function goToStep(target: number) {
    if (target < 0 || target > 3) return;
    if (target <= wizardStep) {
      setWizardStep(target);
      return;
    }
    for (let s = wizardStep; s < target; s += 1) {
      const msg = validateStep(s);
      if (msg) {
        toast(msg, "warning");
        return;
      }
    }
    setWizardStep(target);
  }

  function onNextStep() {
    const msg = validateStep(wizardStep);
    if (msg) {
      toast(msg, "warning");
      return;
    }
    setWizardStep((s) => Math.min(3, s + 1));
  }

  function onPrevStep() {
    setWizardStep((s) => Math.max(0, s - 1));
  }

  function onToggleDescuento(enabled: boolean) {
    setTieneDescuento(enabled);
    if (!enabled) {
      setFechaPagoDesc("");
      setValorDesc("");
    }
  }

  async function onPedidoSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ne = e.nativeEvent;
    const canUseSubmitter = typeof SubmitEvent !== "undefined" && ne instanceof SubmitEvent;
    const submitter = canUseSubmitter ? ne.submitter : undefined;

    if (wizardStep < 3) {
      const msg = validateStep(wizardStep);
      if (msg) {
        toast(msg, "warning");
        return;
      }
      setWizardStep((s) => Math.min(3, s + 1));
      return;
    }

    if (canUseSubmitter && submitter === null) {
      return;
    }

    const pagosErr = validatePagos();
    if (pagosErr) {
      toast(pagosErr, "warning");
      return;
    }

    if (proveedorId === "") {
      toast("Elegí un proveedor activo de la lista o gestioná altas en el módulo Proveedores.", "warning");
      return;
    }
    const built: Record<string, unknown>[] = [];
    for (const ln of lineas) {
      const cant = Number(ln.cantidad);
      const costo = ln.costo_unitario === "" ? NaN : Number(ln.costo_unitario);
      if (!Number.isFinite(cant) || cant <= 0 || !Number.isFinite(costo) || costo < 0) {
        toast("Revisá cantidad y costo en cada línea", "warning");
        return;
      }
      if (!ln.producto_id) {
        toast("Seleccioná un producto en cada línea", "warning");
        return;
      }
      built.push({
        producto_id: ln.producto_id,
        cantidad: cant,
        costo_unitario: costo,
      });
    }

    try {
      await createPedidoProveedor({
        proveedor_id: proveedorId,
        fecha: fechaPedido,
        fecha_pago_con_descuento: tieneDescuento ? fechaPagoDesc.trim() || null : null,
        fecha_pago_maxima: fechaPagoMax.trim() || null,
        valor_pago_con_descuento: tieneDescuento ? (valorDesc === "" ? null : Number(valorDesc)) : null,
        valor_pago_sin_descuento: valorSinDesc === "" ? null : Number(valorSinDesc),
        estado: estadoNuevo,
        notas: notas.trim() || null,
        referencia: referencia.trim() || null,
        lineas: built,
      });
      const lineasConCambio = lineas.filter((ln) => {
        if (!ln.producto_id) return false;
        const prod = productos.find((p) => p.id === ln.producto_id);
        if (!prod) return false;
        const costoChanged = ln.costo_unitario !== "" && Number(ln.costo_unitario) !== Number(prod.precio_compra ?? 0);
        const ventaChanged = ln.precio_venta !== "" && Number(ln.precio_venta) !== Number(prod.precio_venta ?? prod.precio ?? 0);
        return costoChanged || ventaChanged;
      });

      if (lineasConCambio.length > 0) {
        await Promise.all(
          lineasConCambio.map((ln) => {
            const prod = productos.find((p) => p.id === ln.producto_id);
            const body: Record<string, unknown> = {};
            if (ln.costo_unitario !== "" && Number(ln.costo_unitario) !== Number(prod?.precio_compra ?? 0)) {
              body.precio_compra = Number(ln.costo_unitario);
            }
            if (ln.precio_venta !== "" && Number(ln.precio_venta) !== Number(prod?.precio_venta ?? prod?.precio ?? 0)) {
              body.precio_venta = Number(ln.precio_venta);
              body.precio = Number(ln.precio_venta);
            }
            return updateProducto(ln.producto_id, body);
          })
        );
        toast("Pedido registrado; stock y precios actualizados.", "success");
      } else {
        toast("Pedido registrado; stock actualizado (ENTRADA).", "success");
      }
      setProveedorId("");
      setWizardStep(0);
      setProveedorSearch("");
      setProductoSearch("");
      setFechaPedido(fechaLocalISO());
      setFechaPagoDesc("");
      setFechaPagoMax("");
      setValorDesc("");
      setValorSinDesc("");
      setValorSinDescManual(false);
      setTieneDescuento(false);
      setEstadoNuevo("pendiente");
      setNotas("");
      setReferencia("");
      setLineas([]);
      clearSessionDraft(PEDIDO_DRAFT_KEY);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al registrar pedido", "error");
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
    setEditProveedorId(p.proveedor_id);
    setEditCatalogoBusca("");
    setEditProveedorBusca("");
    setEditLineas([]);
    setEditWizardStep(0);
    if (isAdmin) {
      setEditLoadingLineas(true);
      void fetchPedidoProveedor(p.id)
        .then((full) => {
          const raw = Array.isArray(full.lineas) ? full.lineas : [];
          const cargadas: Linea[] = raw
            .map((ln) => ln as Record<string, unknown>)
            .map<Linea>((ln) => ({
              producto_id: Number(ln.producto_id ?? 0) || 0,
              cantidad: Number(ln.cantidad ?? 1) || 1,
              costo_unitario: Number(ln.costo_unitario ?? 0) || 0,
              precio_venta: "",
            }))
            .filter((ln) => ln.producto_id > 0);
          setEditLineas(cargadas);
        })
        .catch((err) => {
          toast(err instanceof Error ? err.message : "No se pudieron cargar las líneas", "error");
        })
        .finally(() => setEditLoadingLineas(false));
    }
  }

  function setEditLinea(i: number, patch: Partial<Linea>) {
    setEditLineas((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function removeEditLinea(i: number) {
    setEditLineas((prev) => prev.filter((_, j) => j !== i));
  }

  function addEditProductoExistente(producto: Producto) {
    setEditLineas((prev) => {
      const idx = prev.findIndex((ln) => ln.producto_id === producto.id);
      if (idx >= 0) {
        return prev.map((ln, i) =>
          i === idx ? { ...ln, cantidad: Math.max(1, Number(ln.cantidad) || 1) + 1 } : ln
        );
      }
      const nueva: Linea = {
        producto_id: producto.id,
        cantidad: 1,
        costo_unitario: Number(producto.precio_compra ?? producto.precio ?? 0),
        precio_venta: "",
      };
      return [...prev.filter((ln) => !isLineaPlaceholderExistente(ln)), nueva];
    });
  }

  const editTotalGeneral = useMemo(() => {
    let sum = 0;
    for (const ln of editLineas) {
      const unit = ln.costo_unitario === "" ? NaN : Number(ln.costo_unitario);
      const qty = Math.max(1, Number(ln.cantidad) || 1);
      if (!Number.isFinite(unit) || unit < 0) continue;
      sum += qty * unit;
    }
    return sum;
  }, [editLineas]);

  const editCatalogoFiltrado = useMemo(
    () => editCatalogo.filter((p) => matchesProductoSearch(p, editCatalogoBusca)),
    [editCatalogo, editCatalogoBusca]
  );

  const editProveedoresFiltrados = useMemo(
    () => proveedores.filter((p) => matchesProveedorSearch(p, editProveedorBusca)),
    [proveedores, editProveedorBusca]
  );

  const editPasos = useMemo<readonly string[]>(
    () => (isAdmin ? ["Proveedor", "Productos", "Pagos", "Resumen y notas"] : ["Pagos", "Resumen y notas"]),
    [isAdmin]
  );

  function validateEditStep(step: number): string | null {
    if (isAdmin) {
      if (step === 0) {
        if (editProveedorId === "") return "Elegí un proveedor.";
        return null;
      }
      if (step === 1) {
        if (editLineas.length === 0) return "Agregá al menos una línea de producto.";
        for (const ln of editLineas) {
          if (!ln.producto_id) return "Seleccioná un producto en cada línea.";
          const cant = Number(ln.cantidad);
          const costo = ln.costo_unitario === "" ? NaN : Number(ln.costo_unitario);
          if (!Number.isFinite(cant) || cant <= 0 || !Number.isFinite(costo) || costo < 0) {
            return "Revisá cantidad y costo en cada línea.";
          }
        }
        return null;
      }
      if (step === 2) {
        if (!editFecha.trim()) return "La fecha del pedido es obligatoria.";
        return null;
      }
      return null;
    }
    // No-admin: paso 0 = Pagos, paso 1 = Notas
    if (step === 0) {
      if (!editFecha.trim()) return "La fecha del pedido es obligatoria.";
    }
    return null;
  }

  function onEditNextStep() {
    const msg = validateEditStep(editWizardStep);
    if (msg) {
      toast(msg, "warning");
      return;
    }
    setEditWizardStep((s) => Math.min(editPasos.length - 1, s + 1));
  }

  function onEditPrevStep() {
    setEditWizardStep((s) => Math.max(0, s - 1));
  }

  function goToEditStep(target: number) {
    if (target < 0 || target > editPasos.length - 1) return;
    if (target <= editWizardStep) {
      setEditWizardStep(target);
      return;
    }
    for (let s = editWizardStep; s < target; s += 1) {
      const msg = validateEditStep(s);
      if (msg) {
        toast(msg, "warning");
        return;
      }
    }
    setEditWizardStep(target);
  }

  async function onEditSave(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    // Si no estamos en el último paso, sólo avanzamos.
    if (editWizardStep < editPasos.length - 1) {
      onEditNextStep();
      return;
    }
    // Revalidar todos los pasos por seguridad.
    for (let s = 0; s < editPasos.length; s += 1) {
      const msg = validateEditStep(s);
      if (msg) {
        toast(msg, "warning");
        setEditWizardStep(s);
        return;
      }
    }
    setEditBusy(true);
    try {
      if (isAdmin) {
        await updatePedidoProveedorFull(edit.id, {
          proveedor_id: Number(editProveedorId),
          fecha: editFecha,
          fecha_pago_con_descuento: editFd.trim() || null,
          fecha_pago_maxima: editFm.trim() || null,
          valor_pago_con_descuento: editVd === "" ? null : Number(editVd),
          valor_pago_sin_descuento: editVs === "" ? null : Number(editVs),
          estado: editEstado,
          notas: editNotas.trim() || null,
          referencia: editRef.trim() || null,
          lineas: editLineas.map((ln) => ({
            producto_id: ln.producto_id,
            cantidad: Number(ln.cantidad),
            costo_unitario: Number(ln.costo_unitario),
          })),
        });
      } else {
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
      }
      setEdit(null);
      toast("Pedido actualizado.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setEditBusy(false);
    }
  }

  function requestEliminarPedido(p: PedidoProveedor) {
    if (!isAdmin) return;
    setConfirmDeletePedido(p);
  }

  async function confirmEliminarPedidoAction() {
    const p = confirmDeletePedido;
    if (!p) return;
    setDeletePedidoBusy(true);
    try {
      await deletePedidoProveedor(p.id);
      setConfirmDeletePedido(null);
      if (edit?.id === p.id) setEdit(null);
      toast("Pedido eliminado. Se revirtió el stock de las líneas.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo eliminar el pedido", "error");
    } finally {
      setDeletePedidoBusy(false);
    }
  }

  const resumenWarnings = [validateLineas(), validatePagos()].filter((x): x is string => Boolean(x));

  return (
    <div className="page-pedidos">
      <nav className="subnav subnav--tabs pedidos-module-nav" aria-label="Navegación de pedidos" role="tablist">
        {(
          [
            ...(puedeCrear
              ? [{
                  id: "pedido" as const,
                  label: "Pedido",
                  description: "Creá un pedido de proveedor y registrá productos, pagos y notas.",
                }]
              : []),
            {
              id: "proveedores" as const,
              label: "Proveedores",
              description: "Consultá y administrá los proveedores del negocio.",
            },
            {
              id: "historial" as const,
              label: "Historial",
              description: "Consultá pedidos anteriores y editá plazos, montos o notas de pago.",
            },
          ] as const
        ).map((tab) => {
          const active = vistaTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={tab.description}
              aria-label={`${tab.label}. ${tab.description}`}
              className={active ? "subnav-link subnav-link--active" : "subnav-link"}
              onClick={() => setVistaTab(tab.id)}
            >
              <span className="subnav-label">{tab.label}</span>
              <Info className="subnav-info" size={15} weight="bold" aria-hidden />
            </button>
          );
        })}
      </nav>

      {vistaTab === "pedido" ? (
        <section className="pedidos-wizard-card">
          <div className="pedidos-wizard-card__intro">
            <h2 className="pedidos-wizard-card__title">Nuevo pedido</h2>
          </div>

          <ol className="pedidos-stepper" aria-label="Progreso del pedido">
            {pasos.map((label, idx) => {
              const active = idx === wizardStep;
              const done = idx < wizardStep;
              const pending = idx > wizardStep;
              return (
                <li key={label} className="pedidos-stepper__item">
                  <button
                    type="button"
                    className={[
                      "pedidos-stepper__hit",
                      active ? "pedidos-stepper__hit--active" : "",
                      done ? "pedidos-stepper__hit--done" : "",
                      pending ? "pedidos-stepper__hit--pending" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-current={active ? "step" : undefined}
                    aria-label={`${label}${done ? ", completado" : ""}${active ? ", paso actual" : ""}`}
                    onClick={() => goToStep(idx)}
                  >
                    <span className="pedidos-stepper__disc" aria-hidden>
                      {done ? <Check size={16} weight="bold" /> : <span>{idx + 1}</span>}
                    </span>
                    <span className="pedidos-stepper__label">{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <form className="pedidos-form" onSubmit={onPedidoSubmit}>
            {wizardStep === 0 ? (
              <div className="pedidos-panel">
                <label className="pedidos-field">
                  <span className="pedidos-field__label">Buscar proveedor</span>
                  <span className="pedidos-input-wrap">
                    <MagnifyingGlass className="pedidos-input-wrap__icon" size={18} weight="regular" aria-hidden />
                    <input
                      id="ped-prov-search-input"
                      className="pedidos-input pedidos-input--with-icon"
                      type="search"
                      autoComplete="off"
                      placeholder="Nombre, NIT, teléfono o email…"
                      value={proveedorSearch}
                      onChange={(e) => setProveedorSearch(e.target.value)}
                    />
                  </span>
                </label>
                {proveedoresActivosFiltrados.length === 0 ? (
                  <div className="pedidos-callout pedidos-callout--muted">
                    No hay proveedores activos que coincidan con la búsqueda.
                  </div>
                ) : (
                  <div className="pedidos-prov-grid" role="list">
                    {proveedoresActivosFiltrados.map((p) => {
                      const selected = proveedorId === p.id;
                      return (
                        <article
                          key={p.id}
                          className={["pedidos-prov-card", selected ? "pedidos-prov-card--selected" : ""]
                            .filter(Boolean)
                            .join(" ")}
                          role="listitem"
                          tabIndex={0}
                          aria-pressed={selected}
                          aria-label={`Seleccionar ${p.nombre}`}
                          onClick={() => {
                            setProveedorId(p.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setProveedorId(p.id);
                            }
                          }}
                        >
                          <ProveedorSelectableMedia proveedor={p} />
                          <div className="pedidos-prov-card__body">
                            <h3 className="pedidos-prov-card__name">{p.nombre}</h3>
                            <p className="pedidos-prov-card__meta">NIT · {p.nit || "—"}</p>
                            <p className="pedidos-prov-card__meta">
                              {p.telefono || "—"} · {p.email || "—"}
                            </p>
                          </div>
                          <div className="pedidos-prov-card__action">
                            {selected ? (
                              <span className="pedidos-prov-card__check" aria-hidden>
                                <Check size={18} weight="bold" />
                              </span>
                            ) : (
                              <span className="pedidos-prov-card__cta">Elegir</span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
                {!proveedorSeleccionado ? (
                  <div className="pedidos-callout pedidos-callout--info">Elegí un proveedor para continuar.</div>
                ) : null}
              </div>
            ) : null}

            {wizardStep === 1 ? (
              <div className="pedidos-panel">
                {!proveedorSeleccionado ? (
                  <div className="pedidos-callout pedidos-callout--info">
                    Primero seleccioná un proveedor en el paso 1.
                  </div>
                ) : (
                  <div className="pedidos-dash-layout">
                    <div className="pedidos-dash-layout__main">
                      <div className="pedidos-lines-head">
                        <h3 className="pedidos-lines-head__title">Líneas del pedido</h3>
                      </div>
                      <div className="pedidos-actions-row">
                        <button type="button" className="pedidos-btn pedidos-btn--ghost" onClick={openDrawerNuevoProducto}>
                          + Nuevo producto (modal)
                        </button>
                      </div>
                      {lineas.length === 0 ? (
                        <div className="pedidos-empty-lines">
                          <p className="pedidos-empty-lines__title">Todavía no agregaste productos</p>
                          <p className="pedidos-empty-lines__text">
                            Buscá en el catálogo a la derecha y tocá un producto para sumarlo al pedido.
                          </p>
                        </div>
                      ) : (
                        <div className="table-wrap pedidos-lineas-table-wrap">
                          <table className="table pedidos-lineas-table">
                            <thead>
                              <tr>
                                <th scope="col">Producto</th>
                                <th scope="col" className="pedidos-lineas-table__col-num">
                                  Cant.
                                </th>
                                <th scope="col" className="pedidos-lineas-table__col-num">
                                  Costo u.
                                </th>
                                <th scope="col" className="pedidos-lineas-table__col-num">
                                  P. Venta
                                </th>
                                <th scope="col" className="pedidos-lineas-table__col-num">
                                  Subtotal
                                </th>
                                <th scope="col" className="pedidos-lineas-table__col-acc" />
                              </tr>
                            </thead>
                            <tbody>
                              {lineas.map((ln, idx) => {
                                const unit = ln.costo_unitario === "" ? 0 : Number(ln.costo_unitario);
                                const subtotal = Math.max(1, Number(ln.cantidad) || 1) * unit;
                                const subStr = Number.isFinite(subtotal)
                                  ? formatMoney(subtotal)
                                  : formatMoney(0);
                                return (
                                  <tr key={`ped-line-${idx}`}>
                                    <td>
                                      <select
                                        className="pedidos-input pedidos-select pedidos-lineas-table__control"
                                        value={ln.producto_id || ""}
                                        onChange={(e) =>
                                          setLinea(idx, { producto_id: Number(e.target.value) || 0 })
                                        }
                                        aria-label="Producto"
                                      >
                                        <option value="">— Elegir —</option>
                                        {productosCatalogoProveedor.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.nombre}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="pedidos-lineas-table__col-num">
                                      <input
                                        className="pedidos-input pedidos-lineas-table__control pedidos-lineas-table__control--qty input-numeric"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        value={ln.cantidad === "" ? "" : String(ln.cantidad)}
                                        onChange={(e) => {
                                          const raw = filterIntegerTyping(e.target.value);
                                          setLinea(idx, {
                                            cantidad: raw === "" ? "" : Math.max(1, parseInt(raw, 10) || 1),
                                          });
                                        }}
                                        aria-label="Cantidad"
                                      />
                                    </td>
                                    <td className="pedidos-lineas-table__col-num">
                                      <input
                                        className="pedidos-input pedidos-lineas-table__control pedidos-lineas-table__control--money input-numeric"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        value={ln.costo_unitario === "" ? "" : formatMoneyForInput(ln.costo_unitario)}
                                        onChange={(e) =>
                                          setLinea(idx, {
                                            costo_unitario: parseMoneyInput(e.target.value),
                                          })
                                        }
                                        aria-label="Costo unitario"
                                      />
                                    </td>
                                    <td className="pedidos-lineas-table__col-num">
                                      <input
                                        className="pedidos-input pedidos-lineas-table__control pedidos-lineas-table__control--money input-numeric"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        value={ln.precio_venta === "" ? "" : formatMoneyForInput(ln.precio_venta)}
                                        onChange={(e) =>
                                          setLinea(idx, {
                                            precio_venta: parseMoneyInput(e.target.value),
                                          })
                                        }
                                        aria-label="Precio de venta"
                                      />
                                    </td>
                                    <td className="pedidos-lineas-table__col-num mono">{subStr}</td>
                                    <td className="pedidos-lineas-table__col-acc">
                                      <button
                                        type="button"
                                        className="pedidos-lineas-table__btn-remove"
                                        onClick={() => removeLinea(idx)}
                                      >
                                        Quitar
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="pedidos-total-strip">
                        <span className="pedidos-total-strip__label">Total general del pedido</span>
                        <span className="pedidos-total-strip__value">
                          {formatMoney(roundMoney(totalGeneralPedido))}
                        </span>
                      </div>
                    </div>

                    <aside className="pedidos-sidebar-card">
                      <div className="pedidos-sidebar-card__head">
                        <div>
                          <h3 className="pedidos-sidebar-card__title">Catálogo del proveedor</h3>
                        </div>
                      </div>
                      <label className="pedidos-field pedidos-field--compact">
                        <span className="pedidos-field__label">Buscar</span>
                        <span className="pedidos-input-wrap">
                          <MagnifyingGlass className="pedidos-input-wrap__icon" size={18} weight="regular" aria-hidden />
                          <input
                            className="pedidos-input pedidos-input--with-icon"
                            type="search"
                            placeholder="Nombre, código, marca…"
                            value={productoSearch}
                            onChange={(e) => setProductoSearch(e.target.value)}
                          />
                        </span>
                      </label>
                      <div className="pedidos-sidebar-card__scroll">
                      {catalogoProveedorLoading ? (
                        <div className="pedidos-sidebar-empty">
                          <p className="pedidos-sidebar-empty__title">Cargando catálogo…</p>
                        </div>
                      ) : productosFiltrados.length === 0 ? (
                        <div className="pedidos-sidebar-empty">
                          <p className="pedidos-sidebar-empty__title">Sin resultados</p>
                          <p className="pedidos-sidebar-empty__text">Probá otra búsqueda o creá un producto nuevo.</p>
                        </div>
                      ) : (
                        <div className="pedidos-catalog-list" role="list">
                          {productosFiltrados.slice(0, 200).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="pedidos-catalog-row"
                              role="listitem"
                              onClick={() => addProductoExistente(p)}
                            >
                              <span className="pedidos-catalog-row__name">{p.nombre}</span>
                              <span className="pedidos-catalog-row__price">
                                {formatMoney(Number(p.precio_compra ?? p.precio ?? 0))}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {productosFiltrados.length > 200 ? (
                        <p className="pedidos-sidebar-card__status">Mostrando los primeros 200 resultados.</p>
                      ) : null}
                      </div>
                      <button type="button" className="pedidos-sidebar-cta" onClick={openDrawerNuevoProducto}>
                        <Plus size={18} weight="bold" aria-hidden />
                        Nuevo producto en catálogo
                      </button>
                    </aside>
                  </div>
                )}
              </div>
            ) : null}

            {wizardStep === 2 ? (
              <div className="pedidos-panel">
                <div className="pedidos-inline-hint">
                  Total del pedido:{" "}
                  <strong>{formatMoney(roundMoney(totalGeneralPedido))}</strong>. El valor sin descuento sigue
                  al total salvo que lo edites a mano.
                </div>
                {validatePagos() ? (
                  <div className="pedidos-callout pedidos-callout--warn" role="status">
                    {validatePagos()}
                  </div>
                ) : (
                  <div className="pedidos-callout pedidos-callout--info" role="status">
                    {tieneDescuento
                      ? "Fechas: pedido ≤ límite con descuento ≤ fecha máxima. Montos: con descuento ≤ sin descuento."
                      : "Sin descuento activo: completá fecha máxima y valor sin descuento si aplica."}
                  </div>
                )}
                <label className="pedidos-field">
                  <span className="pedidos-field__label">Referencia / remito</span>
                  <input
                    className="pedidos-input"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.preventDefault();
                    }}
                    placeholder="Nº remito, OC, factura…"
                    autoComplete="off"
                  />
                </label>
                <div className="pedidos-form-grid">
                  <label className="pedidos-field">
                    <span className="pedidos-field__label">Fecha del pedido *</span>
                    <input
                      className="pedidos-input"
                      type="date"
                      value={fechaPedido}
                      onChange={(e) => setFechaPedido(e.target.value)}
                      required
                    />
                  </label>
                  <label className="pedidos-field">
                    <span className="pedidos-field__label">Estado del pago</span>
                    <select
                      className="pedidos-input pedidos-select"
                      value={estadoNuevo}
                      onChange={(e) => setEstadoNuevo(e.target.value)}
                    >
                      <option value="pendiente">Pendiente</option>
                      <option value="pagado">Pagado</option>
                      <option value="vencido">Vencido</option>
                    </select>
                  </label>
                  <label className="pedidos-field pedidos-field--toggle">
                    <span className="pedidos-field__label">Pago con descuento</span>
                    <span className="pedido-toggle">
                      <input
                        type="checkbox"
                        checked={tieneDescuento}
                        onChange={(e) => onToggleDescuento(e.target.checked)}
                      />
                      <span className="pedido-toggle__track" aria-hidden>
                        <span className="pedido-toggle__thumb" />
                      </span>
                      <span className="pedido-toggle__text">{tieneDescuento ? "Activado" : "Desactivado"}</span>
                    </span>
                  </label>
                  {tieneDescuento ? (
                    <label className="pedidos-field">
                      <span className="pedidos-field__label">Fecha límite con descuento</span>
                      <input
                        className="pedidos-input"
                        type="date"
                        value={fechaPagoDesc}
                        onChange={(e) => setFechaPagoDesc(e.target.value)}
                      />
                    </label>
                  ) : null}
                  <label className="pedidos-field">
                    <span className="pedidos-field__label">Fecha máxima de pago</span>
                    <input
                      className="pedidos-input"
                      type="date"
                      value={fechaPagoMax}
                      onChange={(e) => setFechaPagoMax(e.target.value)}
                    />
                  </label>
                  {tieneDescuento ? (
                    <label className="pedidos-field">
                      <span className="pedidos-field__label">Valor con descuento (ARS)</span>
                      <input
                        className="pedidos-input input-numeric"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={valorDesc === "" ? "" : formatMoneyForInput(valorDesc)}
                        onChange={(e) => setValorDesc(parseMoneyInput(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.preventDefault();
                        }}
                      />
                    </label>
                  ) : null}
                  <label className="pedidos-field">
                    <span className="pedidos-field__label">Valor sin descuento (ARS)</span>
                    <input
                      className="pedidos-input input-numeric"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={valorSinDesc === "" ? "" : formatMoneyForInput(valorSinDesc)}
                      onChange={(e) => {
                        setValorSinDescManual(true);
                        setValorSinDesc(parseMoneyInput(e.target.value));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                    />
                    <span className="pedidos-field__hint">
                      Sugerido: {formatMoney(roundMoney(totalGeneralPedido))}
                      {valorSinDescManual ? " · editado manualmente" : " · enlazado al total"}
                    </span>
                  </label>
                </div>
                <div className="pedidos-actions-row pedidos-actions-row--start">
                  <button
                    type="button"
                    className="pedidos-btn pedidos-btn--ghost"
                    onClick={() => {
                      setValorSinDescManual(false);
                      setValorSinDesc(roundMoney(totalGeneralPedido));
                    }}
                  >
                    Usar total del pedido ({formatMoney(roundMoney(totalGeneralPedido))})
                  </button>
                </div>
              </div>
            ) : null}

            {wizardStep === 3 ? (
              <div
                ref={resumenFocusRef}
                tabIndex={-1}
                className="pedidos-panel pedidos-panel--resumen"
                aria-label="Resumen del pedido"
              >
                {resumenWarnings.length > 0 ? (
                  <div className="pedidos-callout pedidos-callout--warn" role="status">
                    Atención: {resumenWarnings.join(" ")}
                  </div>
                ) : (
                  <div className="pedidos-callout pedidos-callout--info" role="status">
                    Revisá el resumen. Si todo está correcto, podés finalizar el pedido.
                  </div>
                )}
                <div className="pedidos-resumen-grid">
                  <div className="pedidos-resumen-tile">
                    <div className="pedidos-resumen-tile__head">
                      <span className="pedidos-resumen-tile__eyebrow">Proveedor</span>
                      <button type="button" className="pedidos-link-btn" onClick={() => goToStep(0)}>
                        Editar
                      </button>
                    </div>
                    <p className="pedidos-resumen-tile__strong">{proveedorSeleccionado?.nombre ?? "No seleccionado"}</p>
                    <p className="pedidos-resumen-tile__meta">
                      NIT: {proveedorSeleccionado?.nit || "—"} · Tel: {proveedorSeleccionado?.telefono || "—"}
                    </p>
                    <p className="pedidos-resumen-tile__meta">
                      Fecha pedido: {fechaPedido || "—"} · Ref.: {referencia.trim() || "—"}
                    </p>
                  </div>
                  <div className="pedidos-resumen-tile">
                    <div className="pedidos-resumen-tile__head">
                      <span className="pedidos-resumen-tile__eyebrow">Totales</span>
                      <button type="button" className="pedidos-link-btn" onClick={() => goToStep(1)}>
                        Editar
                      </button>
                    </div>
                    <p className="pedidos-resumen-tile__strong">{lineas.length} línea(s)</p>
                    <p className="pedidos-resumen-tile__meta">
                      Total general: {formatMoney(roundMoney(totalGeneralPedido))}
                    </p>
                  </div>
                  <div className="pedidos-resumen-tile pedidos-resumen-tile--wide">
                    <div className="pedidos-resumen-tile__head">
                      <span className="pedidos-resumen-tile__eyebrow">Productos</span>
                      <button type="button" className="pedidos-link-btn" onClick={() => goToStep(1)}>
                        Editar
                      </button>
                    </div>
                    {lineas.length === 0 ? (
                      <p className="pedidos-resumen-tile__meta">No hay productos en el pedido.</p>
                    ) : (
                      <ul className="pedidos-resumen-lines">
                        {lineas.map((ln, i) => {
                          const nombre =
                            productos.find((p) => p.id === ln.producto_id)?.nombre ?? `Producto #${ln.producto_id}`;
                          const unit = ln.costo_unitario === "" ? 0 : Number(ln.costo_unitario);
                          const subtotal = Math.max(1, Number(ln.cantidad) || 1) * unit;
                          const qty = Math.max(1, Number(ln.cantidad) || 1);
                          return (
                            <li className="pedidos-resumen-line" key={`res-ln-${i}`}>
                              <span className="pedidos-resumen-line__name">{nombre}</span>
                              <span className="pedidos-resumen-line__detail">
                                {qty} × {formatMoney(unit)}
                              </span>
                              <span className="pedidos-resumen-line__amt">{formatMoney(subtotal)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="pedidos-resumen-tile pedidos-resumen-tile--wide">
                    <div className="pedidos-resumen-tile__head">
                      <span className="pedidos-resumen-tile__eyebrow">Pagos</span>
                      <button type="button" className="pedidos-link-btn" onClick={() => goToStep(2)}>
                        Editar
                      </button>
                    </div>
                    <p className="pedidos-resumen-tile__body">
                      Con descuento:{" "}
                      {tieneDescuento
                        ? valorDesc === ""
                          ? "—"
                          : formatMoney(Number(valorDesc))
                        : "No aplica"}{" "}
                      · Sin descuento: {valorSinDesc === "" ? "—" : formatMoney(Number(valorSinDesc))}
                    </p>
                    <p className="pedidos-resumen-tile__meta">Estado: {labelEstadoPago(estadoNuevo)}</p>
                    <p className="pedidos-resumen-tile__meta">
                      Plazos: desc. hasta {tieneDescuento ? fechaPagoDesc || "—" : "No aplica"} · máx.{" "}
                      {fechaPagoMax || "—"}
                    </p>
                  </div>
                  <div className="pedidos-resumen-notes">
                    <label className="pedidos-field">
                      <span className="pedidos-field__label">Notas finales (opcional)</span>
                      <textarea
                        className="pedidos-input"
                        rows={4}
                        value={notas}
                        onChange={(e) => setNotas(e.target.value)}
                        placeholder="Observaciones sobre el pedido, entrega, condiciones…"
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="pedidos-wizard-footer pedidos-wizard-footer--end">
              {wizardStep > 0 ? (
                <button type="button" className="pedidos-btn pedidos-btn--ghost" onClick={onPrevStep}>
                  Anterior
                </button>
              ) : null}
              {wizardStep < 3 ? (
                <button type="button" className="pedidos-btn pedidos-btn--primary" onClick={onNextStep}>
                  Siguiente
                </button>
              ) : (
                <button
                  type="submit"
                  className="pedidos-btn pedidos-btn--primary"
                  disabled={bloqueoRegistrarPedido}
                  title={
                    bloqueoRegistrarPedido
                      ? "Esperá un instante: acabás de pasar al resumen."
                      : undefined
                  }
                >
                  Registrar pedido
                </button>
              )}
            </div>
          </form>
        </section>
      ) : null}

      {vistaTab === "historial" ? (
        <section className="pedidos-historial-shell">
          <div className="pedidos-historial-shell__head">
            <div>
              <h2 className="pedidos-historial-shell__title">Historial de pedidos</h2>
            </div>
            <button type="button" className="pedidos-btn pedidos-btn--ghost" onClick={aplicarFiltrosHistorialYRefrescar}>
              Actualizar
            </button>
          </div>
          <div className="pedidos-historial-filtros" role="search" aria-label="Filtrar historial de pedidos">
            <label className="pedidos-field pedidos-historial-filtros__field">
              <span className="pedidos-field__label">Desde</span>
              <input
                type="date"
                className="pedidos-input"
                value={historialForm.desde}
                onChange={(e) => setHistorialForm((s) => ({ ...s, desde: e.target.value }))}
              />
            </label>
            <label className="pedidos-field pedidos-historial-filtros__field">
              <span className="pedidos-field__label">Hasta</span>
              <input
                type="date"
                className="pedidos-input"
                value={historialForm.hasta}
                onChange={(e) => setHistorialForm((s) => ({ ...s, hasta: e.target.value }))}
              />
            </label>
            <label className="pedidos-field pedidos-historial-filtros__field">
              <span className="pedidos-field__label">Proveedor</span>
              <select
                className="pedidos-select"
                value={historialForm.proveedorId}
                onChange={(e) => setHistorialForm((s) => ({ ...s, proveedorId: e.target.value }))}
              >
                <option value="">Todos</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.nombre || p.email || `Proveedor #${p.id}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="pedidos-field pedidos-historial-filtros__field pedidos-historial-filtros__field--grow">
              <span className="pedidos-field__label">Referencia o n.º pedido</span>
              <input
                type="search"
                className="pedidos-input"
                value={historialForm.referencia}
                onChange={(e) => setHistorialForm((s) => ({ ...s, referencia: e.target.value }))}
                placeholder="Remito, OC, texto en referencia o ID del pedido"
                autoComplete="off"
              />
            </label>
            <div className="pedidos-historial-filtros__actions">
              <button type="button" className="pedidos-btn pedidos-btn--primary" onClick={aplicarFiltrosHistorialYRefrescar}>
                Buscar
              </button>
              <button type="button" className="pedidos-btn pedidos-btn--ghost" onClick={limpiarHistorialFiltros}>
                Limpiar
              </button>
            </div>
          </div>
          {loading ? (
            <div className="pedidos-historial-loading" aria-live="polite">
              Cargando historial…
            </div>
          ) : pedidos.length === 0 ? (
            <div className="pedidos-empty-state" role="status">
              <p className="pedidos-empty-state__title">
                {historialFiltrosActivos ? "Sin resultados para los filtros" : "Todavía no hay pedidos"}
              </p>
              <p className="pedidos-empty-state__text">
                {historialFiltrosActivos
                  ? "Probá otro rango de fechas, proveedor o referencia. «Limpiar» quita los filtros y muestra todo el historial."
                  : "Cuando registres un pedido desde «Pedido», aparecerá acá con fechas, totales e indicadores de pago."}
              </p>
            </div>
          ) : (
            <div className="pedidos-historial-cards">
              {pedidos.map((c) => (
                <article className="pedidos-historial-row" key={c.id}>
                  <div className="pedidos-historial-row__main">
                    <time className="pedidos-historial-row__date" dateTime={String(c.fecha).slice(0, 10)}>
                      {String(c.fecha).slice(0, 10)}
                    </time>
                    <h3 className="pedidos-historial-row__prov">
                      {c.proveedor_nombre_ref ?? c.proveedor_nombre ?? "—"}
                    </h3>
                    <div className="pedidos-historial-row__chips">
                      <span className="pedidos-chip">{c.estado ?? "—"}</span>
                      <span className="pedidos-chip pedidos-chip--muted">{labelIndicador(c.indicador_pago)}</span>
                      <span className="pedidos-chip pedidos-chip--muted">Ref. {c.referencia ?? "—"}</span>
                    </div>
                  </div>
                  <div className="pedidos-historial-row__aside">
                    <span className="pedidos-historial-row__amount">{formatMoney(Number(c.total))}</span>
                    <div className="pedidos-historial-row__actions">
                      {puedeEditarPedido ? (
                        <button type="button" className="pedidos-btn pedidos-btn--ghost" onClick={() => openEdit(c)}>
                          Editar
                        </button>
                      ) : null}
                      {puedeEliminarPedido ? (
                        <button
                          type="button"
                          className="pedidos-btn pedidos-btn--danger-ghost"
                          onClick={() => requestEliminarPedido(c)}
                        >
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {vistaTab === "proveedores" ? <ProveedoresPage /> : null}

      {edit ? (() => {
        const stepProveedor = isAdmin && editWizardStep === 0;
        const stepProductos = isAdmin && editWizardStep === 1;
        const stepPagos = isAdmin ? editWizardStep === 2 : editWizardStep === 0;
        const stepResumen = isAdmin ? editWizardStep === 3 : editWizardStep === 1;
        const editProveedorSel =
          editProveedorId === "" ? undefined : proveedores.find((p) => p.id === editProveedorId);
        const isLastStep = editWizardStep === editPasos.length - 1;
        return (
        <div
          className="drawer-overlay"
          role="dialog"
          aria-modal
          aria-labelledby="edit-pedido-title"
          onClick={() => {
            if (!editBusy) setEdit(null);
          }}
        >
          <div className="card drawer-overlay-card pedidos-drawer-card" onClick={(e) => e.stopPropagation()}>
            <div className="pedidos-drawer-card__header">
              <h3 id="edit-pedido-title" className="pedidos-drawer-card__title">
                Editar pedido #{edit.id}
              </h3>
              <div className="pedidos-drawer-card__header-actions">
                {puedeEliminarPedido ? (
                  <button
                    type="button"
                    className="pedidos-btn pedidos-btn--danger-ghost pedidos-btn--compact"
                    onClick={() => requestEliminarPedido(edit)}
                    disabled={editBusy || deletePedidoBusy}
                  >
                    Eliminar
                  </button>
                ) : null}
                <button
                  type="button"
                  className="pedidos-drawer-card__close"
                  onClick={() => setEdit(null)}
                  aria-label="Cerrar"
                  disabled={editBusy}
                >
                  ×
                </button>
              </div>
            </div>
            <p className="pedidos-drawer-card__lede">
              {isAdmin
                ? "Modo administrador: podés editar proveedor, productos, fechas, montos, estado y notas. Los cambios en líneas ajustan stock automáticamente."
                : "Solo fechas de pago, montos acordados, estado y notas. Las líneas y el proveedor no se modifican aquí."}
            </p>
            <ol className="pedidos-stepper" aria-label="Progreso de edición">
              {editPasos.map((label, idx) => {
                const active = idx === editWizardStep;
                const done = idx < editWizardStep;
                const pending = idx > editWizardStep;
                return (
                  <li key={label} className="pedidos-stepper__item">
                    <button
                      type="button"
                      className={[
                        "pedidos-stepper__hit",
                        active ? "pedidos-stepper__hit--active" : "",
                        done ? "pedidos-stepper__hit--done" : "",
                        pending ? "pedidos-stepper__hit--pending" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-current={active ? "step" : undefined}
                      aria-label={`${label}${done ? ", completado" : ""}${active ? ", paso actual" : ""}`}
                      onClick={() => goToEditStep(idx)}
                    >
                      <span className="pedidos-stepper__disc" aria-hidden>
                        {done ? <Check size={16} weight="bold" /> : <span>{idx + 1}</span>}
                      </span>
                      <span className="pedidos-stepper__label">{label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <form className="pedidos-form pedidos-drawer-form" onSubmit={onEditSave}>
              {stepProveedor ? (
                <div className="pedidos-panel">
                  <label className="pedidos-field">
                    <span className="pedidos-field__label">Buscar proveedor</span>
                    <span className="pedidos-input-wrap">
                      <MagnifyingGlass className="pedidos-input-wrap__icon" size={18} weight="regular" aria-hidden />
                      <input
                        className="pedidos-input pedidos-input--with-icon"
                        type="search"
                        autoComplete="off"
                        placeholder="Nombre, NIT, teléfono o email…"
                        value={editProveedorBusca}
                        onChange={(e) => setEditProveedorBusca(e.target.value)}
                      />
                    </span>
                  </label>
                  {editProveedoresFiltrados.length === 0 ? (
                    <div className="pedidos-callout pedidos-callout--muted">
                      No hay proveedores que coincidan con la búsqueda.
                    </div>
                  ) : (
                    <div className="pedidos-prov-grid" role="list">
                      {editProveedoresFiltrados.map((p) => {
                        const selected = editProveedorId === p.id;
                        return (
                          <article
                            key={p.id}
                            className={["pedidos-prov-card", selected ? "pedidos-prov-card--selected" : ""]
                              .filter(Boolean)
                              .join(" ")}
                            role="listitem"
                            tabIndex={0}
                            aria-pressed={selected}
                            aria-label={`Seleccionar ${p.nombre}`}
                            onClick={() => setEditProveedorId(p.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setEditProveedorId(p.id);
                              }
                            }}
                          >
                            <ProveedorSelectableMedia proveedor={p} />
                            <div className="pedidos-prov-card__body">
                              <h3 className="pedidos-prov-card__name">{p.nombre}</h3>
                              <p className="pedidos-prov-card__meta">NIT · {p.nit || "—"}</p>
                              <p className="pedidos-prov-card__meta">
                                {p.telefono || "—"} · {p.email || "—"}
                              </p>
                            </div>
                            <div className="pedidos-prov-card__action">
                              {selected ? (
                                <span className="pedidos-prov-card__check" aria-hidden>
                                  <Check size={18} weight="bold" />
                                </span>
                              ) : (
                                <span className="pedidos-prov-card__cta">Elegir</span>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {stepProductos ? (
                <div className="pedidos-panel">
                  {editLoadingLineas ? (
                    <p className="pedidos-callout pedidos-callout--muted">Cargando líneas…</p>
                  ) : (
                    <div className="pedidos-dash-layout">
                      <div className="pedidos-dash-layout__main">
                        <div className="pedidos-lines-head">
                          <h3 className="pedidos-lines-head__title">Líneas del pedido</h3>
                        </div>
                        {editLineas.length === 0 ? (
                          <div className="pedidos-empty-lines">
                            <p className="pedidos-empty-lines__title">Todavía no hay productos</p>
                            <p className="pedidos-empty-lines__text">
                              Buscá en el catálogo a la derecha y tocá un producto para sumarlo al pedido.
                            </p>
                          </div>
                        ) : (
                          <div className="table-wrap pedidos-lineas-table-wrap">
                            <table className="table pedidos-lineas-table">
                              <thead>
                                <tr>
                                  <th scope="col">Producto</th>
                                  <th scope="col" className="pedidos-lineas-table__col-num">Cant.</th>
                                  <th scope="col" className="pedidos-lineas-table__col-num">Costo u.</th>
                                  <th scope="col" className="pedidos-lineas-table__col-num">Subtotal</th>
                                  <th scope="col" className="pedidos-lineas-table__col-acc" />
                                </tr>
                              </thead>
                              <tbody>
                                {editLineas.map((ln, idx) => {
                                  const unit = ln.costo_unitario === "" ? 0 : Number(ln.costo_unitario);
                                  const subtotal = Math.max(1, Number(ln.cantidad) || 1) * unit;
                                  return (
                                    <tr key={`edit-ln-${idx}`}>
                                      <td>
                                        <select
                                          className="pedidos-input pedidos-select pedidos-lineas-table__control"
                                          value={ln.producto_id || ""}
                                          onChange={(e) =>
                                            setEditLinea(idx, { producto_id: Number(e.target.value) || 0 })
                                          }
                                          aria-label="Producto"
                                        >
                                          <option value="">— Elegir —</option>
                                          {editCatalogo.map((p) => (
                                            <option key={p.id} value={p.id}>
                                              {p.nombre}
                                            </option>
                                          ))}
                                          {ln.producto_id && !editCatalogo.some((p) => p.id === ln.producto_id) ? (
                                            <option value={ln.producto_id}>
                                              {productos.find((p) => p.id === ln.producto_id)?.nombre ??
                                                `Producto #${ln.producto_id}`}
                                            </option>
                                          ) : null}
                                        </select>
                                      </td>
                                      <td className="pedidos-lineas-table__col-num">
                                        <input
                                          className="pedidos-input pedidos-lineas-table__control pedidos-lineas-table__control--qty input-numeric"
                                          type="text"
                                          inputMode="numeric"
                                          autoComplete="off"
                                          value={ln.cantidad === "" ? "" : String(ln.cantidad)}
                                          onChange={(e) => {
                                            const raw = filterIntegerTyping(e.target.value);
                                            setEditLinea(idx, {
                                              cantidad: raw === "" ? "" : Math.max(1, parseInt(raw, 10) || 1),
                                            });
                                          }}
                                          aria-label="Cantidad"
                                        />
                                      </td>
                                      <td className="pedidos-lineas-table__col-num">
                                        <input
                                          className="pedidos-input pedidos-lineas-table__control pedidos-lineas-table__control--money input-numeric"
                                          type="text"
                                          inputMode="numeric"
                                          autoComplete="off"
                                          value={ln.costo_unitario === "" ? "" : formatMoneyForInput(ln.costo_unitario)}
                                          onChange={(e) =>
                                            setEditLinea(idx, {
                                              costo_unitario: parseMoneyInput(e.target.value),
                                            })
                                          }
                                          aria-label="Costo unitario"
                                        />
                                      </td>
                                      <td className="pedidos-lineas-table__col-num mono">{formatMoney(subtotal)}</td>
                                      <td className="pedidos-lineas-table__col-acc">
                                        <button
                                          type="button"
                                          className="pedidos-lineas-table__btn-remove"
                                          onClick={() => removeEditLinea(idx)}
                                        >
                                          Quitar
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <div className="pedidos-total-strip">
                          <span className="pedidos-total-strip__label">Total general del pedido</span>
                          <span className="pedidos-total-strip__value">
                            {formatMoney(roundMoney(editTotalGeneral))}
                          </span>
                        </div>
                      </div>
                      <aside className="pedidos-sidebar-card">
                        <div className="pedidos-sidebar-card__head">
                          <div>
                            <h3 className="pedidos-sidebar-card__title">Catálogo del proveedor</h3>
                          </div>
                        </div>
                        {editProveedorId === "" ? (
                          <p className="pedidos-callout pedidos-callout--muted">
                            Elegí un proveedor en el paso 1 para ver su catálogo.
                          </p>
                        ) : (
                          <>
                            <label className="pedidos-field pedidos-field--compact">
                              <span className="pedidos-field__label">Buscar</span>
                              <span className="pedidos-input-wrap">
                                <MagnifyingGlass className="pedidos-input-wrap__icon" size={18} weight="regular" aria-hidden />
                                <input
                                  className="pedidos-input pedidos-input--with-icon"
                                  type="search"
                                  placeholder="Nombre, código, marca…"
                                  value={editCatalogoBusca}
                                  onChange={(e) => setEditCatalogoBusca(e.target.value)}
                                />
                              </span>
                            </label>
                            <div className="pedidos-sidebar-card__scroll">
                              {editCatalogoFiltrado.length === 0 ? (
                                <div className="pedidos-sidebar-empty">
                                  <p className="pedidos-sidebar-empty__title">Sin resultados</p>
                                </div>
                              ) : (
                                <div className="pedidos-catalog-list" role="list">
                                  {editCatalogoFiltrado.slice(0, 200).map((p) => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      className="pedidos-catalog-row"
                                      role="listitem"
                                      onClick={() => addEditProductoExistente(p)}
                                    >
                                      <span className="pedidos-catalog-row__name">{p.nombre}</span>
                                      <span className="pedidos-catalog-row__price">
                                        {formatMoney(Number(p.precio_compra ?? p.precio ?? 0))}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </aside>
                    </div>
                  )}
                </div>
              ) : null}

              {stepPagos ? (
                <div className="pedidos-panel">
                  <div className="pedidos-form-grid">
                    <label className="pedidos-field">
                      <span className="pedidos-field__label">Fecha del pedido *</span>
                      <input
                        className="pedidos-input"
                        type="date"
                        value={editFecha}
                        onChange={(e) => setEditFecha(e.target.value)}
                        required
                      />
                    </label>
                    <label className="pedidos-field">
                      <span className="pedidos-field__label">Estado del pago</span>
                      <select
                        className="pedidos-input pedidos-select"
                        value={editEstado}
                        onChange={(e) => setEditEstado(e.target.value)}
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="pagado">Pagado</option>
                        <option value="vencido">Vencido</option>
                      </select>
                    </label>
                    <label className="pedidos-field">
                      <span className="pedidos-field__label">Fecha pago con descuento</span>
                      <input
                        className="pedidos-input"
                        type="date"
                        value={editFd}
                        onChange={(e) => setEditFd(e.target.value)}
                      />
                    </label>
                    <label className="pedidos-field">
                      <span className="pedidos-field__label">Fecha máxima de pago</span>
                      <input
                        className="pedidos-input"
                        type="date"
                        value={editFm}
                        onChange={(e) => setEditFm(e.target.value)}
                      />
                    </label>
                    <label className="pedidos-field">
                      <span className="pedidos-field__label">Valor con descuento</span>
                      <input
                        className="pedidos-input input-numeric"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={editVd === "" ? "" : formatMoneyForInput(editVd)}
                        onChange={(e) => setEditVd(parseMoneyInput(e.target.value))}
                      />
                    </label>
                    <label className="pedidos-field">
                      <span className="pedidos-field__label">Valor sin descuento</span>
                      <input
                        className="pedidos-input input-numeric"
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        value={editVs === "" ? "" : formatMoneyForInput(editVs)}
                        onChange={(e) => setEditVs(parseMoneyInput(e.target.value))}
                      />
                    </label>
                    <label className="pedidos-field">
                      <span className="pedidos-field__label">Referencia</span>
                      <input
                        className="pedidos-input"
                        value={editRef}
                        onChange={(e) => setEditRef(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              {stepResumen ? (
                <div className="pedidos-panel pedidos-panel--resumen" aria-label="Resumen del pedido">
                  <div className="pedidos-resumen-grid">
                    {isAdmin ? (
                      <>
                        <div className="pedidos-resumen-tile">
                          <div className="pedidos-resumen-tile__head">
                            <span className="pedidos-resumen-tile__eyebrow">Proveedor</span>
                            <button type="button" className="pedidos-link-btn" onClick={() => goToEditStep(0)}>
                              Editar
                            </button>
                          </div>
                          <p className="pedidos-resumen-tile__strong">
                            {editProveedorSel?.nombre ?? "No seleccionado"}
                          </p>
                          <p className="pedidos-resumen-tile__meta">
                            NIT: {editProveedorSel?.nit || "—"} · Tel: {editProveedorSel?.telefono || "—"}
                          </p>
                        </div>
                        <div className="pedidos-resumen-tile">
                          <div className="pedidos-resumen-tile__head">
                            <span className="pedidos-resumen-tile__eyebrow">Totales</span>
                            <button type="button" className="pedidos-link-btn" onClick={() => goToEditStep(1)}>
                              Editar
                            </button>
                          </div>
                          <p className="pedidos-resumen-tile__strong">{editLineas.length} línea(s)</p>
                          <p className="pedidos-resumen-tile__meta">
                            Total general: {formatMoney(roundMoney(editTotalGeneral))}
                          </p>
                        </div>
                      </>
                    ) : null}
                    <div className="pedidos-resumen-tile pedidos-resumen-tile--wide">
                      <div className="pedidos-resumen-tile__head">
                        <span className="pedidos-resumen-tile__eyebrow">Pagos</span>
                        <button
                          type="button"
                          className="pedidos-link-btn"
                          onClick={() => goToEditStep(isAdmin ? 2 : 0)}
                        >
                          Editar
                        </button>
                      </div>
                      <p className="pedidos-resumen-tile__body">
                        Con descuento: {editVd === "" ? "—" : formatMoney(Number(editVd))} · Sin descuento:{" "}
                        {editVs === "" ? "—" : formatMoney(Number(editVs))}
                      </p>
                      <p className="pedidos-resumen-tile__meta">Estado: {labelEstadoPago(editEstado)}</p>
                      <p className="pedidos-resumen-tile__meta">
                        Plazos: desc. hasta {editFd || "—"} · máx. {editFm || "—"}
                      </p>
                      <p className="pedidos-resumen-tile__meta">
                        Fecha pedido: {editFecha || "—"} · Ref.: {editRef.trim() || "—"}
                      </p>
                    </div>
                    <div className="pedidos-resumen-notes">
                      <label className="pedidos-field">
                        <span className="pedidos-field__label">Notas finales (opcional)</span>
                        <textarea
                          className="pedidos-input"
                          rows={4}
                          value={editNotas}
                          onChange={(e) => setEditNotas(e.target.value)}
                          placeholder="Observaciones sobre el pedido, entrega, condiciones…"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="pedidos-wizard-footer pedidos-drawer-footer pedidos-wizard-footer--end">
                {editWizardStep > 0 ? (
                  <button
                    type="button"
                    className="pedidos-btn pedidos-btn--secondary"
                    onClick={onEditPrevStep}
                  >
                    Anterior
                  </button>
                ) : null}
                {!isLastStep ? (
                  <button type="button" className="pedidos-btn pedidos-btn--primary" onClick={onEditNextStep}>
                    Siguiente
                  </button>
                ) : (
                  <button type="submit" className="pedidos-btn pedidos-btn--primary" disabled={editBusy}>
                    {editBusy ? "Guardando…" : "Guardar cambios"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
        );
      })() : null}

      <Drawer
        open={drawerNuevoProducto}
        title="Nuevo producto"
        wide
        onClose={() => {
          if (!nuevoProdBusy) setDrawerNuevoProducto(false);
        }}
        footer={
          <button
            type="submit"
            form="form-nuevo-producto-proveedor"
            className="pedidos-btn pedidos-btn--primary"
            disabled={nuevoProdBusy}
          >
            {nuevoProdBusy ? "Guardando…" : "Crear y sumar al pedido"}
          </button>
        }
      >
        <form id="form-nuevo-producto-proveedor" className="pedidos-form form drawer-form" onSubmit={guardarNuevoProducto}>
          <p className="pedidos-callout pedidos-callout--info">
            Mismos campos que en inventario. Quedará asociado a{" "}
            <strong>{proveedorSeleccionado?.nombre ?? "—"}</strong> y disponible en el catálogo lateral.
          </p>
          <ProductoCatalogoForm
            values={nuevoCatalogo}
            onChange={patchNuevoCatalogo}
            mode="create"
            proveedorResumen={
              proveedorSeleccionado
                ? {
                    nombre: proveedorSeleccionado.nombre,
                    nit: proveedorSeleccionado.nit,
                    telefono: proveedorSeleccionado.telefono,
                    email: proveedorSeleccionado.email,
                  }
                : null
            }
            barcodeLookup={{
              loading: lookupLoading,
              hint: lookupHint,
              onLookupClick: () => void onBuscarCodigoNuevoProducto(),
            }}
            inventarioCatalogo={{
              loading: catalogoLoading,
              error: catalogoError,
              categorias: inventarioCatalogo?.categorias ?? [],
              proveedores: inventarioCatalogo?.proveedores ?? [],
              onCatalogPanelOpen: () => void loadInventarioCatalogo("silent"),
              onCreateCategoria: crearCategoriaDesdeFormulario,
            }}
          />
        </form>
      </Drawer>

      <ConfirmDialog
        open={confirmDeletePedido != null}
        title="Eliminar pedido"
        description={
          confirmDeletePedido ? (
            <>
              ¿Eliminar el pedido <strong>#{confirmDeletePedido.id}</strong>
              {confirmDeletePedido.proveedor_nombre_ref || confirmDeletePedido.proveedor_nombre
                ? <> de <strong>{confirmDeletePedido.proveedor_nombre_ref ?? confirmDeletePedido.proveedor_nombre}</strong></>
                : null}
              ? Se revertirá el stock de las líneas y no se puede deshacer.
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        cancelLabel="Volver"
        variant="danger"
        busy={deletePedidoBusy}
        onCancel={() => !deletePedidoBusy && setConfirmDeletePedido(null)}
        onConfirm={() => void confirmEliminarPedidoAction()}
      />

    </div>
  );
}
