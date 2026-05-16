/** Medio de pago por transferencia configurable (Nequi, Daviplata, Llave, Bold, etc.). */
export type MedioPagoTransferencia = {
  id: string;
  label: string;
  emoji: string | null;
  activo: boolean;
  orden: number;
};

export const CLAVE_MEDIOS_PAGO_TRANSFERENCIA = "medios_pago_transferencia";

export const MEDIOS_TRANSFERENCIA_DEFAULT: MedioPagoTransferencia[] = [
  { id: "nequi", label: "Nequi", emoji: "📱", activo: true, orden: 0 },
  { id: "daviplata", label: "Daviplata", emoji: "🟣", activo: true, orden: 1 },
  { id: "llave", label: "Llave", emoji: "🔑", activo: true, orden: 2 },
  { id: "bold", label: "Bold", emoji: "💳", activo: true, orden: 3 },
];

function normalizarEmoji(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t ? t.slice(0, 32) : null;
}

const IDS_RESERVADOS = new Set([
  "efectivo",
  "tarjeta",
  "transferencia",
  "mixto",
  "otro",
]);

export function slugMedioTransferencia(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function parseMediosTransferenciaJson(val: string | null | undefined): MedioPagoTransferencia[] {
  if (val == null || val.trim() === "") return [...MEDIOS_TRANSFERENCIA_DEFAULT];
  try {
    const parsed = JSON.parse(val) as unknown;
    return normalizarMediosTransferencia(parsed);
  } catch {
    return [...MEDIOS_TRANSFERENCIA_DEFAULT];
  }
}

export function normalizarMediosTransferencia(raw: unknown): MedioPagoTransferencia[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...MEDIOS_TRANSFERENCIA_DEFAULT];
  const out: MedioPagoTransferencia[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item == null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = slugMedioTransferencia(String(o.id ?? o.label ?? ""));
    if (!id || IDS_RESERVADOS.has(id) || seen.has(id)) continue;
    seen.add(id);
    const label = String(o.label ?? id).trim().slice(0, 80) || id;
    out.push({
      id,
      label,
      emoji: normalizarEmoji(o.emoji),
      activo: o.activo !== false,
      orden: Number.isFinite(Number(o.orden)) ? Math.floor(Number(o.orden)) : i,
    });
  }
  if (out.length === 0) return [...MEDIOS_TRANSFERENCIA_DEFAULT];
  return out.sort((a, b) => a.orden - b.orden || a.label.localeCompare(b.label, "es"));
}

export function validarMediosTransferenciaBody(raw: unknown): MedioPagoTransferencia[] {
  const list = normalizarMediosTransferencia(raw);
  const activos = list.filter((m) => m.activo);
  if (activos.length === 0) {
    throw new Error("Debe haber al menos un medio de transferencia activo");
  }
  return list;
}

export function mediosTransferenciaActivos(medios: MedioPagoTransferencia[]): MedioPagoTransferencia[] {
  return medios.filter((m) => m.activo);
}

export function labelMedioTransferencia(id: string, medios: MedioPagoTransferencia[]): string {
  const hit = medios.find((m) => m.id === id);
  if (hit) return hit.label;
  const def = MEDIOS_TRANSFERENCIA_DEFAULT.find((m) => m.id === id);
  return def?.label ?? id;
}

/** Código almacenado en ventas.metodo_pago */
export function codigoTransferencia(medioId: string): string {
  return `transferencia_${slugMedioTransferencia(medioId)}`;
}

export function esCodigoTransferencia(metodo: string): boolean {
  return metodo.trim().toLowerCase().startsWith("transferencia_");
}

export function idDesdeCodigoTransferencia(metodo: string): string | null {
  const m = metodo.trim().toLowerCase();
  if (!m.startsWith("transferencia_")) return null;
  return m.slice("transferencia_".length) || null;
}
