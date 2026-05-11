import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { reporteService } from "../../server/services/reporte.service.js";
import { ventaService } from "../../server/services/venta.service.js";
import { productoService } from "../../server/services/producto.service.js";
import { createAdminUser } from "../setup/factories.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

async function setup() {
  const u = await createAdminUser();
  const p1 = (await productoService.create({
    nombre: "Shampoo",
    stock: 100,
    precio_venta: 200,
    precio_compra: 80,
  })) as { id: number };
  const p2 = (await productoService.create({
    nombre: "Tinte",
    stock: 50,
    precio_venta: 500,
    precio_compra: 300,
  })) as { id: number };

  await ventaService.create({
    usuario_id: u.id,
    fecha: "2030-08-10T10:00:00Z",
    lineas: [
      { producto_id: p1.id, cantidad: 3 },
      { producto_id: p2.id, cantidad: 1 },
    ],
  });
  await ventaService.create({
    usuario_id: u.id,
    fecha: "2030-08-12T10:00:00Z",
    lineas: [{ producto_id: p1.id, cantidad: 5 }],
  });
  await ventaService.create({
    usuario_id: u.id,
    fecha: "2030-12-01T10:00:00Z",
    lineas: [{ producto_id: p2.id, cantidad: 2 }],
  });
  return { u, p1, p2 };
}

describe("reporte.service.ventasFiltradas", () => {
  it("sin filtros devuelve todas las ventas", async () => {
    await setup();
    const r = (await reporteService.ventasFiltradas()) as unknown[];
    expect(r.length).toBe(3);
  });

  it("filtra por rango de fechas", async () => {
    await setup();
    const ago = (await reporteService.ventasFiltradas(
      "2030-08-01",
      "2030-08-31T23:59:59Z"
    )) as unknown[];
    expect(ago.length).toBe(2);
  });
});

describe("reporte.service.productosMasVendidos", () => {
  it("rankea por unidades vendidas DESC", async () => {
    const { p1, p2 } = await setup();
    const top = (await reporteService.productosMasVendidos(
      "2030-01-01",
      "2030-12-31T23:59:59Z"
    )) as { id: number; nombre: string; unidades: number }[];
    expect(top[0].id).toBe(p1.id);
    expect(top[0].unidades).toBe(8);
    expect(top.find((p) => p.id === p2.id)?.unidades).toBe(3);
  });
});

describe("reporte.service.ingresosDiarios", () => {
  it("agrupa total por día", async () => {
    await setup();
    const dias = (await reporteService.ingresosDiarios(
      "2030-08-01",
      "2030-08-31T23:59:59Z"
    )) as { dia: string; ingresos: number; cantidad_ventas: number }[];
    expect(dias.length).toBe(2);
    /* Día 2030-08-10: 3*200 + 1*500 = 1100 */
    const d10 = dias.find((d) => d.dia === "2030-08-10");
    expect(d10?.ingresos).toBe(1100);
  });
});

describe("reporte.service.productosRentabilidad", () => {
  it("calcula margen = ventas - costo (precio_compra * cantidad)", async () => {
    const { p1 } = await setup();
    const rent = (await reporteService.productosRentabilidad(
      "2030-08-01",
      "2030-08-31T23:59:59Z"
    )) as { id: number; ventas_bruto: number; costo_estimado: number; margen_estimado: number }[];
    const sham = rent.find((r) => r.id === p1.id);
    /* Shampoo en agosto: 8 unidades * 200 = 1600 ventas; costo = 8 * 80 = 640; margen = 960 */
    expect(sham?.ventas_bruto).toBe(1600);
    expect(sham?.costo_estimado).toBe(640);
    expect(sham?.margen_estimado).toBe(960);
  });
});

describe("reporte.service.productosSinRotacion", () => {
  it("identifica productos con stock pero sin ventas en N días", async () => {
    await setup();
    /* Crear producto extra con stock pero sin ventas */
    const sinVender = (await productoService.create({
      nombre: "Aceite",
      stock: 10,
      precio_venta: 100,
    })) as { id: number };
    const r = (await reporteService.productosSinRotacion(7)) as { id: number; nombre: string }[];
    expect(r.find((p) => p.id === sinVender.id)).toBeDefined();
  });
});

describe("reporte.service.dashboard", () => {
  it("retorna conteos básicos sin lanzar", async () => {
    await setup();
    const d = (await reporteService.dashboard()) as Record<string, unknown>;
    expect(typeof d.ventas_mes_total).toBe("number");
    expect(typeof d.ventas_mes_cantidad).toBe("number");
  });
});
