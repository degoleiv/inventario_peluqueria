import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { cobranzaService } from "../../server/services/cobranza.service.js";
import { createCliente } from "../setup/factories.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("cobranza.service.create (caja blanca)", () => {
  it("rechaza cliente_id ausente", async () => {
    await expect(
      cobranzaService.create({ descripcion: "x", monto: 100 })
    ).rejects.toThrow(/cliente_id/);
  });

  it("rechaza descripcion vacía", async () => {
    const cli = await createCliente();
    await expect(
      cobranzaService.create({ cliente_id: cli, descripcion: "", monto: 100 })
    ).rejects.toThrow(/descripción/);
  });

  it("rechaza monto <= 0", async () => {
    const cli = await createCliente();
    await expect(
      cobranzaService.create({ cliente_id: cli, descripcion: "X", monto: 0 })
    ).rejects.toThrow(/monto/);
    await expect(
      cobranzaService.create({ cliente_id: cli, descripcion: "X", monto: -10 })
    ).rejects.toThrow(/monto/);
  });

  it("crea cobranza con saldo=monto y estado=pendiente", async () => {
    const cli = await createCliente({ nombre: "Deudor" });
    const c = (await cobranzaService.create({
      cliente_id: cli,
      descripcion: "Tinte",
      monto: 5000,
      vencimiento: "2030-08-31T00:00:00Z",
    })) as Record<string, unknown>;
    expect(c.monto).toBe(5000);
    expect(c.saldo_pendiente).toBe(5000);
    expect(c.estado).toBe("pendiente");
    expect(c.vencimiento).toBe("2030-08-31");
  });
});

describe("cobranza.service.registrarPago (caja blanca - estado)", () => {
  it("404 si la deuda no existe", async () => {
    await expect(
      cobranzaService.registrarPago(99999, { monto: 100 })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rechaza pago con monto <= 0", async () => {
    const cli = await createCliente();
    const c = (await cobranzaService.create({
      cliente_id: cli,
      descripcion: "X",
      monto: 100,
    })) as { id: number };
    await expect(cobranzaService.registrarPago(c.id, { monto: 0 })).rejects.toThrow(/monto/);
  });

  it("pago parcial deja estado=pendiente con saldo restante", async () => {
    const cli = await createCliente();
    const c = (await cobranzaService.create({
      cliente_id: cli,
      descripcion: "X",
      monto: 100,
    })) as { id: number };
    const upd = (await cobranzaService.registrarPago(c.id, { monto: 30 })) as Record<
      string,
      unknown
    >;
    expect(upd.saldo_pendiente).toBe(70);
    expect(upd.estado).toBe("pendiente");
  });

  it("pago igual o mayor cancela la deuda (estado=cobrado)", async () => {
    const cli = await createCliente();
    const c = (await cobranzaService.create({
      cliente_id: cli,
      descripcion: "X",
      monto: 100,
    })) as { id: number };
    const upd = (await cobranzaService.registrarPago(c.id, { monto: 250 })) as Record<
      string,
      unknown
    >;
    expect(upd.saldo_pendiente).toBe(0);
    expect(upd.estado).toBe("cobrado");
  });

  it("rechaza pago a deuda ya cobrada", async () => {
    const cli = await createCliente();
    const c = (await cobranzaService.create({
      cliente_id: cli,
      descripcion: "X",
      monto: 100,
    })) as { id: number };
    await cobranzaService.registrarPago(c.id, { monto: 100 });
    await expect(
      cobranzaService.registrarPago(c.id, { monto: 50 })
    ).rejects.toThrow(/saldada/);
  });
});

describe("cobranza.service.list", () => {
  it("filtra por estado", async () => {
    const cli = await createCliente();
    const a = (await cobranzaService.create({
      cliente_id: cli,
      descripcion: "A",
      monto: 100,
    })) as { id: number };
    const b = (await cobranzaService.create({
      cliente_id: cli,
      descripcion: "B",
      monto: 200,
    })) as { id: number };
    await cobranzaService.registrarPago(a.id, { monto: 100 });
    /* a → cobrado, b → pendiente */
    const cobrado = (await cobranzaService.list("cobrado")) as unknown[];
    const pendiente = (await cobranzaService.list("pendiente")) as unknown[];
    expect(cobrado.length).toBe(1);
    expect(pendiente.length).toBe(1);
    expect((pendiente[0] as { id: number }).id).toBe(b.id);
  });
});
