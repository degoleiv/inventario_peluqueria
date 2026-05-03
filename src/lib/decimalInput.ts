/** Entrada decimal como texto: evita el bloqueo al escribir sobre un 0 inicial (inputs controlados numéricos). */

export function filterDecimalTyping(raw: string): string {
  let s = raw.replace(",", ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  }
  return s;
}

export function parseDecimalLoose(s: string): number {
  const t = s.trim().replace(",", ".");
  if (t === "" || t === ".") return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export function formatDecimalForInput(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(n);
}

/** Enteros: permite borrar y volver a escribir sin quedar forzado a 0 en cada tecla. */
export function filterIntegerTyping(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function parseIntLoose(s: string, fallback: number): number {
  const t = s.trim();
  if (t === "") return fallback;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : fallback;
}
