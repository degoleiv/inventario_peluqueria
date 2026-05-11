import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import {
  commissionService,
  calcularMontoComision,
} from "../../server/services/commission.service.js";
import { db } from "../../server/db.js";
import { createAdminUser } from "../setup/factories.js";

async function crearVentaStub(total: number, fecha: string, usuarioId: number): Promise<number> {
  const info = await db
    .prepare(
      `INSERT INTO ventas (cliente_id, fecha, total, metodo_pago, created_at, usuario_id)
       VALUES (NULL, ?, ?, 'efectivo', ?, ?)`
    )
    .run(fecha, total, new Date().toISOString(), usuarioId);
  return Number(info.lastInsertRowid);
}

async function crearCitaStub(usuarioId: number, inicioIso: string): Promise<number> {
  const cliInfo = await db
    .prepare(
      `INSERT INTO clientes (nombre, created_at, updated_at, tipo_cliente, activo)
       VALUES ('cli-stub', ?, ?, 'temporal', 1)`
    )
    .run(new Date().toISOString(), new Date().toISOString());
  const info = await db
    .prepare(
      `INSERT INTO citas (cliente_id, usuario_id, inicio, duracion_min, estado, created_at, updated_at)
       VALUES (?, ?, ?, 30, 'pendiente', ?, ?)`
    )
    .run(
      Number(cliInfo.lastInsertRowid),
      usuarioId,
      inicioIso,
      new Date().toISOString(),
      new Date().toISOString()
    );
  return Number(info.lastInsertRowid);
}

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("commission.calcularMontoComision (caja blanca - función pura)", () => {
  it("tipo='porcentaje' aplica el porcentaje al total", () => {
    expect(calcularMontoComision(1000, "porcentaje", 10)).toBe(100);
    expect(calcularMontoComision(1234.56, "porcentaje", 5)).toBe(61.73);
  });

  it("tipo='fijo' devuelve el valor (redondeado a 2 decimales)", () => {
    expect(calcularMontoComision(99999, "fijo", 250)).toBe(250);
    expect(calcularMontoComision(0, "fijo", 199.999)).toBe(200);
  });

  it("valores negativos se truncan a 0", () => {
    expect(calcularMontoComision(1000, "porcentaje", -5)).toBe(0);
    expect(calcularMontoComision(0, "fijo", -100)).toBe(0);
  });

  it("tipo desconocido se trata como porcentaje", () => {
    expect(calcularMontoComision(1000, "raro" as "porcentaje", 7)).toBe(70);
  });

  it("redondea a 2 decimales", () => {
    expect(calcularMontoComision(33.33, "porcentaje", 10)).toBe(3.33);
  });
});

describe("commission.insertForVenta (caja blanca)", () => {
  async function setUserComision(uid: number, tipo: string, valor: number) {
    await db
      .prepare(`UPDATE usuarios SET tipo_comision = ?, valor_comision = ? WHERE id = ?`)
      .run(tipo, valor, uid);
  }

  it("inserta comisión calculada por porcentaje", async () => {
    const u = await createAdminUser();
    await setUserComision(u.id, "porcentaje", 8);
    const ventaId = await crearVentaStub(5000, "2030-03-15T00:00:00.000Z", u.id);
    const monto = await commissionService.insertForVenta(ventaId, u.id, 5000, "2030-03-15T00:00:00.000Z");
    expect(monto).toBe(400);
    const row = (await db.prepare(`SELECT * FROM comisiones WHERE venta_id=?`).get(ventaId)) as
      | { monto: number; fecha: string }
      | undefined;
    expect(row?.monto).toBe(400);
    expect(row?.fecha).toBe("2030-03-15");
  });

  it("retorna null si el empleado no existe", async () => {
    const monto = await commissionService.insertForVenta(1, 99999, 1000, "2030-03-15T00:00:00.000Z");
    expect(monto).toBeNull();
  });

  it("retorna null y no inserta si el monto calculado es 0", async () => {
    const u = await createAdminUser();
    await setUserComision(u.id, "porcentaje", 0);
    const ventaId = await crearVentaStub(1000, "2030-03-15T00:00:00.000Z", u.id);
    const monto = await commissionService.insertForVenta(ventaId, u.id, 1000, "2030-03-15T00:00:00.000Z");
    expect(monto).toBeNull();
    const r = await db.prepare(`SELECT id FROM comisiones WHERE venta_id=?`).get(ventaId);
    expect(r).toBeUndefined();
  });
});

describe("commission.insertForCita / delete*", () => {
  it("insertForCita guarda la comisión asociada a la cita", async () => {
    const u = await createAdminUser();
    await db
      .prepare(`UPDATE usuarios SET tipo_comision = 'fijo', valor_comision = 80 WHERE id = ?`)
      .run(u.id);
    const citaId = await crearCitaStub(u.id, "2030-04-10T15:00:00.000Z");
    const monto = await commissionService.insertForCita(citaId, u.id, 0, "2030-04-10T15:00:00.000Z");
    /* Aunque importe sea 0, comisión fija de 80 corresponde según calcularMontoComision('fijo') */
    expect(monto).toBe(80);
    const r = (await db.prepare(`SELECT * FROM comisiones WHERE cita_id=?`).get(citaId)) as
      | { monto: number }
      | undefined;
    expect(r?.monto).toBe(80);
  });

  it("deleteByVentaId borra la comisión vinculada", async () => {
    const u = await createAdminUser();
    await db
      .prepare(`UPDATE usuarios SET tipo_comision = 'porcentaje', valor_comision = 10 WHERE id = ?`)
      .run(u.id);
    const ventaId = await crearVentaStub(1000, "2030-04-10T00:00:00.000Z", u.id);
    await commissionService.insertForVenta(ventaId, u.id, 1000, "2030-04-10T00:00:00.000Z");
    await commissionService.deleteByVentaId(ventaId);
    const r = await db.prepare(`SELECT id FROM comisiones WHERE venta_id=?`).get(ventaId);
    expect(r).toBeUndefined();
  });
});

describe("commission.list / liquidacion", () => {
  it("list filtra por empleado y rango", async () => {
    const u = await createAdminUser();
    await db
      .prepare(`UPDATE usuarios SET tipo_comision = 'porcentaje', valor_comision = 10 WHERE id = ?`)
      .run(u.id);
    const v1 = await crearVentaStub(100, "2030-01-15T00:00:00Z", u.id);
    const v2 = await crearVentaStub(200, "2030-06-15T00:00:00Z", u.id);
    await commissionService.insertForVenta(v1, u.id, 100, "2030-01-15T00:00:00Z");
    await commissionService.insertForVenta(v2, u.id, 200, "2030-06-15T00:00:00Z");
    const enero = (await commissionService.list("2030-01-01", "2030-01-31", u.id)) as unknown[];
    expect(enero.length).toBe(1);
    const todas = (await commissionService.list(undefined, undefined, u.id)) as unknown[];
    expect(todas.length).toBe(2);
  });

  it("liquidacion rechaza fechas con formato inválido", async () => {
    await expect(commissionService.liquidacion("hoy", "ayer")).rejects.toThrow(/fechas/);
  });

  it("liquidacion agrupa comisiones por empleado y devuelve total general", async () => {
    const u = await createAdminUser();
    await db
      .prepare(`UPDATE usuarios SET tipo_comision = 'porcentaje', valor_comision = 10 WHERE id = ?`)
      .run(u.id);
    const v1 = await crearVentaStub(1000, "2030-05-10T00:00:00Z", u.id);
    const v2 = await crearVentaStub(500, "2030-05-20T00:00:00Z", u.id);
    await commissionService.insertForVenta(v1, u.id, 1000, "2030-05-10T00:00:00Z");
    await commissionService.insertForVenta(v2, u.id, 500, "2030-05-20T00:00:00Z");
    const liq = await commissionService.liquidacion("2030-05-01", "2030-05-31");
    expect(liq.total_general).toBe(150);
    expect(liq.empleados.length).toBe(1);
    expect(liq.empleados[0].total_comisiones).toBe(150);
    expect(liq.empleados[0].lineas.length).toBe(2);
  });
});
