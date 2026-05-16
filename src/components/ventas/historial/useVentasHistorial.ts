import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cancelarVenta,
  fetchEquipo,
  fetchVenta,
  fetchVentas,
  type EquipoMiembro,
  type Venta,
  type VentaDetalle,
} from "../../../api";
import { useToast } from "../../../context/ToastContext";
import {
  defaultFiltros,
  loadFiltrosGuardados,
  matchesFiltrosLocales,
  rangoFromPreset,
  saveFiltrosGuardados,
  type FiltrosHistorialState,
  type RangoPreset,
} from "./utils";

const PAGE_SIZES = [10, 20, 50, 100] as const;

export function useVentasHistorial() {
  const toast = useToast();
  const [filtros, setFiltros] = useState<FiltrosHistorialState>(() => loadFiltrosGuardados() ?? defaultFiltros());
  const [debouncedTexto, setDebouncedTexto] = useState(filtros.texto);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [equipo, setEquipo] = useState<EquipoMiembro[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<VentaDetalle | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Venta | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedTexto(filtros.texto), 300);
    return () => clearTimeout(t);
  }, [filtros.texto]);

  const loadVentas = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchVentas(filtros.desde, filtros.hasta);
      setVentas(rows);
      setPage(1);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar ventas", "error");
      setVentas([]);
    } finally {
      setLoading(false);
    }
  }, [filtros.desde, filtros.hasta, toast]);

  useEffect(() => {
    void loadVentas();
  }, [loadVentas]);

  useEffect(() => {
    void fetchEquipo()
      .then(setEquipo)
      .catch(() => setEquipo([]));
  }, []);

  const filtrosEfectivos = useMemo(
    () => ({ ...filtros, texto: debouncedTexto }),
    [filtros, debouncedTexto]
  );

  const ventasFiltradas = useMemo(
    () => ventas.filter((v) => matchesFiltrosLocales(v, filtrosEfectivos)),
    [ventas, filtrosEfectivos]
  );

  const kpis = useMemo(() => {
    const activas = ventasFiltradas.filter((v) => String(v.estado ?? "confirmada") !== "cancelada");
    const totalVentas = activas.length;
    const monto = activas.reduce((s, v) => s + Number(v.total), 0);
    const ticketProm = totalVentas > 0 ? monto / totalVentas : 0;
    const metodos = new Map<string, number>();
    const vendedores = new Map<string, number>();
    for (const v of activas) {
      const mp = v.metodo_pago || "otro";
      metodos.set(mp, (metodos.get(mp) ?? 0) + 1);
      const vn = (v.vendedor_nombre ?? "Sin asignar").trim();
      vendedores.set(vn, (vendedores.get(vn) ?? 0) + 1);
    }
    let topMetodo = "—";
    let topMetodoCount = 0;
    for (const [k, c] of metodos) {
      if (c > topMetodoCount) {
        topMetodo = k;
        topMetodoCount = c;
      }
    }
    let topVendedor = "—";
    let topVendedorCount = 0;
    for (const [k, c] of vendedores) {
      if (c > topVendedorCount) {
        topVendedor = k;
        topVendedorCount = c;
      }
    }
    return { totalVentas, monto, ticketProm, topMetodo, topVendedor };
  }, [ventasFiltradas]);

  const usuariosOpciones = useMemo(() => {
    const ids = new Map<string, string>();
    for (const v of ventas) {
      if (v.usuario_id != null) ids.set(String(v.usuario_id), v.vendedor_nombre ?? `Usuario #${v.usuario_id}`);
      else if (v.vendedor_nombre?.trim()) ids.set(`n:${v.vendedor_nombre.trim()}`, v.vendedor_nombre.trim());
    }
    for (const u of equipo) {
      ids.set(String(u.id), u.nombre ?? `Usuario #${u.id}`);
    }
    return [...ids.entries()].map(([id, label]) => ({ id, label }));
  }, [ventas, equipo]);

  const clientesOpciones = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of ventas) {
      if (v.cliente_id != null && v.cliente_nombre?.trim()) {
        m.set(String(v.cliente_id), v.cliente_nombre.trim());
      }
    }
    return [...m.entries()].map(([id, label]) => ({ id, label }));
  }, [ventas]);

  const totalPages = Math.max(1, Math.ceil(ventasFiltradas.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const ventasPagina = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return ventasFiltradas.slice(start, start + pageSize);
  }, [ventasFiltradas, pageSafe, pageSize]);

  const rangeLabel = useMemo(() => {
    if (ventasFiltradas.length === 0) return { from: 0, to: 0, total: 0 };
    const from = (pageSafe - 1) * pageSize + 1;
    const to = Math.min(pageSafe * pageSize, ventasFiltradas.length);
    return { from, to, total: ventasFiltradas.length };
  }, [ventasFiltradas.length, pageSafe, pageSize]);

  const setPreset = useCallback((preset: RangoPreset) => {
    const r = preset === "custom" ? undefined : rangoFromPreset(preset);
    setFiltros((prev) => {
      const next = r ? { ...prev, preset, ...r } : { ...prev, preset };
      saveFiltrosGuardados(next);
      return next;
    });
  }, []);

  const limpiarFiltros = useCallback(() => {
    const d = defaultFiltros();
    setFiltros(d);
    setDebouncedTexto("");
    saveFiltrosGuardados(d);
    setPage(1);
  }, []);

  const guardarVista = useCallback(() => {
    saveFiltrosGuardados(filtros);
    toast("Vista de filtros guardada para esta sesión", "success");
  }, [filtros, toast]);

  const openDetalle = useCallback(async (id: number) => {
    setSelectedId(id);
    setDetalle(null);
    setDetalleLoading(true);
    try {
      const d = await fetchVenta(id);
      setDetalle(d);
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

  const confirmCancelar = useCallback(async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      await cancelarVenta(cancelTarget.id, { motivo: "Anulación desde historial", cancelado_por: "empleado" });
      toast(`Venta #${cancelTarget.id} anulada`, "success");
      setCancelTarget(null);
      closeDetalle();
      await loadVentas();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo anular la venta", "error");
    } finally {
      setCancelBusy(false);
    }
  }, [cancelTarget, closeDetalle, loadVentas, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return {
    filtros,
    setFiltros,
    setPreset,
    limpiarFiltros,
    guardarVista,
    ventas,
    ventasFiltradas,
    ventasPagina,
    loading,
    kpis,
    usuariosOpciones,
    clientesOpciones,
    page: pageSafe,
    setPage,
    pageSize,
    setPageSize,
    pageSizes: PAGE_SIZES,
    totalPages,
    rangeLabel,
    selectedId,
    detalle,
    detalleLoading,
    openDetalle,
    closeDetalle,
    loadVentas,
    cancelTarget,
    setCancelTarget,
    cancelBusy,
    confirmCancelar,
    searchRef,
  };
}
