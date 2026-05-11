import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { ventaService } from "../../server/services/venta.service.js";
import { AppError } from "../../server/lib/AppError.js";
import { db } from "../../server/db.js";
import { createAdminUser, createCliente, createProducto } from "../setup/factories.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("venta.service.create (caja blanca - lógica de negocio crítica)", () => {
  it("rechaza venta sin líneas", async () => {
    const u = await createAdminUser();
    await expect(
      ventaService.create({ usuario_id: u.id, lineas: [] })
    ).rejects.toThrow(/línea/);
  });

  it("requiere usuario_id válido", async () => {
    await expect(
      ventaService.create({ lineas: [{ producto_id: 1, cantidad: 1 }] })
    ).rejects.toThrow(/usuario_id/);
  });

  it("rechaza vendedor inexistente", async () => {
    await expect(
      ventaService.create({ usuario_id: 99999, lineas: [{ producto_id: 1, cantidad: 1 }] })
    ).rejects.toThrow(/Vendedor/);
  });

  it("rechaza producto inexistente en línea", async () => {
    const u = await createAdminUser();
    await expect(
      ventaService.create({
        usuario_id: u.id,
        lineas: [{ producto_id: 9999, cantidad: 1 }],
      })
    ).rejects.toThrow(/no existe/);
  });

  it("rechaza si stock insuficiente", async () => {
    const u = await createAdminUser();
    const pid = await createProducto({ nombre: "Tinte", stock: 2 });
    await expect(
      ventaService.create({
        usuario_id: u.id,
        lineas: [{ producto_id: pid, cantidad: 5 }],
      })
    ).rejects.toThrow(/Stock insuficiente/);
  });

  it("calcula total = sum(cantidad * precio_unitario) y descuenta stock atómicamente", async () => {
    const u = await createAdminUser();
    const pid = await createProducto({ nombre: "Tinte", stock: 10, precio_venta: 1500 });
    const out = await ventaService.create({
      usuario_id: u.id,
      lineas: [{ producto_id: pid, cantidad: 3, precio_unitario: 1500 }],
    });
    const venta = (await db.prepare(`SELECT total FROM ventas WHERE id=?`).get(out.id)) as {
      total: number;
    };
    expect(venta.total).toBe(4500);
    const prod = (await db.prepare(`SELECT stock FROM productos WHERE id=?`).get(pid)) as {
      stock: number;
    };
    expect(prod.stock).toBe(7);
  });

  it("aplica precio del catálogo si no se especifica precio_unitario", async () => {
    const u = await createAdminUser();
    const pid = await createProducto({ nombre: "Tinte", stock: 5, precio_venta: 2000 });
    const out = await ventaService.create({
      usuario_id: u.id,
      lineas: [{ producto_id: pid, cantidad: 2 }],
    });
    const v = (await db.prepare(`SELECT total FROM ventas WHERE id=?`).get(out.id)) as {
      total: number;
    };
    expect(v.total).toBe(4000);
  });

  it("transacción rollback: si la 2da línea falla, no se descuenta stock de la 1ra", async () => {
    const u = await createAdminUser();
    const pidOk = await createProducto({ nombre: "OK", stock: 10, precio_venta: 100 });
    const pidNoStock = await createProducto({ nombre: "NoStk", stock: 1, precio_venta: 100 });
    await expect(
      ventaService.create({
        usuario_id: u.id,
        lineas: [
          { producto_id: pidOk, cantidad: 2 },
          { producto_id: pidNoStock, cantidad: 5 },
        ],
      })
    ).rejects.toThrow(/Stock insuficiente/);
    const r = (await db.prepare(`SELECT stock FROM productos WHERE id=?`).get(pidOk)) as {
      stock: number;
    };
    expect(r.stock).toBe(10);
  });

  it("rechaza producto inactivo", async () => {
    const u = await createAdminUser();
    const pid = await createProducto({ nombre: "Inactivo", stock: 5 });
    await db.prepare(`UPDATE productos SET estado='inactivo' WHERE id=?`).run(pid);
    await expect(
      ventaService.create({
        usuario_id: u.id,
        lineas: [{ producto_id: pid, cantidad: 1 }],
      })
    ).rejects.toThrow(/inactivo/);
  });

  it("rechaza producto vencido", async () => {
    const u = await createAdminUser();
    const pid = await createProducto({ nombre: "Vencido", stock: 5 });
    await db
      .prepare(`UPDATE productos SET fecha_vencimiento='2000-01-01' WHERE id=?`)
      .run(pid);
    await expect(
      ventaService.create({
        usuario_id: u.id,
        lineas: [{ producto_id: pid, cantidad: 1 }],
      })
    ).rejects.toThrow(/vencido/);
  });

  it("crea movimiento_inventario tipo SALIDA por cada línea", async () => {
    const u = await createAdminUser();
    const pid = await createProducto({ nombre: "Tinte", stock: 10, precio_venta: 100 });
    const out = await ventaService.create({
      usuario_id: u.id,
      lineas: [{ producto_id: pid, cantidad: 2 }],
    });
    const movs = (await db
      .prepare(
        `SELECT tipo, cantidad FROM movimientos_inventario WHERE venta_id=? AND producto_id=?`
      )
      .all(out.id, pid)) as { tipo: string; cantidad: number }[];
    expect(movs.length).toBe(1);
    expect(movs[0].tipo).toBe("SALIDA");
    expect(movs[0].cantidad).toBe(2);
  });
});

describe("venta.service.list / getById", () => {
  it("getById 404 si no existe", async () => {
    await expect(ventaService.getById(99999)).rejects.toMatchObject({ status: 404 });
  });

  it("getById incluye líneas con nombre del producto", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    const pid = await createProducto({ nombre: "Sham", stock: 5, precio_venta: 100 });
    const out = await ventaService.create({
      usuario_id: u.id,
      cliente_id: cli,
      lineas: [{ producto_id: pid, cantidad: 1 }],
    });
    const v = (await ventaService.getById(out.id)) as Record<string, unknown> & {
      lineas: { producto_nombre: string }[];
    };
    expect(v.lineas).toHaveLength(1);
    expect(v.lineas[0].producto_nombre).toBe("Sham");
  });

  it("list filtra por rango de fechas (desde/hasta)", async () => {
    const u = await createAdminUser();
    const pid = await createProducto({ nombre: "X", stock: 10, precio_venta: 50 });
    await ventaService.create({
      usuario_id: u.id,
      fecha: "2024-01-15T10:00:00Z",
      lineas: [{ producto_id: pid, cantidad: 1 }],
    });
    await ventaService.create({
      usuario_id: u.id,
      fecha: "2025-06-15T10:00:00Z",
      lineas: [{ producto_id: pid, cantidad: 1 }],
    });
    const todas = (await ventaService.list()) as unknown[];
    expect(todas.length).toBe(2);
    const soloVieja = (await ventaService.list("2024-01-01", "2024-12-31")) as unknown[];
    expect(soloVieja.length).toBe(1);
  });
});
