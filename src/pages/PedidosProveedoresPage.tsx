import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPedidoProveedor,
  createProductoRapidoDesdePedido,
  fetchAuthMe,
  fetchPedidosProveedores,
  fetchProductosPorProveedor,
  fetchProveedores,
  updatePedidoProveedorMeta,
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
import { ProveedoresPage } from "./ProveedoresPage";
import {
  EntityNotes,
  parseEntityNotes,
  serializeEntityNotes,
  type EntityNote,
} from "../components/EntityNotes";
import { useToast } from "../context/ToastContext";

type Modo = "existente" | "nuevo";
type PedidosVistaTab = "pedido" | "proveedores" | "historial";

type Linea = {
  modo: Modo;
  producto_id: number;
  cantidad: number;
  costo_unitario: number | "";
  actualizar_precios: boolean;
  precio_venta_lista: number | "";
  nuevo_nombre: string;
  nuevo_precio_venta: number | "";
  nuevo_codigo: string;
};

const lineaVacia = (): Linea => ({
  modo: "existente",
  producto_id: 0,
  cantidad: 1,
  costo_unitario: "",
  actualizar_precios: true,
  precio_venta_lista: "",
  nuevo_nombre: "",
  nuevo_precio_venta: "",
  nuevo_codigo: "",
});

const PEDIDOS_WIZARD_DRAFT_KEY = "peluqueria_pedidos_wizard_draft_v1";

type PedidoDraft = {
  step: number;
  proveedorId: number | "";
  tieneDescuento?: boolean;
  fechaPedido: string;
  fechaPagoDesc: string;
  fechaPagoMax: string;
  valorDesc: number | "";
  valorSinDesc: number | "";
  /** Si true, no se sobrescribe valor sin descuento al cambiar el total del pedido. */
  valorSinDescManual?: boolean;
  estadoNuevo: string;
  notasItems?: EntityNote[];
  notas?: string;
  referencia: string;
  lineas: Linea[];
};

function readWizardDraft(): PedidoDraft | null {
  try {
    const raw = localStorage.getItem(PEDIDOS_WIZARD_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PedidoDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    const lines = Array.isArray(parsed.lineas) && parsed.lineas.length > 0 ? parsed.lineas : [lineaVacia()];
    let notesFromDraft: EntityNote[] = [];
    if (Array.isArray(parsed.notasItems)) {
      notesFromDraft = parsed.notasItems.filter((n): n is EntityNote => {
        return (
          !!n &&
          typeof n.id === "string" &&
          typeof n.content === "string" &&
          typeof n.author === "string" &&
          typeof n.created_at === "string" &&
          typeof n.updated_at === "string"
        );
      });
    } else if (typeof parsed.notas === "string" && parsed.notas.trim()) {
      const parsedLegacy = parseEntityNotes(parsed.notas);
      if (parsedLegacy.notes.length > 0) {
        notesFromDraft = parsedLegacy.notes;
      } else if (parsedLegacy.legacyText) {
        const now = new Date().toISOString();
        notesFromDraft = [
          {
            id: `legacy_${Date.now()}`,
            content: parsedLegacy.legacyText,
            author: "Migrada",
            created_at: now,
            updated_at: now,
          },
        ];
      }
    }
    return {
      step: Number.isFinite(parsed.step) ? Number(parsed.step) : 0,
      proveedorId:
        parsed.proveedorId === "" || typeof parsed.proveedorId === "number" ? parsed.proveedorId : "",
      tieneDescuento:
        typeof parsed.tieneDescuento === "boolean"
          ? parsed.tieneDescuento
          : Boolean(
              (typeof parsed.fechaPagoDesc === "string" && parsed.fechaPagoDesc.trim()) ||
                parsed.valorDesc === 0 ||
                (typeof parsed.valorDesc === "number" && Number.isFinite(parsed.valorDesc))
            ),
      fechaPedido:
        typeof parsed.fechaPedido === "string" && parsed.fechaPedido.trim()
          ? parsed.fechaPedido
          : new Date().toISOString().slice(0, 10),
      fechaPagoDesc: typeof parsed.fechaPagoDesc === "string" ? parsed.fechaPagoDesc : "",
      fechaPagoMax: typeof parsed.fechaPagoMax === "string" ? parsed.fechaPagoMax : "",
      valorDesc: parsed.valorDesc === "" || typeof parsed.valorDesc === "number" ? parsed.valorDesc : "",
      valorSinDesc:
        parsed.valorSinDesc === "" || typeof parsed.valorSinDesc === "number" ? parsed.valorSinDesc : "",
      estadoNuevo: typeof parsed.estadoNuevo === "string" && parsed.estadoNuevo ? parsed.estadoNuevo : "pendiente",
      notasItems: notesFromDraft,
      referencia: typeof parsed.referencia === "string" ? parsed.referencia : "",
      valorSinDescManual: parsed.valorSinDescManual === true,
      lineas: lines,
    };
  } catch {
    return null;
  }
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
    case "parcial":
      return "Pago parcial";
    default:
      return k ?? "—";
  }
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

function labelEstadoPago(estado: string): string {
  switch (estado) {
    case "pendiente":
      return "Pendiente";
    case "parcial":
      return "Parcial";
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
      <div className="prov-card__media-wrap">
        <img src={url} alt="" className="prov-card__img" onError={() => setBroken(true)} />
      </div>
    );
  }
  return (
    <div className="prov-card__avatar prov-card__avatar--ph prov-card__media-wrap" aria-hidden>
      {proveedor.nombre.trim().slice(0, 1).toUpperCase()}
    </div>
  );
}

export function PedidosProveedoresPage() {
  const draft = useMemo(() => readWizardDraft(), []);
  const toast = useToast();
  const prevProveedorIdRef = useRef<number | "">(draft?.proveedorId ?? "");
  const [pedidos, setPedidos] = useState<PedidoProveedor[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productosProveedor, setProductosProveedor] = useState<Producto[]>([]);
  const [productosProveedorLoading, setProductosProveedorLoading] = useState(false);
  const [productoSearch, setProductoSearch] = useState("");
  const [productoRapidoModalOpen, setProductoRapidoModalOpen] = useState(false);
  const [productoRapidoForm, setProductoRapidoForm] = useState<ProductoCatalogoFields>(() =>
    emptyProductoCatalogoFields()
  );
  const [productoRapidoBusy, setProductoRapidoBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [wizardStep, setWizardStep] = useState(() => {
    const s = draft?.step ?? 0;
    return s >= 0 && s <= 3 ? s : 0;
  });
  const [proveedorId, setProveedorId] = useState<number | "">(draft?.proveedorId ?? "");
  const [tieneDescuento, setTieneDescuento] = useState(() => draft?.tieneDescuento ?? false);
  const [fechaPedido, setFechaPedido] = useState(
    draft?.fechaPedido ?? new Date().toISOString().slice(0, 10)
  );
  const [fechaPagoDesc, setFechaPagoDesc] = useState(draft?.fechaPagoDesc ?? "");
  const [fechaPagoMax, setFechaPagoMax] = useState(draft?.fechaPagoMax ?? "");
  const [valorDesc, setValorDesc] = useState<number | "">(draft?.valorDesc ?? "");
  const [valorSinDesc, setValorSinDesc] = useState<number | "">(draft?.valorSinDesc ?? "");
  const [valorSinDescManual, setValorSinDescManual] = useState(() => draft?.valorSinDescManual === true);
  const [estadoNuevo, setEstadoNuevo] = useState(draft?.estadoNuevo ?? "pendiente");
  const [notasItems, setNotasItems] = useState<EntityNote[]>(draft?.notasItems ?? []);
  const [currentAuthor, setCurrentAuthor] = useState("Usuario");
  const [referencia, setReferencia] = useState(draft?.referencia ?? "");
  const [lineas, setLineas] = useState<Linea[]>(draft?.lineas?.length ? draft.lineas : [lineaVacia()]);
  const [vistaTab, setVistaTab] = useState<PedidosVistaTab>("pedido");

  const [edit, setEdit] = useState<PedidoProveedor | null>(null);
  const [editFecha, setEditFecha] = useState("");
  const [editFd, setEditFd] = useState("");
  const [editFm, setEditFm] = useState("");
  const [editVd, setEditVd] = useState<number | "">("");
  const [editVs, setEditVs] = useState<number | "">("");
  const [editEstado, setEditEstado] = useState("pendiente");
  const [editNotasItems, setEditNotasItems] = useState<EntityNote[]>([]);
  const [editRef, setEditRef] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [proveedorSearch, setProveedorSearch] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [p, pr] = await Promise.all([fetchPedidosProveedores(), fetchProveedores()]);
      setPedidos(p);
      setProveedores(pr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!edit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEdit(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit]);

  useEffect(() => {
    void fetchAuthMe()
      .then((me) => {
        const label = me.user.nombre?.trim() || me.user.email?.trim() || "Usuario";
        setCurrentAuthor(label);
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  useEffect(() => {
    if (!productoRapidoModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !productoRapidoBusy) setProductoRapidoModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [productoRapidoModalOpen, productoRapidoBusy]);

  const proveedoresActivos = useMemo(
    () => proveedores.filter((p) => p.estado === "activo"),
    [proveedores]
  );
  const proveedorSeleccionado = useMemo(
    () => proveedores.find((p) => p.id === proveedorId) ?? null,
    [proveedorId, proveedores]
  );
  const pasos = useMemo(
    () => ["Proveedor", "Productos", "Pagos", "Resumen y notas"],
    []
  );
  const lineasExistentes = useMemo(
    () => lineas.map((ln, idx) => ({ ln, idx })).filter((x) => x.ln.modo === "existente"),
    [lineas]
  );
  const lineasNuevas = useMemo(
    () => lineas.map((ln, idx) => ({ ln, idx })).filter((x) => x.ln.modo === "nuevo"),
    [lineas]
  );
  const totalGeneralPedido = useMemo(
    () =>
      lineas.reduce((acc, ln) => {
        const cant = Math.max(1, Number(ln.cantidad) || 1);
        const costo = ln.costo_unitario === "" ? NaN : Number(ln.costo_unitario);
        if (!Number.isFinite(costo) || costo < 0) return acc;
        return acc + cant * costo;
      }, 0),
    [lineas]
  );
  const proveedoresActivosFiltrados = useMemo(
    () => proveedoresActivos.filter((p) => matchesProveedorSearch(p, proveedorSearch)),
    [proveedoresActivos, proveedorSearch]
  );
  const resumenLineas = useMemo(
    () =>
      lineas.reduce((acc, ln) => {
        const cant = Number(ln.cantidad);
        const costo = ln.costo_unitario === "" ? NaN : Number(ln.costo_unitario);
        if (!Number.isFinite(cant) || !Number.isFinite(costo)) return acc;
        return acc + cant * costo;
      }, 0),
    [lineas]
  );
  const resumenWarnings = useMemo(() => {
    const warns: string[] = [];
    if (!proveedorSeleccionado) warns.push("Falta seleccionar proveedor.");
    if (!lineas.length) warns.push("No hay productos seleccionados en el pedido.");
    if (fechaPedido.trim() && fechaPagoMax.trim() && fechaPedido > fechaPagoMax) {
      warns.push("La fecha del pedido no debe ser posterior a la fecha máxima de pago.");
    }
    if (
      tieneDescuento &&
      valorDesc !== "" &&
      valorSinDesc !== "" &&
      Number.isFinite(Number(valorDesc)) &&
      Number.isFinite(Number(valorSinDesc)) &&
      Number(valorDesc) > Number(valorSinDesc)
    ) {
      warns.push("El valor con descuento no puede ser mayor al valor sin descuento.");
    }
    if (!referencia.trim()) warns.push("No se indicó referencia/remito.");
    return warns;
  }, [
    proveedorSeleccionado,
    lineas.length,
    fechaPedido,
    fechaPagoMax,
    tieneDescuento,
    valorDesc,
    valorSinDesc,
    referencia,
  ]);

  useEffect(() => {
    if (prevProveedorIdRef.current === proveedorId) return;
    prevProveedorIdRef.current = proveedorId;
    setProductoSearch("");
    setProductoRapidoModalOpen(false);
    setLineas([]);
  }, [proveedorId]);

  useEffect(() => {
    if (valorSinDescManual) return;
    const t = totalGeneralPedido;
    if (!Number.isFinite(t)) return;
    setValorSinDesc(roundMoney2(t));
  }, [totalGeneralPedido, valorSinDescManual]);

  useEffect(() => {
    if (proveedorId === "") {
      setProductosProveedor([]);
      return;
    }
    let cancel = false;
    const t = window.setTimeout(() => {
      setProductosProveedorLoading(true);
      void fetchProductosPorProveedor(proveedorId, { q: productoSearch, limit: 400 })
        .then((rows) => {
          if (!cancel) setProductosProveedor(rows);
        })
        .catch(() => {
          if (!cancel) setProductosProveedor([]);
        })
        .finally(() => {
          if (!cancel) setProductosProveedorLoading(false);
        });
    }, 180);
    return () => {
      cancel = true;
      window.clearTimeout(t);
    };
  }, [proveedorId, productoSearch]);

  useEffect(() => {
    try {
      const nextDraft: PedidoDraft = {
        step: wizardStep,
        proveedorId,
        tieneDescuento,
        fechaPedido,
        fechaPagoDesc,
        fechaPagoMax,
        valorDesc,
        valorSinDesc,
        valorSinDescManual,
        estadoNuevo,
        notasItems,
        referencia,
        lineas,
      };
      localStorage.setItem(PEDIDOS_WIZARD_DRAFT_KEY, JSON.stringify(nextDraft));
    } catch {
      /* ignore */
    }
  }, [
    wizardStep,
    proveedorId,
    tieneDescuento,
    fechaPedido,
    fechaPagoDesc,
    fechaPagoMax,
    valorDesc,
    valorSinDesc,
    valorSinDescManual,
    estadoNuevo,
    notasItems,
    referencia,
    lineas,
  ]);

  function clearWizardDraft() {
    try {
      localStorage.removeItem(PEDIDOS_WIZARD_DRAFT_KEY);
    } catch {
      /* ignore */
    }
  }

  function setLinea(i: number, patch: Partial<Linea>) {
    setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function removeLinea(i: number) {
    setLineas((prev) => prev.filter((_, j) => j !== i));
  }

  function addProductoExistente(producto: Producto) {
    setLineas((prev) => {
      const idx = prev.findIndex((ln) => ln.modo === "existente" && ln.producto_id === producto.id);
      if (idx >= 0) {
        return prev.map((ln, i) =>
          i === idx ? { ...ln, cantidad: Math.max(1, Number(ln.cantidad) || 1) + 1 } : ln
        );
      }
      return [
        ...prev,
        {
          ...lineaVacia(),
          modo: "existente",
          producto_id: producto.id,
          cantidad: 1,
          costo_unitario: Number(producto.precio_compra ?? producto.precio ?? 0),
        },
      ];
    });
  }

  function openProductoRapidoModal() {
    if (proveedorId === "") {
      setError("Seleccioná un proveedor en el paso 1 antes de crear un producto.");
      return;
    }
    setError(null);
    setProductoRapidoForm(emptyProductoCatalogoFields());
    setProductoRapidoModalOpen(true);
  }

  async function onGuardarProductoRapido(e: React.FormEvent) {
    e.preventDefault();
    if (proveedorId === "") {
      setError("Seleccioná un proveedor en el paso 1.");
      return;
    }
    if (!productoRapidoForm.nombre.trim()) {
      setError("El nombre del producto es obligatorio.");
      return;
    }
    setProductoRapidoBusy(true);
    setError(null);
    try {
      const body = {
        ...catalogoFieldsToCreateBody(productoRapidoForm),
        codigo_barras: null,
        imagen_url: null,
        fecha_vencimiento: null,
        precio_venta: null,
        marca: null,
        stock: 0,
        stock_minimo: undefined,
      };
      const created = await createProductoRapidoDesdePedido(proveedorId, body);
      setProductosProveedor((prev) => {
        const rest = prev.filter((p) => p.id !== created.id);
        return [created, ...rest];
      });
      addProductoExistente(created);
      toast("Producto creado y asociado al proveedor", "success");
      setProductoRapidoModalOpen(false);
      setProductoRapidoForm(emptyProductoCatalogoFields());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el producto");
      toast(err instanceof Error ? err.message : "Error al crear producto", "error");
    } finally {
      setProductoRapidoBusy(false);
    }
  }

  function validateLineas(): string | null {
    if (!lineas.length) return "Agregá al menos una línea de producto.";
    for (const ln of lineas) {
      const cant = Number(ln.cantidad);
      const costo = ln.costo_unitario === "" ? NaN : Number(ln.costo_unitario);
      if (!Number.isFinite(cant) || cant <= 0 || !Number.isFinite(costo) || costo < 0) {
        return "Revisá cantidad y costo en cada línea.";
      }
      if (ln.modo === "nuevo") {
        const pv = ln.nuevo_precio_venta === "" ? NaN : Number(ln.nuevo_precio_venta);
        if (!ln.nuevo_nombre.trim() || !Number.isFinite(pv) || pv < 0) {
          return "Producto nuevo: nombre y precio de venta obligatorios.";
        }
      } else if (!ln.producto_id) {
        return "Seleccioná un producto en cada línea existente.";
      }
    }
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
    if (
      valorSinDesc !== "" &&
      (!Number.isFinite(Number(valorSinDesc)) || Number(valorSinDesc) < 0)
    ) {
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
    if (step === 2) return validatePagos();
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
        setError(msg);
        return;
      }
    }
    setError(null);
    setWizardStep(target);
  }

  function onNextStep() {
    const msg = validateStep(wizardStep);
    if (msg) {
      setError(msg);
      return;
    }
    setError(null);
    setWizardStep((s) => Math.min(3, s + 1));
  }

  function onPrevStep() {
    setError(null);
    setWizardStep((s) => Math.max(0, s - 1));
  }

  function onToggleDescuento(enabled: boolean) {
    setTieneDescuento(enabled);
    if (!enabled) {
      setFechaPagoDesc("");
      setValorDesc("");
    }
  }

  async function onPedidoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOkMsg(null);
    const stepMsg = validateStep(0) ?? validateStep(1) ?? validateStep(2);
    if (stepMsg) {
      setError(stepMsg);
      return;
    }
    const built: Record<string, unknown>[] = [];
    for (const ln of lineas) {
      const cant = Number(ln.cantidad);
      const costo = ln.costo_unitario === "" ? NaN : Number(ln.costo_unitario);
      if (!Number.isFinite(cant) || cant <= 0 || !Number.isFinite(costo) || costo < 0) {
        setError("Revisá cantidad y costo en cada línea");
        return;
      }
      if (ln.modo === "nuevo") {
        const pv = ln.nuevo_precio_venta === "" ? NaN : Number(ln.nuevo_precio_venta);
        if (!ln.nuevo_nombre.trim() || !Number.isFinite(pv)) {
          setError("Producto nuevo: nombre y precio de venta obligatorios");
          return;
        }
        built.push({
          cantidad: cant,
          costo_unitario: costo,
          actualizar_precios: ln.actualizar_precios,
          precio_venta_lista: ln.precio_venta_lista === "" ? undefined : Number(ln.precio_venta_lista),
          nuevo_producto: {
            nombre: ln.nuevo_nombre.trim(),
            codigo_barras: ln.nuevo_codigo.trim() || null,
            precio_venta: pv,
            marca: null,
          },
        });
      } else {
        if (!ln.producto_id) {
          setError("Seleccioná un producto en cada línea existente");
          return;
        }
        built.push({
          producto_id: ln.producto_id,
          cantidad: cant,
          costo_unitario: costo,
          actualizar_precios: ln.actualizar_precios,
          precio_venta_lista: ln.precio_venta_lista === "" ? undefined : Number(ln.precio_venta_lista),
        });
      }
    }

    setError(null);
    try {
      await createPedidoProveedor({
        proveedor_id: proveedorId,
        fecha: fechaPedido,
        fecha_pago_con_descuento: tieneDescuento ? fechaPagoDesc.trim() || null : null,
        fecha_pago_maxima: fechaPagoMax.trim() || null,
        valor_pago_con_descuento: tieneDescuento && valorDesc !== "" ? Number(valorDesc) : null,
        valor_pago_sin_descuento: valorSinDesc === "" ? null : Number(valorSinDesc),
        estado: estadoNuevo,
        notas: serializeEntityNotes(notasItems),
        referencia: referencia.trim() || null,
        lineas: built,
      });
      setOkMsg("Pedido registrado; stock actualizado (ENTRADA).");
      setProveedorId("");
      setTieneDescuento(false);
      setFechaPedido(new Date().toISOString().slice(0, 10));
      setFechaPagoDesc("");
      setFechaPagoMax("");
      setValorDesc("");
      setValorSinDesc("");
      setValorSinDescManual(false);
      setEstadoNuevo("pendiente");
      setNotasItems([]);
      setReferencia("");
      setLineas([lineaVacia()]);
      setWizardStep(0);
      clearWizardDraft();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar pedido");
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
    const parsed = parseEntityNotes(p.notas ?? null);
    if (parsed.notes.length > 0) {
      setEditNotasItems(parsed.notes);
    } else if (parsed.legacyText) {
      const now = new Date().toISOString();
      setEditNotasItems([
        {
          id: `legacy_edit_${Date.now()}`,
          content: parsed.legacyText,
          author: "Migrada",
          created_at: now,
          updated_at: now,
        },
      ]);
    } else {
      setEditNotasItems([]);
    }
    setEditRef(p.referencia ?? "");
  }

  function validateEditPagos(): string | null {
    if (!editFecha.trim()) return "La fecha del pedido es obligatoria.";
    const fp = editFecha.trim().slice(0, 10);
    if (editFd.trim() && fp > editFd.trim()) {
      return "La fecha del pedido debe ser anterior o igual a la fecha límite con descuento.";
    }
    if (editFm.trim() && fp > editFm.trim()) {
      return "La fecha del pedido debe ser anterior o igual a la fecha máxima de pago.";
    }
    if (editFd.trim() && editFm.trim() && editFd > editFm) {
      return "La fecha de pago con descuento debe ser anterior o igual a la fecha máxima.";
    }
    if (editVd !== "" && (!Number.isFinite(Number(editVd)) || Number(editVd) < 0)) {
      return "El valor con descuento debe ser un número válido mayor o igual a 0.";
    }
    if (editVs !== "" && (!Number.isFinite(Number(editVs)) || Number(editVs) < 0)) {
      return "El valor sin descuento debe ser un número válido mayor o igual a 0.";
    }
    if (
      editVd !== "" &&
      editVs !== "" &&
      Number.isFinite(Number(editVd)) &&
      Number.isFinite(Number(editVs)) &&
      Number(editVd) > Number(editVs)
    ) {
      return "El valor con descuento no puede ser mayor al valor sin descuento.";
    }
    return null;
  }

  async function onEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const editErr = validateEditPagos();
    if (editErr) {
      setError(editErr);
      return;
    }
    setEditBusy(true);
    setError(null);
    try {
      await updatePedidoProveedorMeta(edit.id, {
        fecha: editFecha,
        fecha_pago_con_descuento: editFd.trim() || null,
        fecha_pago_maxima: editFm.trim() || null,
        valor_pago_con_descuento: editVd === "" ? null : Number(editVd),
        valor_pago_sin_descuento: editVs === "" ? null : Number(editVs),
        estado: editEstado,
        notas: serializeEntityNotes(editNotasItems),
        referencia: editRef.trim() || null,
      });
      setEdit(null);
      setOkMsg("Pedido actualizado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}
      {okMsg ? (
        <div className="banner" style={{ background: "#e8f5e9", border: "1px solid #c8e6c9" }}>
          {okMsg}
        </div>
      ) : null}

      <div className="subnav-wrap" style={{ marginBottom: "0.8rem" }}>
        <nav className="subnav subnav--tabs" aria-label="Navegación de pedidos">
          {([
            { id: "pedido", label: "Pedido" },
            { id: "proveedores", label: "Proveedores" },
            { id: "historial", label: "Historial" },
          ] as const).map((tab) => {
            const active = vistaTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={
                  active
                    ? "subnav-link subnav-link--active subnav-link--btn"
                    : "subnav-link subnav-link--btn"
                }
                onClick={() => setVistaTab(tab.id)}
              >
                <span className="subnav-label">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {vistaTab === "pedido" ? (
      <section className="card">
        <div className="card-head" style={{ marginBottom: "0.35rem" }}>
          <h2 className="card-title">Pedido</h2>
        </div>
        <p className="hint">Seleccioná proveedor, cargá productos, configurá pagos y confirmá el resumen final.</p>
        <div className="pedido-wizard-steps" role="tablist" aria-label="Progreso del pedido">
          {pasos.map((label, idx) => {
            const active = idx === wizardStep;
            const done = idx < wizardStep;
            return (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={active}
                className={[
                  "pedido-wizard-step",
                  active ? "pedido-wizard-step--active" : "",
                  done ? "pedido-wizard-step--done" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => goToStep(idx)}
              >
                <span className="pedido-wizard-step__index">{idx + 1}</span>
                <span className="pedido-wizard-step__label">{label}</span>
              </button>
            );
          })}
        </div>
        <div className="pedido-wizard-progress" aria-hidden>
          <span style={{ width: `${((wizardStep + 1) / pasos.length) * 100}%` }} />
        </div>
        <form className="form" onSubmit={onPedidoSubmit}>
          {wizardStep === 0 ? (
            <div className="pedido-wizard-panel">
              <div className="field" style={{ marginBottom: "0.4rem" }}>
                <span style={{ display: "block", marginBottom: "0.3rem" }}>Buscar proveedor</span>
                <input
                  type="search"
                  aria-label="Buscar proveedor"
                  placeholder="Nombre, NIT, teléfono o email"
                  value={proveedorSearch}
                  onChange={(e) => setProveedorSearch(e.target.value)}
                />
              </div>
              {proveedoresActivosFiltrados.length === 0 ? (
                <div className="banner banner-info">No hay proveedores activos que coincidan con la búsqueda.</div>
              ) : (
                <div className="proveedores-grid" role="list" style={{ marginTop: "0.5rem" }}>
                  {proveedoresActivosFiltrados.map((p) => {
                    const selected = proveedorId === p.id;
                    return (
                      <article
                        key={p.id}
                        className="prov-card prov-card--stacked prov-card--clickable"
                        role="listitem"
                        tabIndex={0}
                        aria-label={`Seleccionar ${p.nombre}`}
                        style={selected ? { borderColor: "#6d5a9c", boxShadow: "0 0 0 2px rgba(109,90,156,0.18)" } : undefined}
                        onClick={() => {
                          setProveedorId(p.id);
                          setError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setProveedorId(p.id);
                            setError(null);
                          }
                        }}
                      >
                        <ProveedorSelectableMedia proveedor={p} />
                        <div style={{ width: "100%" }}>
                          <h4 className="prov-card__nombre-text">{p.nombre}</h4>
                          <p className="muted small" style={{ marginTop: "0.2rem" }}>
                            NIT: {p.nit || "—"}
                          </p>
                          <p className="muted small">Tel: {p.telefono || "—"} · Email: {p.email || "—"}</p>
                        </div>
                        {selected ? (
                          <span className="prov-card__badge prov-card__badge--ok">Seleccionado</span>
                        ) : (
                          <span className="prov-card__badge">Seleccionar</span>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
              {!proveedorSeleccionado ? (
                <div className="banner banner-info">Elegí un proveedor para continuar.</div>
              ) : null}
            </div>
          ) : null}

          {wizardStep === 1 ? (
            <div className="pedido-wizard-panel">
              {!proveedorSeleccionado ? (
                <div className="banner banner-info">Primero seleccioná un proveedor en el paso 1.</div>
              ) : (
                <div className="pedido-productos-layout">
                  <section className="pedido-productos-detail">
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Producto</th>
                            <th>Cantidad</th>
                            <th>Precio unit.</th>
                            <th>Subtotal</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineasExistentes.length === 0 && lineasNuevas.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="muted">
                                Sin productos en el pedido.
                              </td>
                            </tr>
                          ) : null}
                          {lineasExistentes.map(({ ln, idx }) => {
                            const producto = productosProveedor.find((p) => p.id === ln.producto_id);
                            const unit = ln.costo_unitario === "" ? 0 : Number(ln.costo_unitario);
                            const subtotal = Math.max(1, Number(ln.cantidad) || 1) * unit;
                            return (
                              <tr key={`exist-${idx}`}>
                                <td>{producto?.nombre ?? `Producto #${ln.producto_id}`}</td>
                                <td>
                                  <input
                                    type="number"
                                    min={1}
                                    value={ln.cantidad}
                                    onChange={(e) =>
                                      setLinea(idx, { cantidad: Math.max(1, Number(e.target.value) || 1) })
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={ln.costo_unitario}
                                    onChange={(e) =>
                                      setLinea(idx, {
                                        costo_unitario: e.target.value === "" ? "" : Number(e.target.value),
                                      })
                                    }
                                  />
                                </td>
                                <td>{Number.isFinite(subtotal) ? subtotal.toFixed(2) : "0.00"}</td>
                                <td>
                                  <button type="button" className="btn ghost small" onClick={() => removeLinea(idx)}>
                                    Quitar
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {lineasNuevas.map(({ ln, idx }) => {
                            const unit = ln.costo_unitario === "" ? 0 : Number(ln.costo_unitario);
                            const subtotal = Math.max(1, Number(ln.cantidad) || 1) * unit;
                            return (
                              <tr key={`new-${idx}`}>
                                <td>
                                  <input
                                    value={ln.nuevo_nombre}
                                    placeholder="Producto nuevo"
                                    onChange={(e) => setLinea(idx, { nuevo_nombre: e.target.value })}
                                  />
                                  <input
                                    style={{ marginTop: "0.35rem" }}
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={ln.nuevo_precio_venta}
                                    placeholder="Precio venta"
                                    onChange={(e) =>
                                      setLinea(idx, {
                                        nuevo_precio_venta: e.target.value === "" ? "" : Number(e.target.value),
                                      })
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    min={1}
                                    value={ln.cantidad}
                                    onChange={(e) =>
                                      setLinea(idx, { cantidad: Math.max(1, Number(e.target.value) || 1) })
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={ln.costo_unitario}
                                    onChange={(e) =>
                                      setLinea(idx, {
                                        costo_unitario: e.target.value === "" ? "" : Number(e.target.value),
                                      })
                                    }
                                  />
                                </td>
                                <td>{Number.isFinite(subtotal) ? subtotal.toFixed(2) : "0.00"}</td>
                                <td>
                                  <button type="button" className="btn ghost small" onClick={() => removeLinea(idx)}>
                                    Quitar
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="pedido-total-box">
                      Total general del pedido:{" "}
                      <strong>{moneyEsAr.format(roundMoney2(totalGeneralPedido))}</strong>
                    </div>
                  </section>
                  <aside className="card inner-line pedido-productos-sidebar">
                    <div className="card-head pedido-productos-sidebar-head">
                      <p className="muted small" style={{ margin: 0 }}>
                        Productos del proveedor
                      </p>
                      <button
                        type="button"
                        className="btn ghost small pedido-productos-add-btn"
                        onClick={openProductoRapidoModal}
                        disabled={!proveedorSeleccionado}
                        title={
                          proveedorSeleccionado
                            ? "Crear producto nuevo asociado a este proveedor"
                            : "Elegí proveedor en el paso 1"
                        }
                        aria-label="Nuevo producto"
                      >
                        +
                      </button>
                    </div>
                    <label className="field">
                      <span>Buscar productos del proveedor</span>
                      <input
                        type="search"
                        placeholder="Nombre, código o marca"
                        value={productoSearch}
                        onChange={(e) => setProductoSearch(e.target.value)}
                      />
                    </label>
                    {productosProveedorLoading ? (
                      <p className="muted small">Buscando productos…</p>
                    ) : productosProveedor.length === 0 ? (
                      <p className="muted small">
                        Este proveedor aún no tiene productos asociados por historial.
                      </p>
                    ) : (
                      <div className="pedido-productos-list">
                        {productosProveedor.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="pedido-producto-item"
                            onClick={() => addProductoExistente(p)}
                            title="Agregar al pedido"
                          >
                            <span className="pedido-producto-item__name">{p.nombre}</span>
                            <span className="pedido-producto-item__meta">
                              ${Number(p.precio_compra ?? p.precio ?? 0).toFixed(2)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </aside>
                </div>
              )}
            </div>
          ) : null}

          {wizardStep === 2 ? (
            <div className="pedido-wizard-panel">
              <p className="hint">
                Total del pedido (paso 2):{" "}
                <strong>{moneyEsAr.format(roundMoney2(totalGeneralPedido))}</strong>. El valor sin
                descuento se actualiza con ese total salvo que lo edites a mano.
              </p>
              {validatePagos() ? (
                <div className="banner banner-error" role="status">
                  {validatePagos()}
                </div>
              ) : (
                <div className="banner banner-info" role="status">
                  {tieneDescuento
                    ? "Fechas: pedido ≤ límite con descuento ≤ fecha máxima. Montos: con descuento ≤ sin descuento."
                    : "Sin descuento activo: completá fecha máxima y valor sin descuento si aplica."}
                </div>
              )}
              <label className="field">
                <span>Referencia / remito</span>
                <input
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="Nº remito, OC, factura…"
                  autoComplete="off"
                />
              </label>
              <div className="grid-2">
                <label className="field">
                  <span>Fecha del pedido *</span>
                  <input
                    type="date"
                    value={fechaPedido}
                    onChange={(e) => setFechaPedido(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Estado del pago</span>
                  <select value={estadoNuevo} onChange={(e) => setEstadoNuevo(e.target.value)}>
                    <option value="pendiente">Pendiente</option>
                    <option value="parcial">Parcial</option>
                    <option value="pagado">Pagado</option>
                    <option value="vencido">Vencido</option>
                  </select>
                </label>
                <label className="field pedido-descuento-field">
                  <span>Pago con descuento</span>
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
                  <label className="field">
                    <span>Fecha límite pago con descuento</span>
                    <input
                      type="date"
                      value={fechaPagoDesc}
                      onChange={(e) => setFechaPagoDesc(e.target.value)}
                    />
                  </label>
                ) : null}
                <label className="field">
                  <span>Fecha máxima de pago (sin descuento)</span>
                  <input
                    type="date"
                    value={fechaPagoMax}
                    onChange={(e) => setFechaPagoMax(e.target.value)}
                  />
                </label>
                {tieneDescuento ? (
                  <label className="field">
                    <span>Valor pago con descuento (ARS)</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      inputMode="decimal"
                      value={valorDesc}
                      onChange={(e) => setValorDesc(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </label>
                ) : null}
                <label className="field">
                  <span>Valor pago sin descuento (ARS)</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    inputMode="decimal"
                    value={valorSinDesc}
                    onChange={(e) => {
                      setValorSinDescManual(true);
                      setValorSinDesc(e.target.value === "" ? "" : Number(e.target.value));
                    }}
                  />
                  <span className="muted small">
                    Sugerido: {moneyEsAr.format(roundMoney2(totalGeneralPedido))}
                    {valorSinDescManual ? " · editado manualmente" : " · enlazado al total"}
                  </span>
                </label>
              </div>
              <div className="actions" style={{ justifyContent: "flex-start" }}>
                <button
                  type="button"
                  className="btn ghost small"
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
            <div className="pedido-wizard-panel">
              {resumenWarnings.length > 0 ? (
                <div className="banner banner-error" role="status">
                  Atención: {resumenWarnings.join(" ")}
                </div>
              ) : (
                <div className="banner banner-info" role="status">
                  Revisá el resumen. Si todo está correcto, podés finalizar el pedido.
                </div>
              )}
              <div className="grid-2">
                <div className="card inner-line" style={{ margin: 0 }}>
                  <div className="card-head" style={{ marginBottom: "0.4rem" }}>
                    <p className="muted small" style={{ margin: 0 }}>
                      Proveedor
                    </p>
                    <button type="button" className="btn ghost small" onClick={() => goToStep(0)}>
                      Editar
                    </button>
                  </div>
                  <strong>{proveedorSeleccionado?.nombre ?? "No seleccionado"}</strong>
                  <p className="muted small" style={{ marginTop: "0.5rem" }}>
                    NIT: {proveedorSeleccionado?.nit || "—"} · Tel: {proveedorSeleccionado?.telefono || "—"}
                  </p>
                  <p className="muted small">
                    Fecha pedido: {fechaPedido || "—"} · Ref.: {referencia.trim() || "—"}
                  </p>
                </div>
                <div className="card inner-line" style={{ margin: 0 }}>
                  <div className="card-head" style={{ marginBottom: "0.4rem" }}>
                    <p className="muted small" style={{ margin: 0 }}>
                      Totales
                    </p>
                    <button type="button" className="btn ghost small" onClick={() => goToStep(1)}>
                      Editar
                    </button>
                  </div>
                  <strong>{lineas.length} línea(s)</strong>
                  <p className="muted small" style={{ marginTop: "0.5rem" }}>
                    Total compra: {moneyEsAr.format(roundMoney2(resumenLineas))}
                  </p>
                  <p className="muted small">
                    Total general pedido: {moneyEsAr.format(roundMoney2(totalGeneralPedido))}
                  </p>
                </div>
                <div className="card inner-line" style={{ margin: 0, gridColumn: "1 / -1" }}>
                  <div className="card-head" style={{ marginBottom: "0.4rem" }}>
                    <p className="muted small" style={{ margin: 0 }}>
                      Productos seleccionados
                    </p>
                    <button type="button" className="btn ghost small" onClick={() => goToStep(1)}>
                      Editar
                    </button>
                  </div>
                  {lineas.length === 0 ? (
                    <p className="muted small">No hay productos en el pedido.</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Producto</th>
                            <th>Cant.</th>
                            <th>Unitario</th>
                            <th>Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineas.map((ln, i) => {
                            const producto = ln.modo === "existente"
                              ? productosProveedor.find((p) => p.id === ln.producto_id)?.nombre ??
                                `Producto #${ln.producto_id}`
                              : ln.nuevo_nombre || "Producto nuevo";
                            const unit = ln.costo_unitario === "" ? 0 : Number(ln.costo_unitario);
                            const subtotal = Math.max(1, Number(ln.cantidad) || 1) * unit;
                            return (
                              <tr key={`res-ln-${i}`}>
                                <td>{producto}</td>
                                <td>{Math.max(1, Number(ln.cantidad) || 1)}</td>
                                <td>{moneyEsAr.format(unit)}</td>
                                <td>{moneyEsAr.format(subtotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="card inner-line" style={{ margin: 0, gridColumn: "1 / -1" }}>
                  <div className="card-head" style={{ marginBottom: "0.4rem" }}>
                    <p className="muted small" style={{ margin: 0 }}>
                      Pagos y descuentos
                    </p>
                    <button type="button" className="btn ghost small" onClick={() => goToStep(2)}>
                      Editar
                    </button>
                  </div>
                  <p className="small">
                    Con descuento:{" "}
                    {tieneDescuento
                      ? valorDesc === ""
                        ? "—"
                        : moneyEsAr.format(Number(valorDesc))
                      : "No aplica"}{" "}
                    · Sin descuento:{" "}
                    {valorSinDesc === "" ? "—" : moneyEsAr.format(Number(valorSinDesc))}
                  </p>
                  <p className="muted small">Estado: {labelEstadoPago(estadoNuevo)}</p>
                  <p className="muted small">
                    Plazos: desc. hasta {tieneDescuento ? fechaPagoDesc || "—" : "No aplica"} · máx.{" "}
                    {fechaPagoMax || "—"}
                  </p>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <EntityNotes
                    title="Notas finales"
                    notes={notasItems}
                    onChange={setNotasItems}
                    currentAuthor={currentAuthor}
                    emptyLabel="Sin notas finales. Son opcionales."
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="actions pedido-wizard-actions">
            {wizardStep < 3 ? (
              <button type="button" className="btn primary" onClick={onNextStep}>
                Siguiente
              </button>
            ) : (
              <button type="submit" className="btn primary">
                Registrar pedido
              </button>
            )}
          </div>
        </form>
      </section>
      ) : null}

      {vistaTab === "historial" ? (
      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Historial de pedidos</h2>
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
        <p className="hint">Consultá pedidos anteriores y editá plazos, montos o notas de pago.</p>
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : pedidos.length === 0 ? (
          <p className="muted">Sin pedidos registrados.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha pedido</th>
                  <th>Proveedor</th>
                  <th>Total ítems</th>
                  <th>Estado</th>
                  <th>Indicador pago</th>
                  <th>Ref.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{String(c.fecha).slice(0, 10)}</td>
                    <td>{c.proveedor_nombre_ref ?? c.proveedor_nombre ?? "—"}</td>
                    <td>{Number(c.total).toFixed(2)}</td>
                    <td>{c.estado ?? "—"}</td>
                    <td>{labelIndicador(c.indicador_pago)}</td>
                    <td>{c.referencia ?? "—"}</td>
                    <td>
                      <button type="button" className="btn ghost small" onClick={() => openEdit(c)}>
                        Editar plazos / montos
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

      {vistaTab === "proveedores" ? (
        <ProveedoresPage />
      ) : null}

      {edit ? (
        <div
          className="drawer-overlay"
          role="dialog"
          aria-modal
          aria-labelledby="edit-pedido-title"
          onClick={() => setEdit(null)}
        >
          <div className="card drawer-overlay-card" onClick={(e) => e.stopPropagation()}>
            <h3 id="edit-pedido-title" className="card-title">
              Editar pedido #{edit.id}
            </h3>
            <p className="muted small">
              Solo fechas de pago, montos acordados, estado y notas. Las líneas y el proveedor no se
              modifican aquí.
            </p>
            <form className="form" onSubmit={onEditSave}>
              <label className="field">
                <span>Fecha del pedido</span>
                <input type="date" value={editFecha} onChange={(e) => setEditFecha(e.target.value)} required />
              </label>
              <label className="field">
                <span>Fecha pago con descuento</span>
                <input type="date" value={editFd} onChange={(e) => setEditFd(e.target.value)} />
              </label>
              <label className="field">
                <span>Fecha máxima de pago</span>
                <input type="date" value={editFm} onChange={(e) => setEditFm(e.target.value)} />
              </label>
              <label className="field">
                <span>Valor con descuento</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={editVd}
                  onChange={(e) => setEditVd(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Valor sin descuento</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={editVs}
                  onChange={(e) => setEditVs(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Estado</span>
                <select value={editEstado} onChange={(e) => setEditEstado(e.target.value)}>
                  <option value="pendiente">Pendiente</option>
                  <option value="parcial">Parcial</option>
                  <option value="pagado">Pagado</option>
                  <option value="vencido">Vencido</option>
                </select>
              </label>
              <label className="field">
                <span>Referencia</span>
                <input value={editRef} onChange={(e) => setEditRef(e.target.value)} />
              </label>
              <div className="field">
                <span>Notas</span>
                <div style={{ marginTop: "0.35rem" }}>
                  <EntityNotes
                    notes={editNotasItems}
                    onChange={setEditNotasItems}
                    currentAuthor={currentAuthor}
                    emptyLabel="Sin notas para este pedido."
                  />
                </div>
              </div>
              <div className="actions">
                <button type="button" className="btn ghost" onClick={() => setEdit(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={editBusy}>
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {productoRapidoModalOpen && proveedorSeleccionado ? (
        <div
          className="drawer-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="producto-rapido-title"
          onClick={() => {
            if (!productoRapidoBusy) setProductoRapidoModalOpen(false);
          }}
        >
          <div
            className="card drawer-overlay-card pedido-rapido-modal"
            style={{ maxWidth: 480, width: "min(92vw, 480px)", maxHeight: "88vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-head">
              <h3 id="producto-rapido-title" className="card-title">
                Pre-registro de producto desde pedido
              </h3>
              <button
                type="button"
                className="btn ghost small"
                disabled={productoRapidoBusy}
                onClick={() => setProductoRapidoModalOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <form className="form pedido-rapido-form" onSubmit={onGuardarProductoRapido}>
              <p className="muted small" style={{ margin: "0 0 0.35rem" }}>
                Registrá solo datos base para compra inicial (nombre, categoría, descripción y costo de compra).
                El stock real se actualizará al registrar la entrada del pedido.
              </p>
              <ProductoCatalogoForm
                values={productoRapidoForm}
                onChange={(patch) => setProductoRapidoForm((f) => ({ ...f, ...patch }))}
                mode="create"
                hideBarcodeLookup
                quickCreateFromPedido
                proveedorResumen={{
                  nombre: proveedorSeleccionado.nombre,
                  nit: proveedorSeleccionado.nit,
                  telefono: proveedorSeleccionado.telefono,
                  email: proveedorSeleccionado.email,
                }}
              />
              <div className="actions" style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={productoRapidoBusy}
                  onClick={() => setProductoRapidoModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn primary" disabled={productoRapidoBusy}>
                  {productoRapidoBusy ? "Guardando…" : "Guardar y agregar al pedido"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
