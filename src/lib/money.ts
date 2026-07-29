/** Pesos: separador de miles con punto, sin decimales (locale es-CO). */
const LOCALE = "es-CO";

export const moneyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const moneyDigitsFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Muestra un monto en pesos, p. ej. `$ 1.234.567`. */
export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return moneyFormatter.format(0);
  return moneyFormatter.format(Math.round(n));
}

/** Quita todo excepto dígitos. */
export function stripMoneyDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Formatea mientras el usuario escribe (solo dígitos → puntos de miles). */
export function filterMoneyTyping(raw: string): string {
  const digits = stripMoneyDigits(raw);
  if (digits === "") return "";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return "";
  return moneyDigitsFormatter.format(n);
}

/** Parsea texto con o sin puntos de miles → número entero o vacío. */
export function parseMoneyInput(raw: string): number | "" {
  const digits = stripMoneyDigits(raw);
  if (digits === "") return "";
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 ? n : "";
}

/** Igual que parseMoneyInput pero devuelve 0 si está vacío o inválido. */
export function parseMoneyLoose(raw: string): number {
  const parsed = parseMoneyInput(raw);
  return parsed === "" ? 0 : parsed;
}

/** Valor formateado para inputs controlados (sin símbolo $). */
export function formatMoneyForInput(n: number | ""): string {
  if (n === "" || !Number.isFinite(n)) return "";
  return moneyDigitsFormatter.format(Math.round(n));
}

/** Redondeo a pesos enteros. */
export function roundMoney(n: number): number {
  return Math.round(n);
}
