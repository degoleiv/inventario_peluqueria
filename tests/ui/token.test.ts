import { describe, it, expect, beforeEach } from "vitest";
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
} from "../../src/auth/token";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("auth/token (caja blanca - localStorage)", () => {
  it("getAccessToken devuelve null si no hay nada", () => {
    expect(getAccessToken()).toBeNull();
  });

  it("setAccessToken persiste en localStorage", () => {
    setAccessToken("eyJhbGc.test");
    expect(localStorage.getItem("peluqueria_access_token")).toBe("eyJhbGc.test");
    expect(getAccessToken()).toBe("eyJhbGc.test");
  });

  it("clearAccessToken limpia ambos storages", () => {
    setAccessToken("abc");
    sessionStorage.setItem("peluqueria_access_token", "legacy");
    clearAccessToken();
    expect(getAccessToken()).toBeNull();
  });

  it("migra token desde sessionStorage si solo está allí", () => {
    sessionStorage.setItem("peluqueria_access_token", "legacy-xyz");
    const t = getAccessToken();
    expect(t).toBe("legacy-xyz");
    /* La migración persiste en localStorage y limpia el legado */
    expect(localStorage.getItem("peluqueria_access_token")).toBe("legacy-xyz");
    expect(sessionStorage.getItem("peluqueria_access_token")).toBeNull();
  });
});
