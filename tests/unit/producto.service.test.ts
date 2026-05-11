import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { productoService } from "../../server/services/producto.service.js";
import { AppError } from "../../server/lib/AppError.js";
import { db } from "../../server/db.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("producto.service.create (caja blanca)", () => {
  it("crea producto con campos mínimos (nombre)", async () => {
    const p = (await productoService.create({ nombre: "Shampoo" })) as Record<string, unknown>;
    expect(p.id).toBeDefined();
    expect(p.nombre).toBe("Shampoo");
    expect(p.stock).toBe(0);
    expect(p.stock_minimo).toBe(5);
  });

  it("rechaza nombre vacío", async () => {
    await expect(productoService.create({ nombre: "  " })).rejects.toBeInstanceOf(AppError);
    await expect(productoService.create({})).rejects.toBeInstanceOf(AppError);
  });

  it("rechaza precio_venta < precio_compra", async () => {
    await expect(
      productoService.create({ nombre: "X", precio_compra: 100, precio_venta: 50 })
    ).rejects.toThrow(/precio_venta/);
  });

  it("rechaza código de barras duplicado", async () => {
    await productoService.create({ nombre: "A", codigo_barras: "777" });
    await expect(
      productoService.create({ nombre: "B", codigo_barras: "777" })
    ).rejects.toThrow(/código de barras/);
  });

  it("normaliza stock y stock_minimo (Math.floor, mínimo 0)", async () => {
    const p = (await productoService.create({
      nombre: "X",
      stock: 4.7,
      stock_minimo: -3,
    })) as Record<string, unknown>;
    expect(p.stock).toBe(4);
    expect(p.stock_minimo).toBe(0);
  });

  it("acepta proveedor_id válido y descarta inválido", async () => {
    /* Crea proveedor para satisfacer la FK */
    const now = new Date().toISOString();
    const ins = await db
      .prepare(
        `INSERT INTO proveedores (nombre, nit, telefono, email, created_at) VALUES (?, ?, ?, ?, ?)`
      )
      .run("Prov X", "NIT-001", null, null, now);
    const provId = Number(ins.lastInsertRowid);

    const valido = (await productoService.create({
      nombre: "Z",
      proveedor_id: provId,
    })) as Record<string, unknown>;
    expect(valido.proveedor_id).toBe(provId);

    const invalido = (await productoService.create({
      nombre: "Z2",
      proveedor_id: "abc",
    })) as Record<string, unknown>;
    expect(invalido.proveedor_id).toBeNull();
  });
});

describe("producto.service.update", () => {
  it("404 si producto no existe", async () => {
    await expect(productoService.update(99999, { nombre: "X" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("permite cambiar precio respetando regla compra<=venta", async () => {
    const created = (await productoService.create({
      nombre: "P",
      precio_compra: 100,
      precio_venta: 200,
    })) as Record<string, unknown>;
    const upd = (await productoService.update(Number(created.id), {
      precio_venta: 300,
    })) as Record<string, unknown>;
    expect(upd.precio_venta).toBe(300);
    await expect(
      productoService.update(Number(created.id), { precio_venta: 50 })
    ).rejects.toThrow(/precio_venta/);
  });
});

describe("producto.service.setEstado / delete", () => {
  it("setEstado activo/inactivo cambia el campo", async () => {
    const p = (await productoService.create({ nombre: "X" })) as Record<string, unknown>;
    const updated = (await productoService.setEstado(Number(p.id), "inactivo")) as Record<
      string,
      unknown
    >;
    expect(updated.estado).toBe("inactivo");
  });

  it("setEstado rechaza valores fuera del enum", async () => {
    const p = (await productoService.create({ nombre: "X" })) as Record<string, unknown>;
    await expect(
      productoService.setEstado(Number(p.id), "borrado" as "activo")
    ).rejects.toThrow();
  });

  it("delete remueve el registro", async () => {
    const p = (await productoService.create({ nombre: "X" })) as Record<string, unknown>;
    await productoService.delete(Number(p.id));
    const r = await db.prepare(`SELECT id FROM productos WHERE id=?`).get(p.id);
    expect(r).toBeUndefined();
  });

  it("delete inexistente arroja 404", async () => {
    await expect(productoService.delete(123456)).rejects.toMatchObject({ status: 404 });
  });
});
