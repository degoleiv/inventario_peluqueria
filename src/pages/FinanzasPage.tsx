import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowCounterClockwise,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  ChartLineUp,
  Check,
  CurrencyCircleDollar,
  FileArrowUp,
  Paperclip,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  createCobranza,
  createGasto,
  deleteGasto,
  fetchAuthMe,
  fetchCategoriasFinanzaConcepto,
  fetchClientes,
  fetchCobranzas,
  fetchFlujoCaja,
  fetchGastos,
  marcarGastoPago,
  registrarPagoCobranza,
  resolveImageSrc,
  type CategoriaFinanzaConcepto,
  type Cliente,
  type GastoOperativo,
} from "../api";
import { useToast } from "../context/ToastContext";
import { SearchableSelect } from "../components/SearchableSelect";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PromptDialog } from "../components/PromptDialog";

type FinanzasTab = "flujo" | "gastos" | "cobrar";

type CobranzaRow = {
  id: number;
  cliente_nombre: string;
  descripcion: string;
  saldo_pendiente: number;
  monto: number;
  vencimiento: string | null;
  estado: string;
};

type FlujoCaja = {
  ingresos_ventas: number;
  egresos_gastos: number;
  egresos_pedidos_proveedor?: number;
  egresos_compras?: number;
  egresos_total: number;
  resultado_neto: number;
};

function atStartOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseLocalDate(iso: string | null): Date | null {
  if (!iso) return null;
  const part = iso.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  return new Date(y, mo - 1, da);
}

type VencBadge = "vencida" | "por_vencer" | "vigente";

function cobranzaVencimientoBadge(vencimiento: string | null): VencBadge {
  const v = parseLocalDate(vencimiento);
  if (!v) return "vigente";
  const today = atStartOfLocalDay(new Date());
  const diffMs = v.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return "vencida";
  if (diffDays <= 7) return "por_vencer";
  return "vigente";
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

const FIN_CAL_WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const FIN_CAL_MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

type FinCalCell = {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
};

/** Devuelve 6×7 = 42 celdas; primer día de la semana = lunes. */
function buildFinanzasCalendarCells(viewDate: Date): FinCalCell[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const dayJs = firstOfMonth.getDay();
  const offset = (dayJs + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const todayIso = isoDay(new Date());
  const cells: FinCalCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      date: d,
      iso: isoDay(d),
      inMonth: d.getMonth() === month,
      isToday: isoDay(d) === todayIso,
    });
  }
  return cells;
}

export function FinanzasPage() {
  const toast = useToast();
  const [tab, setTab] = useState<FinanzasTab>("flujo");
  const [isAdmin, setIsAdmin] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [flujo, setFlujo] = useState<FlujoCaja | null>(null);
  const [gastos, setGastos] = useState<GastoOperativo[]>([]);
  const [cobranzas, setCobranzas] = useState<CobranzaRow[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [gastoDeletingId, setGastoDeletingId] = useState<number | null>(null);
  const [gastoPagoBusyId, setGastoPagoBusyId] = useState<number | null>(null);
  const [pagoDeudaModal, setPagoDeudaModal] = useState<{ id: number; saldo: number } | null>(null);
  const [pagoDeudaBusy, setPagoDeudaBusy] = useState(false);
  const [confirmDeleteGastoId, setConfirmDeleteGastoId] = useState<number | null>(null);
  const [deleteGastoDialogBusy, setDeleteGastoDialogBusy] = useState(false);
  const [confirmAnularPagoGasto, setConfirmAnularPagoGasto] = useState<GastoOperativo | null>(null);

  const [gMonto, setGMonto] = useState<number | "">("");
  const [gCatId, setGCatId] = useState<number | "">("");
  const [finanzasCategorias, setFinanzasCategorias] = useState<CategoriaFinanzaConcepto[]>([]);
  const [gFecha, setGFecha] = useState(() => new Date().toISOString().slice(0, 10));

  const [calMes, setCalMes] = useState<Date>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [diaDetalleIso, setDiaDetalleIso] = useState<string | null>(null);

  const [cCliente, setCCliente] = useState<number | "">("");
  const [cDesc, setCDesc] = useState("");
  const [cMonto, setCMonto] = useState<number | "">("");
  const [cVenc, setCVenc] = useState("");

  const totalGastosMonto = useMemo(
    () => gastos.reduce((acc, g) => acc + (Number.isFinite(g.monto) ? g.monto : 0), 0),
    [gastos]
  );

  const totalDeudaPendiente = useMemo(
    () =>
      cobranzas.reduce((acc, c) => acc + (Number.isFinite(c.saldo_pendiente) ? c.saldo_pendiente : 0), 0),
    [cobranzas]
  );

  const calCells = useMemo(() => buildFinanzasCalendarCells(calMes), [calMes]);

  /** Mapa de categoría (por nombre, lower) → emoji para usarlo como etiqueta. */
  const emojiPorCategoria = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of finanzasCategorias) {
      if (c.emoji && c.emoji.trim()) m.set(c.nombre.trim().toLowerCase(), c.emoji.trim());
    }
    return m;
  }, [finanzasCategorias]);

  /**
   * Opciones del combobox de categoría para el form de gasto.
   * Cada opción muestra "emoji  nombre" (con fallback 💸 si la categoría no tiene).
   * Solo categorías activas; la categoría es obligatoria (define el concepto).
   */
  const categoriasGastoOptions = useMemo(
    () =>
      finanzasCategorias
        .filter((c) => c.estado !== "inactivo")
        .map((c) => {
          const emoji = c.emoji && c.emoji.trim() ? c.emoji.trim() : "💸";
          return { value: String(c.id), label: `${emoji}  ${c.nombre}` };
        }),
    [finanzasCategorias]
  );

  /** Agrupa los gastos por fecha YYYY-MM-DD. */
  const gastosPorDia = useMemo(() => {
    const m = new Map<string, GastoOperativo[]>();
    for (const g of gastos) {
      const k = (g.fecha || "").slice(0, 10);
      if (!k) continue;
      const arr = m.get(k) ?? [];
      arr.push(g);
      m.set(k, arr);
    }
    return m;
  }, [gastos]);

  const totalDelMes = useMemo(() => {
    const ym = `${calMes.getFullYear()}-${String(calMes.getMonth() + 1).padStart(2, "0")}`;
    return gastos
      .filter((g) => (g.fecha || "").slice(0, 7) === ym)
      .reduce((a, g) => a + (Number.isFinite(g.monto) ? g.monto : 0), 0);
  }, [gastos, calMes]);

  const gastosDelDia = useMemo(() => {
    if (!diaDetalleIso) return [] as GastoOperativo[];
    return gastosPorDia.get(diaDetalleIso) ?? [];
  }, [diaDetalleIso, gastosPorDia]);

  const totalDelDia = useMemo(
    () => gastosDelDia.reduce((a, g) => a + (Number.isFinite(g.monto) ? g.monto : 0), 0),
    [gastosDelDia]
  );

  const goPrevMes = useCallback(
    () => setCalMes((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)),
    []
  );
  const goNextMes = useCallback(
    () => setCalMes((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)),
    []
  );
  const goHoyMes = useCallback(() => {
    const n = new Date();
    setCalMes(new Date(n.getFullYear(), n.getMonth(), 1));
  }, []);

  const abrirRapidoEnDia = useCallback((iso: string) => {
    setGFecha(iso);
    setDiaDetalleIso(null);
    setGMonto("");
    requestAnimationFrame(() => {
      const el = document.getElementById("finanzas-gastos-form-anchor");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, cob, cl, cats] = await Promise.all([
        fetchGastos(),
        fetchCobranzas("pendiente"),
        fetchClientes(),
        fetchCategoriasFinanzaConcepto().catch(() => [] as CategoriaFinanzaConcepto[]),
      ]);
      setGastos(g);
      setCobranzas(cob as CobranzaRow[]);
      setClientes(cl);
      setFinanzasCategorias(cats);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const me = await fetchAuthMe();
        if (cancel) return;
        setIsAdmin(!!me.user.permisos?.includes("*"));
      } catch (e) {
        console.warn("[finanzas] No se pudo verificar permisos de admin:", e);
        if (!cancel) setIsAdmin(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!diaDetalleIso) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDiaDetalleIso(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [diaDetalleIso]);

  async function cargarFlujo() {
    const d = desde.trim();
    const h = hasta.trim();
    if (!d || !h) {
      toast("Elegí fecha Desde y fecha Hasta para el flujo de caja.", "warning");
      return;
    }
    try {
      const f = (await fetchFlujoCaja(d, h)) as FlujoCaja;
      setFlujo(f);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    }
  }

  async function onGasto(e: React.FormEvent) {
    e.preventDefault();
    if (gMonto === "") {
      toast("Ingresá el monto del gasto.", "warning");
      return;
    }
    if (gCatId === "") {
      toast("Elegí una categoría: define el concepto del gasto.", "warning");
      return;
    }
    const cat = finanzasCategorias.find((c) => c.id === Number(gCatId));
    const concepto = cat?.nombre.trim();
    if (!concepto) {
      toast("La categoría seleccionada no es válida.", "error");
      return;
    }
    try {
      await createGasto({
        concepto,
        monto: Number(gMonto),
        fecha: gFecha,
        categoria_finanza_id: Number(gCatId),
      });
      setGMonto("");
      setGCatId("");
      toast("Gasto registrado correctamente.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo registrar (¿admin?)", "error");
    }
  }

  async function onDeuda(e: React.FormEvent) {
    e.preventDefault();
    if (cCliente === "" || !cDesc.trim() || cMonto === "") return;
    try {
      await createCobranza({
        cliente_id: Number(cCliente),
        descripcion: cDesc.trim(),
        monto: Number(cMonto),
        vencimiento: cVenc.trim() || null,
      });
      setCDesc("");
      setCMonto("");
      setCVenc("");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  function openPagoDeudaModal(id: number, saldo: number) {
    setPagoDeudaModal({ id, saldo });
  }

  async function confirmPagoDeuda(trimmed: string) {
    if (!pagoDeudaModal) return;
    const n = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    setPagoDeudaBusy(true);
    try {
      await registrarPagoCobranza(pagoDeudaModal.id, n);
      setPagoDeudaModal(null);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setPagoDeudaBusy(false);
    }
  }

  function requestEliminarGasto(id: number) {
    setConfirmDeleteGastoId(id);
  }

  async function confirmDeleteGastoAction() {
    const id = confirmDeleteGastoId;
    if (id == null) return;
    setGastoDeletingId(id);
    setDeleteGastoDialogBusy(true);
    try {
      await deleteGasto(id);
      setConfirmDeleteGastoId(null);
      toast("Gasto eliminado.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo eliminar", "error");
    } finally {
      setGastoDeletingId(null);
      setDeleteGastoDialogBusy(false);
    }
  }

  /**
   * Marca un gasto como pagado y, opcionalmente, adjunta un comprobante.
   * Abre un input de archivo dinámico (JPG/PNG/WEBP/PDF, máx 1.5 MB).
   * Si el usuario cancela, igualmente queda como pagado pero sin comprobante.
   */
  function pagarGasto(g: GastoOperativo) {
    if (gastoPagoBusyId !== null) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,application/pdf";
    input.style.display = "none";
    document.body.appendChild(input);

    let handled = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    const proceed = async (dataUrl: string | null) => {
      if (handled) return;
      handled = true;
      cleanup();
      setGastoPagoBusyId(g.id);
      try {
        await marcarGastoPago(g.id, {
          pagado: true,
          ...(dataUrl ? { comprobante_url: dataUrl } : {}),
        });
        toast(
          dataUrl
            ? "Gasto marcado como pagado y comprobante adjuntado."
            : "Gasto marcado como pagado.",
          "success"
        );
        await load();
      } catch (err) {
        toast(err instanceof Error ? err.message : "No se pudo registrar el pago", "error");
      } finally {
        setGastoPagoBusyId(null);
      }
    };

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        void proceed(null);
        return;
      }
      const tipoOk =
        file.type.startsWith("image/") || file.type === "application/pdf";
      if (!tipoOk) {
        toast("Adjuntá una imagen (JPG/PNG/WEBP) o un PDF.", "warning");
        cleanup();
        return;
      }
      if (file.size > 1.5 * 1024 * 1024) {
        toast("El comprobante es muy grande (máx. 1.5 MB).", "warning");
        cleanup();
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result;
        void proceed(typeof r === "string" ? r : null);
      };
      reader.onerror = () => {
        toast("No se pudo leer el archivo.", "error");
        cleanup();
      };
      reader.readAsDataURL(file);
    });

    /* Si el usuario cierra el diálogo nativo sin seleccionar archivo, no hay
       evento "change". Marcamos como pagado sin comprobante tras refocus. */
    let pickGuard: ReturnType<typeof setTimeout> | null = null;
    const onFocus = () => {
      pickGuard = setTimeout(() => {
        if (!handled && !input.files?.length) void proceed(null);
        window.removeEventListener("focus", onFocus);
      }, 350);
    };
    window.addEventListener("focus", onFocus, { once: true });
    void pickGuard;

    input.click();
  }

  function requestAnularPagoGasto(g: GastoOperativo) {
    if (gastoPagoBusyId !== null) return;
    setConfirmAnularPagoGasto(g);
  }

  async function confirmAnularPagoGastoAction() {
    const g = confirmAnularPagoGasto;
    if (!g) return;
    setGastoPagoBusyId(g.id);
    try {
      await marcarGastoPago(g.id, { pagado: false, comprobante_url: null });
      setConfirmAnularPagoGasto(null);
      toast("Pago anulado.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo anular el pago", "error");
    } finally {
      setGastoPagoBusyId(null);
    }
  }

  function abrirComprobante(g: GastoOperativo) {
    if (!g.comprobante_url) return;
    const w = window.open();
    if (!w) {
      toast("Permití abrir ventanas para ver el comprobante.", "warning");
      return;
    }
    const srcUrl = resolveImageSrc(g.comprobante_url) ?? g.comprobante_url;
    /* Para data URLs grandes Chrome bloquea el navegador → embebemos en HTML. */
    const isPdf = srcUrl.toLowerCase().startsWith("data:application/pdf");
    const safeName = (g.concepto || `gasto-${g.id}`).replace(/[<>"']/g, "");
    if (isPdf) {
      w.document.write(
        `<!doctype html><html><head><title>${safeName}</title></head><body style="margin:0">` +
          `<embed src="${srcUrl}" type="application/pdf" width="100%" height="100%" style="height:100vh"/>` +
          `</body></html>`
      );
    } else {
      w.document.write(
        `<!doctype html><html><head><title>${safeName}</title></head><body style="margin:0;display:grid;place-items:center;background:#111">` +
          `<img src="${srcUrl}" alt="" style="max-width:100vw;max-height:100vh;object-fit:contain"/>` +
          `</body></html>`
      );
    }
    w.document.close();
  }

  return (
    <div className="page-pedidos page-finanzas">
      <header className="pedidos-hero">
        <div className="pedidos-hero__icon" aria-hidden>
          <CurrencyCircleDollar size={26} weight="duotone" />
        </div>
        <div className="pedidos-hero__copy">
          <p className="pedidos-hero__eyebrow">Control financiero</p>
          <h1 className="pedidos-hero__title">Finanzas</h1>
          <p className="pedidos-hero__lede">
            Flujo de caja por período, registro de gastos operativos y seguimiento de cuentas por cobrar.
            Usá las pestañas para enfocarte en cada área sin recorrer toda la página.
          </p>
        </div>
      </header>

      <nav className="pedidos-segmented" aria-label="Secciones de finanzas" role="tablist">
        {(
          [
            { id: "flujo" as const, label: "Flujo de caja" },
            { id: "gastos" as const, label: "Gastos operativos" },
            { id: "cobrar" as const, label: "Cuentas por cobrar" },
          ] as const
        ).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={
                active ? "pedidos-segmented__tab pedidos-segmented__tab--active" : "pedidos-segmented__tab"
              }
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === "flujo" ? (
        <section className="pedidos-wizard-card finanzas-tab-panel" aria-labelledby="finanzas-flujo-title">
          <div className="pedidos-wizard-card__intro">
            <h2 id="finanzas-flujo-title" className="pedidos-wizard-card__title">
              Flujo de caja
            </h2>
            <p className="pedidos-wizard-card__subtitle">
              Ingresos: suma de ventas en el período. Egresos: gastos operativos más total de pedidos a
              proveedor (valor de líneas). El balance neto es la diferencia.
            </p>
          </div>

          <div className="finanzas-flujo-fechas">
            <div className="pedidos-field">
              <span className="pedidos-field__label">Desde</span>
              <input
                type="date"
                className="pedidos-input"
                value={desde}
                max={hasta || undefined}
                onChange={(e) => setDesde(e.target.value)}
                aria-label="Fecha desde"
              />
            </div>
            <div className="pedidos-field">
              <span className="pedidos-field__label">Hasta</span>
              <input
                type="date"
                className="pedidos-input"
                value={hasta}
                min={desde || undefined}
                onChange={(e) => setHasta(e.target.value)}
                aria-label="Fecha hasta"
              />
            </div>
            <div className="finanzas-flujo-fechas__action">
              <button type="button" className="pedidos-btn pedidos-btn--primary" onClick={() => void cargarFlujo()}>
                Calcular
              </button>
            </div>
          </div>

          {flujo ? (
            <div className="finanzas-flujo-grid">
              <article className="finanzas-stat-card finanzas-stat-card--ingresos">
                <div className="finanzas-stat-card__eyebrow">Total ingresos</div>
                <div className="finanzas-stat-card__value">{flujo.ingresos_ventas.toFixed(2)}</div>
                <p className="finanzas-stat-card__hint">Ventas en el período</p>
              </article>
              <article className="finanzas-stat-card finanzas-stat-card--egresos">
                <div className="finanzas-stat-card__eyebrow">Total egresos</div>
                <div className="finanzas-stat-card__value">{flujo.egresos_total.toFixed(2)}</div>
                <p className="finanzas-stat-card__hint">
                  Gastos {flujo.egresos_gastos.toFixed(2)} + pedidos{" "}
                  {(flujo.egresos_pedidos_proveedor ?? flujo.egresos_compras ?? 0).toFixed(2)}
                </p>
              </article>
              <article className="finanzas-stat-card finanzas-stat-card--balance">
                <div className="finanzas-stat-card__eyebrow">Balance neto</div>
                <div className="finanzas-stat-card__value">{flujo.resultado_neto.toFixed(2)}</div>
                <p className="finanzas-stat-card__hint">Ingresos − egresos totales</p>
              </article>
            </div>
          ) : (
            <div className="finanzas-empty" role="status">
              <div className="finanzas-empty__icon" aria-hidden>
                <ChartLineUp size={44} weight="duotone" />
              </div>
              <p className="finanzas-empty__title">Aún no hay resultado</p>
              <p className="finanzas-empty__text">
                Completá las fechas <strong>Desde</strong> y <strong>Hasta</strong> y pulsá{" "}
                <strong>Calcular</strong> para ver el resumen con ingresos, egresos y balance.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {tab === "gastos" ? (
        <>
          <section
            id="finanzas-gastos-form-anchor"
            className="pedidos-wizard-card finanzas-tab-panel"
            aria-labelledby="finanzas-gastos-title"
          >
            <div className="pedidos-wizard-card__intro">
              <h2 id="finanzas-gastos-title" className="pedidos-wizard-card__title">
                Registrar gasto
              </h2>
              <p className="pedidos-wizard-card__subtitle">
                Arriendo, servicios, insumos administrativos, etc. Solo administrador. La{" "}
                <strong>categoría</strong> define el concepto del gasto. Las categorías se gestionan en{" "}
                <Link to="/configuracion/parametros" className="finanzas-inline-link">
                  Parámetros generales
                </Link>
                .
              </p>
            </div>
            {loading ? <p className="pedidos-inline-hint">Cargando lista…</p> : null}
            <form className="finanzas-form-card" onSubmit={onGasto}>
              <div className="pedidos-form-grid">
                <div className="pedidos-field finanzas-cat-field">
                  <SearchableSelect
                    label="Categoría *"
                    value={gCatId === "" ? "" : String(gCatId)}
                    onChange={(v) => setGCatId(v === "" ? "" : Number(v))}
                    options={categoriasGastoOptions}
                    placeholder="Buscar categoría…"
                    idleTextWhenEmpty="Elegí una categoría…"
                    emptySlot={
                      <p className="muted small">
                        Aún no hay categorías. Creá una en{" "}
                        <Link to="/configuracion/parametros" className="finanzas-inline-link">
                          Parámetros generales
                        </Link>
                        .
                      </p>
                    }
                  />
                </div>
                <div className="pedidos-field">
                  <span className="pedidos-field__label">Monto *</span>
                  <input
                    className="pedidos-input"
                    type="number"
                    min={0}
                    step={0.01}
                    value={gMonto}
                    onChange={(e) => setGMonto(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="Ej: 450000"
                    required
                  />
                </div>
                <div className="pedidos-field">
                  <span className="pedidos-field__label">Fecha</span>
                  <input
                    className="pedidos-input"
                    type="date"
                    value={gFecha}
                    onChange={(e) => setGFecha(e.target.value)}
                  />
                </div>
              </div>
              <div className="pedidos-actions-row pedidos-actions-row--start" style={{ marginTop: "18px" }}>
                <button type="submit" className="pedidos-btn pedidos-btn--primary">
                  Registrar gasto
                </button>
              </div>
            </form>
          </section>

          <section
            className="pedidos-wizard-card finanzas-tab-panel"
            aria-labelledby="finanzas-gastos-cal"
          >
            <div className="pedidos-wizard-card__intro fin-cal-intro">
              <div>
                <h2 id="finanzas-gastos-cal" className="pedidos-wizard-card__title">
                  Calendario de gastos
                </h2>
                <p className="pedidos-wizard-card__subtitle">
                  Cada gasto aparece como etiqueta en el día. Tocá un día para ver el detalle o registrar
                  uno nuevo.
                </p>
              </div>
              <div className="fin-cal-total" aria-live="polite">
                <span className="fin-cal-total__label">Total del mes</span>
                <span className="fin-cal-total__value">{totalDelMes.toFixed(2)}</span>
              </div>
            </div>

            <div className="fin-cal-toolbar">
              <button
                type="button"
                className="fin-cal-nav"
                onClick={goPrevMes}
                aria-label="Mes anterior"
                title="Mes anterior"
              >
                <CaretLeft size={18} weight="bold" aria-hidden />
              </button>
              <div className="fin-cal-title" aria-live="polite">
                {FIN_CAL_MONTH_NAMES[calMes.getMonth()]} {calMes.getFullYear()}
              </div>
              <button
                type="button"
                className="fin-cal-nav"
                onClick={goNextMes}
                aria-label="Mes siguiente"
                title="Mes siguiente"
              >
                <CaretRight size={18} weight="bold" aria-hidden />
              </button>
              <button
                type="button"
                className="fin-cal-today"
                onClick={goHoyMes}
                title="Ir al mes actual"
              >
                Hoy
              </button>
            </div>

            <div
              className="fin-cal-grid"
              role="grid"
              aria-label={`Calendario de ${FIN_CAL_MONTH_NAMES[calMes.getMonth()]} ${calMes.getFullYear()}`}
            >
              {FIN_CAL_WEEKDAYS.map((wd) => (
                <div key={`wd-${wd}`} className="fin-cal-weekday" role="columnheader">
                  {wd}
                </div>
              ))}
              {calCells.map((cell) => {
                const items = gastosPorDia.get(cell.iso) ?? [];
                const visibles = items.slice(0, 3);
                const restantes = items.length - visibles.length;
                const totalDay = items.reduce(
                  (a, g) => a + (Number.isFinite(g.monto) ? g.monto : 0),
                  0
                );
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    role="gridcell"
                    className={`fin-cal-day ${cell.inMonth ? "" : "fin-cal-day--out"} ${
                      cell.isToday ? "fin-cal-day--today" : ""
                    } ${items.length > 0 ? "fin-cal-day--has" : ""}`}
                    onClick={() => {
                      if (items.length > 0) setDiaDetalleIso(cell.iso);
                      else abrirRapidoEnDia(cell.iso);
                    }}
                    aria-label={
                      items.length > 0
                        ? `${cell.iso}: ${items.length} gasto${items.length === 1 ? "" : "s"}, total ${totalDay.toFixed(2)}`
                        : `${cell.iso}: sin gastos. Tocar para registrar uno`
                    }
                  >
                    <span className="fin-cal-day__num">{cell.date.getDate()}</span>
                    {items.length > 0 ? (
                      <ul className="fin-cal-day__chips" aria-hidden>
                        {visibles.map((g) => {
                          const emoji = g.categoria
                            ? emojiPorCategoria.get(g.categoria.trim().toLowerCase())
                            : null;
                          return (
                            <li key={g.id} className="fin-cal-chip" title={`${g.concepto} · ${g.monto.toFixed(2)}`}>
                              <span className="fin-cal-chip__emoji" aria-hidden>
                                {emoji ?? "💸"}
                              </span>
                              <span className="fin-cal-chip__txt">{g.concepto}</span>
                            </li>
                          );
                        })}
                        {restantes > 0 ? (
                          <li className="fin-cal-chip fin-cal-chip--more">+{restantes} más</li>
                        ) : null}
                      </ul>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="pedidos-wizard-card finanzas-tab-panel" aria-labelledby="finanzas-gastos-lista">
            <h2 id="finanzas-gastos-lista" className="pedidos-wizard-card__title">
              Historial de gastos
            </h2>
            <p className="pedidos-wizard-card__subtitle">Últimos movimientos registrados (orden por fecha).</p>
            {gastos.length > 0 ? (
              <div className="finanzas-table-wrap">
                <table className="finanzas-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Concepto</th>
                      <th>Categoría</th>
                      <th className="finanzas-table__th-monto">Monto</th>
                      <th>Estado</th>
                      <th aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.map((g) => {
                      const pagado = g.pagado === 1;
                      const pagoBusy = gastoPagoBusyId === g.id;
                      return (
                        <tr key={g.id}>
                          <td className="finanzas-table__mono">{g.fecha}</td>
                          <td>{g.concepto}</td>
                          <td>{g.categoria ?? "—"}</td>
                          <td className="finanzas-monto-out">{g.monto.toFixed(2)}</td>
                          <td>
                            {pagado ? (
                              <span className="fin-cal-day-item__badge fin-cal-day-item__badge--paid">
                                <Check size={11} weight="bold" aria-hidden /> Pagado
                              </span>
                            ) : (
                              <span className="fin-cal-day-item__badge fin-cal-day-item__badge--pending">
                                Pendiente
                              </span>
                            )}
                          </td>
                          <td className="finanzas-table__td-accion">
                            <div className="fin-cal-day-item__acts">
                              {g.comprobante_url ? (
                                <button
                                  type="button"
                                  className="finanzas-icon-btn"
                                  title="Ver comprobante"
                                  aria-label="Ver comprobante"
                                  onClick={() => abrirComprobante(g)}
                                >
                                  <Paperclip size={16} weight="bold" />
                                </button>
                              ) : null}
                              {isAdmin && !pagado ? (
                                <button
                                  type="button"
                                  className="finanzas-icon-btn finanzas-icon-btn--accent"
                                  title="Marcar como pagado (opcional: subir comprobante)"
                                  aria-label="Marcar como pagado"
                                  disabled={pagoBusy}
                                  onClick={() => pagarGasto(g)}
                                >
                                  <FileArrowUp size={16} weight="bold" />
                                </button>
                              ) : null}
                              {isAdmin && pagado ? (
                                <>
                                  <button
                                    type="button"
                                    className="finanzas-icon-btn"
                                    title="Cambiar comprobante"
                                    aria-label="Cambiar comprobante"
                                    disabled={pagoBusy}
                                    onClick={() => pagarGasto(g)}
                                  >
                                    <FileArrowUp size={16} weight="bold" />
                                  </button>
                                  <button
                                    type="button"
                                    className="finanzas-icon-btn"
                                    title="Anular pago"
                                    aria-label="Anular pago"
                                    disabled={pagoBusy}
                                    onClick={() => requestAnularPagoGasto(g)}
                                  >
                                    <ArrowCounterClockwise size={16} weight="bold" />
                                  </button>
                                </>
                              ) : null}
                              {isAdmin ? (
                                <button
                                  type="button"
                                  className="finanzas-icon-btn"
                                  title="Eliminar gasto"
                                  aria-label="Eliminar gasto"
                                  disabled={gastoDeletingId === g.id}
                                  onClick={() => requestEliminarGasto(g.id)}
                                >
                                  <Trash size={16} weight="bold" />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="finanzas-total-row">
                      <td colSpan={3}>Total</td>
                      <td className="finanzas-monto-out">{totalGastosMonto.toFixed(2)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="finanzas-empty finanzas-empty--compact" role="status">
                <p className="finanzas-empty__title">Sin gastos registrados</p>
                <p className="finanzas-empty__text">Cuando registres movimientos, aparecerán en esta tabla.</p>
              </div>
            )}
          </section>
        </>
      ) : null}

      {diaDetalleIso ? (
        <div
          className="drawer-overlay fin-cal-day-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fin-cal-day-title"
        >
          <div
            className="card drawer-overlay-card fin-cal-day-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="fin-cal-day-modal__head">
              <div className="fin-cal-day-modal__head-text">
                <p className="fin-cal-day-modal__eyebrow">
                  <CalendarBlank size={14} weight="bold" aria-hidden /> Gastos del día
                </p>
                <h3 id="fin-cal-day-title" className="fin-cal-day-modal__title">
                  {diaDetalleIso}
                </h3>
              </div>
              <button
                type="button"
                className="fin-cal-day-modal__close"
                onClick={() => setDiaDetalleIso(null)}
                aria-label="Cerrar"
                title="Cerrar"
              >
                <X size={18} weight="bold" aria-hidden />
              </button>
            </header>

            {gastosDelDia.length > 0 ? (
              <ul className="fin-cal-day-list">
                {gastosDelDia.map((g) => {
                  const emoji = g.categoria
                    ? emojiPorCategoria.get(g.categoria.trim().toLowerCase())
                    : null;
                  const pagado = g.pagado === 1;
                  const pagoBusy = gastoPagoBusyId === g.id;
                  return (
                    <li
                      key={g.id}
                      className={`fin-cal-day-item ${pagado ? "fin-cal-day-item--paid" : ""}`}
                    >
                      <div className="fin-cal-day-item__main">
                        <span className="fin-cal-day-item__emoji" aria-hidden>
                          {emoji ?? "💸"}
                        </span>
                        <div className="fin-cal-day-item__txt">
                          <div className="fin-cal-day-item__concept">{g.concepto}</div>
                          <div className="fin-cal-day-item__sub">
                            {g.categoria ? (
                              <span className="muted small">{g.categoria}</span>
                            ) : null}
                            {pagado ? (
                              <span className="fin-cal-day-item__badge fin-cal-day-item__badge--paid">
                                <Check size={11} weight="bold" aria-hidden /> Pagado
                              </span>
                            ) : (
                              <span className="fin-cal-day-item__badge fin-cal-day-item__badge--pending">
                                Pendiente
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="fin-cal-day-item__monto">{g.monto.toFixed(2)}</div>
                      <div className="fin-cal-day-item__acts">
                        {g.comprobante_url ? (
                          <button
                            type="button"
                            className="finanzas-icon-btn"
                            title="Ver comprobante"
                            aria-label="Ver comprobante"
                            onClick={() => abrirComprobante(g)}
                          >
                            <Paperclip size={16} weight="bold" />
                          </button>
                        ) : null}
                        {isAdmin && !pagado ? (
                          <button
                            type="button"
                            className="finanzas-icon-btn finanzas-icon-btn--accent"
                            title={
                              g.comprobante_url
                                ? "Marcar pagado y reemplazar comprobante"
                                : "Marcar como pagado (opcional: subir comprobante)"
                            }
                            aria-label="Marcar como pagado"
                            disabled={pagoBusy}
                            onClick={() => pagarGasto(g)}
                          >
                            <FileArrowUp size={16} weight="bold" />
                          </button>
                        ) : null}
                        {isAdmin && pagado ? (
                          <>
                            <button
                              type="button"
                              className="finanzas-icon-btn"
                              title="Cambiar comprobante"
                              aria-label="Cambiar comprobante"
                              disabled={pagoBusy}
                              onClick={() => pagarGasto(g)}
                            >
                              <FileArrowUp size={16} weight="bold" />
                            </button>
                            <button
                              type="button"
                              className="finanzas-icon-btn"
                              title="Anular pago"
                              aria-label="Anular pago"
                              disabled={pagoBusy}
                              onClick={() => requestAnularPagoGasto(g)}
                            >
                              <ArrowCounterClockwise size={16} weight="bold" />
                            </button>
                          </>
                        ) : null}
                        {isAdmin ? (
                          <button
                            type="button"
                            className="finanzas-icon-btn fin-cal-day-item__del"
                            title="Eliminar gasto"
                            aria-label="Eliminar gasto"
                            disabled={gastoDeletingId === g.id}
                            onClick={() => requestEliminarGasto(g.id)}
                          >
                            <Trash size={16} weight="bold" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="finanzas-empty finanzas-empty--compact" role="status">
                <p className="finanzas-empty__title">Sin gastos en este día</p>
                <p className="finanzas-empty__text">
                  Tocá «Registrar gasto en este día» para añadir uno.
                </p>
              </div>
            )}

            {gastosDelDia.length > 0 ? (
              <div className="fin-cal-day-modal__total">
                <span>Total del día</span>
                <strong>{totalDelDia.toFixed(2)}</strong>
              </div>
            ) : null}

            <div className="fin-cal-day-modal__actions">
              <button
                type="button"
                className="pedidos-btn pedidos-btn--secondary"
                onClick={() => setDiaDetalleIso(null)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="pedidos-btn pedidos-btn--primary"
                onClick={() => abrirRapidoEnDia(diaDetalleIso)}
              >
                <Plus size={16} weight="bold" aria-hidden /> Registrar gasto en este día
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "cobrar" ? (
        <>
          <section className="pedidos-wizard-card finanzas-tab-panel" aria-labelledby="finanzas-cobrar-form">
            <div className="pedidos-wizard-card__intro">
              <h2 id="finanzas-cobrar-form" className="pedidos-wizard-card__title">
                Nueva cuenta por cobrar
              </h2>
              <p className="pedidos-wizard-card__subtitle">
                Registrá deudas de clientes con monto y vencimiento. Los pagos se registran desde la tabla inferior.
              </p>
            </div>
            <form className="finanzas-form-card" onSubmit={onDeuda}>
              <div className="pedidos-form-grid">
                <div className="pedidos-field">
                  <span className="pedidos-field__label">Cliente</span>
                  <select
                    className="pedidos-select"
                    value={cCliente === "" ? "" : String(cCliente)}
                    onChange={(e) => setCCliente(e.target.value === "" ? "" : Number(e.target.value))}
                    required
                    aria-label="Cliente"
                  >
                    <option value="">Seleccioná un cliente</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pedidos-field">
                  <span className="pedidos-field__label">Monto</span>
                  <input
                    className="pedidos-input"
                    type="number"
                    min={0}
                    step={0.01}
                    value={cMonto}
                    onChange={(e) => setCMonto(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="Ej: 125000"
                    required
                  />
                </div>
                <div className="pedidos-field finanzas-field-span-2">
                  <span className="pedidos-field__label">Descripción</span>
                  <input
                    className="pedidos-input"
                    value={cDesc}
                    onChange={(e) => setCDesc(e.target.value)}
                    placeholder="Ej: Venta fiada — tintura + corte"
                    required
                  />
                </div>
                <div className="pedidos-field">
                  <span className="pedidos-field__label">Vencimiento</span>
                  <input
                    className="pedidos-input"
                    type="date"
                    value={cVenc}
                    onChange={(e) => setCVenc(e.target.value)}
                    aria-label="Vencimiento"
                  />
                </div>
              </div>
              <div className="pedidos-actions-row pedidos-actions-row--start" style={{ marginTop: "18px" }}>
                <button type="submit" className="pedidos-btn pedidos-btn--primary">
                  Registrar deuda
                </button>
              </div>
            </form>
          </section>

          <section className="pedidos-wizard-card finanzas-tab-panel" aria-labelledby="finanzas-cobrar-lista">
            <h2 id="finanzas-cobrar-lista" className="pedidos-wizard-card__title">
              Cuentas pendientes
            </h2>
            <p className="pedidos-wizard-card__subtitle">Saldo actual y vencimiento por cada deuda abierta.</p>
            {cobranzas.length > 0 ? (
              <>
                <div className="finanzas-deuda-chip" role="status">
                  <span className="finanzas-deuda-chip__label">Deuda pendiente total</span>
                  <span className="finanzas-deuda-chip__value">{totalDeudaPendiente.toFixed(2)}</span>
                </div>
                <div className="finanzas-table-wrap">
                  <table className="finanzas-table">
                    <thead>
                      <tr>
                        <th>Cliente / detalle</th>
                        <th>Estado</th>
                        <th>Saldo</th>
                        <th>Venc.</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {cobranzas.map((c) => {
                        const badge = cobranzaVencimientoBadge(c.vencimiento);
                        const badgeClass =
                          badge === "vencida"
                            ? "finanzas-badge finanzas-badge--vencida"
                            : badge === "por_vencer"
                              ? "finanzas-badge finanzas-badge--por-vencer"
                              : "finanzas-badge finanzas-badge--vigente";
                        const badgeLabel =
                          badge === "vencida" ? "Vencida" : badge === "por_vencer" ? "Por vencer" : "Vigente";
                        return (
                          <tr key={c.id}>
                            <td>
                              <div className="finanzas-cell-main">{c.cliente_nombre}</div>
                              <div className="finanzas-cell-sub">{c.descripcion}</div>
                            </td>
                            <td>
                              <span className={badgeClass}>{badgeLabel}</span>
                            </td>
                            <td className="finanzas-table__mono">{Number(c.saldo_pendiente).toFixed(2)}</td>
                            <td className="finanzas-table__mono">{c.vencimiento ?? "—"}</td>
                            <td>
                              <button
                                type="button"
                                className="finanzas-pill-pago"
                                onClick={() => openPagoDeudaModal(c.id, c.saldo_pendiente)}
                              >
                                <Check size={16} weight="bold" aria-hidden />
                                Registrar pago
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="finanzas-empty finanzas-empty--compact" role="status">
                <p className="finanzas-empty__title">No hay cuentas pendientes</p>
                <p className="finanzas-empty__text">Cuando registres una deuda, aparecerá en esta lista.</p>
              </div>
            )}
          </section>
        </>
      ) : null}

      <PromptDialog
        open={pagoDeudaModal != null}
        title="Registrar pago"
        description={
          pagoDeudaModal ? (
            <>
              Monto a registrar (máximo <strong>{pagoDeudaModal.saldo.toFixed(2)}</strong>).
            </>
          ) : null
        }
        inputLabel="Monto"
        inputType="number"
        inputMode="decimal"
        defaultValue={pagoDeudaModal ? String(pagoDeudaModal.saldo) : ""}
        confirmLabel="Registrar"
        cancelLabel="Cancelar"
        busy={pagoDeudaBusy}
        validate={(t) => {
          if (!pagoDeudaModal) return null;
          const n = Number(t.replace(",", "."));
          if (!Number.isFinite(n) || n <= 0) return "Ingresá un monto válido mayor a cero.";
          if (n > pagoDeudaModal.saldo + 1e-9) {
            return `El monto no puede superar el saldo pendiente (${pagoDeudaModal.saldo.toFixed(2)}).`;
          }
          return null;
        }}
        onCancel={() => !pagoDeudaBusy && setPagoDeudaModal(null)}
        onConfirm={(t) => void confirmPagoDeuda(t)}
      />

      <ConfirmDialog
        open={confirmDeleteGastoId != null}
        title="Eliminar gasto"
        description="¿Eliminar este gasto? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        busy={deleteGastoDialogBusy}
        onCancel={() => !deleteGastoDialogBusy && setConfirmDeleteGastoId(null)}
        onConfirm={() => void confirmDeleteGastoAction()}
      />

      <ConfirmDialog
        open={confirmAnularPagoGasto != null}
        title="Anular pago del gasto"
        description={
          confirmAnularPagoGasto ? (
            <>
              ¿Anular el pago de <strong>«{confirmAnularPagoGasto.concepto}»</strong>? Se quitará la fecha de pago
              y el comprobante adjunto (si lo hay).
            </>
          ) : null
        }
        confirmLabel="Anular pago"
        cancelLabel="Volver"
        variant="danger"
        busy={confirmAnularPagoGasto != null && gastoPagoBusyId === confirmAnularPagoGasto.id}
        onCancel={() => {
          const busy = confirmAnularPagoGasto != null && gastoPagoBusyId === confirmAnularPagoGasto.id;
          if (!busy) setConfirmAnularPagoGasto(null);
        }}
        onConfirm={() => void confirmAnularPagoGastoAction()}
      />
    </div>
  );
}
