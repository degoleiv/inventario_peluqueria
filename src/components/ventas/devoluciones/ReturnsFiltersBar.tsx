import type { DevolucionEstado } from "../../../api";

type Props = {
  busqueda: string;
  onBusquedaChange: (v: string) => void;
  estadoFiltro: DevolucionEstado | "todos";
  onEstadoChange: (v: DevolucionEstado | "todos") => void;
  desde: string;
  hasta: string;
  onDesdeChange: (v: string) => void;
  onHastaChange: (v: string) => void;
};

export function ReturnsFiltersBar({
  busqueda,
  onBusquedaChange,
  estadoFiltro,
  onEstadoChange,
  desde,
  hasta,
  onDesdeChange,
  onHastaChange,
}: Props) {
  return (
    <div className="returns-filters">
      <label className="field returns-filters__search">
        <span>Buscar</span>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => onBusquedaChange(e.target.value)}
          placeholder="Cliente, motivo, ID…"
          autoComplete="off"
        />
      </label>
      <label className="field">
        <span>Estado</span>
        <select
          value={estadoFiltro}
          onChange={(e) => onEstadoChange(e.target.value as DevolucionEstado | "todos")}
        >
          <option value="todos">Todos</option>
          <option value="pendiente">Pendientes</option>
          <option value="aprobada">Aprobadas</option>
          <option value="procesada">Procesadas</option>
          <option value="rechazada">Rechazadas</option>
          <option value="anulada">Anuladas</option>
        </select>
      </label>
      <label className="field">
        <span>Desde</span>
        <input type="date" value={desde} onChange={(e) => onDesdeChange(e.target.value)} />
      </label>
      <label className="field">
        <span>Hasta</span>
        <input type="date" value={hasta} onChange={(e) => onHastaChange(e.target.value)} />
      </label>
    </div>
  );
}
