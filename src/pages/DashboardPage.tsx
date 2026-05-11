import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchDashboard, type DashboardStats, type ProximaCitaDia } from "../api";
import { useToast } from "../context/ToastContext";

const DEMO_TRENDS = {
  ventas_hoy_pct: 12,
  ventas_mes_pct: -3,
  citas_hoy_pct: 8,
  stock_pct: -5,
  servicios_pct: 15,
} as const;

const DEMO_TOP_SERVICIOS = [
  { nombre: "Corte dama", unidades: 28 },
  { nombre: "Coloración completa", unidades: 14 },
  { nombre: "Brushing / peinado", unidades: 22 },
  { nombre: "Barba + cejas", unidades: 11 },
  { nombre: "Tratamiento keratina", unidades: 6 },
];

const DEMO_PROXIMAS = (fecha: string): ProximaCitaDia[] => [
  { inicio: `${fecha}T09:30:00`, cliente_nombre: "Laura Méndez", servicio: "Corte + brushing" },
  { inicio: `${fecha}T11:00:00`, cliente_nombre: "Carla Ruiz", servicio: "Coloración raíz" },
  { inicio: `${fecha}T14:15:00`, cliente_nombre: "Marina Díaz", servicio: "Manicura semipermanente" },
  { inicio: `${fecha}T16:45:00`, cliente_nombre: "Sofía Herrera", servicio: "Corte caballero" },
];

function makeDemoIngresos7d(): DashboardStats["ingresos_7d"] {
  const valores = [14200, 11800, 16500, 20100, 8900, 15400, 22300];
  const out: DashboardStats["ingresos_7d"] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dia = d.toISOString().slice(0, 10);
    const ingresos = valores[6 - i] ?? 12000;
    out.push({ dia, ingresos, cantidad_ventas: 3 + ((6 - i) % 4) });
  }
  return out;
}

function normalizeApi(d: DashboardStats): DashboardStats {
  return {
    ...d,
    top_servicios: Array.isArray(d.top_servicios) ? d.top_servicios : [],
    proximas_citas_hoy: Array.isArray(d.proximas_citas_hoy) ? d.proximas_citas_hoy : [],
  };
}

type DashboardView = DashboardStats & { trends: typeof DEMO_TRENDS };

function buildDisplay(data: DashboardStats): DashboardView {
  const n = normalizeApi(data);
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...n,
    trends: DEMO_TRENDS,
    ventas_hoy_total: n.ventas_hoy_total > 0 ? n.ventas_hoy_total : 85230.5,
    ventas_hoy_cantidad: n.ventas_hoy_cantidad > 0 ? n.ventas_hoy_cantidad : 5,
    ventas_mes_total: n.ventas_mes_total > 0 ? n.ventas_mes_total : 324_500,
    ventas_mes_cantidad: n.ventas_mes_cantidad > 0 ? n.ventas_mes_cantidad : 42,
    citas_hoy: n.citas_hoy > 0 ? n.citas_hoy : 3,
    productos_bajo_stock: n.productos_bajo_stock,
    productos_total: n.productos_total > 0 ? n.productos_total : 186,
    clientes_total: n.clientes_total > 0 ? n.clientes_total : 412,
    ingresos_7d: n.ingresos_7d.length > 0 ? n.ingresos_7d : makeDemoIngresos7d(),
    top_servicios: n.top_servicios.length > 0 ? n.top_servicios : DEMO_TOP_SERVICIOS,
    proximas_citas_hoy: n.proximas_citas_hoy.length > 0 ? n.proximas_citas_hoy : DEMO_PROXIMAS(today),
  };
}

function formatHoraCita(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

function Trend({ pct }: { pct: number }) {
  if (pct === 0) {
    return <span className="dash-trend dash-trend--flat">sin variación vs ayer</span>;
  }
  const up = pct > 0;
  return (
    <span className={`dash-trend ${up ? "dash-trend--up" : "dash-trend--down"}`}>
      {up ? "↑" : "↓"} {Math.abs(pct)}% vs ayer
    </span>
  );
}

function IconIngresos() {
  return (
    <svg className="dash-metric__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 7v10M9.5 10.5h5M9.5 13.5h3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconVentasMes() {
  return (
    <svg className="dash-metric__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="6" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function IconCitas() {
  return (
    <svg className="dash-metric__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.6" fill="currentColor" />
    </svg>
  );
}

function IconStock() {
  return (
    <svg className="dash-metric__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 8l7-4 7 4v8l-7 4-7-4V8z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M12 4v8l7-4" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}

function IconServicios() {
  return (
    <svg className="dash-metric__icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 11c2-3 5-3 7 0s5 3 7 0M5 15h2M17 15h2M9 19h6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="16" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

export function DashboardPage() {
  const toast = useToast();
  const [raw, setRaw] = useState<DashboardStats | null>(null);
  const [dashLoadFailed, setDashLoadFailed] = useState(false);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const d = await fetchDashboard();
        if (!cancel) {
          setRaw(d);
          setDashLoadFailed(false);
        }
      } catch (e) {
        if (!cancel) {
          setDashLoadFailed(true);
          toast(e instanceof Error ? e.message : "Error", "error");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [toast]);

  function retryDashboard() {
    setDashLoadFailed(false);
    setRaw(null);
    void (async () => {
      try {
        const d = await fetchDashboard();
        setRaw(d);
        setDashLoadFailed(false);
      } catch (e) {
        setDashLoadFailed(true);
        toast(e instanceof Error ? e.message : "Error", "error");
      }
    })();
  }

  const data = useMemo<DashboardView | null>(() => (raw ? buildDisplay(raw) : null), [raw]);

  if (!data) {
    return (
      <div className="clay-empty" role="status">
        {dashLoadFailed ? (
          <>
            <p>No pudimos cargar el resumen.</p>
            <button type="button" className="btn" onClick={retryDashboard}>
              Reintentar
            </button>
          </>
        ) : (
          "Cargando resumen del negocio…"
        )}
      </div>
    );
  }

  const maxIngresoDia =
    data.ingresos_7d.length === 0 ? 1 : Math.max(...data.ingresos_7d.map((r) => r.ingresos), 1);
  const maxServicios =
    data.top_servicios.length === 0 ? 1 : Math.max(...data.top_servicios.map((p) => p.unidades), 1);

  const trends = data.trends;

  return (
    <div className="dash-page">
      <div className="dash-row dash-row--negocio">
        <article className="dash-metric dash-metric--hero">
          <div className="dash-metric__head">
            <IconIngresos />
            <span className="dash-metric__label">Ingresos hoy</span>
          </div>
          <div className="dash-metric__value dash-metric__value--hero">
            {data.ventas_hoy_total.toLocaleString("es-AR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="dash-metric__meta">{data.ventas_hoy_cantidad} ventas</div>
          <Trend pct={trends.ventas_hoy_pct} />
        </article>

        <article className="dash-metric">
          <div className="dash-metric__head">
            <IconVentasMes />
            <span className="dash-metric__label">Ventas del mes</span>
          </div>
          <div className="dash-metric__value">
            {data.ventas_mes_total.toLocaleString("es-AR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="dash-metric__meta">{data.ventas_mes_cantidad} tickets</div>
          <Trend pct={trends.ventas_mes_pct} />
        </article>

        <article className={`dash-metric${raw && raw.citas_hoy > 0 ? " dash-metric--citas-ok" : ""}`}>
          <div className="dash-metric__head">
            <IconCitas />
            <span className="dash-metric__label">Citas hoy</span>
          </div>
          <div className="dash-metric__value">{data.citas_hoy}</div>
          <div className="dash-metric__meta">no canceladas</div>
          <Trend pct={trends.citas_hoy_pct} />
        </article>
      </div>

      <div className="dash-row dash-row--operativas">
        <article
          className={`dash-metric dash-metric--compact${raw && raw.productos_bajo_stock > 0 ? " dash-metric--stock-alert" : ""}`}
        >
          <div className="dash-metric__head">
            <IconStock />
            <span className="dash-metric__label">Stock bajo (≤ mín.)</span>
          </div>
          <div className="dash-metric__value">{data.productos_bajo_stock}</div>
          <div className="dash-metric__meta">productos</div>
          <Trend pct={trends.stock_pct} />
        </article>

        <article className="dash-metric dash-metric--stretch">
          <div className="dash-metric__head">
            <IconServicios />
            <span className="dash-metric__label">Servicios más vendidos (30 días)</span>
          </div>
          <Trend pct={trends.servicios_pct} />
          <ul className="dash-top-servicios">
            {data.top_servicios.map((p) => (
              <li key={p.nombre} className="dash-top-servicios__row">
                <span className="dash-top-servicios__name">{p.nombre}</span>
                <span className="dash-top-servicios__bar-wrap">
                  <span
                    className="dash-top-servicios__bar"
                    style={{ width: `${(p.unidades / maxServicios) * 100}%` }}
                  />
                </span>
                <span className="dash-top-servicios__qty mono">{p.unidades}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <section className="dash-card dash-card--proximas">
        <h2 className="dash-card__title">Próximas citas del día</h2>
        {raw && raw.proximas_citas_hoy.length === 0 ? (
          <div className="dash-empty-cta">
            <p className="muted">No hay citas agendadas para hoy.</p>
            <Link to="/citas" className="btn primary">
              Agendar cita →
            </Link>
          </div>
        ) : (
          <ul className="dash-timeline" aria-label="Citas de hoy">
            {data.proximas_citas_hoy.map((c, idx) => (
              <li key={`${c.inicio}-${idx}`} className="dash-timeline__item">
                <span className="dash-timeline__time mono">{formatHoraCita(c.inicio)}</span>
                <div className="dash-timeline__body">
                  <span className="dash-timeline__cliente">{c.cliente_nombre}</span>
                  <span className="dash-timeline__servicio muted small">{c.servicio}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="dash-totales-strip muted small">
        <span>{data.productos_total} productos</span>
        <span aria-hidden> · </span>
        <span>{data.clientes_total} clientes</span>
      </p>

      <div className="dashboard-charts dash-charts dash-charts--single">
        <section className="card chart-card dash-chart-card">
          <h2 className="card-title">Ingresos por día (7 días)</h2>
          {raw && raw.ingresos_7d.length === 0 ? (
            <div className="dash-empty-cta">
              <p className="muted">Todavía no registramos ventas en este período.</p>
              <Link to="/ventas" className="btn secondary">
                Registrar primera venta →
              </Link>
            </div>
          ) : (
            <div className="bar-chart" role="img" aria-label="Ingresos últimos 7 días">
              {data.ingresos_7d.map((row) => (
                <div key={row.dia} className="bar-chart-col">
                  <div
                    className="bar-chart-bar"
                    style={{ height: `${(row.ingresos / maxIngresoDia) * 100}%` }}
                    title={`${row.ingresos.toFixed(2)}`}
                  />
                  <span className="bar-chart-label">{row.dia.slice(5).replace("-", "/")}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
