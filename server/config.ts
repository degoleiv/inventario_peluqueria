/**
 * Puerto HTTP del API. Por defecto 3011: en Windows, WSL suele reenviar el 3010 (`wslrelay`)
 * y las peticiones a `127.0.0.1:3010` no llegan a esta app (login falla en dev/Tauri).
 */
export const API_DEFAULT_PORT = 3011;

export function resolveApiPort(raw = process.env.INVENTARIO_API_PORT): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 65536 ? Math.floor(n) : API_DEFAULT_PORT;
}

/** Sesión JWT: mínimo obligatorio 8 horas. `JWT_EXPIRY_SEC` en env solo puede alargar, nunca acortar. */
const JWT_MIN_SEC = 8 * 60 * 60;

export const JWT_EXPIRY_SEC = (() => {
  const raw = process.env.JWT_EXPIRY_SEC?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= JWT_MIN_SEC) return Math.floor(n);
  }
  return JWT_MIN_SEC;
})();
export const BCRYPT_ROUNDS = 11;

export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET es obligatorio en producción");
  }
  return "dev-only-secret-change-me";
}

export function businessHours(): { open: number; close: number } {
  const open = Number(process.env.BUSINESS_OPEN_HOUR ?? 9);
  const close = Number(process.env.BUSINESS_CLOSE_HOUR ?? 20);
  return { open, close };
}
