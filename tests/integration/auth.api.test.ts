import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { ensureDb, resetDb } from "../setup/db.js";
import { buildTestApp } from "../setup/testApp.js";
import { createAdminUser, signTokenFor } from "../setup/factories.js";

let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  await ensureDb();
  app = await buildTestApp();
});

beforeEach(async () => {
  await resetDb();
});

describe("API /api/health (caja negra)", () => {
  it("GET /api/health responde 200 sin auth", async () => {
    const r = await request(app).get("/api/health");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });
});

describe("API /api/auth/bootstrap-needed", () => {
  it("retorna true cuando no hay usuarios", async () => {
    const r = await request(app).get("/api/auth/bootstrap-needed");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ needed: true });
  });

  it("retorna false cuando ya existe al menos uno", async () => {
    await createAdminUser();
    const r = await request(app).get("/api/auth/bootstrap-needed");
    expect(r.body).toEqual({ needed: false });
  });
});

describe("API /api/auth/bootstrap (POST)", () => {
  it("201 al crear el primer admin", async () => {
    const r = await request(app)
      .post("/api/auth/bootstrap")
      .send({ email: "boss@test.com", password: "secret123", nombre: "Boss" });
    expect(r.status).toBe(201);
    expect(r.body.user.email).toBe("boss@test.com");
    expect(r.body.accessToken).toBeTypeOf("string");
  });

  it("400 si password es muy corto", async () => {
    const r = await request(app)
      .post("/api/auth/bootstrap")
      .send({ email: "x@test.com", password: "123" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/contraseña/i);
  });

  it("403 cuando ya hay un usuario", async () => {
    await createAdminUser();
    const r = await request(app)
      .post("/api/auth/bootstrap")
      .send({ email: "y@test.com", password: "secret123" });
    expect(r.status).toBe(403);
  });
});

describe("API /api/auth/login (POST)", () => {
  beforeEach(async () => {
    await createAdminUser("login@test.com", "secret123");
  });

  it("200 con credenciales válidas", async () => {
    const r = await request(app)
      .post("/api/auth/login")
      .send({ email: "login@test.com", password: "secret123" });
    expect(r.status).toBe(200);
    expect(r.body.accessToken).toBeTypeOf("string");
    expect(r.body.user.email).toBe("login@test.com");
  });

  it("401 con password incorrecto", async () => {
    const r = await request(app)
      .post("/api/auth/login")
      .send({ email: "login@test.com", password: "wrong" });
    expect(r.status).toBe(401);
  });

  it("401 con email inexistente", async () => {
    const r = await request(app)
      .post("/api/auth/login")
      .send({ email: "nope@test.com", password: "secret123" });
    expect(r.status).toBe(401);
  });

  it("401 si faltan campos", async () => {
    const r = await request(app).post("/api/auth/login").send({});
    expect(r.status).toBe(401);
  });
});

describe("API protección JWT (middleware)", () => {
  it("401 si no se envía Authorization", async () => {
    const r = await request(app).get("/api/auth/me");
    expect(r.status).toBe(401);
  });

  it("401 si Authorization no es Bearer válido", async () => {
    const r = await request(app).get("/api/auth/me").set("Authorization", "Basic xyz");
    expect(r.status).toBe(401);
  });

  it("401 si token JWT es inválido", async () => {
    const r = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-jwt");
    expect(r.status).toBe(401);
  });

  it("200 con Bearer válido", async () => {
    const u = await createAdminUser();
    const tok = signTokenFor(u.id, u.email);
    const r = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${tok}`);
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe(u.email);
  });
});
