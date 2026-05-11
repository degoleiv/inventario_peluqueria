import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { citaService } from "../../server/services/cita.service.js";
import { AppError } from "../../server/lib/AppError.js";
import { db } from "../../server/db.js";
import { createAdminUser, createCliente } from "../setup/factories.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

/**
 * Construye un ISO local para "hoy" o fecha dada con hora explícita en horario laboral.
 * El servicio valida horario [open=9, close=20) en hora local del servidor.
 */
function isoLocal(year: number, monthIdx: number, day: number, hour: number, min = 0) {
  return new Date(year, monthIdx, day, hour, min, 0, 0).toISOString();
}

describe("cita.service.create (caja blanca)", () => {
  it("rechaza si no hay profesional (usuario_id requerido)", async () => {
    const cli = await createCliente({ nombre: "X" });
    await expect(
      citaService.create({
        cliente_id: cli,
        inicio: isoLocal(2030, 0, 6, 10, 0),
        duracion_min: 30,
      })
    ).rejects.toThrow(/profesional/);
  });

  it("rechaza profesional inactivo o inexistente", async () => {
    const cli = await createCliente({ nombre: "X" });
    await expect(
      citaService.create({
        cliente_id: cli,
        usuario_id: 99999,
        inicio: isoLocal(2030, 0, 6, 10, 0),
        duracion_min: 30,
      })
    ).rejects.toThrow(/Profesional/);
  });

  it("rechaza inicio sin formato válido (parseMs lanza)", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    await expect(
      citaService.create({
        cliente_id: cli,
        usuario_id: u.id,
        inicio: "no-es-fecha",
        duracion_min: 30,
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rechaza duración < 10 minutos (regla de negocio CITA_DURACION_MINIMA)", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    await expect(
      citaService.create({
        cliente_id: cli,
        usuario_id: u.id,
        inicio: isoLocal(2030, 0, 6, 10, 0),
        duracion_min: 5,
      })
    ).rejects.toThrow(/duración mínima/i);
  });

  it("rechaza duración no múltiplo de 5 (paso de 5 minutos)", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    await expect(
      citaService.create({
        cliente_id: cli,
        usuario_id: u.id,
        inicio: isoLocal(2030, 0, 6, 10, 0),
        duracion_min: 17,
      })
    ).rejects.toThrow(/múltiplo/);
  });

  it("rechaza inicio que no esté alineado a paso de 5 minutos", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    await expect(
      citaService.create({
        cliente_id: cli,
        usuario_id: u.id,
        inicio: isoLocal(2030, 0, 6, 10, 3),
        duracion_min: 30,
      })
    ).rejects.toThrow(/intervalos de 5/);
  });

  it("rechaza estado='realizado' al crear (debe pasarse por update)", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    await expect(
      citaService.create({
        cliente_id: cli,
        usuario_id: u.id,
        inicio: isoLocal(2030, 0, 6, 10, 0),
        duracion_min: 30,
        estado: "realizado",
      })
    ).rejects.toThrow(/realizad/);
  });

  it("crea cita válida en horario laboral", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    const c = (await citaService.create({
      cliente_id: cli,
      usuario_id: u.id,
      inicio: isoLocal(2030, 0, 6, 10, 0),
      duracion_min: 30,
      servicio: "Corte",
    })) as Record<string, unknown>;
    expect(c.id).toBeDefined();
    expect(c.estado).toBe("pendiente");
    expect(c.servicio).toBe("Corte");
  });

  it("rechaza solapamiento con otra cita del mismo profesional", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    await citaService.create({
      cliente_id: cli,
      usuario_id: u.id,
      inicio: isoLocal(2030, 0, 6, 10, 0),
      duracion_min: 60,
    });
    await expect(
      citaService.create({
        cliente_id: cli,
        usuario_id: u.id,
        inicio: isoLocal(2030, 0, 6, 10, 30),
        duracion_min: 30,
      })
    ).rejects.toThrow(/solapad/);
  });

  it("permite solapamiento con DISTINTO profesional", async () => {
    const u1 = await createAdminUser("a@t.com", "secret123");
    const u2 = await createAdminUser("b@t.com", "secret123");
    const cli = await createCliente({ nombre: "X" });
    await citaService.create({
      cliente_id: cli,
      usuario_id: u1.id,
      inicio: isoLocal(2030, 0, 6, 10, 0),
      duracion_min: 60,
    });
    const c2 = (await citaService.create({
      cliente_id: cli,
      usuario_id: u2.id,
      inicio: isoLocal(2030, 0, 6, 10, 0),
      duracion_min: 60,
    })) as Record<string, unknown>;
    expect(c2.id).toBeDefined();
  });
});

describe("cita.service.update / cancelar / delete", () => {
  it("update 404 si no existe", async () => {
    await expect(citaService.update(99999, {})).rejects.toMatchObject({ status: 404 });
  });

  it("estado='realizado' exige importe_servicio > 0", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    const c = (await citaService.create({
      cliente_id: cli,
      usuario_id: u.id,
      inicio: isoLocal(2030, 0, 6, 10, 0),
      duracion_min: 30,
    })) as { id: number };
    await expect(
      citaService.update(c.id, { estado: "realizado" })
    ).rejects.toThrow(/importe/);
  });

  it("cancelar exige motivo y cancelado_por válido", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    const c = (await citaService.create({
      cliente_id: cli,
      usuario_id: u.id,
      inicio: isoLocal(2030, 0, 6, 10, 0),
      duracion_min: 30,
    })) as { id: number };
    await expect(
      citaService.cancelar(c.id, { motivo: "", cancelado_por: "cliente" })
    ).rejects.toThrow(/motivo/);
    await expect(
      citaService.cancelar(c.id, { motivo: "x", cancelado_por: "alguien" as "cliente" })
    ).rejects.toThrow(/cancelado_por/);
    const out = (await citaService.cancelar(c.id, {
      motivo: "no vino",
      cancelado_por: "cliente",
    })) as Record<string, unknown>;
    expect(out.estado).toBe("cancelado");
  });

  it("no se puede cancelar dos veces", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    const c = (await citaService.create({
      cliente_id: cli,
      usuario_id: u.id,
      inicio: isoLocal(2030, 0, 6, 10, 0),
      duracion_min: 30,
    })) as { id: number };
    await citaService.cancelar(c.id, { motivo: "x", cancelado_por: "admin" });
    await expect(
      citaService.cancelar(c.id, { motivo: "y", cancelado_por: "admin" })
    ).rejects.toThrow(/ya está cancelada/);
  });

  it("delete 404 si no existe", async () => {
    await expect(citaService.delete(99999)).rejects.toMatchObject({ status: 404 });
  });

  it("delete remueve cita existente", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    const c = (await citaService.create({
      cliente_id: cli,
      usuario_id: u.id,
      inicio: isoLocal(2030, 0, 6, 10, 0),
      duracion_min: 30,
    })) as { id: number };
    await citaService.delete(c.id);
    const r = await db.prepare(`SELECT id FROM citas WHERE id=?`).get(c.id);
    expect(r).toBeUndefined();
  });
});

describe("cita.service.list (caja negra - filtros)", () => {
  it("list sin filtros devuelve todas", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    await citaService.create({
      cliente_id: cli,
      usuario_id: u.id,
      inicio: isoLocal(2030, 0, 6, 10, 0),
      duracion_min: 30,
    });
    await citaService.create({
      cliente_id: cli,
      usuario_id: u.id,
      inicio: isoLocal(2030, 0, 6, 11, 0),
      duracion_min: 30,
    });
    const all = (await citaService.list({})) as unknown[];
    expect(all.length).toBe(2);
  });

  it("list con desde/hasta filtra por rango", async () => {
    const u = await createAdminUser();
    const cli = await createCliente({ nombre: "X" });
    await citaService.create({
      cliente_id: cli,
      usuario_id: u.id,
      inicio: isoLocal(2030, 0, 6, 10, 0),
      duracion_min: 30,
    });
    await citaService.create({
      cliente_id: cli,
      usuario_id: u.id,
      inicio: isoLocal(2030, 5, 15, 10, 0),
      duracion_min: 30,
    });
    const enero = (await citaService.list({ desde: "2030-01-01", hasta: "2030-01-31" })) as unknown[];
    expect(enero.length).toBe(1);
  });
});
