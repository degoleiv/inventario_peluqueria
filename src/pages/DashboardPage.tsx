import { useEffect, useState } from "react";
import {
  fetchDashboard,
  fetchPuntosConfig,
  updatePuntosConfig,
  type DashboardStats,
  type PuntosConfig,
} from "../api";
import {
  filterDecimalTyping,
  formatDecimalForInput,
  parseDecimalLoose,
} from "../lib/decimalInput";

export function DashboardPage() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [puntosCfg, setPuntosCfg] = useState<PuntosConfig | null>(null);
  const [puntosDraft, setPuntosDraft] = useState({
    activo: false,
    ratioStr: "1",
    valorRedStr: "0",
  });
  const [puntosMsg, setPuntosMsg] = useState<string | null>(null);
  const [puntosErr, setPuntosErr] = useState<string | null>(null);
  const [puntosSaving, setPuntosSaving] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const d = await fetchDashboard();
        if (!cancel) setData(d);
      } catch (e) {
        if (!cancel) setErr(e instanceof Error ? e.message : "Error");
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const p = await fetchPuntosConfig();
        if (!cancel) {
          setPuntosCfg(p);
          setPuntosDraft({
            activo: p.activo,
            ratioStr: formatDecimalForInput(p.puntos_por_unidad_moneda),
            valorRedStr: formatDecimalForInput(p.valor_redencion_moneda ?? 0),
          });
        }
      } catch {
        if (!cancel) setPuntosCfg(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function guardarPuntos(e: React.FormEvent) {
    e.preventDefault();
    setPuntosErr(null);
    setPuntosMsg(null);
    setPuntosSaving(true);
    try {
      const p = await updatePuntosConfig({
        activo: puntosDraft.activo,
        puntos_por_unidad_moneda: parseDecimalLoose(puntosDraft.ratioStr),
        valor_redencion_moneda: parseDecimalLoose(puntosDraft.valorRedStr),
      });
      setPuntosCfg(p);
      setPuntosMsg("Configuración guardada.");
    } catch (e) {
      setPuntosErr(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setPuntosSaving(false);
    }
  }

  if (err) {
    return (
      <div className="banner banner-error" role="alert">
        {err}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="clay-empty" role="status">
        Cargando resumen del negocio…
      </div>
    );
  }

  const maxIngresoDia =
    data.ingresos_7d.length === 0
      ? 1
      : Math.max(...data.ingresos_7d.map((r) => r.ingresos), 1);
  const maxUnidades =
    data.top_productos.length === 0
      ? 1
      : Math.max(...data.top_productos.map((p) => p.unidades), 1);

  return (
    <>
      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="stat-label">Ingresos hoy</div>
          <div className="stat-value">{data.ventas_hoy_total.toFixed(2)}</div>
          <div className="stat-meta">{data.ventas_hoy_cantidad} ventas</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ventas del mes</div>
          <div className="stat-value">{data.ventas_mes_total.toFixed(2)}</div>
          <div className="stat-meta">{data.ventas_mes_cantidad} tickets</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Citas hoy</div>
          <div className="stat-value">{data.citas_hoy}</div>
          <div className="stat-meta">no canceladas</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stock bajo (≤5)</div>
          <div className="stat-value">{data.productos_bajo_stock}</div>
          <div className="stat-meta">productos</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Cola sync</div>
          <div className="stat-value">{data.sync_pendientes}</div>
          <div className="stat-meta">pendientes de nube</div>
        </div>
        <div className="stat-card wide">
          <div className="stat-label">Totales</div>
          <div className="stat-row">
            <span>{data.productos_total} productos</span>
            <span>{data.clientes_total} clientes</span>
          </div>
        </div>
      </div>

      <div className="dashboard-charts">
        <section className="card chart-card">
          <h2 className="card-title">Ingresos por día (7 días)</h2>
          {data.ingresos_7d.length === 0 ? (
            <p className="muted empty-inline">Sin ventas en este período.</p>
          ) : (
            <div className="bar-chart" role="img" aria-label="Ingresos últimos 7 días">
              {data.ingresos_7d.map((row) => (
                <div key={row.dia} className="bar-chart-col">
                  <div
                    className="bar-chart-bar"
                    style={{ height: `${(row.ingresos / maxIngresoDia) * 100}%` }}
                    title={`${row.ingresos.toFixed(2)}`}
                  />
                  <span className="bar-chart-label">
                    {row.dia.slice(5).replace("-", "/")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card chart-card">
          <h2 className="card-title">Productos más vendidos (30 días)</h2>
          {data.top_productos.length === 0 ? (
            <p className="muted empty-inline">Sin datos aún.</p>
          ) : (
            <ul className="top-products-list">
              {data.top_productos.map((p) => (
                <li key={p.nombre} className="top-products-row">
                  <span className="top-products-name">{p.nombre}</span>
                  <span className="top-products-bar-wrap">
                    <span
                      className="top-products-bar"
                      style={{ width: `${(p.unidades / maxUnidades) * 100}%` }}
                    />
                  </span>
                  <span className="top-products-qty mono">{p.unidades} u.</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card dashboard-puntos-card">
        <h2 className="card-title">Puntos de fidelidad</h2>
        <p className="muted">
          Si está activo, cada venta con cliente asignado suma puntos según el total. Ejemplo: ratio{" "}
          <code>1</code> = 1 punto por cada unidad monetaria del total; <code>0.1</code> = 1 punto
          cada 10 unidades.
        </p>
        {puntosCfg == null ? (
          <p className="muted">Cargando configuración…</p>
        ) : (
          <form className="form" onSubmit={guardarPuntos}>
            {puntosErr ? (
              <div className="banner banner-error" role="alert">
                {puntosErr}
              </div>
            ) : null}
            {puntosMsg ? (
              <div className="banner banner-info" role="status">
                {puntosMsg}
              </div>
            ) : null}
            <label className="field inline-check">
              <input
                type="checkbox"
                checked={puntosDraft.activo}
                onChange={(e) => setPuntosDraft((d) => ({ ...d, activo: e.target.checked }))}
              />
              <span>Programa de puntos activo</span>
            </label>
            <label className="field">
              <span>Puntos por unidad de moneda del total</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={puntosDraft.ratioStr}
                onChange={(e) =>
                  setPuntosDraft((d) => ({
                    ...d,
                    ratioStr: filterDecimalTyping(e.target.value),
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Valor de cada punto al canjear (descuento en moneda; 0 = no canje)</span>
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={puntosDraft.valorRedStr}
                onChange={(e) =>
                  setPuntosDraft((d) => ({
                    ...d,
                    valorRedStr: filterDecimalTyping(e.target.value),
                  }))
                }
              />
            </label>
            <div className="actions">
              <button type="submit" className="btn primary" disabled={puntosSaving}>
                {puntosSaving ? "Guardando…" : "Guardar"}
              </button>
            </div>
            <p className="muted" style={{ fontSize: "0.85rem" }}>
              Solo administradores pueden cambiar esta opción. Demás usuarios ven el estado en
              Ventas.
            </p>
          </form>
        )}
      </section>
    </>
  );
}
