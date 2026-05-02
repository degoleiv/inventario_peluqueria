const KEY = "peluqueria_access_token";

export function getAccessToken(): string | null {
  return sessionStorage.getItem(KEY);
}

export function setAccessToken(token: string) {
  sessionStorage.setItem(KEY, token);
}

export function clearAccessToken() {
  sessionStorage.removeItem(KEY);
}
