export const JWT_EXPIRY_SEC = 60 * 60;
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
