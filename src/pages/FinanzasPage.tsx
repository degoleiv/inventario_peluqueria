import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChartLineUp, Check, CurrencyCircleDollar, Trash } from "@phosphor-icons/react";
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
  registrarPagoCobranza,
  type CategoriaFinanzaConcepto,
  type Cliente,
  type GastoOperativo,
} from "../api";
import { useToast } from "../context/ToastContext";

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

  const [gConcepto, setGConcepto] = useState("");
  const [gMonto, setGMonto] = useState<number | "">("");
  const [gCatId, setGCatId] = useState<number | "">("");
  const [finanzasCategorias, setFinanzasCategorias] = useState<CategoriaFinanzaConcepto[]>([]);
  const [gFecha, setGFecha] = useState(() => new Date().toISOString().slice(0, 10));

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
      } catch {
        if (!cancel) setIsAdmin(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

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
    if (!gConcepto.trim() || gMonto === "") return;
    try {
      await createGasto({
        concepto: gConcepto.trim(),
        monto: Number(gMonto),
        fecha: gFecha,
        ...(gCatId === "" ? {} : { categoria_finanza_id: Number(gCatId) }),
      });
      setGConcepto("");
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

  async function pagoDeuda(id: number, saldo: number) {
    const m = window.prompt(`Monto a registrar (máx ${saldo.toFixed(2)}):`, String(saldo));
    if (m == null) return;
    const n = Number(m);
    if (!Number.isFinite(n) || n <= 0) return;
    try {
      await registrarPagoCobranza(id, n);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  }

  async function onEliminarGasto(id: number) {
    if (!window.confirm("¿Eliminar este gasto? Esta acción no se puede deshacer.")) return;
    setGastoDeletingId(id);
    try {
      await deleteGasto(id);
      toast("Gasto eliminado.", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo eliminar", "error");
    } finally {
      setGastoDeletingId(null);
    }
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
          <section className="pedidos-wizard-card finanzas-tab-panel" aria-labelledby="finanzas-gastos-title">
            <div className="pedidos-wizard-card__intro">
              <h2 id="finanzas-gastos-title" className="pedidos-wizard-card__title">
                Registrar gasto
              </h2>
              <p className="pedidos-wizard-card__subtitle">
                Arriendo, servicios, insumos administrativos, etc. Solo administrador. Las categorías se gestionan
                en{" "}
                <Link to="/configuracion/parametros" className="finanzas-inline-link">
                  Parámetros generales
                </Link>
                .
              </p>
            </div>
            {loading ? <p className="pedidos-inline-hint">Cargando lista…</p> : null}
            <form className="finanzas-form-card" onSubmit={onGasto}>
              <div className="pedidos-form-grid">
                <div className="pedidos-field">
                  <span className="pedidos-field__label">Concepto</span>
                  <input
                    className="pedidos-input"
                    value={gConcepto}
                    onChange={(e) => setGConcepto(e.target.value)}
                    placeholder="Ej: Arriendo local"
                    required
                  />
                </div>
                <div className="pedidos-field">
                  <span className="pedidos-field__label">Monto</span>
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
                  <span className="pedidos-field__label">Categoría</span>
                  <select
                    className="pedidos-select"
                    value={gCatId === "" ? "" : String(gCatId)}
                    onChange={(e) => setGCatId(e.target.value === "" ? "" : Number(e.target.value))}
                    aria-label="Categoría"
                  >
                    <option value="">Sin categoría</option>
                    {finanzasCategorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
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
                      {isAdmin ? <th className="finanzas-table__th-accion" aria-label="Eliminar" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {gastos.map((g) => (
                      <tr key={g.id}>
                        <td className="finanzas-table__mono">{g.fecha}</td>
                        <td>{g.concepto}</td>
                        <td>{g.categoria ?? "—"}</td>
                        <td className="finanzas-monto-out">{g.monto.toFixed(2)}</td>
                        {isAdmin ? (
                          <td className="finanzas-table__td-accion">
                            <button
                              type="button"
                              className="finanzas-icon-btn"
                              title="Eliminar gasto"
                              disabled={gastoDeletingId === g.id}
                              onClick={() => void onEliminarGasto(g.id)}
                              aria-label="Eliminar gasto"
                            >
                              <Trash size={18} weight="bold" />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                    <tr className="finanzas-total-row">
                      <td colSpan={3}>Total</td>
                      <td className="finanzas-monto-out">{totalGastosMonto.toFixed(2)}</td>
                      {isAdmin ? <td /> : null}
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
                                onClick={() => void pagoDeuda(c.id, c.saldo_pendiente)}
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
    </div>
  );
}
