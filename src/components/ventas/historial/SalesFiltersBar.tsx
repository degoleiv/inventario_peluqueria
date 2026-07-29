import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CalendarBlank,
  DownloadSimple,
  FloppyDisk,
  Funnel,
  MagnifyingGlass,
  SlidersHorizontal,
  X,
} from "@phosphor-icons/react";
import { filterMoneyTyping } from "../../../lib/money";
import type { FiltrosHistorialState, RangoPreset } from "./utils";
import "./SalesFiltersBar.css";

const PRESETS: { id: RangoPreset; label: string; short?: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7d", label: "7 días", short: "7d" },
  { id: "30d", label: "30 días", short: "30d" },
  { id: "mes", label: "Este mes", short: "Mes" },
  { id: "custom", label: "Personalizado", short: "icon" },
];

function countAdvancedFilters(f: FiltrosHistorialState): number {
  let n = 0;
  if (f.usuarioId !== "todos") n++;
  if (f.clienteId !== "todos") n++;
  if (f.metodoPago !== "todos") n++;
  if (f.estado !== "todos") n++;
  if (f.montoMin.trim()) n++;
  if (f.montoMax.trim()) n++;
  return n;
}

type AdvancedFieldsProps = {
  filtros: FiltrosHistorialState;
  patch: (p: Partial<FiltrosHistorialState>) => void;
  usuarios: { id: string; label: string }[];
  clientes: { id: string; label: string }[];
  idPrefix: string;
  layout: "popover" | "drawer";
};

function AdvancedFilterFields({
  filtros,
  patch,
  usuarios,
  clientes,
  idPrefix,
  layout,
}: AdvancedFieldsProps) {
  const gridClass = layout === "popover" ? "shfb__popover-grid" : "shfb__drawer-grid";

  return (
    <div className={gridClass}>
      <label className="shfb__field" htmlFor={`${idPrefix}-usuario`}>
        <span className="shfb__field-label">Cajero</span>
        <select
          id={`${idPrefix}-usuario`}
          className="shfb__field-select"
          value={filtros.usuarioId}
          onChange={(e) => patch({ usuarioId: e.target.value })}
        >
          <option value="todos">Todos</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </label>
      <label className="shfb__field" htmlFor={`${idPrefix}-cliente`}>
        <span className="shfb__field-label">Cliente</span>
        <select
          id={`${idPrefix}-cliente`}
          className="shfb__field-select"
          value={filtros.clienteId}
          onChange={(e) => patch({ clienteId: e.target.value })}
        >
          <option value="todos">Todos</option>
          <option value="sin">Sin cliente</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="shfb__field" htmlFor={`${idPrefix}-pago`}>
        <span className="shfb__field-label">Método de pago</span>
        <select
          id={`${idPrefix}-pago`}
          className="shfb__field-select"
          value={filtros.metodoPago}
          onChange={(e) => patch({ metodoPago: e.target.value })}
        >
          <option value="todos">Todos</option>
          <option value="efectivo">Efectivo</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="transferencia">Transferencia</option>
          <option value="mixto">Mixto</option>
          <option value="otro">Otro</option>
        </select>
      </label>
      <label className="shfb__field" htmlFor={`${idPrefix}-estado`}>
        <span className="shfb__field-label">Estado</span>
        <select
          id={`${idPrefix}-estado`}
          className="shfb__field-select"
          value={filtros.estado}
          onChange={(e) => patch({ estado: e.target.value as FiltrosHistorialState["estado"] })}
        >
          <option value="todos">Todos</option>
          <option value="confirmada">Completada</option>
          <option value="cancelada">Anulada</option>
        </select>
      </label>
      <label className="shfb__field" htmlFor={`${idPrefix}-min`}>
        <span className="shfb__field-label">Monto mínimo</span>
        <input
          id={`${idPrefix}-min`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="shfb__field-input input-numeric"
          placeholder="Sin mínimo"
          value={filtros.montoMin}
          onChange={(e) => patch({ montoMin: filterMoneyTyping(e.target.value) })}
        />
      </label>
      <label className="shfb__field" htmlFor={`${idPrefix}-max`}>
        <span className="shfb__field-label">Monto máximo</span>
        <input
          id={`${idPrefix}-max`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="shfb__field-input input-numeric"
          placeholder="Sin máximo"
          value={filtros.montoMax}
          onChange={(e) => patch({ montoMax: filterMoneyTyping(e.target.value) })}
        />
      </label>
    </div>
  );
}

type Props = {
  filtros: FiltrosHistorialState;
  onChange: (f: FiltrosHistorialState) => void;
  onPreset: (p: RangoPreset) => void;
  onApplyDates: () => void;
  onClear: () => void;
  onSaveView: () => void;
  onExport: () => void;
  usuarios: { id: string; label: string }[];
  clientes: { id: string; label: string }[];
  searchRef: React.RefObject<HTMLInputElement | null>;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
};

export function SalesFiltersBar({
  filtros,
  onChange,
  onPreset,
  onApplyDates,
  onClear,
  onSaveView,
  onExport,
  usuarios,
  clientes,
  searchRef,
  advancedOpen,
  onToggleAdvanced,
}: Props) {
  const uid = useId();
  const moreRef = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const advancedCount = useMemo(() => countAdvancedFilters(filtros), [filtros]);

  const patch = useCallback(
    (p: Partial<FiltrosHistorialState>) => onChange({ ...filtros, ...p }),
    [filtros, onChange]
  );

  useEffect(() => {
    if (!advancedOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        onToggleAdvanced();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggleAdvanced();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [advancedOpen, onToggleAdvanced]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const handlePresetKey = (e: React.KeyboardEvent, idx: number) => {
    const tabs = PRESETS.map((_, i) => document.getElementById(`${uid}-preset-${i}`));
    if (e.key === "ArrowRight") {
      e.preventDefault();
      tabs[(idx + 1) % tabs.length]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      tabs[(idx - 1 + tabs.length) % tabs.length]?.focus();
    }
  };

  return (
    <section className="shfb" aria-label="Filtros de ventas">
      <div className="shfb__bar">
        <div className="shfb__search">
          <MagnifyingGlass size={17} className="shfb__search-icon" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            className="shfb__search-input"
            placeholder="Factura, cliente, cajero…"
            value={filtros.texto}
            onChange={(e) => patch({ texto: e.target.value })}
            aria-label="Búsqueda global"
          />
          <kbd className="shfb__kbd" title="Atajo de teclado: barra /">
            /
          </kbd>
        </div>

        <div
          className="shfb__segmented"
          role="tablist"
          aria-label="Período rápido"
        >
          {PRESETS.map((p, idx) => {
            const active = filtros.preset === p.id;
            return (
              <button
                key={p.id}
                id={`${uid}-preset-${idx}`}
                type="button"
                role="tab"
                aria-selected={active}
                className={`shfb__segment${active ? " shfb__segment--active" : ""}`}
                onClick={() => onPreset(p.id)}
                onKeyDown={(e) => handlePresetKey(e, idx)}
                title={p.label}
              >
                {p.short === "icon" ? (
                  <CalendarBlank size={16} aria-hidden />
                ) : (
                  <>
                    <span className="shfb__segment-label-full">{p.label}</span>
                    {p.short ? (
                      <span className="shfb__segment-label-short" aria-hidden>
                        {p.short}
                      </span>
                    ) : null}
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div className="shfb__actions">
          <div className="shfb__more-wrap" ref={moreRef}>
            <button
              type="button"
              className={`shfb__btn shfb__btn--more${advancedOpen ? " shfb__btn--open" : ""}`}
              aria-expanded={advancedOpen}
              aria-haspopup="dialog"
              onClick={onToggleAdvanced}
              title="Filtrar por cajero, cliente, pago y montos"
            >
              <Funnel size={16} weight={advancedOpen ? "fill" : "regular"} aria-hidden />
              <span>Más filtros</span>
              {advancedCount > 0 ? (
                <span className="shfb__badge" aria-label={`${advancedCount} filtros activos`}>
                  {advancedCount}
                </span>
              ) : null}
            </button>

            {advancedOpen ? (
              <div
                className="shfb__popover"
                role="dialog"
                aria-modal="false"
                aria-label="Filtros avanzados"
              >
                <div className="shfb__popover-head">
                  <h3 className="shfb__popover-title">Filtros avanzados</h3>
                  <button
                    type="button"
                    className="shfb__btn shfb__btn--ghost"
                    aria-label="Cerrar filtros avanzados"
                    onClick={onToggleAdvanced}
                  >
                    <X size={16} aria-hidden />
                  </button>
                </div>
                <AdvancedFilterFields
                  filtros={filtros}
                  patch={patch}
                  usuarios={usuarios}
                  clientes={clientes}
                  idPrefix={`${uid}-pop`}
                  layout="popover"
                />
                <div className="shfb__popover-foot">
                  <button type="button" className="shfb__btn shfb__btn--ghost" onClick={onClear}>
                    Limpiar todo
                  </button>
                  <button type="button" className="shfb__btn shfb__btn--secondary" onClick={onToggleAdvanced}>
                    Listo
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="shfb__btn shfb__btn--ghost"
            onClick={onClear}
            title="Restablecer todos los filtros"
          >
            <X size={16} aria-hidden />
            <span className="shfb__btn-label-full">Limpiar</span>
          </button>
          <button
            type="button"
            className="shfb__btn shfb__btn--secondary"
            onClick={onSaveView}
            title="Guardar combinación actual de filtros"
          >
            <FloppyDisk size={16} aria-hidden />
            <span className="shfb__btn-label-full">Guardar vista</span>
          </button>
          <button type="button" className="shfb__btn shfb__btn--primary" onClick={onExport}>
            <DownloadSimple size={16} weight="bold" aria-hidden />
            <span>Exportar</span>
          </button>

          <button
            type="button"
            className="shfb__btn shfb__btn--secondary shfb__mobile-trigger"
            onClick={() => setMobileOpen(true)}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={16} aria-hidden />
            Filtros
            {advancedCount > 0 ? (
              <span className="shfb__badge" aria-hidden>
                {advancedCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {filtros.preset === "custom" ? (
        <div className="shfb__dates" aria-label="Rango personalizado">
          <label className="shfb__field" htmlFor={`${uid}-desde`}>
            <span className="shfb__field-label">Desde</span>
            <input
              id={`${uid}-desde`}
              type="date"
              className="shfb__field-input"
              value={filtros.desde}
              onChange={(e) => patch({ desde: e.target.value, preset: "custom" })}
            />
          </label>
          <label className="shfb__field" htmlFor={`${uid}-hasta`}>
            <span className="shfb__field-label">Hasta</span>
            <input
              id={`${uid}-hasta`}
              type="date"
              className="shfb__field-input"
              value={filtros.hasta}
              onChange={(e) => patch({ hasta: e.target.value, preset: "custom" })}
            />
          </label>
          <button type="button" className="shfb__btn shfb__btn--secondary" onClick={onApplyDates}>
            Aplicar
          </button>
        </div>
      ) : null}

      {mobileOpen ? (
        <div
          className="shfb__drawer-overlay"
          role="presentation"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="shfb__drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Filtros de ventas"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shfb__drawer-head">
              <h2 className="shfb__drawer-title">Filtros</h2>
              <button
                type="button"
                className="shfb__btn shfb__btn--ghost"
                aria-label="Cerrar"
                onClick={() => setMobileOpen(false)}
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="shfb__drawer-section">
              <span className="shfb__drawer-section-label">Período</span>
              <div className="shfb__segmented" role="group" aria-label="Período">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`shfb__segment${filtros.preset === p.id ? " shfb__segment--active" : ""}`}
                    onClick={() => onPreset(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {filtros.preset === "custom" ? (
                <div className="shfb__dates" style={{ paddingTop: "0.5rem" }}>
                  <label className="shfb__field" htmlFor={`${uid}-m-desde`}>
                    <span className="shfb__field-label">Desde</span>
                    <input
                      id={`${uid}-m-desde`}
                      type="date"
                      className="shfb__field-input"
                      value={filtros.desde}
                      onChange={(e) => patch({ desde: e.target.value, preset: "custom" })}
                    />
                  </label>
                  <label className="shfb__field" htmlFor={`${uid}-m-hasta`}>
                    <span className="shfb__field-label">Hasta</span>
                    <input
                      id={`${uid}-m-hasta`}
                      type="date"
                      className="shfb__field-input"
                      value={filtros.hasta}
                      onChange={(e) => patch({ hasta: e.target.value, preset: "custom" })}
                    />
                  </label>
                  <button type="button" className="shfb__btn shfb__btn--secondary" onClick={onApplyDates}>
                    Aplicar fechas
                  </button>
                </div>
              ) : null}
            </div>

            <div className="shfb__drawer-section">
              <span className="shfb__drawer-section-label">Detalle</span>
              <AdvancedFilterFields
                filtros={filtros}
                patch={patch}
                usuarios={usuarios}
                clientes={clientes}
                idPrefix={`${uid}-drawer`}
                layout="drawer"
              />
            </div>

            <div className="shfb__drawer-foot">
              <button type="button" className="shfb__btn shfb__btn--primary" onClick={onExport}>
                <DownloadSimple size={16} weight="bold" aria-hidden />
                Exportar
              </button>
              <button type="button" className="shfb__btn shfb__btn--secondary" onClick={onSaveView}>
                Guardar vista
              </button>
              <button
                type="button"
                className="shfb__btn shfb__btn--ghost"
                onClick={() => {
                  onClear();
                  setMobileOpen(false);
                }}
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
