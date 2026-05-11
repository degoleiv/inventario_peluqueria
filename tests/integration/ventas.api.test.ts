import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { ensureDb, resetDb } from "../setup/db.js";
import { buildTestApp } from "../setup/testApp.js";
import { createAdminUser, createProducto, signTokenFor } from "../setup/factories.js";

let app: Awaited<ReturnType<typeof buildTestApp>>;
let token: string;
let userId: number;

beforeAll(async () => {
  await ensureDb();
  app = await buildTestApp();
});

beforeEach(async () => {
  await resetDb();
  const u = await createAdminUser();
  token = signTokenFor(u.id, u.email);
  userId = u.id;
});

const auth = () => ({ Authorization: `Bearer ${token}` });

describe("API /api/ventas (caja negra - flujo POS)", () => {
  it("POST crea venta con líneas, descuenta stock y devuelve total correcto", async () => {
    const pid = await createProducto({ nombre: "Tinte", stock: 10, precio_venta: 1500 });
    const r = await request(app)
      .post("/api/ventas")
      .set(auth())
      .send({
        usuario_id: userId,
        lineas: [{ producto_id: pid, cantidad: 2 }],
      });
    expect([200, 201]).toContain(r.status);
    expect(r.body.id).toBeDefined();

    const detalle = await request(app).get(`/api/ventas/${r.body.id}`).set(auth());
    expect(detalle.status).toBe(200);
    expect(detalle.body.total).toBe(3000);
    expect(detalle.body.lineas).toHaveLength(1);
    expect(detalle.body.lineas[0].cantidad).toBe(2);
  });

  it("POST 400 si lineas está vacío", async () => {
    const r = await request(app)
      .post("/api/ventas")
      .set(auth())
      .send({ usuario_id: userId, lineas: [] });
    expect(r.status).toBe(400);
  });

  it("POST 400 si stock insuficiente", async () => {
    const pid = await createProducto({ nombre: "X", stock: 1, precio_venta: 100 });
    const r = await request(app)
      .post("/api/ventas")
      .set(auth())
      .send({
        usuario_id: userId,
        lineas: [{ producto_id: pid, cantidad: 99 }],
      });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Stock/);
  });

  it("POST 400 si producto no existe", async () => {
    const r = await request(app)
      .post("/api/ventas")
      .set(auth())
      .send({
        usuario_id: userId,
        lineas: [{ producto_id: 99999, cantidad: 1 }],
      });
    expect(r.status).toBe(400);
  });

  it("GET /api/ventas/:id 404 si no existe", async () => {
    const r = await request(app).get("/api/ventas/99999").set(auth());
    expect(r.status).toBe(404);
  });

  it("GET /api/ventas lista todas las ventas creadas", async () => {
    const pid = await createProducto({ nombre: "X", stock: 100, precio_venta: 50 });
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/ventas")
        .set(auth())
        .send({ usuario_id: userId, lineas: [{ producto_id: pid, cantidad: 1 }] });
    }
    const r = await request(app).get("/api/ventas").set(auth());
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(3);
  });

  it("requiere auth (401 sin token)", async () => {
    const r = await request(app).post("/api/ventas").send({});
    expect(r.status).toBe(401);
  });
});
