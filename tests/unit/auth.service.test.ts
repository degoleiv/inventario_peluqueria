import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import bcrypt from "bcrypt";
import { ensureDb, resetDb } from "../setup/db.js";
import { bootstrapFirstAdmin, login, verifyAccessToken } from "../../server/services/auth.service.js";
import { AppError } from "../../server/lib/AppError.js";
import { db } from "../../server/db.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("auth.service / bootstrapFirstAdmin (caja blanca)", () => {
  it("crea el primer admin y retorna token + user con rol admin", async () => {
    const out = await bootstrapFirstAdmin("ADMIN@test.com", "secret123", "Admin");
    expect(out.user.email).toBe("admin@test.com");
    expect(out.user.rol).toBe("admin");
    expect(out.user.permisos).toContain("*");
    expect(typeof out.accessToken).toBe("string");
    expect(out.expiresIn).toBeGreaterThan(0);
  });

  it("rechaza bootstrap si ya existe usuario (status 403)", async () => {
    await bootstrapFirstAdmin("a@b.com", "secret123");
    await expect(bootstrapFirstAdmin("c@d.com", "secret123")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("exige email no vacío y password >= 6 chars", async () => {
    await expect(bootstrapFirstAdmin("", "secret123")).rejects.toBeInstanceOf(AppError);
    await expect(bootstrapFirstAdmin("a@b.com", "12345")).rejects.toMatchObject({ status: 400 });
  });

  it("hashea la contraseña con bcrypt (no se guarda en claro)", async () => {
    await bootstrapFirstAdmin("a@b.com", "secret123");
    const row = (await db.prepare(`SELECT password_hash FROM usuarios WHERE email='a@b.com'`).get()) as
      | { password_hash: string }
      | undefined;
    expect(row?.password_hash).toBeDefined();
    expect(row!.password_hash).not.toBe("secret123");
    expect(await bcrypt.compare("secret123", row!.password_hash)).toBe(true);
  });
});

describe("auth.service / login", () => {
  beforeEach(async () => {
    await bootstrapFirstAdmin("user@test.com", "secret123", "User");
  });

  it("login exitoso con credenciales válidas retorna token", async () => {
    const out = await login("user@test.com", "secret123");
    expect(out.accessToken).toBeTypeOf("string");
    expect(out.user.email).toBe("user@test.com");
  });

  it("rechaza email inexistente con 401", async () => {
    await expect(login("nope@test.com", "secret123")).rejects.toMatchObject({ status: 401 });
  });

  it("rechaza password incorrecto con 401", async () => {
    await expect(login("user@test.com", "wrong")).rejects.toMatchObject({ status: 401 });
  });

  it("rechaza usuario inactivo con 401", async () => {
    await db.prepare(`UPDATE usuarios SET activo=0 WHERE email='user@test.com'`).run();
    await expect(login("user@test.com", "secret123")).rejects.toMatchObject({ status: 401 });
  });
});

describe("auth.service / verifyAccessToken", () => {
  it("decodifica un token válido", async () => {
    const out = await bootstrapFirstAdmin("v@test.com", "secret123");
    const decoded = verifyAccessToken(out.accessToken);
    expect(decoded.email).toBe("v@test.com");
    expect(decoded.rol).toBe("admin");
    expect(typeof decoded.sub).toBe("number");
  });

  it("rechaza token vacío o inválido con 401", () => {
    expect(() => verifyAccessToken("not-a-jwt")).toThrowError(/Token inválido/);
  });
});
