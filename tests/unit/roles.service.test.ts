import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { rolesService } from "../../server/services/roles.service.js";
import { AppError } from "../../server/lib/AppError.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("roles.service.permisosParaRol", () => {
  it("rol 'admin' devuelve ['*'] aunque no esté en DB (fallback de seguridad)", async () => {
    const p = await rolesService.permisosParaRol("admin");
    expect(p).toEqual(["*"]);
  });

  it("rol inexistente devuelve []", async () => {
    const p = await rolesService.permisosParaRol("no-existe");
    expect(p).toEqual([]);
  });

  it("rol creado devuelve sus permisos como array", async () => {
    await rolesService.create({
      slug: "vendedor_test",
      nombre: "Vendedor Test",
      permisos: ["ventas", "clientes"],
    });
    const p = await rolesService.permisosParaRol("vendedor_test");
    expect(p).toEqual(["ventas", "clientes"]);
  });
});

describe("roles.service.create (validaciones)", () => {
  it("rechaza slug con caracteres inválidos", async () => {
    await expect(
      rolesService.create({
        slug: "Vendedor!",
        nombre: "X",
        permisos: ["ventas"],
      })
    ).rejects.toThrow(/slug/);
  });

  it("rechaza nombre vacío", async () => {
    await expect(
      rolesService.create({ slug: "x", nombre: "", permisos: ["ventas"] })
    ).rejects.toThrow(/nombre/);
  });

  it("rechaza el slug 'admin' (reservado)", async () => {
    await expect(
      rolesService.create({ slug: "admin", nombre: "Admin", permisos: ["*"] })
    ).rejects.toThrow(/reservado/);
  });

  it("rechaza permisos no array", async () => {
    await expect(
      rolesService.create({
        slug: "x",
        nombre: "X",
        permisos: "ventas" as unknown as string[],
      })
    ).rejects.toThrow(/array/);
  });

  it("rechaza array de permisos vacío", async () => {
    await expect(
      rolesService.create({ slug: "x", nombre: "X", permisos: [] })
    ).rejects.toThrow(/al menos un permiso/);
  });

  it("rechaza permisos desconocidos", async () => {
    await expect(
      rolesService.create({
        slug: "x",
        nombre: "X",
        permisos: ["ventas", "modulo_inexistente"],
      })
    ).rejects.toThrow(/Permiso desconocido/);
  });

  it("rechaza '*' combinado con otros permisos", async () => {
    await expect(
      rolesService.create({
        slug: "x",
        nombre: "X",
        permisos: ["*", "ventas"],
      })
    ).rejects.toThrow(/no podés combinar/);
  });

  it("normaliza alias 'compras'/'pedidos_proveedores'/'proveedores' a 'pedidos'", async () => {
    const r = await rolesService.create({
      slug: "alias_test",
      nombre: "Alias",
      permisos: ["compras", "pedidos_proveedores", "proveedores", "ventas"],
    });
    expect(r).not.toBeNull();
    /* Tras normalización debería quedar ['pedidos','ventas'] (set) */
    const p = await rolesService.permisosParaRol("alias_test");
    expect(p.sort()).toEqual(["pedidos", "ventas"]);
  });

  it("rechaza crear el mismo slug dos veces", async () => {
    await rolesService.create({
      slug: "duplicado",
      nombre: "Dup",
      permisos: ["ventas"],
    });
    await expect(
      rolesService.create({ slug: "duplicado", nombre: "X", permisos: ["clientes"] })
    ).rejects.toThrow(/Ya existe/);
  });
});

describe("roles.service.update / delete", () => {
  it("update rol no existente → 404", async () => {
    await expect(rolesService.update("nope", { nombre: "X" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("delete del slug 'admin' está prohibido", async () => {
    /* Crear admin no se puede; pero podemos comprobar que delete sobre admin lanza error
       independientemente de su existencia: el guard se evalúa antes de la lectura. */
    await expect(rolesService.delete("admin")).rejects.toThrow(/administrador/);
  });

  it("delete falla si hay usuarios con ese rol", async () => {
    await rolesService.create({
      slug: "vend2",
      nombre: "V",
      permisos: ["ventas"],
    });
    /* Insertar usuario directo via repo */
    const { db } = await import("../../server/db.js");
    await db
      .prepare(
        `INSERT INTO usuarios (email, password_hash, nombre, rol, activo, tipo_comision, valor_comision, created_at)
         VALUES ('x@test.com', 'h', 'X', 'vend2', 1, 'porcentaje', 0, ?)`
      )
      .run(new Date().toISOString());
    await expect(rolesService.delete("vend2")).rejects.toThrow(/reasign/);
  });

  it("delete remueve rol sin usuarios asignados", async () => {
    await rolesService.create({
      slug: "vacante",
      nombre: "V",
      permisos: ["ventas"],
    });
    await rolesService.delete("vacante");
    expect(await rolesService.exists("vacante")).toBe(false);
  });

  it("update permite cambiar nombre y permisos", async () => {
    await rolesService.create({
      slug: "edicion",
      nombre: "Antes",
      permisos: ["ventas"],
    });
    const upd = await rolesService.update("edicion", {
      nombre: "Después",
      permisos: ["clientes", "inventario"],
    });
    expect(upd?.nombre).toBe("Después");
    const p = await rolesService.permisosParaRol("edicion");
    expect(p.sort()).toEqual(["clientes", "inventario"]);
  });
});
