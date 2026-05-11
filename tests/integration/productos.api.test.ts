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

describe("API /api/productos (caja negra - CRUD)", () => {
  it("GET retorna lista vacía inicial", async () => {
    const r = await request(app).get("/api/productos").set(auth());
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it("POST crea producto válido y devuelve 200/201 con id", async () => {
    const r = await request(app)
      .post("/api/productos")
      .set(auth())
      .send({ nombre: "Tijera", precio_venta: 5000, stock: 10 });
    expect([200, 201]).toContain(r.status);
    expect(r.body.id).toBeDefined();
    expect(r.body.nombre).toBe("Tijera");
  });

  it("POST 400 si falta nombre", async () => {
    const r = await request(app).post("/api/productos").set(auth()).send({ stock: 5 });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/nombre/);
  });

  it("POST 400 si precio_venta < precio_compra", async () => {
    const r = await request(app)
      .post("/api/productos")
      .set(auth())
      .send({ nombre: "X", precio_compra: 1000, precio_venta: 500 });
    expect(r.status).toBe(400);
  });

  it("POST 400 con código de barras duplicado", async () => {
    await request(app)
      .post("/api/productos")
      .set(auth())
      .send({ nombre: "A", codigo_barras: "111" });
    const r = await request(app)
      .post("/api/productos")
      .set(auth())
      .send({ nombre: "B", codigo_barras: "111" });
    expect(r.status).toBe(400);
  });

  it("PUT actualiza producto existente", async () => {
    const c = await request(app).post("/api/productos").set(auth()).send({ nombre: "Inicial" });
    const r = await request(app)
      .put(`/api/productos/${c.body.id}`)
      .set(auth())
      .send({ nombre: "Modificado", stock: 99 });
    expect(r.status).toBe(200);
    expect(r.body.nombre).toBe("Modificado");
    expect(r.body.stock).toBe(99);
  });

  it("PUT 404 si id no existe", async () => {
    const r = await request(app)
      .put(`/api/productos/99999`)
      .set(auth())
      .send({ nombre: "X" });
    expect(r.status).toBe(404);
  });

  it("DELETE elimina producto y siguiente GET no lo encuentra", async () => {
    const c = await request(app).post("/api/productos").set(auth()).send({ nombre: "AEliminar" });
    const r = await request(app).delete(`/api/productos/${c.body.id}`).set(auth());
    expect([200, 204]).toContain(r.status);
    const list = await request(app).get("/api/productos").set(auth());
    expect((list.body as { id: number }[]).find((p) => p.id === c.body.id)).toBeUndefined();
  });

  it("DELETE 404 si id no existe", async () => {
    const r = await request(app).delete(`/api/productos/99999`).set(auth());
    expect(r.status).toBe(404);
  });

  it("rechaza id no numérico con 400", async () => {
    const r = await request(app).put(`/api/productos/abc`).set(auth()).send({ nombre: "X" });
    expect(r.status).toBe(400);
  });

  it("requiere autenticación (401 sin token)", async () => {
    const r = await request(app).get("/api/productos");
    expect(r.status).toBe(401);
  });
});
