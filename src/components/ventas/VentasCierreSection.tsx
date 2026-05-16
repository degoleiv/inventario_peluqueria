import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowClockwise,
  CalendarBlank,
  CheckCircle,
  LockSimple,
  Receipt,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  crearCierreDia,
  fetchCierreDia,
  fetchCierresDia,
  fetchResumenCierreDia,
  type CierreDia,
  type ResumenCierreDia,
  type VentasDiaDetalle,
} from "../../api";
import { useToast } from "../../context/ToastContext";
import type { CanalCierreMeta } from "../../api";
import {
  diferenciaMontos,
  isoDateLocal,
  moneyCierre,
  montosVacios,
  totalMontos,
  type MontosPorCanal,
} from "../../lib/cierreDia";

type Vista = "cerrar" | "historial";

function fmtFecha(f: string) {
  try {
    const [y, m, d] = f.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return f;
  }
}

function diffClass(n: number) {
  if (Math.abs(n) < 0.01) return "cierre-diff--ok";
  if (n > 0) return "cierre-diff--sobra";
  return "cierre-diff--falta";
}

export function VentasCierreSection() {
  const toast = useToast();
  const [vista, setVista] = useState<Vista>("cerrar");
  const [fecha, setFecha] = useState(() => isoDateLocal());
  const [resumen, setResumen] = useState<ResumenCierreDia | null>(null);
  const [reales, setReales] = useState<MontosPorCanal>({});
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [historial, setHistorial] = useState<CierreDia[]>([]);
  const [detalle, setDetalle] = useState<CierreDia | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);

  const canales = useMemo(
    () => resumen?.canales_cierre ?? detalle?.canales_cierre ?? [],
    [resumen, detalle]
  );

  const reportado = useMemo(
    () => resumen?.montos_reportados ?? detalle?.montos_reportados ?? montosVacios(canales),
    [resumen, detalle, canales]
  );
  const diferencias = useMemo(() => diferenciaMontos(reportado, reales), [reportado, reales]);
  const totalDiff = useMemo(() => totalMontos(diferencias), [diferencias]);

  const loadResumen = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchResumenCierreDia(fecha);
      setResumen(r);
      if (r.ya_cerrado && r.cierre_id) {
        try {
          const d = await fetchCierreDia(r.cierre_id);
          setDetalle(d);
          setReales({ ...d.montos_reales });
        } catch {
          setDetalle(null);
          setReales(montosVacios(r.canales_cierre));
        }
      } else {
        setDetalle(null);
        setReales(montosVacios(r.canales_cierre));
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar resumen", "error");
      setResumen(null);
    } finally {
      setLoading(false);
    }
  }, [fecha, toast]);

  const loadHistorial = useCallback(async () => {
    try {
      setHistorial(await fetchCierresDia(90));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar historial", "error");
    }
  }, [toast]);

  useEffect(() => {
    if (vista === "cerrar") void loadResumen();
  }, [vista, loadResumen]);

  useEffect(() => {
    if (vista === "historial") void loadHistorial();
  }, [vista, loadHistorial]);

  async function seleccionarCierre(c: CierreDia) {
    setDetalle(c);
    setDetalleLoading(true);
    try {
      setDetalle(await fetchCierreDia(c.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar detalle", "error");
    } finally {
      setDetalleLoading(false);
    }
  }

  async function onCerrarDia() {
    if (!resumen || resumen.ya_cerrado) return;
    setBusy(true);
    try {
      const cierre = await crearCierreDia({
        fecha,
        montos_reales: reales,
        nota_final: nota.trim() || null,
      });
      toast("Día cerrado correctamente", "success");
      setDetalle(cierre);
      setResumen((prev) =>
        prev ? { ...prev, ya_cerrado: true, cierre_id: cierre.id } : prev
      );
      void loadHistorial();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo cerrar el día", "error");
    } finally {
      setBusy(false);
    }
  }

  function patchReal(canalId: string, raw: string) {
    const n = raw.trim() === "" ? 0 : Number(raw.replace(",", "."));
    setReales((prev) => ({ ...prev, [canalId]: Number.isFinite(n) ? Math.max(0, n) : 0 }));
  }

  const canalesActivos = useMemo(() => {
    const extraIds = new Set([
      ...Object.keys(reportado),
      ...Object.keys(reales),
    ]);
    const fromMeta = canales.filter(
      (c) =>
        c.siempreVisible ||
        (reportado[c.id] ?? 0) > 0 ||
        (reales[c.id] ?? 0) > 0
    );
    const known = new Set(fromMeta.map((c) => c.id));
    const extras: CanalCierreMeta[] = [...extraIds]
      .filter((id) => !known.has(id) && ((reportado[id] ?? 0) > 0 || (reales[id] ?? 0) > 0))
      .map((id) => ({ id, label: id, siempreVisible: false }));
    return [...fromMeta, ...extras];
  }, [canales, reportado, reales]);

  return (
    <div className="cierre-dia-page">
      <header className="cierre-dia-header">
        <div>
          <h1 className="cierre-dia-title">Cierre de día</h1>
          <p className="cierre-dia-subtitle muted">
            Compará lo reportado por ventas con el dinero en caja y cuentas. Dejá la nota de cierre.
          </p>
        </div>
        <div className="cierre-dia-header-actions">
          <div className="cierre-dia-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={vista === "cerrar"}
              className={`cierre-dia-tab${vista === "cerrar" ? " is-active" : ""}`}
              onClick={() => setVista("cerrar")}
            >
              Cerrar día
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vista === "historial"}
              className={`cierre-dia-tab${vista === "historial" ? " is-active" : ""}`}
              onClick={() => setVista("historial")}
            >
              Historial
            </button>
          </div>
          <Link to="/ventas/ventas" className="btn ghost small">
            Ir a ventas
          </Link>
        </div>
      </header>

      {vista === "cerrar" ? (
        <>
          <div className="cierre-dia-toolbar card-pro">
            <label className="cierre-dia-fecha-field">
              <CalendarBlank size={18} aria-hidden />
              <span>Fecha del cierre</span>
              <input
                type="date"
                value={fecha}
                max={isoDateLocal()}
                onChange={(e) => setFecha(e.target.value)}
                disabled={busy}
              />
            </label>
            <button type="button" className="btn ghost small" onClick={() => void loadResumen()} disabled={loading}>
              <ArrowClockwise size={16} aria-hidden />
              Actualizar
            </button>
          </div>

          {loading ? (
            <p className="muted cierre-dia-loading">Cargando ventas del día…</p>
          ) : !resumen ? (
            <p className="muted">No se pudo cargar el resumen.</p>
          ) : resumen.ya_cerrado && detalle ? (
            <section className="card-pro cierre-dia-cerrado">
              <div className="cierre-dia-cerrado-head">
                <CheckCircle size={32} weight="duotone" className="cierre-ok-icon" aria-hidden />
                <div>
                  <h2>Día ya cerrado</h2>
                  <p className="muted">{fmtFecha(resumen.fecha)}</p>
                  <p className="muted small">
                    Por {detalle.usuario_nombre ?? "—"} ·{" "}
                    {new Date(detalle.created_at).toLocaleString("es-AR")}
                  </p>
                </div>
              </div>
              <CierreVentasDelDia detalle={resumen} />
              <CierreDetalleGrid cierre={detalle} />
              {detalle.nota_final ? (
                <div className="cierre-nota-box">
                  <strong>Nota de cierre</strong>
                  <p>{detalle.nota_final}</p>
                </div>
              ) : null}
              <button type="button" className="btn ghost" onClick={() => setVista("historial")}>
                Ver en historial
              </button>
            </section>
          ) : (
            <>
              <div className="cierre-dia-kpis">
                <article className="cierre-kpi card-pro">
                  <span className="cierre-kpi-label">Ventas del día</span>
                  <strong>{resumen.ventas_cantidad}</strong>
                </article>
                <article className="cierre-kpi card-pro">
                  <span className="cierre-kpi-label">Total reportado</span>
                  <strong>{moneyCierre.format(resumen.total_reportado)}</strong>
                </article>
                <article className="cierre-kpi card-pro">
                  <span className="cierre-kpi-label">Total contado</span>
                  <strong>{moneyCierre.format(totalMontos(reales))}</strong>
                </article>
                <article className={`cierre-kpi card-pro ${diffClass(totalDiff)}`}>
                  <span className="cierre-kpi-label">Diferencia total</span>
                  <strong>{moneyCierre.format(totalDiff)}</strong>
                </article>
              </div>

              <CierreVentasDelDia detalle={resumen} />

              <div className="cierre-conciliacion card-pro">
                <h2 className="cierre-section-title">Conciliación por medio de pago</h2>
                <p className="muted small cierre-hint">
                  Los pagos <strong>mixtos</strong> aparecen en una sola línea: revisá manualmente cómo repartir el
                  efectivo entre cuentas.
                </p>
                <div className="cierre-table-wrap">
                  <table className="cierre-table">
                    <thead>
                      <tr>
                        <th>Medio</th>
                        <th>Reportado (ventas)</th>
                        <th>Real (conteo)</th>
                        <th>Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {canalesActivos.map((canal) => (
                        <tr key={canal.id}>
                          <td>{canal.label}</td>
                          <td className="mono">{moneyCierre.format(reportado[canal.id] ?? 0)}</td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step="100"
                              className="cierre-input-monto"
                              value={reales[canal.id] === 0 ? "" : reales[canal.id]}
                              onChange={(e) => patchReal(canal.id, e.target.value)}
                              disabled={busy}
                              placeholder="0"
                            />
                          </td>
                          <td className={`mono ${diffClass(diferencias[canal.id] ?? 0)}`}>
                            {moneyCierre.format(diferencias[canal.id] ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>Total</th>
                        <th className="mono">{moneyCierre.format(resumen.total_reportado)}</th>
                        <th className="mono">{moneyCierre.format(totalMontos(reales))}</th>
                        <th className={`mono ${diffClass(totalDiff)}`}>{moneyCierre.format(totalDiff)}</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="cierre-nota card-pro">
                <label className="cierre-nota-label" htmlFor="cierre-nota-final">
                  Nota final del día
                </label>
                <textarea
                  id="cierre-nota-final"
                  className="cierre-nota-textarea"
                  rows={4}
                  placeholder="Observaciones, faltantes, sobrantes, incidentes…"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  disabled={busy}
                />
              </div>

              {Math.abs(totalDiff) > 0.01 ? (
                <p className="cierre-advertencia" role="status">
                  <WarningCircle size={18} weight="duotone" aria-hidden />
                  Hay diferencia entre lo reportado y lo contado. Podés cerrar igual y explicarlo en la nota.
                </p>
              ) : null}

              <button
                type="button"
                className="btn primary cierre-submit"
                disabled={busy}
                onClick={() => void onCerrarDia()}
              >
                <LockSimple size={20} weight="fill" aria-hidden />
                {busy ? "Cerrando…" : "Cerrar día"}
              </button>
              {resumen.ventas_cantidad === 0 ? (
                <p className="muted small">No hay ventas confirmadas en esta fecha; podés cerrar igual.</p>
              ) : null}
            </>
          )}
        </>
      ) : (
        <section className="cierre-historial">
          {historial.length === 0 ? (
            <div className="cierre-empty card-pro">
              <Receipt size={48} weight="duotone" aria-hidden />
              <p>Aún no hay días cerrados.</p>
              <button type="button" className="btn primary" onClick={() => setVista("cerrar")}>
                Cerrar el día de hoy
              </button>
            </div>
          ) : (
            <ul className="cierre-historial-list">
              {historial.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`cierre-historial-card card-pro${detalle?.id === c.id ? " is-selected" : ""}`}
                    onClick={() => void seleccionarCierre(c)}
                  >
                    <div className="cierre-historial-card-top">
                      <strong>{fmtFecha(c.fecha)}</strong>
                      <span className={`cierre-diff-pill ${diffClass(c.total_diferencia)}`}>
                        {moneyCierre.format(c.total_diferencia)}
                      </span>
                    </div>
                    <p className="muted small">
                      {c.ventas_cantidad} ventas · Reportado {moneyCierre.format(c.total_reportado)} · Real{" "}
                      {moneyCierre.format(c.total_real)}
                    </p>
                    <p className="muted small">{c.usuario_nombre ?? "—"}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {detalle ? (
            <aside className="cierre-detalle-panel card-pro">
              <h2 className="cierre-section-title">Detalle · {fmtFecha(detalle.fecha)}</h2>
              {detalleLoading ? (
                <p className="muted small">Cargando detalle…</p>
              ) : (
                <CierreVentasDelDia detalle={detalle} compact />
              )}
              <CierreDetalleGrid cierre={detalle} />
              {detalle.nota_final ? (
                <div className="cierre-nota-box">
                  <strong>Nota de cierre</strong>
                  <p>{detalle.nota_final}</p>
                </div>
              ) : null}
            </aside>
          ) : null}
        </section>
      )}
    </div>
  );
}

function CierreVentasDelDia({
  detalle,
  compact = false,
}: {
  detalle: VentasDiaDetalle;
  compact?: boolean;
}) {
  const { productos, servicios, total_productos, total_servicios } = detalle;
  return (
    <div className={`cierre-ventas-dia${compact ? " cierre-ventas-dia--compact" : ""}`}>
      <div className="cierre-ventas-dia-grid">
        <section className="card-pro cierre-ventas-bloque">
          <h2 className="cierre-section-title">Productos vendidos</h2>
          {productos.length === 0 ? (
            <p className="muted small">Sin productos en ventas de este día.</p>
          ) : (
            <div className="cierre-table-wrap">
              <table className="cierre-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="cierre-col-num">Cant.</th>
                    <th className="cierre-col-num">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((p) => (
                    <tr key={p.producto_id}>
                      <td>{p.producto_nombre}</td>
                      <td className="mono cierre-col-num">{p.cantidad}</td>
                      <td className="mono cierre-col-num">{moneyCierre.format(p.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={2}>Total productos</th>
                    <th className="mono cierre-col-num">{moneyCierre.format(total_productos)}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <section className="card-pro cierre-ventas-bloque">
          <h2 className="cierre-section-title">Servicios realizados</h2>
          {servicios.length === 0 ? (
            <p className="muted small">Sin servicios en ventas de este día.</p>
          ) : (
            <div className="cierre-table-wrap">
              <table className="cierre-table">
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Profesional</th>
                    <th className="cierre-col-num">Cant.</th>
                    <th className="cierre-col-num">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {servicios.map((s, i) => (
                    <tr key={`${s.servicio_nombre}-${s.profesional_nombre ?? ""}-${i}`}>
                      <td>{s.servicio_nombre}</td>
                      <td className="muted">{s.profesional_nombre ?? "—"}</td>
                      <td className="mono cierre-col-num">{s.cantidad}</td>
                      <td className="mono cierre-col-num">{moneyCierre.format(s.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={3}>Total servicios</th>
                    <th className="mono cierre-col-num">{moneyCierre.format(total_servicios)}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CierreDetalleGrid({ cierre }: { cierre: CierreDia }) {
  const ids = new Set([
    ...Object.keys(cierre.montos_reportados),
    ...Object.keys(cierre.montos_reales),
    ...cierre.canales_cierre.map((c) => c.id),
  ]);
  const labelById = new Map(cierre.canales_cierre.map((c) => [c.id, c.label]));
  const canales = [...ids].filter(
    (id) =>
      (cierre.montos_reportados[id] ?? 0) !== 0 ||
      (cierre.montos_reales[id] ?? 0) !== 0 ||
      cierre.canales_cierre.some((c) => c.id === id && c.siempreVisible)
  );
  return (
    <div className="cierre-table-wrap">
      <table className="cierre-table">
        <thead>
          <tr>
            <th>Medio</th>
            <th>Reportado</th>
            <th>Real</th>
            <th>Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {canales.map((id) => (
            <tr key={id}>
              <td>{labelById.get(id) ?? id}</td>
              <td className="mono">{moneyCierre.format(cierre.montos_reportados[id] ?? 0)}</td>
              <td className="mono">{moneyCierre.format(cierre.montos_reales[id] ?? 0)}</td>
              <td className={`mono ${diffClass(cierre.montos_diferencia[id] ?? 0)}`}>
                {moneyCierre.format(cierre.montos_diferencia[id] ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            <th className="mono">{moneyCierre.format(cierre.total_reportado)}</th>
            <th className="mono">{moneyCierre.format(cierre.total_real)}</th>
            <th className={`mono ${diffClass(cierre.total_diferencia)}`}>
              {moneyCierre.format(cierre.total_diferencia)}
            </th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
