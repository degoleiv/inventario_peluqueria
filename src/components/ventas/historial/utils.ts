import type { Venta } from "../../../api";
import { labelMetodoPago, metodoPagoCoincideFiltro } from "../../../lib/ventaMetodoPago";

export { labelMetodoPago };

export const moneyEsAr = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

export type VentaEstadoUi = "completada" | "anulada" | "pendiente";

export type RangoPreset = "hoy" | "ayer" | "7d" | "30d" | "mes" | "custom";

export type FiltrosHistorialState = {
  preset: RangoPreset;
  desde: string;
  hasta: string;
  texto: string;
  metodoPago: string;
  estado: "todos" | "confirmada" | "cancelada";
  usuarioId: string;
  clienteId: string;
  montoMin: string;
  montoMax: string;
};

const STORAGE_KEY = "peluqueria_ventas_historial_filtros_v2";

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function isoDateLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function defaultRango(): { desde: string; hasta: string } {
  const hasta = new Date();
  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - 30);
  return { desde: isoDateLocal(desde), hasta: isoDateLocal(hasta) };
}

export function defaultFiltros(): FiltrosHistorialState {
  const r = defaultRango();
  return {
    preset: "30d",
    desde: r.desde,
    hasta: r.hasta,
    texto: "",
    metodoPago: "todos",
    estado: "todos",
    usuarioId: "todos",
    clienteId: "todos",
    montoMin: "",
    montoMax: "",
  };
}

export function loadFiltrosGuardados(): FiltrosHistorialState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<FiltrosHistorialState>;
    if (!p.desde || !p.hasta) return null;
    const d = defaultFiltros();
    return {
      ...d,
      preset: p.preset ?? d.preset,
      desde: p.desde,
      hasta: p.hasta,
      texto: typeof p.texto === "string" ? p.texto : "",
      metodoPago: p.metodoPago ?? d.metodoPago,
      estado: p.estado ?? d.estado,
      usuarioId: p.usuarioId ?? d.usuarioId,
      clienteId: p.clienteId ?? d.clienteId,
      montoMin: typeof p.montoMin === "string" ? p.montoMin : "",
      montoMax: typeof p.montoMax === "string" ? p.montoMax : "",
    };
  } catch {
    return null;
  }
}

export function saveFiltrosGuardados(f: FiltrosHistorialState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}

export function rangoFromPreset(preset: RangoPreset): { desde: string; hasta: string } {
  const hoy = new Date();
  const hasta = isoDateLocal(hoy);
  if (preset === "custom") return defaultRango();
  if (preset === "hoy") return { desde: hasta, hasta };
  if (preset === "ayer") {
    const ay = new Date(hoy);
    ay.setDate(ay.getDate() - 1);
    const d = isoDateLocal(ay);
    return { desde: d, hasta: d };
  }
  if (preset === "7d") {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 6);
    return { desde: isoDateLocal(d), hasta };
  }
  if (preset === "30d") {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 29);
    return { desde: isoDateLocal(d), hasta };
  }
  if (preset === "mes") {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return { desde: isoDateLocal(d), hasta };
  }
  return defaultRango();
}

export function fmtFechaHora(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function fmtFechaCorta(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function ventaEstadoUi(v: Venta): VentaEstadoUi {
  const e = String(v.estado ?? "confirmada").toLowerCase();
  if (e === "cancelada") return "anulada";
  if (e === "confirmada") return "completada";
  return "pendiente";
}

export function ventaActiva(v: Venta) {
  return ventaEstadoUi(v) !== "anulada";
}

export function productsCount(v: Venta): number {
  const nProd = Number(v.num_lineas ?? 0);
  const nSvc = Number(v.num_servicios ?? 0);
  return nProd + nSvc;
}

export function resumenItemsVenta(v: Venta): string {
  const parts: string[] = [];
  if (v.resumen_productos?.trim()) parts.push(v.resumen_productos.trim());
  if (v.resumen_servicios?.trim()) parts.push(v.resumen_servicios.trim());
  if (parts.length) return parts.join(" · ");
  const n = productsCount(v);
  if (n === 0) return "Sin ítems";
  return `${n} ítem${n === 1 ? "" : "s"}`;
}

export function matchesFiltrosLocales(v: Venta, f: FiltrosHistorialState): boolean {
  const est = String(v.estado ?? "confirmada");
  if (f.estado === "confirmada" && est === "cancelada") return false;
  if (f.estado === "cancelada" && est !== "cancelada") return false;
  if (f.metodoPago !== "todos" && !metodoPagoCoincideFiltro(v.metodo_pago ?? "", f.metodoPago)) {
    return false;
  }

  if (f.usuarioId !== "todos") {
    if (f.usuarioId.startsWith("n:")) {
      const want = f.usuarioId.slice(2).trim().toLowerCase();
      if ((v.vendedor_nombre ?? "").trim().toLowerCase() !== want) return false;
    } else {
      const vid = v.usuario_id != null ? String(v.usuario_id) : "";
      if (vid !== f.usuarioId) return false;
    }
  }

  if (f.clienteId !== "todos") {
    if (f.clienteId === "sin") {
      if (v.cliente_id != null && Number(v.cliente_id) > 0) return false;
    } else {
      const cid = v.cliente_id != null ? String(v.cliente_id) : "";
      if (cid !== f.clienteId) return false;
    }
  }

  const min = f.montoMin.trim() ? Number(f.montoMin.replace(",", ".")) : NaN;
  const max = f.montoMax.trim() ? Number(f.montoMax.replace(",", ".")) : NaN;
  const total = Number(v.total);
  if (Number.isFinite(min) && total < min) return false;
  if (Number.isFinite(max) && total > max) return false;

  const q = f.texto.trim().toLowerCase();
  if (!q) return true;
  const blob = [
    String(v.id),
    v.cliente_nombre ?? "",
    v.vendedor_nombre ?? "",
    v.metodo_pago,
    labelMetodoPago(v.metodo_pago),
    v.notas ?? "",
    v.resumen_productos ?? "",
    v.resumen_servicios ?? "",
    ventaEstadoUi(v),
  ]
    .join(" ")
    .toLowerCase();
  return blob.includes(q);
}

export function exportVentasCsv(ventas: Venta[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [
    ["ID", "Fecha", "Cliente", "Vendedor", "Items", "Total", "Pago", "Estado", "Notas"].join(","),
    ...ventas.map((v) =>
      [
        v.id,
        fmtFechaHora(v.fecha),
        v.cliente_nombre ?? "",
        v.vendedor_nombre ?? "",
        resumenItemsVenta(v),
        Number(v.total).toFixed(2),
        labelMetodoPago(v.metodo_pago),
        ventaEstadoUi(v),
        (v.notas ?? "").replace(/\r?\n/g, " "),
      ]
        .map((x) => esc(String(x)))
        .join(",")
    ),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ventas_${isoDateLocal(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
