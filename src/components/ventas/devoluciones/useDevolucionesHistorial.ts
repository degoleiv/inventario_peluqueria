import { useCallback, useEffect, useMemo, useState } from "react";
import {
  aprobarDevolucion,
  anularDevolucion,
  fetchDevolucion,
  fetchDevoluciones,
  fetchDevolucionesKpis,
  procesarDevolucion,
  rechazarDevolucion,
  type Devolucion,
  type DevolucionDetalle,
  type DevolucionEstado,
  type DevolucionKpis,
} from "../../../api";
import { useToast } from "../../../context/ToastContext";

const PAGE_SIZE = 20;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function useDevolucionesHistorial() {
  const toast = useToast();

  const [desde, setDesde] = useState(() => daysAgo(30));
  const [hasta, setHasta] = useState(todayISO);
  const [estadoFiltro, setEstadoFiltro] = useState<DevolucionEstado | "todos">("todos");
  const [busqueda, setBusqueda] = useState("");
  const [debouncedBusqueda, setDebouncedBusqueda] = useState("");

  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<DevolucionKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<DevolucionDetalle | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedBusqueda(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params: { desde?: string; hasta?: string; estado?: string } = {};
      if (desde) params.desde = desde;
      if (hasta) params.hasta = hasta;
      if (estadoFiltro !== "todos") params.estado = estadoFiltro;
      const rows = await fetchDevoluciones(params);
      setDevoluciones(rows);
      setPage(1);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar devoluciones", "error");
      setDevoluciones([]);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, estadoFiltro, toast]);

  const loadKpis = useCallback(async () => {
    setKpisLoading(true);
    try {
      const k = await fetchDevolucionesKpis(desde, hasta);
      setKpis(k);
    } catch {
      setKpis(null);
    } finally {
      setKpisLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    void loadList();
    void loadKpis();
  }, [loadList, loadKpis]);

  const filtradas = useMemo(() => {
    if (!debouncedBusqueda) return devoluciones;
    const q = debouncedBusqueda.toLowerCase();
    return devoluciones.filter(
      (d) =>
        String(d.id).includes(q) ||
        (d.cliente_nombre ?? "").toLowerCase().includes(q) ||
        d.motivo.toLowerCase().includes(q) ||
        String(d.venta_id).includes(q)
    );
  }, [devoluciones, debouncedBusqueda]);

  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pagina = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return filtradas.slice(start, start + PAGE_SIZE);
  }, [filtradas, pageSafe]);

  const rangeLabel = useMemo(() => {
    if (filtradas.length === 0) return { from: 0, to: 0, total: 0 };
    const from = (pageSafe - 1) * PAGE_SIZE + 1;
    const to = Math.min(pageSafe * PAGE_SIZE, filtradas.length);
    return { from, to, total: filtradas.length };
  }, [filtradas.length, pageSafe]);

  const openDetalle = useCallback(async (id: number) => {
    setSelectedId(id);
    setDetalle(null);
    setDetalleLoading(true);
    try {
      setDetalle(await fetchDevolucion(id));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar detalle", "error");
      setSelectedId(null);
    } finally {
      setDetalleLoading(false);
    }
  }, [toast]);

  const closeDetalle = useCallback(() => {
    setSelectedId(null);
    setDetalle(null);
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([loadList(), loadKpis()]);
  }, [loadList, loadKpis]);

  const handleAprobar = useCallback(async () => {
    if (!selectedId) return;
    setActionBusy(true);
    try {
      await aprobarDevolucion(selectedId);
      toast("Devolución aprobada", "success");
      setDetalle(await fetchDevolucion(selectedId));
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al aprobar", "error");
    } finally {
      setActionBusy(false);
    }
  }, [selectedId, toast, reload]);

  const handleProcesar = useCallback(async () => {
    if (!selectedId) return;
    setActionBusy(true);
    try {
      await procesarDevolucion(selectedId);
      toast("Reembolso procesado", "success");
      setDetalle(await fetchDevolucion(selectedId));
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al procesar", "error");
    } finally {
      setActionBusy(false);
    }
  }, [selectedId, toast, reload]);

  const handleRechazar = useCallback(async () => {
    if (!selectedId) return;
    setActionBusy(true);
    try {
      await rechazarDevolucion(selectedId, { motivo: "Rechazada por operador" });
      toast("Devolución rechazada", "success");
      setDetalle(await fetchDevolucion(selectedId));
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al rechazar", "error");
    } finally {
      setActionBusy(false);
    }
  }, [selectedId, toast, reload]);

  const handleAnular = useCallback(async () => {
    if (!selectedId) return;
    setActionBusy(true);
    try {
      await anularDevolucion(selectedId, { motivo: "Anulada por operador" });
      toast("Devolución anulada", "success");
      setDetalle(await fetchDevolucion(selectedId));
      await reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al anular", "error");
    } finally {
      setActionBusy(false);
    }
  }, [selectedId, toast, reload]);

  return {
    desde,
    setDesde,
    hasta,
    setHasta,
    estadoFiltro,
    setEstadoFiltro,
    busqueda,
    setBusqueda,
    devoluciones: filtradas,
    devolucionesPagina: pagina,
    loading,
    kpis,
    kpisLoading,
    selectedId,
    detalle,
    detalleLoading,
    openDetalle,
    closeDetalle,
    createOpen,
    setCreateOpen,
    actionBusy,
    handleAprobar,
    handleProcesar,
    handleRechazar,
    handleAnular,
    reload,
    page: pageSafe,
    setPage,
    totalPages,
    rangeLabel,
  };
}
