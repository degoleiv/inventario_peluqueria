const KEY = "peluqueria_access_token";
const EXPIRES_AT_KEY = "peluqueria_access_token_expires_at";

/** Duración de sesión en el cliente (debe coincidir con el mínimo del servidor). */
export const SESSION_DURATION_SEC = 8 * 60 * 60;

function readTokenRaw(): string | null {
  try {
    const fromLocal = localStorage.getItem(KEY);
    if (fromLocal) return fromLocal;
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Token en `localStorage` para que todas las pestañas del mismo origen compartan la sesión.
 */
export function parseJwtExpMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getSessionExpiresAtMs(token?: string | null): number | null {
  const fromJwt = token ? parseJwtExpMs(token) : null;
  if (fromJwt != null) return fromJwt;
  try {
    const stored = localStorage.getItem(EXPIRES_AT_KEY);
    if (stored) {
      const n = Number(stored);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Margen de 10 s para desfase de reloj cliente/servidor. */
export function isAccessTokenExpired(token: string | null = readTokenRaw()): boolean {
  if (!token) return true;
  const exp = getSessionExpiresAtMs(token);
  if (exp == null) return false;
  return Date.now() >= exp - 10_000;
}

export function getAccessToken(): string | null {
  try {
    const fromLocal = localStorage.getItem(KEY);
    if (fromLocal) {
      if (isAccessTokenExpired(fromLocal)) {
        clearAccessToken();
        return null;
      }
      return fromLocal;
    }
    const legacy = sessionStorage.getItem(KEY);
    if (legacy) {
      if (isAccessTokenExpired(legacy)) {
        clearAccessToken();
        return null;
      }
      localStorage.setItem(KEY, legacy);
      sessionStorage.removeItem(KEY);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

export function setAccessToken(token: string, expiresInSec = SESSION_DURATION_SEC) {
  try {
    localStorage.setItem(KEY, token);
    sessionStorage.removeItem(KEY);
    const fromJwt = parseJwtExpMs(token);
    const fallback = Date.now() + Math.max(60, expiresInSec) * 1000;
    localStorage.setItem(EXPIRES_AT_KEY, String(fromJwt ?? fallback));
  } catch {
    /* ignore */
  }
}

export function clearAccessToken() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function hasValidSession(): boolean {
  return getAccessToken() != null;
}
