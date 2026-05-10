<<<<<<< Updated upstream
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
=======
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, MagnifyingGlass, Plus, Truck } from "@phosphor-icons/react";
>>>>>>> Stashed changes
import {
  createPedidoProveedor,
  fetchPedidosProveedores,
  fetchProductos,
  fetchProveedores,
  updatePedidoProveedorMeta,
  type PedidoProveedor,
  type Producto,
  type Proveedor,
} from "../api";

type Modo = "existente" | "nuevo";

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

<<<<<<< Updated upstream
=======
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

>>>>>>> Stashed changes
export function PedidosProveedoresPage() {
  const [pedidos, setPedidos] = useState<PedidoProveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [proveedorId, setProveedorId] = useState<number | "">("");
  const [fechaPedido, setFechaPedido] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaPagoDesc, setFechaPagoDesc] = useState("");
  const [fechaPagoMax, setFechaPagoMax] = useState("");
  const [valorDesc, setValorDesc] = useState<number | "">("");
  const [valorSinDesc, setValorSinDesc] = useState<number | "">("");
  const [estadoNuevo, setEstadoNuevo] = useState("pendiente");
  const [notas, setNotas] = useState("");
  const [referencia, setReferencia] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);

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

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [p, pr, prod] = await Promise.all([
        fetchPedidosProveedores(),
        fetchProveedores(),
        fetchProductos(),
      ]);
      setPedidos(p);
      setProveedores(pr);
      setProductos(prod);
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

  const proveedoresActivos = useMemo(
    () => proveedores.filter((p) => p.estado === "activo"),
    [proveedores]
  );

  function setLinea(i: number, patch: Partial<Linea>) {
    setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function addLinea() {
    setLineas((prev) => [...prev, lineaVacia()]);
  }

  function removeLinea(i: number) {
    setLineas((prev) => prev.filter((_, j) => j !== i));
  }

<<<<<<< Updated upstream
  async function onPedidoSubmit(e: React.FormEvent) {
=======
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

  async function onPedidoSubmit(e: React.FormEvent<HTMLFormElement>) {
>>>>>>> Stashed changes
    e.preventDefault();
    const ne = e.nativeEvent;
    const canUseSubmitter = typeof SubmitEvent !== "undefined" && ne instanceof SubmitEvent;
    const submitter = canUseSubmitter ? ne.submitter : undefined;

    /*
     * El wizard está dentro de un <form>. Enter en un input de una sola línea (p. ej. referencia)
     * dispara envío implícito (submitter === null). Eso debe avanzar el paso, no registrar.
     *
     * En algunos navegadores pueden encolarse dos submit seguidos: el primero pasa de Pagos a
     * Resumen (paso 3) y el segundo ya ve paso 3; si registráramos igual, se guardaría el pedido
     * y el efecto de éxito te devuelve al paso 1 del stepper (reset a 0).
     */
    if (wizardStep < 3) {
      const msg = validateStep(wizardStep);
      if (msg) {
        setError(msg);
        return;
      }
      setError(null);
      setWizardStep((s) => Math.min(3, s + 1));
      return;
    }

    if (canUseSubmitter && submitter === null) {
      return;
    }

    setOkMsg(null);
    if (proveedorId === "") {
      setError("Elegí un proveedor activo de la lista o gestioná altas en el módulo Proveedores.");
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
        fecha_pago_con_descuento: fechaPagoDesc.trim() || null,
        fecha_pago_maxima: fechaPagoMax.trim() || null,
        valor_pago_con_descuento: valorDesc === "" ? null : Number(valorDesc),
        valor_pago_sin_descuento: valorSinDesc === "" ? null : Number(valorSinDesc),
        estado: estadoNuevo,
        notas: notas.trim() || null,
        referencia: referencia.trim() || null,
        lineas: built,
      });
      setOkMsg("Pedido registrado; stock actualizado (ENTRADA).");
      setProveedorId("");
      setFechaPedido(new Date().toISOString().slice(0, 10));
      setFechaPagoDesc("");
      setFechaPagoMax("");
      setValorDesc("");
      setValorSinDesc("");
      setEstadoNuevo("pendiente");
      setNotas("");
      setReferencia("");
      setLineas([lineaVacia()]);
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
    setEditNotas(p.notas ?? "");
    setEditRef(p.referencia ?? "");
  }

  async function onEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
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
        notas: editNotas.trim() || null,
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
        <div className="pedidos-alert pedidos-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {okMsg ? (
        <div className="pedidos-alert pedidos-alert--success" role="status">
          {okMsg}
        </div>
      ) : null}

<<<<<<< Updated upstream
      <section className="card">
        <h2 className="card-title">Nuevo pedido a proveedor</h2>
        <p className="hint">
          Cada pedido debe tener un proveedor de la lista. Actualiza stock (ENTRADA) y opcionalmente
          precios de compra / venta por línea.
        </p>
        <form className="form" onSubmit={onPedidoSubmit}>
          <div className="grid-2">
            <label className="field">
              <span>Proveedor *</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                <select
                  style={{ flex: "1 1 12rem", minWidth: 0 }}
                  value={proveedorId === "" ? "" : String(proveedorId)}
                  onChange={(e) =>
                    setProveedorId(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  required
                >
                  <option value="">— Elegir —</option>
                  {proveedoresActivos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
                <Link to="/pedidos/proveedores" className="btn ghost small">
                  Proveedores
                </Link>
              </div>
            </label>
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
              <span>Fecha límite pago con descuento</span>
              <input type="date" value={fechaPagoDesc} onChange={(e) => setFechaPagoDesc(e.target.value)} />
            </label>
            <label className="field">
              <span>Fecha máxima de pago (sin descuento)</span>
              <input type="date" value={fechaPagoMax} onChange={(e) => setFechaPagoMax(e.target.value)} />
            </label>
            <label className="field">
              <span>Valor a pagar con descuento</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={valorDesc}
                onChange={(e) => setValorDesc(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Valor a pagar sin descuento</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={valorSinDesc}
                onChange={(e) => setValorSinDesc(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Estado</span>
              <select value={estadoNuevo} onChange={(e) => setEstadoNuevo(e.target.value)}>
                <option value="pendiente">Pendiente</option>
                <option value="pagado">Pagado</option>
                <option value="vencido">Vencido</option>
              </select>
            </label>
            <label className="field">
              <span>Referencia / remito</span>
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </label>
            <label className="field">
              <span>Notas</span>
              <input value={notas} onChange={(e) => setNotas(e.target.value)} />
            </label>
          </div>

          <div className="lineas-head">
            <span className="field-label-strong">Líneas del pedido</span>
            <button type="button" className="btn ghost small" onClick={addLinea}>
              + Línea
            </button>
          </div>

          {lineas.map((ln, i) => (
            <div key={i} className="card inner-line">
              <div className="field-row">
                <label className="field">
                  <span>Modo</span>
                  <select
                    value={ln.modo}
                    onChange={(e) => setLinea(i, { modo: e.target.value as Modo })}
                  >
                    <option value="existente">Producto existente</option>
                    <option value="nuevo">Alta producto nuevo</option>
                  </select>
                </label>
              </div>
              {ln.modo === "existente" ? (
                <div className="grid-3 compra-grid">
                  <label className="field">
                    <span>Producto</span>
                    <select
                      value={ln.producto_id || ""}
                      onChange={(e) => setLinea(i, { producto_id: Number(e.target.value) || 0 })}
                    >
                      <option value="">—</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Cantidad</span>
                    <input
                      type="number"
                      min={1}
                      value={ln.cantidad}
                      onChange={(e) => setLinea(i, { cantidad: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span>Costo unit.</span>
=======
      <header className="pedidos-hero">
        <div className="pedidos-hero__icon" aria-hidden>
          <Truck size={26} weight="duotone" />
        </div>
        <div className="pedidos-hero__copy">
          <p className="pedidos-hero__eyebrow">Compras y stock</p>
          <h1 className="pedidos-hero__title">Pedidos a proveedor</h1>
          <p className="pedidos-hero__lede">
            Flujo guiado en cuatro pasos: elegí proveedor, cargá productos, definí pagos y cerrá con
            resumen y notas. Todo queda guardado en borrador hasta que confirmes.
          </p>
        </div>
      </header>

      <nav className="pedidos-segmented" aria-label="Navegación de pedidos" role="tablist">
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
                          className={[
                            "pedidos-prov-card",
                            selected ? "pedidos-prov-card--selected" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          role="listitem"
                          tabIndex={0}
                          aria-pressed={selected}
                          aria-label={`Seleccionar ${p.nombre}`}
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
                        <p className="pedidos-lines-head__hint">Editá cantidades y costos; el total se actualiza al instante.</p>
                      </div>
                      <div className="pedidos-lines-stack">
                        {lineasExistentes.length === 0 && lineasNuevas.length === 0 ? (
                          <div className="pedidos-empty-lines">
                            <p className="pedidos-empty-lines__title">Todavía no agregaste productos</p>
                            <p className="pedidos-empty-lines__text">
                              Buscá en el catálogo del proveedor a la derecha y tocá un ítem para sumarlo al pedido.
                            </p>
                          </div>
                        ) : null}
                        {lineasExistentes.map(({ ln, idx }) => {
                          const producto = productosProveedor.find((p) => p.id === ln.producto_id);
                          const unit = ln.costo_unitario === "" ? 0 : Number(ln.costo_unitario);
                          const subtotal = Math.max(1, Number(ln.cantidad) || 1) * unit;
                          return (
                            <div className="pedidos-line-card" key={`exist-${idx}`}>
                              <div className="pedidos-line-card__main">
                                <p className="pedidos-line-card__badge">Catálogo</p>
                                <h4 className="pedidos-line-card__title">
                                  {producto?.nombre ?? `Producto #${ln.producto_id}`}
                                </h4>
                                <div className="pedidos-line-card__grid">
                                  <label className="pedidos-field pedidos-field--compact">
                                    <span className="pedidos-field__label">Cantidad</span>
                                    <input
                                      className="pedidos-input"
                                      type="number"
                                      min={1}
                                      value={ln.cantidad}
                                      onChange={(e) =>
                                        setLinea(idx, { cantidad: Math.max(1, Number(e.target.value) || 1) })
                                      }
                                    />
                                  </label>
                                  <label className="pedidos-field pedidos-field--compact">
                                    <span className="pedidos-field__label">Costo unit.</span>
                                    <input
                                      className="pedidos-input"
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
                                  </label>
                                </div>
                              </div>
                              <div className="pedidos-line-card__aside">
                                <div className="pedidos-line-card__sub">
                                  <span className="pedidos-line-card__sub-label">Subtotal</span>
                                  <span className="pedidos-line-card__sub-value">
                                    {Number.isFinite(subtotal) ? moneyEsAr.format(subtotal) : moneyEsAr.format(0)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="pedidos-line-card__remove"
                                  onClick={() => removeLinea(idx)}
                                >
                                  Quitar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {lineasNuevas.map(({ ln, idx }) => {
                          const unit = ln.costo_unitario === "" ? 0 : Number(ln.costo_unitario);
                          const subtotal = Math.max(1, Number(ln.cantidad) || 1) * unit;
                          return (
                            <div className="pedidos-line-card" key={`new-${idx}`}>
                              <div className="pedidos-line-card__main">
                                <p className="pedidos-line-card__badge pedidos-line-card__badge--new">Nuevo</p>
                                <div className="pedidos-line-card__grid pedidos-line-card__grid--2">
                                  <label className="pedidos-field pedidos-field--compact">
                                    <span className="pedidos-field__label">Nombre</span>
                                    <input
                                      className="pedidos-input"
                                      value={ln.nuevo_nombre}
                                      placeholder="Nombre del producto"
                                      onChange={(e) => setLinea(idx, { nuevo_nombre: e.target.value })}
                                    />
                                  </label>
                                  <label className="pedidos-field pedidos-field--compact">
                                    <span className="pedidos-field__label">Precio venta</span>
                                    <input
                                      className="pedidos-input"
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={ln.nuevo_precio_venta}
                                      placeholder="0"
                                      onChange={(e) =>
                                        setLinea(idx, {
                                          nuevo_precio_venta: e.target.value === "" ? "" : Number(e.target.value),
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="pedidos-field pedidos-field--compact">
                                    <span className="pedidos-field__label">Cantidad</span>
                                    <input
                                      className="pedidos-input"
                                      type="number"
                                      min={1}
                                      value={ln.cantidad}
                                      onChange={(e) =>
                                        setLinea(idx, { cantidad: Math.max(1, Number(e.target.value) || 1) })
                                      }
                                    />
                                  </label>
                                  <label className="pedidos-field pedidos-field--compact">
                                    <span className="pedidos-field__label">Costo unit.</span>
                                    <input
                                      className="pedidos-input"
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
                                  </label>
                                </div>
                              </div>
                              <div className="pedidos-line-card__aside">
                                <div className="pedidos-line-card__sub">
                                  <span className="pedidos-line-card__sub-label">Subtotal</span>
                                  <span className="pedidos-line-card__sub-value">
                                    {Number.isFinite(subtotal) ? moneyEsAr.format(subtotal) : moneyEsAr.format(0)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="pedidos-line-card__remove"
                                  onClick={() => removeLinea(idx)}
                                >
                                  Quitar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
                          <p className="pedidos-sidebar-card__hint">Tocá un producto para agregarlo al pedido.</p>
                        </div>
                        <button
                          type="button"
                          className="pedidos-icon-btn"
                          onClick={openProductoRapidoModal}
                          disabled={!proveedorSeleccionado}
                          title={
                            proveedorSeleccionado
                              ? "Crear producto nuevo asociado a este proveedor"
                              : "Elegí proveedor en el paso 1"
                          }
                          aria-label="Agregar producto nuevo"
                        >
                          <Plus size={20} weight="bold" />
                        </button>
                      </div>
                      <label className="pedidos-field pedidos-field--compact">
                        <span className="pedidos-field__label">Buscar</span>
                        <span className="pedidos-input-wrap">
                          <MagnifyingGlass className="pedidos-input-wrap__icon" size={18} weight="regular" aria-hidden />
                          <input
                            className="pedidos-input pedidos-input--with-icon"
                            type="search"
                            placeholder="Nombre, código o marca"
                            value={productoSearch}
                            onChange={(e) => setProductoSearch(e.target.value)}
                          />
                        </span>
                      </label>
                      {productosProveedorLoading ? (
                        <p className="pedidos-sidebar-card__status">Buscando productos…</p>
                      ) : productosProveedor.length === 0 ? (
                        <div className="pedidos-sidebar-empty">
                          <p className="pedidos-sidebar-empty__title">Sin resultados</p>
                          <p className="pedidos-sidebar-empty__text">
                            Este proveedor aún no tiene productos asociados por historial, o no coinciden con la
                            búsqueda.
                          </p>
                        </div>
                      ) : (
                        <div className="pedidos-catalog-list" role="list">
                          {productosProveedor.map((p) => (
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
                      <button type="button" className="pedidos-sidebar-cta" onClick={openProductoRapidoModal}>
                        <Plus size={18} weight="bold" aria-hidden />
                        Agregar producto nuevo
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
                  <strong>{moneyEsAr.format(roundMoney2(totalGeneralPedido))}</strong>. El valor sin descuento
                  sigue al total salvo que lo edites a mano.
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
                    placeholder="Nº remito, OC, factura…"
                    autoComplete="off"
                  />
                </label>
                <div className="pedidos-form-grid">
                  <label className="pedidos-field">
                    <span className="pedidos-field__label">Fecha del pedido *</span>
>>>>>>> Stashed changes
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
                      <option value="parcial">Parcial</option>
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
<<<<<<< Updated upstream
                      value={ln.costo_unitario}
                      onChange={(e) =>
                        setLinea(i, {
                          costo_unitario: e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
=======
                      inputMode="decimal"
                      value={valorSinDesc}
                      onChange={(e) => {
                        setValorSinDescManual(true);
                        setValorSinDesc(e.target.value === "" ? "" : Number(e.target.value));
                      }}
>>>>>>> Stashed changes
                    />
                    <span className="pedidos-field__hint">
                      Sugerido: {moneyEsAr.format(roundMoney2(totalGeneralPedido))}
                      {valorSinDescManual ? " · editado manualmente" : " · enlazado al total"}
                    </span>
                  </label>
                </div>
<<<<<<< Updated upstream
              ) : (
                <div className="grid-2">
                  <label className="field">
                    <span>Nombre nuevo producto *</span>
                    <input
                      value={ln.nuevo_nombre}
                      onChange={(e) => setLinea(i, { nuevo_nombre: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Precio venta lista *</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={ln.nuevo_precio_venta}
                      onChange={(e) =>
                        setLinea(i, {
                          nuevo_precio_venta: e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Código barras</span>
                    <input
                      value={ln.nuevo_codigo}
                      onChange={(e) => setLinea(i, { nuevo_codigo: e.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Cantidad</span>
                    <input
                      type="number"
                      min={1}
                      value={ln.cantidad}
                      onChange={(e) => setLinea(i, { cantidad: Number(e.target.value) })}
                    />
                  </label>
                  <label className="field">
                    <span>Costo unit.</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={ln.costo_unitario}
                      onChange={(e) =>
                        setLinea(i, {
                          costo_unitario: e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              )}
              <label className="field inline-check">
                <input
                  type="checkbox"
                  checked={ln.actualizar_precios}
                  onChange={(e) => setLinea(i, { actualizar_precios: e.target.checked })}
                />
                <span>Actualizar precio compra (y opcional lista venta) según esta línea</span>
              </label>
              {ln.modo === "existente" ? (
                <label className="field">
                  <span>Nuevo precio venta lista (opcional)</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={ln.precio_venta_lista}
                    onChange={(e) =>
                      setLinea(i, {
                        precio_venta_lista: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                  />
                </label>
              ) : null}
              {lineas.length > 1 ? (
                <button type="button" className="btn ghost small" onClick={() => removeLinea(i)}>
                  Quitar línea
                </button>
              ) : null}
            </div>
          ))}

          <div className="actions">
            <button type="submit" className="btn primary">
              Registrar pedido
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Historial de pedidos</h2>
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
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
=======
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
              <div className="pedidos-panel">
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
                      Total compra: {moneyEsAr.format(roundMoney2(resumenLineas))}
                    </p>
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
                          const producto =
                            ln.modo === "existente"
                              ? productosProveedor.find((p) => p.id === ln.producto_id)?.nombre ??
                                `Producto #${ln.producto_id}`
                              : ln.nuevo_nombre || "Producto nuevo";
                          const unit = ln.costo_unitario === "" ? 0 : Number(ln.costo_unitario);
                          const subtotal = Math.max(1, Number(ln.cantidad) || 1) * unit;
                          const qty = Math.max(1, Number(ln.cantidad) || 1);
                          return (
                            <li className="pedidos-resumen-line" key={`res-ln-${i}`}>
                              <span className="pedidos-resumen-line__name">{producto}</span>
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
                <button type="submit" className="pedidos-btn pedidos-btn--primary">
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
            <button type="button" className="pedidos-btn pedidos-btn--ghost" onClick={() => void load()}>
              Actualizar
            </button>
          </div>
          {loading ? (
            <div className="pedidos-historial-loading" aria-live="polite">
              Cargando historial…
            </div>
          ) : pedidos.length === 0 ? (
            <div className="pedidos-empty-state" role="status">
              <p className="pedidos-empty-state__title">Todavía no hay pedidos</p>
              <p className="pedidos-empty-state__text">
                Cuando registres un pedido desde «Pedido», aparecerá acá con fechas, totales e indicadores de pago.
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

      {vistaTab === "proveedores" ? (
        <ProveedoresPage />
      ) : null}
>>>>>>> Stashed changes

      {edit ? (
        <div
          className="drawer-overlay"
          role="dialog"
          aria-modal
          aria-labelledby="edit-pedido-title"
          onClick={() => setEdit(null)}
        >
          <div className="card drawer-overlay-card pedidos-drawer-card" onClick={(e) => e.stopPropagation()}>
            <h3 id="edit-pedido-title" className="pedidos-drawer-card__title">
              Editar pedido #{edit.id}
            </h3>
            <p className="pedidos-drawer-card__lede">
              Solo fechas de pago, montos acordados, estado y notas. Las líneas y el proveedor no se modifican
              aquí.
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
<<<<<<< Updated upstream
              <label className="field">
                <span>Notas</span>
                <input value={editNotas} onChange={(e) => setEditNotas(e.target.value)} />
              </label>
              <div className="actions">
                <button type="button" className="btn ghost" onClick={() => setEdit(null)}>
=======
              <div className="pedidos-field">
                <span className="pedidos-field__label">Notas</span>
                <div className="pedidos-drawer-notes">
                  <EntityNotes
                    notes={editNotasItems}
                    onChange={setEditNotasItems}
                    currentAuthor={currentAuthor}
                    emptyLabel="Sin notas para este pedido."
                  />
                </div>
              </div>
              <div className="pedidos-wizard-footer pedidos-drawer-footer">
                <button type="button" className="pedidos-btn pedidos-btn--ghost" onClick={() => setEdit(null)}>
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======
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
            className="card drawer-overlay-card pedidos-drawer-card pedido-rapido-modal"
            style={{ maxWidth: 480, width: "min(92vw, 480px)", maxHeight: "88vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pedidos-drawer-card__toolbar">
              <h3 id="producto-rapido-title" className="pedidos-drawer-card__title" style={{ margin: 0 }}>
                Pre-registro de producto
              </h3>
              <button
                type="button"
                className="pedidos-btn pedidos-btn--ghost"
                disabled={productoRapidoBusy}
                onClick={() => setProductoRapidoModalOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <form className="pedidos-form pedido-rapido-form" onSubmit={onGuardarProductoRapido}>
              <p className="pedidos-drawer-card__lede" style={{ marginTop: 0 }}>
                Registrá solo datos base para compra inicial (nombre, categoría, descripción y costo de compra). El
                stock real se actualizará al registrar la entrada del pedido.
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
              <div className="pedidos-wizard-footer pedidos-drawer-footer" style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className="pedidos-btn pedidos-btn--ghost"
                  disabled={productoRapidoBusy}
                  onClick={() => setProductoRapidoModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="pedidos-btn pedidos-btn--primary" disabled={productoRapidoBusy}>
                  {productoRapidoBusy ? "Guardando…" : "Guardar y agregar al pedido"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
>>>>>>> Stashed changes
    </>
  );
}
