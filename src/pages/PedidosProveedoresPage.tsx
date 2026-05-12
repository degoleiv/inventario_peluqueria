import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Check, MagnifyingGlass, Plus, Truck } from "@phosphor-icons/react";
import {
  createPedidoProveedor,
  createProducto,
  fetchPedidosProveedores,
  fetchProductos,
  fetchProveedores,
  updatePedidoProveedorMeta,
  type PedidoProveedor,
  type Producto,
  type Proveedor,
} from "../api";
import { Drawer } from "../components/Drawer";
import { useToast } from "../context/ToastContext";
import { ProveedoresPage } from "./ProveedoresPage";

type Linea = {
  producto_id: number;
  cantidad: number;
  costo_unitario: number | "";
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

const moneyEsAr = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
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
        <img src={url} alt="" className="pedidos-prov-card__img" onError={() => setBroken(true)} />
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
  const prevWizardStepRef = useRef(0);
  const [bloqueoRegistrarPedido, setBloqueoRegistrarPedido] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoProveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);

  const [vistaTab, setVistaTab] = useState<VistaTab>("pedido");
  const [wizardStep, setWizardStep] = useState(0);
  const [proveedorSearch, setProveedorSearch] = useState("");
  const [productoSearch, setProductoSearch] = useState("");

  const [proveedorId, setProveedorId] = useState<number | "">("");
  const [fechaPedido, setFechaPedido] = useState(fechaLocalISO);
  const [fechaPagoDesc, setFechaPagoDesc] = useState("");
  const [fechaPagoMax, setFechaPagoMax] = useState("");
  const [valorDesc, setValorDesc] = useState<number | "">("");
  const [valorSinDesc, setValorSinDesc] = useState<number | "">("");
  const [valorSinDescManual, setValorSinDescManual] = useState(false);
  const [tieneDescuento, setTieneDescuento] = useState(false);
  const [estadoNuevo, setEstadoNuevo] = useState("pendiente");
  const [notas, setNotas] = useState("");
  const [referencia, setReferencia] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);

  const [drawerNuevoProducto, setDrawerNuevoProducto] = useState(false);
  const [nuevoProdBusy, setNuevoProdBusy] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCodigo, setNuevoCodigo] = useState("");
  const [nuevoPrecioCompra, setNuevoPrecioCompra] = useState<number | "">("");
  const [nuevoPrecioVenta, setNuevoPrecioVenta] = useState<number | "">("");

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
    if (proveedorId === "") return productos;
    const id = Number(proveedorId);
    return productos.filter((p) => p.proveedor_id == null || p.proveedor_id === id);
  }, [productos, proveedorId]);

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
    const t = roundMoney2(totalGeneralPedido);
    setValorSinDesc(t > 0 ? t : "");
  }, [totalGeneralPedido, valorSinDescManual]);

  function setLinea(i: number, patch: Partial<Linea>) {
    setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function openDrawerNuevoProducto() {
    if (proveedorId === "") {
      toast("Elegí un proveedor en el paso 1.", "warning");
      return;
    }
    setNuevoNombre("");
    setNuevoCodigo("");
    setNuevoPrecioCompra("");
    setNuevoPrecioVenta("");
    setDrawerNuevoProducto(true);
  }

  async function guardarNuevoProducto(e: FormEvent) {
    e.preventDefault();
    if (proveedorId === "") return;
    const nom = nuevoNombre.trim();
    if (!nom) {
      toast("El nombre es obligatorio.", "warning");
      return;
    }
    const pc = nuevoPrecioCompra === "" ? NaN : Number(nuevoPrecioCompra);
    if (!Number.isFinite(pc) || pc < 0) {
      toast("Indicá un precio de compra válido (≥ 0).", "warning");
      return;
    }
    const pvRaw = nuevoPrecioVenta === "" ? NaN : Number(nuevoPrecioVenta);
    const pv = Number.isFinite(pvRaw) && pvRaw >= 0 ? pvRaw : pc;
    if (pv < pc) {
      toast("El precio de venta debe ser mayor o igual al de compra.", "warning");
      return;
    }
    setNuevoProdBusy(true);
    try {
      const created = await createProducto({
        nombre: nom,
        codigo_barras: nuevoCodigo.trim() || null,
        precio_compra: pc,
        precio_venta: pv,
        proveedor_id: Number(proveedorId),
        stock: 0,
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
      toast("Pedido registrado; stock actualizado (ENTRADA).", "success");
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
  }

  async function onEditSave(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setEditBusy(true);
    try {
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
      setEdit(null);
      toast("Pedido actualizado.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al guardar", "error");
    } finally {
      setEditBusy(false);
    }
  }

  const resumenWarnings = [validateLineas(), validatePagos()].filter((x): x is string => Boolean(x));

  return (
    <div className="page-pedidos">
      <header className="pedidos-hero">
        <div className="pedidos-hero__icon" aria-hidden>
          <Truck size={26} weight="duotone" />
        </div>
        <div className="pedidos-hero__copy">
          <p className="pedidos-hero__eyebrow">Compras y stock</p>
          <h1 className="pedidos-hero__title">Pedidos a proveedor</h1>
          <p className="pedidos-hero__lede">
            Flujo guiado en cuatro pasos: elegí proveedor, cargá productos, definí pagos y cerrá con resumen y notas.
            Podés moverte entre pasos con el stepper o con Anterior / Siguiente.
          </p>
        </div>
      </header>

      <nav className="pedidos-segmented" aria-label="Navegación de pedidos" role="tablist">
        {(
          [
            { id: "pedido" as const, label: "Pedido" },
            { id: "proveedores" as const, label: "Proveedores" },
            { id: "historial" as const, label: "Historial" },
          ] as const
        ).map((tab) => {
          const active = vistaTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={
                active ? "pedidos-segmented__tab pedidos-segmented__tab--active" : "pedidos-segmented__tab"
              }
              onClick={() => setVistaTab(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {vistaTab === "pedido" ? (
        <section className="pedidos-wizard-card">
          <div className="pedidos-wizard-card__intro">
            <h2 className="pedidos-wizard-card__title">Nuevo pedido</h2>
            <p className="pedidos-wizard-card__subtitle">
              Completá los pasos en orden. Podés volver atrás en cualquier momento.
            </p>
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
                        <p className="pedidos-lines-head__hint">
                          Sumá ítems desde el catálogo del proveedor a la derecha o creá uno nuevo en el panel lateral.
                        </p>
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
                                  ? moneyEsAr.format(subtotal)
                                  : moneyEsAr.format(0);
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
                                        className="pedidos-input pedidos-lineas-table__control pedidos-lineas-table__control--qty"
                                        type="number"
                                        min={1}
                                        value={ln.cantidad}
                                        onChange={(e) =>
                                          setLinea(idx, { cantidad: Math.max(1, Number(e.target.value) || 1) })
                                        }
                                        aria-label="Cantidad"
                                      />
                                    </td>
                                    <td className="pedidos-lineas-table__col-num">
                                      <input
                                        className="pedidos-input pedidos-lineas-table__control pedidos-lineas-table__control--money"
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={ln.costo_unitario}
                                        onChange={(e) =>
                                          setLinea(idx, {
                                            costo_unitario: e.target.value === "" ? "" : Number(e.target.value),
                                          })
                                        }
                                        aria-label="Costo unitario"
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
                          {moneyEsAr.format(roundMoney2(totalGeneralPedido))}
                        </span>
                      </div>
                    </div>

                    <aside className="pedidos-sidebar-card">
                      <div className="pedidos-sidebar-card__head">
                        <div>
                          <h3 className="pedidos-sidebar-card__title">Catálogo del proveedor</h3>
                          <p className="pedidos-sidebar-card__hint">
                            Productos generales del salón y los asociados a {proveedorSeleccionado?.nombre ?? "este proveedor"}. Tocá uno para sumarlo al pedido.
                          </p>
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
                      {productosFiltrados.length === 0 ? (
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
                                {moneyEsAr.format(Number(p.precio_compra ?? p.precio ?? 0))}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                      {productosFiltrados.length > 200 ? (
                        <p className="pedidos-sidebar-card__status">Mostrando los primeros 200 resultados.</p>
                      ) : null}
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
                  <strong>{moneyEsAr.format(roundMoney2(totalGeneralPedido))}</strong>. El valor sin descuento sigue
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
                        className="pedidos-input"
                        type="number"
                        step="0.01"
                        min={0}
                        inputMode="decimal"
                        value={valorDesc}
                        onChange={(e) => setValorDesc(e.target.value === "" ? "" : Number(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.preventDefault();
                        }}
                      />
                    </label>
                  ) : null}
                  <label className="pedidos-field">
                    <span className="pedidos-field__label">Valor sin descuento (ARS)</span>
                    <input
                      className="pedidos-input"
                      type="number"
                      step="0.01"
                      min={0}
                      inputMode="decimal"
                      value={valorSinDesc}
                      onChange={(e) => {
                        setValorSinDescManual(true);
                        setValorSinDesc(e.target.value === "" ? "" : Number(e.target.value));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                    />
                    <span className="pedidos-field__hint">
                      Sugerido: {moneyEsAr.format(roundMoney2(totalGeneralPedido))}
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
                      setValorSinDesc(roundMoney2(totalGeneralPedido));
                    }}
                  >
                    Usar total del pedido ({moneyEsAr.format(roundMoney2(totalGeneralPedido))})
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
                      Total general: {moneyEsAr.format(roundMoney2(totalGeneralPedido))}
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
                                {qty} × {moneyEsAr.format(unit)}
                              </span>
                              <span className="pedidos-resumen-line__amt">{moneyEsAr.format(subtotal)}</span>
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
                          : moneyEsAr.format(Number(valorDesc))
                        : "No aplica"}{" "}
                      · Sin descuento: {valorSinDesc === "" ? "—" : moneyEsAr.format(Number(valorSinDesc))}
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

            <div className="pedidos-wizard-footer">
              {wizardStep > 0 ? (
                <button type="button" className="pedidos-btn pedidos-btn--ghost" onClick={onPrevStep}>
                  Anterior
                </button>
              ) : (
                <span />
              )}
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
              <p className="pedidos-historial-shell__lede">
                Consultá pedidos anteriores y editá plazos, montos o notas de pago.
              </p>
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
                    <span className="pedidos-historial-row__amount">{moneyEsAr.format(Number(c.total))}</span>
                    <button type="button" className="pedidos-btn pedidos-btn--ghost" onClick={() => openEdit(c)}>
                      Editar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {vistaTab === "proveedores" ? <ProveedoresPage /> : null}

      {edit ? (
        <div
          className="drawer-overlay"
          role="dialog"
          aria-modal
          aria-labelledby="edit-pedido-title"
        >
          <div className="card drawer-overlay-card pedidos-drawer-card" onClick={(e) => e.stopPropagation()}>
            <h3 id="edit-pedido-title" className="pedidos-drawer-card__title">
              Editar pedido #{edit.id}
            </h3>
            <p className="pedidos-drawer-card__lede">
              Solo fechas de pago, montos acordados, estado y notas. Las líneas y el proveedor no se modifican aquí.
            </p>
            <form className="pedidos-form pedidos-drawer-form" onSubmit={onEditSave}>
              <label className="pedidos-field">
                <span className="pedidos-field__label">Fecha del pedido</span>
                <input
                  className="pedidos-input"
                  type="date"
                  value={editFecha}
                  onChange={(e) => setEditFecha(e.target.value)}
                  required
                />
              </label>
              <label className="pedidos-field">
                <span className="pedidos-field__label">Fecha pago con descuento</span>
                <input className="pedidos-input" type="date" value={editFd} onChange={(e) => setEditFd(e.target.value)} />
              </label>
              <label className="pedidos-field">
                <span className="pedidos-field__label">Fecha máxima de pago</span>
                <input className="pedidos-input" type="date" value={editFm} onChange={(e) => setEditFm(e.target.value)} />
              </label>
              <label className="pedidos-field">
                <span className="pedidos-field__label">Valor con descuento</span>
                <input
                  className="pedidos-input"
                  type="number"
                  step="0.01"
                  min={0}
                  value={editVd}
                  onChange={(e) => setEditVd(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
              <label className="pedidos-field">
                <span className="pedidos-field__label">Valor sin descuento</span>
                <input
                  className="pedidos-input"
                  type="number"
                  step="0.01"
                  min={0}
                  value={editVs}
                  onChange={(e) => setEditVs(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
              <label className="pedidos-field">
                <span className="pedidos-field__label">Estado</span>
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
                <span className="pedidos-field__label">Referencia</span>
                <input className="pedidos-input" value={editRef} onChange={(e) => setEditRef(e.target.value)} />
              </label>
              <label className="pedidos-field">
                <span className="pedidos-field__label">Notas</span>
                <textarea
                  className="pedidos-input"
                  rows={3}
                  value={editNotas}
                  onChange={(e) => setEditNotas(e.target.value)}
                />
              </label>
              <div className="pedidos-wizard-footer pedidos-drawer-footer">
                <button type="button" className="pedidos-btn pedidos-btn--ghost" onClick={() => setEdit(null)}>
                  Cancelar
                </button>
                <button type="submit" className="pedidos-btn pedidos-btn--primary" disabled={editBusy}>
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <Drawer
        open={drawerNuevoProducto}
        title="Nuevo producto en catálogo del proveedor"
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
        <form id="form-nuevo-producto-proveedor" className="pedidos-form" onSubmit={guardarNuevoProducto}>
          <p className="pedidos-callout pedidos-callout--info">
            Quedará asociado a <strong>{proveedorSeleccionado?.nombre ?? "—"}</strong> y lo vas a ver en el catálogo
            lateral para próximos pedidos.
          </p>
          <label className="pedidos-field">
            <span className="pedidos-field__label">Nombre *</span>
            <input
              className="pedidos-input"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              required
              autoComplete="off"
              autoFocus
            />
          </label>
          <label className="pedidos-field">
            <span className="pedidos-field__label">Código de barras (opcional)</span>
            <input
              className="pedidos-input"
              value={nuevoCodigo}
              onChange={(e) => setNuevoCodigo(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="pedidos-field">
            <span className="pedidos-field__label">Precio de compra *</span>
            <input
              className="pedidos-input"
              type="number"
              min={0}
              step="0.01"
              value={nuevoPrecioCompra}
              onChange={(e) =>
                setNuevoPrecioCompra(e.target.value === "" ? "" : Number(e.target.value))
              }
              required
            />
          </label>
          <label className="pedidos-field">
            <span className="pedidos-field__label">Precio de venta (opcional)</span>
            <input
              className="pedidos-input"
              type="number"
              min={0}
              step="0.01"
              value={nuevoPrecioVenta}
              onChange={(e) =>
                setNuevoPrecioVenta(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="Si lo dejás vacío, usamos el de compra"
            />
          </label>
        </form>
      </Drawer>
    </div>
  );
}
