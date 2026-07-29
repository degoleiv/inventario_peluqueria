import type { DevolucionEstado } from "../../../api";

export const ESTADO_LABELS: Record<DevolucionEstado, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  procesada: "Procesada",
  rechazada: "Rechazada",
  anulada: "Anulada",
};

export const ESTADO_CSS_CLASS: Record<DevolucionEstado, string> = {
  pendiente: "returns-badge--pendiente",
  aprobada: "returns-badge--aprobada",
  procesada: "returns-badge--procesada",
  rechazada: "returns-badge--rechazada",
  anulada: "returns-badge--anulada",
};

export function formatCurrency(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleString("es", { dateStyle: "short", timeStyle: "short" });
}
