import { describe, it, expect } from "vitest";
import { hasPermiso } from "../../server/middleware/auth.js";

describe("hasPermiso (caja blanca - matriz de equivalencia)", () => {
  it("retorna false si permisos undefined o vacíos", () => {
    expect(hasPermiso(undefined, "ventas")).toBe(false);
    expect(hasPermiso([], "ventas")).toBe(false);
  });

  it('"*" otorga acceso a cualquier módulo', () => {
    expect(hasPermiso(["*"], "cualquier_cosa")).toBe(true);
    expect(hasPermiso(["*"], "ventas")).toBe(true);
  });

  it("permiso explícito coincide con el módulo solicitado", () => {
    expect(hasPermiso(["ventas"], "ventas")).toBe(true);
    expect(hasPermiso(["clientes"], "ventas")).toBe(false);
  });

  it("compatibilidad: 'compras'/'pedidos_proveedores' otorga 'pedidos'", () => {
    expect(hasPermiso(["compras"], "pedidos")).toBe(true);
    expect(hasPermiso(["pedidos_proveedores"], "pedidos")).toBe(true);
    expect(hasPermiso(["proveedores"], "pedidos")).toBe(true);
  });

  it("compatibilidad: 'pedidos' otorga 'pedidos_proveedores' y 'proveedores'", () => {
    expect(hasPermiso(["pedidos"], "pedidos_proveedores")).toBe(true);
    expect(hasPermiso(["pedidos"], "proveedores")).toBe(true);
  });

  it("permisos no relacionados retornan false", () => {
    expect(hasPermiso(["inventario"], "facturas")).toBe(false);
  });
});
