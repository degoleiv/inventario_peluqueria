import { useCallback, useEffect, useState } from "react";
import {
  downloadFacturaDocumento,
  fetchFacturasElectronicas,
  type FacturaElectronica,
} from "../api";

export function FacturasPage() {
  const [rows, setRows] = useState<FacturaElectronica[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setRows(await fetchFacturasElectronicas());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      {error ? (
        <div className="banner banner-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Facturas electrónicas</h2>
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
        <p className="hint">
          Comprobantes generados al vender (si dejaste activada la emisión). Descargá XML o JSON con
          firma HMAC local; adaptable a ARCA/AFIP con variables de entorno.
        </p>
        {loading ? (
          <p className="muted">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No hay facturas emitidas todavía.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Venta</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <td className="mono">
                      {f.punto_venta}-{f.numero}
                    </td>
                    <td className="mono">{new Date(f.fecha_emision).toLocaleString()}</td>
                    <td>{f.cliente_nombre ?? "—"}</td>
                    <td>{f.total.toFixed(2)}</td>
                    <td>#{f.venta_id}</td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="link"
                        onClick={() => void downloadFacturaDocumento(f.id, "xml")}
                      >
                        XML
                      </button>
                      <button
                        type="button"
                        className="link"
                        onClick={() => void downloadFacturaDocumento(f.id, "json")}
                      >
                        JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
