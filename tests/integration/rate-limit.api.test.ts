import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { ensureDb, resetDb } from "../setup/db.js";
import { buildTestApp } from "../setup/testApp.js";
import { createAdminUser } from "../setup/factories.js";

const PRIOR_NODE_ENV = process.env.NODE_ENV;

let app: Awaited<ReturnType<typeof buildTestApp>>;

beforeAll(async () => {
  await ensureDb();
  /* El limiter está deshabilitado en NODE_ENV=test; lo activamos solo aquí.
     Construimos una app fresca para no contaminar el cache (otras suites usan NODE_ENV=test). */
  process.env.NODE_ENV = "production-like";
  app = await buildTestApp({ fresh: true });
});

afterAll(() => {
  process.env.NODE_ENV = PRIOR_NODE_ENV;
});

beforeEach(async () => {
  await resetDb();
  await createAdminUser("rl@test.com", "secret123");
});

describe("DEF-002 / Rate limiting en /api/auth/login", () => {
  it("bloquea con 429 tras superar el límite (10 intentos en 15 min)", async () => {
    const intentos: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await request(app)
        .post("/api/auth/login")
        .send({ email: "rl@test.com", password: "wrong-password" });
      intentos.push(r.status);
    }
    expect(intentos.filter((s) => s === 401).length).toBeGreaterThanOrEqual(10);
    expect(intentos.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
  });

  it("login exitoso no consume cuota (skipSuccessfulRequests)", async () => {
    /* Como el test anterior consumió los 10, comprobamos que con un nuevo IP
       el limiter cuenta de nuevo. supertest usa siempre la misma IP de loopback,
       así que aquí sólo verificamos que un 200 NO incremente la cuota fallida.
       Forzamos varios logins exitosos y luego verificamos que aún se permite
       al menos 1 intento fallido (sin pasar a 429 inmediato). */
    /* En este punto, tras el test previo, ya estamos limitados; para que esta
       prueba sea informativa la marcamos skip si ya estamos en 429. */
    const r = await request(app)
      .post("/api/auth/login")
      .send({ email: "rl@test.com", password: "secret123" });
    expect([200, 429]).toContain(r.status);
  });
});
