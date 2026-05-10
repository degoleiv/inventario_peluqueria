import { useCallback, useEffect, useState } from "react";
import {
  createCobranza,
  createGasto,
  fetchClientes,
  fetchCobranzas,
  fetchFlujoCaja,
  fetchGastos,
  registrarPagoCobranza,
  type Cliente,
  type GastoOperativo,
} from "../api";
import { useToast } from "../context/ToastContext";

export function FinanzasPage() {
  const toast = useToast();
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [flujo, setFlujo] = useState<{
    ingresos_ventas: number;
    egresos_gastos: number;
    egresos_pedidos_proveedor?: number;
    egresos_compras?: number;
    egresos_total: number;
    resultado_neto: number;
  } | null>(null);
  const [gastos, setGastos] = useState<GastoOperativo[]>([]);
  const [cobranzas, setCobranzas] = useState<
    Array<{
      id: number;
      cliente_nombre: string;
      descripcion: string;
      saldo_pendiente: number;
      monto: number;
      vencimiento: string | null;
      estado: string;
    }>
  >([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);

  const [gConcepto, setGConcepto] = useState("");
  const [gMonto, setGMonto] = useState<number | "">("");
  const [gCat, setGCat] = useState("");
  const [gFecha, setGFecha] = useState(() => new Date().toISOString().slice(0, 10));

  const [cCliente, setCCliente] = useState<number | "">("");
  const [cDesc, setCDesc] = useState("");
  const [cMonto, setCMonto] = useState<number | "">("");
  const [cVenc, setCVenc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, cob, cl] = await Promise.all([
        fetchGastos(),
        fetchCobranzas("pendiente"),
        fetchClientes(),
      ]);
      setGastos(g);
      setCobranzas(cob as typeof cobranzas);
      setClientes(cl);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cargarFlujo() {
    const d = desde.trim();
    const h = hasta.trim();
    if (!d || !h) {
      toast("Indicá desde y hasta (ISO o fecha) para el flujo de caja", "warning");
      return;
    }
    try {
      const f = await fetchFlujoCaja(d, h);
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
        categoria: gCat.trim() || null,
        fecha: gFecha,
      });
      setGConcepto("");
      setGMonto("");
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

  return (
    <>
      <section className="card">
        <h2 className="card-title">Flujo de caja (ventas vs gastos + pedidos proveedores)</h2>
        <p className="muted">
          Ingresos: suma de ventas en el período. Egresos: gastos operativos + total de pedidos a
          proveedores (valor de líneas / stock).
        </p>
        <div className="filtros-row">
          <label className="field inline">
            <span>Desde</span>
            <input value={desde} onChange={(e) => setDesde(e.target.value)} placeholder="2026-05-01" />
          </label>
          <label className="field inline">
            <span>Hasta</span>
            <input value={hasta} onChange={(e) => setHasta(e.target.value)} placeholder="2026-05-31" />
          </label>
          <button type="button" className="btn secondary" onClick={() => void cargarFlujo()}>
            Calcular
          </button>
        </div>
        {flujo ? (
          <ul className="report-list">
            <li>
              Ingresos (ventas): <strong>{flujo.ingresos_ventas.toFixed(2)}</strong>
            </li>
            <li>Egresos gastos: {flujo.egresos_gastos.toFixed(2)}</li>
            <li>
              Egresos pedidos proveedores:{" "}
              {(flujo.egresos_pedidos_proveedor ?? flujo.egresos_compras ?? 0).toFixed(2)}
            </li>
            <li>
              Resultado neto: <strong>{flujo.resultado_neto.toFixed(2)}</strong>
            </li>
          </ul>
        ) : null}
      </section>

      <section className="card">
        <h2 className="card-title">Gastos operativos</h2>
        <p className="muted">Registrar arriendo, servicios, etc. Solo administrador.</p>
        {loading ? <p className="muted">Cargando…</p> : null}
        <form className="form" onSubmit={onGasto}>
          <div className="grid-2">
            <label className="field">
              <span>Concepto</span>
              <input value={gConcepto} onChange={(e) => setGConcepto(e.target.value)} required />
            </label>
            <label className="field">
              <span>Monto</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={gMonto}
                onChange={(e) => setGMonto(e.target.value === "" ? "" : Number(e.target.value))}
                required
              />
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Categoría</span>
              <input value={gCat} onChange={(e) => setGCat(e.target.value)} placeholder="opcional" />
            </label>
            <label className="field">
              <span>Fecha</span>
              <input type="date" value={gFecha} onChange={(e) => setGFecha(e.target.value)} />
            </label>
          </div>
          <button type="submit" className="btn primary">
            Registrar gasto
          </button>
        </form>
        {gastos.length > 0 ? (
          <div className="table-wrap" style={{ marginTop: "1rem" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {gastos.slice(0, 40).map((g) => (
                  <tr key={g.id}>
                    <td className="mono">{g.fecha}</td>
                    <td>{g.concepto}</td>
                    <td>{g.monto.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2 className="card-title">Cuentas por cobrar</h2>
        <form className="form" onSubmit={onDeuda}>
          <div className="grid-2">
            <label className="field">
              <span>Cliente</span>
              <select
                value={cCliente === "" ? "" : String(cCliente)}
                onChange={(e) =>
                  setCCliente(e.target.value === "" ? "" : Number(e.target.value))
                }
                required
              >
                <option value="">—</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Monto</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={cMonto}
                onChange={(e) => setCMonto(e.target.value === "" ? "" : Number(e.target.value))}
                required
              />
            </label>
          </div>
          <label className="field">
            <span>Descripción</span>
            <input value={cDesc} onChange={(e) => setCDesc(e.target.value)} required />
          </label>
          <label className="field">
            <span>Vencimiento</span>
            <input type="date" value={cVenc} onChange={(e) => setCVenc(e.target.value)} />
          </label>
          <button type="submit" className="btn primary">
            Registrar deuda
          </button>
        </form>
        {cobranzas.length > 0 ? (
          <div className="table-wrap" style={{ marginTop: "1rem" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Saldo</th>
                  <th>Venc.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cobranzas.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="cell-main">{c.cliente_nombre}</div>
                      <div className="cell-sub">{c.descripcion}</div>
                    </td>
                    <td>{Number(c.saldo_pendiente).toFixed(2)}</td>
                    <td className="mono">{c.vencimiento ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="link"
                        onClick={() => void pagoDeuda(c.id, c.saldo_pendiente)}
                      >
                        Registrar pago
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No hay cuentas pendientes.</p>
        )}
      </section>
    </>
  );
}
