import { MagnifyingGlass, Funnel, X } from "@phosphor-icons/react";
import type { FiltrosHistorialState, RangoPreset } from "./utils";

const PRESETS: { id: RangoPreset; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "mes", label: "Este mes" },
  { id: "custom", label: "Personalizado" },
];

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
  const patch = (p: Partial<FiltrosHistorialState>) => onChange({ ...filtros, ...p });

  return (
    <section className="sales-history-filters card-pro" aria-label="Filtros de ventas">
      <div className="sales-history-filters-search">
        <MagnifyingGlass size={18} className="sales-history-filters-search-icon" aria-hidden />
        <input
          ref={searchRef}
          type="search"
          className="sales-history-filters-input"
          placeholder="Buscar factura, cliente, cajero, pago, notas…"
          value={filtros.texto}
          onChange={(e) => patch({ texto: e.target.value })}
          aria-label="Búsqueda global"
        />
        <kbd className="sales-history-kbd" title="Atajo: /">/</kbd>
      </div>

      <div className="sales-history-presets" role="group" aria-label="Período rápido">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`sales-history-preset${filtros.preset === p.id ? " is-active" : ""}`}
            onClick={() => onPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {filtros.preset === "custom" ? (
        <div className="sales-history-dates">
          <label className="sales-history-field">
            <span>Desde</span>
            <input
              type="date"
              value={filtros.desde}
              onChange={(e) => patch({ desde: e.target.value, preset: "custom" })}
            />
          </label>
          <label className="sales-history-field">
            <span>Hasta</span>
            <input
              type="date"
              value={filtros.hasta}
              onChange={(e) => patch({ hasta: e.target.value, preset: "custom" })}
            />
          </label>
          <button type="button" className="btn primary small" onClick={onApplyDates}>
            Aplicar fechas
          </button>
        </div>
      ) : null}

      <div className="sales-history-filters-toolbar">
        <button type="button" className="btn ghost small" onClick={onToggleAdvanced}>
          <Funnel size={16} aria-hidden />
          {advancedOpen ? "Ocultar filtros" : "Más filtros"}
        </button>
        <button type="button" className="btn ghost small" onClick={onClear}>
          <X size={16} aria-hidden />
          Limpiar
        </button>
        <button type="button" className="btn ghost small" onClick={onSaveView}>
          Guardar vista
        </button>
        <button type="button" className="btn ghost small" onClick={onExport}>
          Exportar
        </button>
      </div>

      {advancedOpen ? (
        <div className="sales-history-filters-advanced">
          <label className="sales-history-field">
            <span>Usuario</span>
            <select value={filtros.usuarioId} onChange={(e) => patch({ usuarioId: e.target.value })}>
              <option value="todos">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sales-history-field">
            <span>Cliente</span>
            <select value={filtros.clienteId} onChange={(e) => patch({ clienteId: e.target.value })}>
              <option value="todos">Todos</option>
              <option value="sin">Sin cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sales-history-field">
            <span>Método de pago</span>
            <select value={filtros.metodoPago} onChange={(e) => patch({ metodoPago: e.target.value })}>
              <option value="todos">Todos</option>
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="mixto">Mixto</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <label className="sales-history-field">
            <span>Estado</span>
            <select
              value={filtros.estado}
              onChange={(e) => patch({ estado: e.target.value as FiltrosHistorialState["estado"] })}
            >
              <option value="todos">Todos</option>
              <option value="confirmada">Completada</option>
              <option value="cancelada">Anulada</option>
            </select>
          </label>
          <label className="sales-history-field">
            <span>Monto mín.</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="0"
              value={filtros.montoMin}
              onChange={(e) => patch({ montoMin: e.target.value })}
            />
          </label>
          <label className="sales-history-field">
            <span>Monto máx.</span>
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="—"
              value={filtros.montoMax}
              onChange={(e) => patch({ montoMax: e.target.value })}
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}