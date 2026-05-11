import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { ensureDb, resetDb } from "../setup/db.js";
import { buildTestApp } from "../setup/testApp.js";
import { createAdminUser, signTokenFor } from "../setup/factories.js";

let app: Awaited<ReturnType<typeof buildTestApp>>;
let token: string;

beforeAll(async () => {
  await ensureDb();
  app = await buildTestApp();
});

beforeEach(async () => {
  await resetDb();
  const u = await createAdminUser();
  token = signTokenFor(u.id, u.email);
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe("API /api/clientes (caja negra)", () => {
  it("GET lista vacía inicial", async () => {
    const r = await request(app).get("/api/clientes").set(auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("POST crea cliente con nombre", async () => {
    const r = await request(app)
      .post("/api/clientes")
      .set(auth())
      .send({ nombre: "Andrea" });
    expect([200, 201]).toContain(r.status);
    expect(r.body.nombre).toBe("Andrea");
  });

  it("POST 400 sin nombre", async () => {
    const r = await request(app).post("/api/clientes").set(auth()).send({});
    expect(r.status).toBe(400);
  });

  it("POST 400 con email inválido", async () => {
    const r = await request(app)
      .post("/api/clientes")
      .set(auth())
      .send({ nombre: "X", email: "no-email" });
    expect(r.status).toBe(400);
  });

  it("POST 400 con teléfono duplicado", async () => {
    await request(app).post("/api/clientes").set(auth()).send({ nombre: "A", telefono: "999" });
    const r = await request(app)
      .post("/api/clientes")
      .set(auth())
      .send({ nombre: "B", telefono: "999" });
    expect(r.status).toBe(400);
  });

  it("GET ?q=texto filtra por nombre", async () => {
    await request(app).post("/api/clientes").set(auth()).send({ nombre: "Camila" });
    await request(app).post("/api/clientes").set(auth()).send({ nombre: "Pedro" });
    const r = await request(app).get("/api/clientes?q=Cami").set(auth());
    expect(r.status).toBe(200);
    expect((r.body as { nombre: string }[]).every((c) => c.nombre.includes("Cami"))).toBe(true);
  });

  it("PUT actualiza cliente existente", async () => {
    const c = await request(app).post("/api/clientes").set(auth()).send({ nombre: "X" });
    const r = await request(app)
      .put(`/api/clientes/${c.body.id}`)
      .set(auth())
      .send({ nombre: "Y" });
    expect(r.status).toBe(200);
    expect(r.body.nombre).toBe("Y");
  });

  it("DELETE remueve cliente", async () => {
    const c = await request(app).post("/api/clientes").set(auth()).send({ nombre: "Borrar" });
    const r = await request(app).delete(`/api/clientes/${c.body.id}`).set(auth());
    expect([200, 204]).toContain(r.status);
  });

  it("requiere auth (401 sin token)", async () => {
    const r = await request(app).get("/api/clientes");
    expect(r.status).toBe(401);
  });
});
