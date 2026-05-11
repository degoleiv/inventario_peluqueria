import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { notificacionService } from "../../server/services/notificacion.service.js";
import { db } from "../../server/db.js";
import { createCliente } from "../setup/factories.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

async function crearProducto(nombre: string, stock: number, stock_minimo: number): Promise<number> {
  const now = new Date().toISOString();
  const info = await db
    .prepare(
      `INSERT INTO productos (nombre, stock, stock_minimo, precio_compra, precio_venta, created_at, updated_at)
       VALUES (?, ?, ?, 10, 20, ?, ?)`
    )
    .run(nombre, stock, stock_minimo, now, now);
  return Number(info.lastInsertRowid);
}

async function crearCita(clienteId: number, inicioIso: string, estado = "pendiente"): Promise<number> {
  const now = new Date().toISOString();
  const info = await db
    .prepare(
      `INSERT INTO citas (cliente_id, inicio, duracion_min, estado, created_at, updated_at)
       VALUES (?, ?, 30, ?, ?, ?)`
    )
    .run(clienteId, inicioIso, estado, now, now);
  return Number(info.lastInsertRowid);
}

describe("notificacion.service.listar (caja blanca - regla de negocio)", () => {
  it("retorna estructura {stock_bajo, citas_proximas} aunque esté vacía", async () => {
    const r = await notificacionService.listar();
    expect(Array.isArray(r.stock_bajo)).toBe(true);
    expect(Array.isArray(r.citas_proximas)).toBe(true);
    expect(r.stock_bajo).toEqual([]);
    expect(r.citas_proximas).toEqual([]);
  });

  it("incluye productos con stock = 0", async () => {
    const id = await crearProducto("Sin stock", 0, 5);
    const r = await notificacionService.listar();
    expect((r.stock_bajo as { id: number }[]).find((p) => p.id === id)).toBeDefined();
  });

  it("incluye productos con stock <= stock_minimo (con stock_minimo > 0)", async () => {
    const id = await crearProducto("Bajo mínimo", 3, 5);
    const r = await notificacionService.listar();
    expect((r.stock_bajo as { id: number }[]).find((p) => p.id === id)).toBeDefined();
  });

  it("excluye productos con stock holgado", async () => {
    const id = await crearProducto("OK", 50, 5);
    const r = await notificacionService.listar();
    expect((r.stock_bajo as { id: number }[]).find((p) => p.id === id)).toBeUndefined();
  });

  it("excluye productos con stock_minimo=0 aunque tengan stock>0", async () => {
    const id = await crearProducto("Sin mínimo", 1, 0);
    const r = await notificacionService.listar();
    expect((r.stock_bajo as { id: number }[]).find((p) => p.id === id)).toBeUndefined();
  });

  it("ordena por stock ASC (más críticos primero)", async () => {
    const a = await crearProducto("A", 0, 5);
    const b = await crearProducto("B", 2, 5);
    const r = await notificacionService.listar();
    const arr = r.stock_bajo as { id: number; stock: number }[];
    const ia = arr.findIndex((x) => x.id === a);
    const ib = arr.findIndex((x) => x.id === b);
    expect(ia).toBeGreaterThanOrEqual(0);
    expect(ib).toBeGreaterThanOrEqual(0);
    expect(ia).toBeLessThan(ib);
  });

  it("incluye citas próximas (≤ 48h) y excluye canceladas", async () => {
    const cli = await createCliente({ nombre: "Z" });
    const en2h = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const proxima = await crearCita(cli, en2h);
    const cancelada = await crearCita(cli, en2h, "cancelado");
    const r = await notificacionService.listar();
    const ids = (r.citas_proximas as { id: number }[]).map((c) => c.id);
    expect(ids).toContain(proxima);
    expect(ids).not.toContain(cancelada);
  });

  it("excluye citas más allá de 48 horas", async () => {
    const cli = await createCliente({ nombre: "Z" });
    const en5dias = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const lejana = await crearCita(cli, en5dias);
    const r = await notificacionService.listar();
    expect((r.citas_proximas as { id: number }[]).find((c) => c.id === lejana)).toBeUndefined();
  });
});
