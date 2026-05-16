export type MedioPagoTransferencia = {
  id: string;
  label: string;
  emoji: string | null;
  activo: boolean;
  orden: number;
};

const EMOJI_PAGO_POR_ID: Record<string, string> = {
  nequi: "📱",
  daviplata: "🟣",
  llave: "🔑",
  bold: "💳",
  bancolombia: "🏦",
};

export const MEDIOS_TRANSFERENCIA_DEFAULT: MedioPagoTransferencia[] = [
  { id: "nequi", label: "Nequi", emoji: "📱", activo: true, orden: 0 },
  { id: "daviplata", label: "Daviplata", emoji: "🟣", activo: true, orden: 1 },
  { id: "llave", label: "Llave", emoji: "🔑", activo: true, orden: 2 },
  { id: "bold", label: "Bold", emoji: "💳", activo: true, orden: 3 },
];

export function emojiMedioTransferencia(m: MedioPagoTransferencia): string {
  if (m.emoji?.trim()) return m.emoji.trim();
  if (EMOJI_PAGO_POR_ID[m.id]) return EMOJI_PAGO_POR_ID[m.id];
  const k = m.id.toLowerCase();
  for (const [key, em] of Object.entries(EMOJI_PAGO_POR_ID)) {
    if (k.includes(key)) return em;
  }
  return "💸";
}

export function etiquetaMedioTransferencia(m: MedioPagoTransferencia): string {
  const em = emojiMedioTransferencia(m);
  return em ? `${em} ${m.label}` : m.label;
}

let cache: MedioPagoTransferencia[] | null = null;
let cachePromise: Promise<MedioPagoTransferencia[]> | null = null;

export function invalidateMediosPagoTransferenciaCache() {
  cache = null;
  cachePromise = null;
}

export function setMediosPagoTransferenciaCache(medios: MedioPagoTransferencia[]) {
  cache = medios;
}

export function getMediosPagoTransferenciaCached(): MedioPagoTransferencia[] | null {
  return cache;
}

export function mediosTransferenciaActivos(
  medios: MedioPagoTransferencia[] = MEDIOS_TRANSFERENCIA_DEFAULT
): MedioPagoTransferencia[] {
  return medios.filter((m) => m.activo);
}

export function labelMedioTransferencia(
  id: string,
  medios: MedioPagoTransferencia[] = MEDIOS_TRANSFERENCIA_DEFAULT
): string {
  const hit = medios.find((m) => m.id === id);
  if (hit) return hit.label;
  const def = MEDIOS_TRANSFERENCIA_DEFAULT.find((m) => m.id === id);
  return def?.label ?? id;
}

export function idsMediosActivos(medios: MedioPagoTransferencia[]): Set<string> {
  return new Set(mediosTransferenciaActivos(medios).map((m) => m.id));
}

export function esIdMedioTransferenciaValido(
  id: string,
  medios: MedioPagoTransferencia[]
): boolean {
  return idsMediosActivos(medios).has(id.trim());
}
