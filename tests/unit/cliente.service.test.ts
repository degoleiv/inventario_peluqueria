import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { clienteService } from "../../server/services/cliente.service.js";
import { AppError } from "../../server/lib/AppError.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("cliente.service.create (caja blanca)", () => {
  it("crea cliente con nombre", async () => {
    const c = (await clienteService.create({ nombre: "María" })) as Record<string, unknown>;
    expect(c.id).toBeDefined();
    expect(c.nombre).toBe("María");
    expect(c.tipo_cliente).toBe("registrado");
  });

  it("rechaza nombre vacío", async () => {
    await expect(clienteService.create({ nombre: "" })).rejects.toBeInstanceOf(AppError);
  });

  it("valida formato de email", async () => {
    await expect(
      clienteService.create({ nombre: "X", email: "no-es-email" })
    ).rejects.toThrow(/Correo/);
    const ok = (await clienteService.create({
      nombre: "X",
      email: "x@test.com",
    })) as Record<string, unknown>;
    expect(ok.email).toBe("x@test.com");
  });

  it("rechaza teléfono duplicado", async () => {
    await clienteService.create({ nombre: "A", telefono: "555-1" });
    await expect(
      clienteService.create({ nombre: "B", telefono: "555-1" })
    ).rejects.toThrow(/teléfono/);
  });

  it("rechaza número de documento duplicado", async () => {
    await clienteService.create({
      nombre: "A",
      tipo_documento: "DNI",
      numero_documento: "12345",
    });
    await expect(
      clienteService.create({
        nombre: "B",
        tipo_documento: "DNI",
        numero_documento: "12345",
      })
    ).rejects.toThrow(/documento/);
  });
});

describe("cliente.service.createTemporal", () => {
  it("crea cliente ocasional con datos mínimos", async () => {
    const out = await clienteService.createTemporal({});
    expect(out.reutilizado).toBe(false);
    const cli = out.cliente as Record<string, unknown>;
    expect(cli.tipo_cliente).toBe("temporal");
    expect(cli.nombre).toBe("Cliente ocasional");
  });

  it("reutiliza si el teléfono ya existe", async () => {
    await clienteService.create({ nombre: "Pedro", telefono: "555-9" });
    const out = await clienteService.createTemporal({ telefono: "555-9" });
    expect(out.reutilizado).toBe(true);
  });
});

describe("cliente.service.createTemporalParaCita", () => {
  it("exige nombre y teléfono", async () => {
    await expect(
      clienteService.createTemporalParaCita({ nombre: "" })
    ).rejects.toThrow(/nombre/);
    await expect(
      clienteService.createTemporalParaCita({ nombre: "Ana", telefono: "" })
    ).rejects.toThrow(/teléfono/);
  });

  it("retorna id existente si teléfono coincide", async () => {
    await clienteService.create({ nombre: "Lu", telefono: "111" });
    const id = await clienteService.createTemporalParaCita({
      nombre: "Otro nombre",
      telefono: "111",
    });
    expect(typeof id).toBe("number");
  });
});

describe("cliente.service.update / delete", () => {
  it("404 al actualizar inexistente", async () => {
    await expect(clienteService.update(99999, { nombre: "X" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("404 al borrar inexistente", async () => {
    await expect(clienteService.delete(99999)).rejects.toMatchObject({ status: 404 });
  });

  it("borra correctamente un cliente existente", async () => {
    const c = (await clienteService.create({ nombre: "Z" })) as Record<string, unknown>;
    await clienteService.delete(Number(c.id));
  });
});
