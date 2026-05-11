import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { ensureDb, resetDb } from "../setup/db.js";
import { usuarioService } from "../../server/services/usuario.service.js";
import { rolesService } from "../../server/services/roles.service.js";
import { db } from "../../server/db.js";
import { createAdminUser } from "../setup/factories.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

async function asegurarRolEmpleado() {
  if (!(await rolesService.exists("empleado"))) {
    /* roles_app es seed; resetDb la preserva */
  }
}

describe("usuario.service.create (caja blanca)", () => {
  it("crea usuario con campos válidos", async () => {
    await asegurarRolEmpleado();
    const u = await usuarioService.create({
      email: "ana@test.com",
      password: "secreta1",
      nombre: "Ana",
      rol: "empleado",
    });
    expect(u.email).toBe("ana@test.com");
    expect(u.nombre).toBe("Ana");
    expect(u.rol).toBe("empleado");
    expect((u as { password_hash?: string }).password_hash).toBeUndefined();
  });

  it("rechaza email vacío o password corto", async () => {
    await expect(
      usuarioService.create({ email: "", password: "secreta1", rol: "empleado" })
    ).rejects.toThrow(/Email/);
    await expect(
      usuarioService.create({ email: "x@t.com", password: "12345", rol: "empleado" })
    ).rejects.toThrow(/contraseña/);
  });

  it("rechaza email duplicado", async () => {
    await usuarioService.create({
      email: "dup@test.com",
      password: "secreta1",
      rol: "empleado",
    });
    await expect(
      usuarioService.create({ email: "DUP@test.com", password: "secreta1", rol: "empleado" })
    ).rejects.toThrow(/ya registrado/);
  });

  it("rechaza rol inexistente", async () => {
    await expect(
      usuarioService.create({ email: "x@t.com", password: "secreta1", rol: "rol_fake" })
    ).rejects.toThrow(/Rol/);
  });

  it("normaliza tipo_comision desconocido a 'porcentaje'", async () => {
    const u = await usuarioService.create({
      email: "comi@t.com",
      password: "secreta1",
      rol: "empleado",
      tipo_comision: "raro",
      valor_comision: 5,
    });
    const row = (await db
      .prepare(`SELECT tipo_comision, valor_comision FROM usuarios WHERE id=?`)
      .get(u.id)) as { tipo_comision: string; valor_comision: number };
    expect(row.tipo_comision).toBe("porcentaje");
    expect(row.valor_comision).toBe(5);
  });

  it("hashea la contraseña en la base (no se guarda en claro)", async () => {
    const u = await usuarioService.create({
      email: "h@test.com",
      password: "miClaveSecreta",
      rol: "empleado",
    });
    const row = (await db
      .prepare(`SELECT password_hash FROM usuarios WHERE id=?`)
      .get(u.id)) as { password_hash: string };
    expect(row.password_hash).not.toBe("miClaveSecreta");
    expect(await bcrypt.compare("miClaveSecreta", row.password_hash)).toBe(true);
  });
});

describe("usuario.service.update (caja blanca)", () => {
  it("404 si no existe", async () => {
    await expect(usuarioService.update(99999, { nombre: "X" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("cambia password con bcrypt si tiene >= 6 chars", async () => {
    const admin = await createAdminUser("a@t.com", "secret123");
    /* Crear segundo admin para poder cambiar password sin tocar el último */
    await usuarioService.update(admin.id, { password: "nuevaPass1" });
    const row = (await db
      .prepare(`SELECT password_hash FROM usuarios WHERE id=?`)
      .get(admin.id)) as { password_hash: string };
    expect(await bcrypt.compare("nuevaPass1", row.password_hash)).toBe(true);
  });

  it("rechaza password con menos de 6 chars", async () => {
    const admin = await createAdminUser();
    await expect(
      usuarioService.update(admin.id, { password: "12345" })
    ).rejects.toThrow(/contraseña/);
  });

  it("rechaza degradar al ÚLTIMO admin a otro rol", async () => {
    const admin = await createAdminUser("solo@admin.com");
    await expect(
      usuarioService.update(admin.id, { rol: "empleado" })
    ).rejects.toThrow(/al menos un.*administrador/);
  });

  it("permite degradar admin si hay otros administradores", async () => {
    const a1 = await createAdminUser("a1@t.com", "secret123", "A1");
    const a2 = await createAdminUser("a2@t.com", "secret123", "A2");
    const upd = await usuarioService.update(a1.id, { rol: "empleado" });
    expect(upd.rol).toBe("empleado");
    /* a2 sigue admin */
    const a2row = (await db
      .prepare(`SELECT rol FROM usuarios WHERE id=?`)
      .get(a2.id)) as { rol: string };
    expect(a2row.rol).toBe("admin");
  });

  it("rechaza desactivar al ÚLTIMO admin activo", async () => {
    const admin = await createAdminUser("solo@admin.com");
    await expect(
      usuarioService.update(admin.id, { activo: false })
    ).rejects.toThrow(/último administrador/);
  });

  it("update de comision normaliza tipo y guarda valor", async () => {
    const admin = await createAdminUser();
    await usuarioService.update(admin.id, {
      tipo_comision: "FIJO",
      valor_comision: 100,
    });
    const row = (await db
      .prepare(`SELECT tipo_comision, valor_comision FROM usuarios WHERE id=?`)
      .get(admin.id)) as { tipo_comision: string; valor_comision: number };
    expect(row.tipo_comision).toBe("fijo");
    expect(row.valor_comision).toBe(100);
  });

  it("update permite cambiar campos opcionales (telefono, color_agenda, foto_url)", async () => {
    const admin = await createAdminUser();
    const upd = await usuarioService.update(admin.id, {
      telefono: " 555-100 ",
      color_agenda: "#abcdef",
      foto_url: "https://cdn/x.png",
    });
    expect(upd.telefono).toBe("555-100");
    expect(upd.color_agenda).toBe("#abcdef");
    expect(upd.foto_url).toBe("https://cdn/x.png");
  });
});

describe("usuario.service.delete (caja blanca)", () => {
  it("rechaza si solo hay un usuario en la base", async () => {
    const u = await createAdminUser();
    await expect(usuarioService.delete(u.id)).rejects.toThrow(/último usuario/);
  });

  it("404 si no existe (con >1 usuarios)", async () => {
    await createAdminUser("a@t.com", "secret123", "A");
    await createAdminUser("b@t.com", "secret123", "B");
    await expect(usuarioService.delete(99999)).rejects.toMatchObject({ status: 404 });
  });

  it("rechaza eliminar el último admin (con otros no-admin presentes)", async () => {
    const admin = await createAdminUser("admin@t.com");
    /* Insertar usuario normal directo en DB */
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO usuarios (email, password_hash, nombre, rol, activo, tipo_comision, valor_comision, created_at)
         VALUES ('u@t.com', 'h', 'U', 'empleado', 1, 'porcentaje', 0, ?)`
      )
      .run(now);
    await expect(usuarioService.delete(admin.id)).rejects.toThrow(/último administrador/);
  });

  it("permite eliminar admin si hay otro admin", async () => {
    const a1 = await createAdminUser("a1@t.com", "secret123", "A1");
    await createAdminUser("a2@t.com", "secret123", "A2");
    await usuarioService.delete(a1.id);
    const r = await db.prepare(`SELECT id FROM usuarios WHERE id=?`).get(a1.id);
    expect(r).toBeUndefined();
  });
});

describe("usuario.service.list (caja negra)", () => {
  it("retorna lista sin password_hash", async () => {
    await createAdminUser("a@t.com", "secret123", "A");
    const list = (await usuarioService.list()) as { email: string; password_hash?: string }[];
    expect(list.length).toBeGreaterThan(0);
    for (const u of list) {
      expect(u.password_hash).toBeUndefined();
    }
  });
});
