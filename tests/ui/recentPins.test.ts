import { describe, it, expect, beforeEach } from "vitest";
import {
  getPinnedProductIds,
  isProductPinned,
  togglePinProduct,
  recordRecentProduct,
  getRecentProductIds,
  getPinnedClienteIds,
  togglePinCliente,
  recordRecentCliente,
  getRecentClienteIds,
} from "../../src/lib/recentPins";

beforeEach(() => {
  localStorage.clear();
});

describe("recentPins / productos (caja blanca)", () => {
  it("getPinnedProductIds devuelve [] sin nada", () => {
    expect(getPinnedProductIds()).toEqual([]);
  });

  it("togglePinProduct alterna entre fijado y no fijado", () => {
    expect(togglePinProduct(42)).toBe(true);
    expect(isProductPinned(42)).toBe(true);
    expect(togglePinProduct(42)).toBe(false);
    expect(isProductPinned(42)).toBe(false);
  });

  it("recordRecentProduct mueve el id al frente y deduplica", () => {
    recordRecentProduct(1);
    recordRecentProduct(2);
    recordRecentProduct(1); /* repetido — debe quedar primero */
    const r = getRecentProductIds();
    expect(r[0]).toBe(1);
    expect(r.indexOf(1)).toBe(0);
    expect(r.filter((x) => x === 1)).toHaveLength(1);
  });

  it("recordRecentProduct trunca a MAX_RECENT (12)", () => {
    for (let i = 0; i < 20; i++) recordRecentProduct(i);
    const r = getRecentProductIds();
    expect(r.length).toBe(12);
    /* El último insertado (19) debe estar primero */
    expect(r[0]).toBe(19);
  });

  it("ignora valores corruptos en localStorage", () => {
    localStorage.setItem("peluqueria_recent_productos", "no-es-json");
    expect(getRecentProductIds()).toEqual([]);
    localStorage.setItem("peluqueria_recent_productos", JSON.stringify({ x: 1 }));
    expect(getRecentProductIds()).toEqual([]);
  });
});

describe("recentPins / clientes (caja blanca)", () => {
  it("togglePinCliente y getPinnedClienteIds funcionan en paralelo", () => {
    expect(getPinnedClienteIds()).toEqual([]);
    togglePinCliente(7);
    togglePinCliente(8);
    const ids = getPinnedClienteIds();
    expect(ids).toContain(7);
    expect(ids).toContain(8);
  });

  it("recordRecentCliente comparte semántica con productos", () => {
    recordRecentCliente(100);
    recordRecentCliente(200);
    expect(getRecentClienteIds()[0]).toBe(200);
  });

  it("pins de productos y clientes son independientes", () => {
    togglePinProduct(1);
    togglePinCliente(1);
    expect(getPinnedProductIds()).toEqual([1]);
    expect(getPinnedClienteIds()).toEqual([1]);
    /* Quitar pin de producto no toca cliente */
    togglePinProduct(1);
    expect(getPinnedProductIds()).toEqual([]);
    expect(getPinnedClienteIds()).toEqual([1]);
  });
});
