const KEY = "peluqueria_access_token";

/**
 * Token en `localStorage` para que todas las pestañas del mismo origen compartan la sesión.
 * (En `sessionStorage` cada pestaña quedaba sin token → 401 al abrir Configuración/Equipo en otra pestaña.)
 */
export function getAccessToken(): string | null {
  try {
    const fromLocal = localStorage.getItem(KEY);
    if (fromLocal) return fromLocal;
    const legacy = sessionStorage.getItem(KEY);
    if (legacy) {
      localStorage.setItem(KEY, legacy);
      sessionStorage.removeItem(KEY);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

export function setAccessToken(token: string) {
  try {
    localStorage.setItem(KEY, token);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function clearAccessToken() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
