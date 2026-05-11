import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { finanzaService } from "../../server/services/finanza.service.js";
import { db } from "../../server/db.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("finanza.service.createGasto (caja blanca)", () => {
  it("rechaza concepto vacío", async () => {
    await expect(finanzaService.createGasto({ monto: 100 })).rejects.toThrow(/concepto/);
  });

  it("rechaza monto no numérico o negativo", async () => {
    await expect(
      finanzaService.createGasto({ concepto: "x", monto: "abc" })
    ).rejects.toThrow(/monto/);
    await expect(
      finanzaService.createGasto({ concepto: "x", monto: -5 })
    ).rejects.toThrow(/monto/);
  });

  it("rechaza categoria_finanza_id inexistente", async () => {
    await expect(
      finanzaService.createGasto({ concepto: "x", monto: 10, categoria_finanza_id: 9999 })
    ).rejects.toThrow(/Categoría/);
  });

  it("crea gasto con categoría libre (texto)", async () => {
    const g = (await finanzaService.createGasto({
      concepto: "Limpieza",
      monto: 25.5,
      categoria: "Aseo",
    })) as Record<string, unknown>;
    expect(g.concepto).toBe("Limpieza");
    expect(g.monto).toBe(25.5);
    expect(g.categoria).toBe("Aseo");
  });

  it("usa fecha por defecto = hoy si no se pasa", async () => {
    const g = (await finanzaService.createGasto({
      concepto: "Café",
      monto: 5,
    })) as Record<string, unknown>;
    const hoy = new Date().toISOString().slice(0, 10);
    expect(g.fecha).toBe(hoy);
  });
});

describe("finanza.service.deleteGasto", () => {
  it("rechaza id inválido", async () => {
    await expect(finanzaService.deleteGasto(0)).rejects.toThrow(/id/);
  });

  it("404 si no existe", async () => {
    await expect(finanzaService.deleteGasto(99999)).rejects.toMatchObject({ status: 404 });
  });

  it("borra gasto existente", async () => {
    const g = (await finanzaService.createGasto({ concepto: "X", monto: 10 })) as { id: number };
    await finanzaService.deleteGasto(g.id);
    await expect(finanzaService.deleteGasto(g.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("finanza.service.flujoCaja", () => {
  it("calcula resultado_neto = ingresos − (gastos + pedidos)", async () => {
    /* Insertamos venta directa */
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO ventas (cliente_id, fecha, total, metodo_pago, created_at)
         VALUES (NULL, ?, 1000, 'efectivo', ?)`
      )
      .run("2030-07-15T10:00:00Z", now);
    await finanzaService.createGasto({
      concepto: "Renta",
      monto: 200,
      fecha: "2030-07-10",
    });
    /* Crear proveedor + pedido */
    const provInfo = await db
      .prepare(
        `INSERT INTO proveedores (nombre, nit, telefono, email, created_at) VALUES (?, ?, NULL, NULL, ?)`
      )
      .run("Prov", "NIT-FIN", now);
    await db
      .prepare(
        `INSERT INTO pedidos_proveedor (proveedor_id, fecha, total, created_at) VALUES (?, ?, 300, ?)`
      )
      .run(Number(provInfo.lastInsertRowid), "2030-07-12", now);

    const flujo = await finanzaService.flujoCaja("2030-07-01", "2030-07-31");
    expect(flujo.ingresos_ventas).toBe(1000);
    expect(flujo.egresos_gastos).toBe(200);
    expect(flujo.egresos_pedidos_proveedor).toBe(300);
    expect(flujo.egresos_total).toBe(500);
    expect(flujo.resultado_neto).toBe(500);
  });
});

describe("finanza.service.listGastos", () => {
  it("lista vacía cuando no hay gastos", async () => {
    const r = (await finanzaService.listGastos()) as unknown[];
    expect(r).toEqual([]);
  });

  it("filtra por rango de fechas", async () => {
    await finanzaService.createGasto({ concepto: "A", monto: 1, fecha: "2030-01-15" });
    await finanzaService.createGasto({ concepto: "B", monto: 2, fecha: "2030-06-15" });
    const enero = (await finanzaService.listGastos("2030-01-01", "2030-01-31")) as unknown[];
    expect(enero.length).toBe(1);
  });
});
