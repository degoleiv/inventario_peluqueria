import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { inventarioAjusteService } from "../../server/services/inventarioAjuste.service.js";
import { db } from "../../server/db.js";
import { createAdminUser, createProducto } from "../setup/factories.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("inventarioAjuste.registrarAjuste (caja blanca)", () => {
  it("rechaza producto_id no numérico", async () => {
    await expect(
      inventarioAjusteService.registrarAjuste(
        { producto_id: "abc", stock_real: 5 },
        1
      )
    ).rejects.toThrow(/producto_id/);
  });

  it("rechaza stock_real negativo", async () => {
    const pid = await createProducto({ stock: 10 });
    await expect(
      inventarioAjusteService.registrarAjuste({ producto_id: pid, stock_real: -3 }, 1)
    ).rejects.toThrow(/stock_real/);
  });

  it("404 si el producto no existe", async () => {
    await expect(
      inventarioAjusteService.registrarAjuste({ producto_id: 99999, stock_real: 0 }, null)
    ).rejects.toMatchObject({ status: 404 });
  });

  it("ajusta a la baja: deja diferencia negativa y nuevo stock", async () => {
    const u = await createAdminUser();
    const pid = await createProducto({ nombre: "Tijera", stock: 10 });
    const out = await inventarioAjusteService.registrarAjuste(
      { producto_id: pid, stock_real: 7, motivo: "merma" },
      u.id
    );
    expect(out.stock_anterior).toBe(10);
    expect(out.stock_nuevo).toBe(7);
    expect(out.diferencia).toBe(-3);

    const stockEnDb = (await db.prepare(`SELECT stock FROM productos WHERE id=?`).get(pid)) as {
      stock: number;
    };
    expect(stockEnDb.stock).toBe(7);

    const ajuste = (await db
      .prepare(`SELECT * FROM ajustes_inventario WHERE producto_id=?`)
      .get(pid)) as { motivo: string; usuario_id: number };
    expect(ajuste.motivo).toBe("merma");
    expect(ajuste.usuario_id).toBe(u.id);
  });

  it("ajusta al alza: diferencia positiva", async () => {
    const pid = await createProducto({ nombre: "Tinte", stock: 5 });
    const out = await inventarioAjusteService.registrarAjuste(
      { producto_id: pid, stock_real: 12 },
      null
    );
    expect(out.diferencia).toBe(7);
    const stock = (await db.prepare(`SELECT stock FROM productos WHERE id=?`).get(pid)) as {
      stock: number;
    };
    expect(stock.stock).toBe(12);
  });

  it("normaliza floats (Math.floor) y motivo nulo", async () => {
    const pid = await createProducto({ stock: 0 });
    const out = await inventarioAjusteService.registrarAjuste(
      { producto_id: pid, stock_real: 4.9 },
      null
    );
    expect(out.stock_nuevo).toBe(4);
    const ajuste = (await db
      .prepare(`SELECT motivo FROM ajustes_inventario WHERE producto_id=?`)
      .get(pid)) as { motivo: string | null };
    expect(ajuste.motivo).toBeNull();
  });

  it("ajuste idempotente: stock_real == stock actual deja diferencia=0", async () => {
    const pid = await createProducto({ stock: 50 });
    const out = await inventarioAjusteService.registrarAjuste(
      { producto_id: pid, stock_real: 50 },
      null
    );
    expect(out.diferencia).toBe(0);
    expect(out.stock_anterior).toBe(50);
    expect(out.stock_nuevo).toBe(50);
  });
});
