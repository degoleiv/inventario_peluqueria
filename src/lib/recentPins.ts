/** Favoritos y recientes en localStorage (acceso rápido POS / clientes). */

const MAX_RECENT = 12;

function readIds(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map(Number).filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: number[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

const KEY_PIN_P = "peluqueria_pins_productos";
const KEY_REC_P = "peluqueria_recent_productos";
const KEY_PIN_C = "peluqueria_pins_clientes";
const KEY_REC_C = "peluqueria_recent_clientes";

export function getPinnedProductIds(): number[] {
  return readIds(KEY_PIN_P);
}

export function isProductPinned(id: number): boolean {
  return getPinnedProductIds().includes(id);
}

export function togglePinProduct(id: number): boolean {
  const cur = getPinnedProductIds();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  writeIds(KEY_PIN_P, next);
  return next.includes(id);
}

export function recordRecentProduct(id: number) {
  const cur = readIds(KEY_REC_P).filter((x) => x !== id);
  cur.unshift(id);
  writeIds(KEY_REC_P, cur.slice(0, MAX_RECENT));
}

export function getRecentProductIds(): number[] {
  return readIds(KEY_REC_P);
}

export function getPinnedClienteIds(): number[] {
  return readIds(KEY_PIN_C);
}

export function isClientePinned(id: number): boolean {
  return getPinnedClienteIds().includes(id);
}

export function togglePinCliente(id: number): boolean {
  const cur = getPinnedClienteIds();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  writeIds(KEY_PIN_C, next);
  return next.includes(id);
}

export function recordRecentCliente(id: number) {
  const cur = readIds(KEY_REC_C).filter((x) => x !== id);
  cur.unshift(id);
  writeIds(KEY_REC_C, cur.slice(0, MAX_RECENT));
}

export function getRecentClienteIds(): number[] {
  return readIds(KEY_REC_C);
}
