import { useEffect, useRef, useState } from "react";
import {
  fetchPuntosConfig,
  updatePuntosConfig,
  type PuntosConfig,
} from "../../api";
import {
  filterDecimalTyping,
  formatDecimalForInput,
  parseDecimalLoose,
} from "../../lib/decimalInput";
import { useToast } from "../../context/ToastContext";

const AUTOSAVE_MS = 700;

function sameNumber(a: number, b: number) {
  return Math.abs(a - b) < 1e-9;
}

export function PuntosFidelidadConfigSection() {
  const toast = useToast();
  const [puntosCfg, setPuntosCfg] = useState<PuntosConfig | null>(null);
  const [puntosDraft, setPuntosDraft] = useState({
    activo: false,
    ratioStr: "1",
    valorRedStr: "0",
  });
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const draftRef = useRef(puntosDraft);
  draftRef.current = puntosDraft;
  const cfgRef = useRef(puntosCfg);
  cfgRef.current = puntosCfg;
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancel = false;
    void (async () => {
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

  useEffect(() => {
    return () => {
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (puntosCfg == null) return;
    const d = puntosDraft;
    const ratio = parseDecimalLoose(d.ratioStr);
    const valor = parseDecimalLoose(d.valorRedStr);
    const unchanged =
      d.activo === puntosCfg.activo &&
      sameNumber(ratio, puntosCfg.puntos_por_unidad_moneda) &&
      sameNumber(valor, puntosCfg.valor_redencion_moneda ?? 0);
    if (unchanged) return;

    const t = setTimeout(() => {
      void (async () => {
        const cur = draftRef.current;
        const srv = cfgRef.current;
        if (srv == null) return;
        const r = parseDecimalLoose(cur.ratioStr);
        const v = parseDecimalLoose(cur.valorRedStr);
        const stillChanged =
          cur.activo !== srv.activo ||
          !sameNumber(r, srv.puntos_por_unidad_moneda) ||
          !sameNumber(v, srv.valor_redencion_moneda ?? 0);
        if (!stillChanged) return;

        setSaving(true);
        try {
          const p = await updatePuntosConfig({
            activo: cur.activo,
            puntos_por_unidad_moneda: r,
            valor_redencion_moneda: v,
          });
          setPuntosCfg(p);
          setPuntosDraft({
            activo: p.activo,
            ratioStr: formatDecimalForInput(p.puntos_por_unidad_moneda),
            valorRedStr: formatDecimalForInput(p.valor_redencion_moneda ?? 0),
          });
          if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
          setSavedFlash(true);
          savedFlashTimerRef.current = setTimeout(() => {
            savedFlashTimerRef.current = null;
            setSavedFlash(false);
          }, 2000);
        } catch (e) {
          toast(e instanceof Error ? e.message : "Error al guardar", "error");
        } finally {
          setSaving(false);
        }
      })();
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [puntosDraft, puntosCfg, toast]);

  return (
    <section className="card cat-board-card config-param-extra">
      <h2 className="card-title">Puntos de fidelidad</h2>
      <p className="muted">
        Si está activo, cada venta con cliente asignado suma puntos según el total. Ejemplo: ratio{" "}
        <code>1</code> = 1 punto por cada unidad monetaria del total; <code>0.1</code> = 1 punto cada 10
        unidades.
      </p>
      {puntosCfg == null ? (
        <p className="muted">Cargando configuración…</p>
      ) : (
        <div className="form">
          <div className="field">
            <span>Programa de puntos</span>
            <label
              className="ui-switch producto-estado-switch"
              title={puntosDraft.activo ? "Activo" : "Inactivo"}
            >
              <input
                type="checkbox"
                className="ui-switch__input"
                checked={puntosDraft.activo}
                onChange={(e) => setPuntosDraft((d) => ({ ...d, activo: e.target.checked }))}
              />
              <span className="ui-switch__track" aria-hidden />
              <span className="producto-estado-switch__text muted small">
                {puntosDraft.activo ? "Programa activo" : "Programa inactivo"}
              </span>
            </label>
          </div>
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
          <p className="muted small" style={{ marginTop: "0.35rem", minHeight: "1.25rem" }}>
            {saving ? "Guardando…" : savedFlash ? "Cambios guardados." : "Se guarda automáticamente al editar."}
          </p>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Solo administradores pueden cambiar esta opción. El resto de usuarios ven el estado en Ventas.
          </p>
        </div>
      )}
    </section>
  );
}
