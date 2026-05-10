import { useCallback, useEffect, useState } from "react";
import {
  fetchDashboard,
  fetchIngresosDiarios,
  fetchKpisNegocio,
  fetchProductosMasVendidos,
  fetchRentabilidad,
  fetchReporteVentas,
  fetchSinRotacion,
  fetchSugerenciasCompra,
  type DashboardStats,
  type Venta,
} from "../api";
import { useToast } from "../context/ToastContext";

/** Rango inclusivo por día calendario → ISO para comparar con `ventas.fecha` en el servidor. */
function fechaDiaToIsoDesde(yyyyMmDd: string) {
  return `${yyyyMmDd.trim()}T00:00:00.000Z`;
}

function fechaDiaToIsoHasta(yyyyMmDd: string) {
  return `${yyyyMmDd.trim()}T23:59:59.999Z`;
}

export function ReportesPage() {
  const toast = useToast();
  const [dash, setDash] = useState<DashboardStats | null>(null);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [loading, setLoading] = useState(true);
  const [topProd, setTopProd] = useState<
    Array<{ id: number; nombre: string; unidades: number; total_vendido: number }>
  >([]);
  const [ingresosDia, setIngresosDia] = useState<
    Array<{ dia: string; ingresos: number; cantidad_ventas: number }>
  >([]);
  const [rentabilidad, setRentabilidad] = useState<
    Array<{
      id: number;
      nombre: string;
      ventas_bruto: number;
      costo_estimado: number;
      margen_estimado: number;
      unidades: number;
    }>
  >([]);
  const [sinRotacion, setSinRotacion] = useState<
    Array<{ id: number; nombre: string; stock: number; costo_ref: number }>
  >([]);
  const [sugerencias, setSugerencias] = useState<
    Array<{
      id: number;
      nombre: string;
      sugerencia_compra_unidades: number;
      stock_actual: number;
      consumo_estimado_periodo: number;
    }>
  >([]);
  const [kpis, setKpis] = useState<Record<string, unknown> | null>(null);

  const loadDash = useCallback(async () => {
    setDash(await fetchDashboard());
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        await loadDash();
        const v = await fetchReporteVentas();
        if (!cancel) setVentas(v);
      } catch (e) {
        if (!cancel) toast(e instanceof Error ? e.message : "Error", "error");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [loadDash, toast]);

  async function aplicarFiltro() {
    const fd = fechaDesde.trim();
    const fh = fechaHasta.trim();
    const d = fd ? fechaDiaToIsoDesde(fd) : "";
    const h = fh ? fechaDiaToIsoHasta(fh) : "";
    setLoading(true);
    try {
      const v = await fetchReporteVentas(d || undefined, h || undefined);
      setVentas(v);
      if (d && h) {
        const [tp, ing, rent, sr, sug, k] = await Promise.all([
          fetchProductosMasVendidos(d, h),
          fetchIngresosDiarios(d, h),
          fetchRentabilidad(d, h),
          fetchSinRotacion(90),
          fetchSugerenciasCompra(30, 14),
          fetchKpisNegocio(d, h),
        ]);
        setTopProd(tp);
        setIngresosDia(ing);
        setRentabilidad(rent);
        setSinRotacion(sr);
        setSugerencias(sug as typeof sugerencias);
        setKpis(k as Record<string, unknown>);
      } else {
        setTopProd([]);
        setIngresosDia([]);
        setRentabilidad([]);
        setSinRotacion([]);
        setSugerencias([]);
        setKpis(null);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setLoading(false);
    }
  }

  const sumaFiltrada = ventas.reduce((a, v) => a + v.total, 0);

  return (
    <>
      <section className="card">
        <h2 className="card-title">Resumen</h2>
        {loading && !dash ? (
          <p className="muted">Cargando…</p>
        ) : dash ? (
          <ul className="report-list">
            <li>
              Ventas del mes: <strong>{dash.ventas_mes_total.toFixed(2)}</strong> (
              {dash.ventas_mes_cantidad} tickets)
            </li>
            <li>
              Citas hoy: <strong>{dash.citas_hoy}</strong>
            </li>
            <li>
              Productos con stock bajo: <strong>{dash.productos_bajo_stock}</strong>
            </li>
            <li>
              Eventos en cola de sincronización: <strong>{dash.sync_pendientes}</strong>
            </li>
          </ul>
        ) : null}
      </section>

      <section className="card">
        <h2 className="card-title">Ventas por período</h2>
        <div className="filtros-row">
          <label className="field inline">
            <span>Desde</span>
            <input
              type="date"
              value={fechaDesde}
              max={fechaHasta || undefined}
              onChange={(e) => setFechaDesde(e.target.value)}
            />
          </label>
          <label className="field inline">
            <span>Hasta</span>
            <input
              type="date"
              value={fechaHasta}
              min={fechaDesde || undefined}
              onChange={(e) => setFechaHasta(e.target.value)}
            />
          </label>
          <button type="button" className="btn secondary" onClick={() => void aplicarFiltro()}>
            Aplicar
          </button>
        </div>
        <p className="hint">
          Total mostrado: <strong>{sumaFiltrada.toFixed(2)}</strong> ({ventas.length} ventas). Con
          ambas fechas también se cargan rankings e ingresos diarios.
        </p>
        {loading ? (
          <p className="muted">Cargando lista…</p>
        ) : ventas.length === 0 ? (
          <p className="muted">No hay ventas en este rango.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Pago</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((v) => (
                  <tr key={v.id}>
                    <td className="mono">{new Date(v.fecha).toLocaleString()}</td>
                    <td>{v.cliente_nombre ?? "—"}</td>
                    <td>{v.total.toFixed(2)}</td>
                    <td>{v.metodo_pago}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {topProd.length > 0 ? (
        <section className="card">
          <h2 className="card-title">Productos más vendidos (período)</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Unidades</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {topProd.map((r) => (
                  <tr key={r.id}>
                    <td>{r.nombre}</td>
                    <td>{r.unidades}</td>
                    <td>{Number(r.total_vendido).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {ingresosDia.length > 0 ? (
        <section className="card">
          <h2 className="card-title">Ingresos diarios</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Ingresos</th>
                  <th>Ventas</th>
                </tr>
              </thead>
              <tbody>
                {ingresosDia.map((r) => (
                  <tr key={r.dia}>
                    <td className="mono">{r.dia}</td>
                    <td>{Number(r.ingresos).toFixed(2)}</td>
                    <td>{r.cantidad_ventas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {kpis ? (
        <section className="card">
          <h2 className="card-title">KPIs (período filtrado)</h2>
          <ul className="report-list">
            <li>
              Ticket promedio:{" "}
              <strong>{Number(kpis.ticket_promedio ?? 0).toFixed(2)}</strong>
            </li>
            <li>Ingresos totales: {Number(kpis.ingresos_totales ?? 0).toFixed(2)}</li>
            <li>Cantidad ventas: {Number(kpis.cantidad_ventas ?? 0)}</li>
            <li>Clientes distintos: {Number(kpis.clientes_distintos_en_periodo ?? 0)}</li>
            <li>Clientes con más de una compra: {Number(kpis.clientes_recurentes_mas_de_una_compra ?? 0)}</li>
          </ul>
        </section>
      ) : null}

      {rentabilidad.length > 0 ? (
        <section className="card">
          <h2 className="card-title">Rentabilidad por producto (margen estimado)</h2>
          <p className="muted">
            Margen = ventas − costo (precio_compra × unidades). Completá precio_compra en inventario.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Ventas</th>
                  <th>Costo est.</th>
                  <th>Margen</th>
                </tr>
              </thead>
              <tbody>
                {rentabilidad.slice(0, 30).map((r) => (
                  <tr key={r.id}>
                    <td>{r.nombre}</td>
                    <td>{Number(r.ventas_bruto).toFixed(2)}</td>
                    <td>{Number(r.costo_estimado).toFixed(2)}</td>
                    <td>{Number(r.margen_estimado).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {sinRotacion.length > 0 ? (
        <section className="card">
          <h2 className="card-title">Productos sin rotación (90 días)</h2>
          <p className="muted">Con stock pero sin ventas en la ventana indicada.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {sinRotacion.slice(0, 40).map((r) => (
                  <tr key={r.id}>
                    <td>{r.nombre}</td>
                    <td>{r.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {sugerencias.length > 0 ? (
        <section className="card">
          <h2 className="card-title">Sugerencias de reabastecimiento</h2>
          <p className="muted">Heurística según ventas recientes y stock mínimo.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock</th>
                  <th>Sugerido comprar</th>
                </tr>
              </thead>
              <tbody>
                {sugerencias.slice(0, 40).map((r) => (
                  <tr key={r.id}>
                    <td>{r.nombre}</td>
                    <td>{r.stock_actual}</td>
                    <td>{r.sugerencia_compra_unidades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
