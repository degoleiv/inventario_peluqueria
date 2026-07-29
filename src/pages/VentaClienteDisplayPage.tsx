import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { fetchBranding } from "../api";
import { applyBrandingToDocument } from "../lib/brandingDocument";
import { usePermisos, usePuedeVer } from "../context/PermisosContext";
import {
  readPosClienteDisplaySnapshot,
  subscribePosClienteDisplay,
  subscribePosClienteStorage,
  type PosClienteSnapshot,
} from "../lib/posClientDisplay";
import { formatMoney } from "../lib/money";

const empty: PosClienteSnapshot = { lines: [], subtotal: 0 };

export function VentaClienteDisplayPage() {
  const { permisos } = usePermisos();
  const puedeVerVentas = usePuedeVer("ventas");
  const allowed = permisos.length === 0 ? null : puedeVerVentas;
  const [snapshot, setSnapshot] = useState<PosClienteSnapshot>(() => readPosClienteDisplaySnapshot() ?? empty);
  const [brand, setBrand] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void fetchBranding()
      .then((b) => {
        if (cancel) return;
        setBrand(b.nombre_negocio?.trim() || null);
        applyBrandingToDocument(b);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const snap = readPosClienteDisplaySnapshot();
    if (snap) setSnapshot(snap);
    const unSub = subscribePosClienteDisplay(setSnapshot);
    const unSto = subscribePosClienteStorage(() => {
      const next = readPosClienteDisplaySnapshot();
      if (next) setSnapshot(next);
    });
    return () => {
      unSub();
      unSto();
    };
  }, []);

  useEffect(() => {
    document.title = brand ? `${brand} · Subtotal` : "Subtotal — cliente";
  }, [brand]);

  if (allowed === false) {
    return <Navigate to="/inicio" replace />;
  }
  if (allowed === null) {
    return (
      <div className="pos-client-display pos-client-display--loading">
        <p className="muted">…</p>
      </div>
    );
  }

  return (
    <div className="pos-client-display">
      <header className="pos-client-display-head">
        {brand ? <span className="pos-client-display-brand">{brand}</span> : null}
        <span className="pos-client-display-tag">Vista cliente</span>
      </header>

      {snapshot.lines.length === 0 ? (
        <div className="pos-client-display-empty">
          <p>Esperando ítems…</p>
        </div>
      ) : (
        <ul className="pos-client-display-lines" aria-label="Detalle">
          {snapshot.lines.map((l, i) => (
            <li key={i} className="pos-client-display-line">
              <span className="pos-client-display-line-name">{l.nombre}</span>
              <span className="pos-client-display-line-qty mono">×{l.cantidad}</span>
              <span className="pos-client-display-line-amount mono">{formatMoney(l.importe)}</span>
            </li>
          ))}
        </ul>
      )}

      <footer className="pos-client-display-footer">
        <span className="pos-client-display-subtotal-label">Subtotal</span>
        <span className="pos-client-display-subtotal-value mono">{formatMoney(snapshot.subtotal)}</span>
      </footer>
    </div>
  );
}
