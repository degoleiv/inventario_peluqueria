import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * E2E "Selenium-like" del flujo POS completo: ejecutado contra el API real
 * que Playwright arranca como `webServer` en el puerto 3012 con DB temporal
 * en `%TEMP%\inventario-e2e-pos.sqlite`.
 *
 * Cada `test()` se encadena con el anterior (use({ workers: 1 }) garantiza
 * el orden) para emular un caso de uso real: bootstrap, alta de producto,
 * alta de cliente, registro de venta, lectura del ticket.
 */
const ADMIN = { email: "pos@e2e.com", password: "secret123", nombre: "POS E2E" };

const STATE_FILE = path.join(os.tmpdir(), "inventario-e2e-pos-state.json");

type State = {
  token?: string;
  userId?: number;
  productoId?: number;
  clienteId?: number;
  ventaId?: number;
};

function loadState(): State {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as State;
  } catch {
    return {};
  }
}

function saveState(s: State) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

test.describe.configure({ mode: "serial" });

test("limpia estado previo del flujo", async () => {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  expect(fs.existsSync(STATE_FILE)).toBe(false);
});

test("E2E-POS-01 · health del backend responde 200", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  const body = (await r.json()) as { ok: boolean };
  expect(body.ok).toBe(true);
});

test("E2E-POS-02 · bootstrap del primer admin", async ({ request }) => {
  const need = await request.get("/api/auth/bootstrap-needed");
  const needBody = (await need.json()) as { needed: boolean };

  let token: string;
  let userId: number;
  if (needBody.needed) {
    const r = await request.post("/api/auth/bootstrap", { data: ADMIN });
    expect(r.status()).toBe(201);
    const body = (await r.json()) as { accessToken: string; user: { id: number } };
    token = body.accessToken;
    userId = body.user.id;
  } else {
    const r = await request.post("/api/auth/login", {
      data: { email: ADMIN.email, password: ADMIN.password },
    });
    expect(r.status()).toBe(200);
    const body = (await r.json()) as { accessToken: string; user: { id: number } };
    token = body.accessToken;
    userId = body.user.id;
  }

  expect(token).toBeTruthy();
  expect(typeof userId).toBe("number");
  saveState({ ...loadState(), token, userId });
});

test("E2E-POS-03 · alta de producto en inventario", async ({ request }) => {
  const { token } = loadState();
  expect(token).toBeTruthy();

  const r = await request.post("/api/productos", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      nombre: "Shampoo Premium E2E",
      precio_compra: 1200,
      precio_venta: 2500,
      stock: 15,
      stock_minimo: 3,
    },
  });
  expect([200, 201]).toContain(r.status());
  const body = (await r.json()) as { id: number; nombre: string; stock: number };
  expect(body.id).toBeDefined();
  expect(body.nombre).toBe("Shampoo Premium E2E");
  expect(body.stock).toBe(15);
  saveState({ ...loadState(), productoId: body.id });
});

test("E2E-POS-04 · alta de cliente registrado", async ({ request }) => {
  const { token } = loadState();
  expect(token).toBeTruthy();

  const r = await request.post("/api/clientes", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      nombre: "María Pérez E2E",
      telefono: "555-9090-E2E",
      email: "maria.e2e@test.com",
    },
  });
  expect([200, 201]).toContain(r.status());
  const body = (await r.json()) as { id: number; nombre: string };
  expect(body.id).toBeDefined();
  expect(body.nombre).toBe("María Pérez E2E");
  saveState({ ...loadState(), clienteId: body.id });
});

test("E2E-POS-05 · registrar venta del producto al cliente", async ({ request }) => {
  const { token, userId, productoId, clienteId } = loadState();
  expect(token).toBeTruthy();
  expect(productoId).toBeDefined();
  expect(clienteId).toBeDefined();
  expect(userId).toBeDefined();

  const r = await request.post("/api/ventas", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      usuario_id: userId,
      cliente_id: clienteId,
      lineas: [{ producto_id: productoId, cantidad: 2 }],
      metodo_pago: "efectivo",
    },
  });
  expect([200, 201]).toContain(r.status());
  const body = (await r.json()) as { id: number };
  expect(body.id).toBeDefined();
  saveState({ ...loadState(), ventaId: body.id });
});

test("E2E-POS-06 · ticket: detalle de la venta muestra total y líneas", async ({ request }) => {
  const { token, ventaId, productoId } = loadState();
  expect(token).toBeTruthy();
  expect(ventaId).toBeDefined();

  const r = await request.get(`/api/ventas/${ventaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(r.status()).toBe(200);
  const v = (await r.json()) as {
    total: number;
    lineas: { producto_id: number; cantidad: number; subtotal: number; producto_nombre: string }[];
    metodo_pago: string;
  };
  expect(v.total).toBe(5000); /* 2 × 2500 */
  expect(v.metodo_pago).toBe("efectivo");
  expect(v.lineas).toHaveLength(1);
  expect(v.lineas[0].producto_id).toBe(productoId);
  expect(v.lineas[0].cantidad).toBe(2);
  expect(v.lineas[0].subtotal).toBe(5000);
  expect(v.lineas[0].producto_nombre).toBe("Shampoo Premium E2E");
});

test("E2E-POS-07 · stock del producto disminuyó 2 unidades", async ({ request }) => {
  const { token, productoId } = loadState();
  const r = await request.get(`/api/productos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(r.status()).toBe(200);
  const productos = (await r.json()) as { id: number; stock: number }[];
  const found = productos.find((p) => p.id === productoId);
  expect(found?.stock).toBe(13);
});

test("E2E-POS-08 · una segunda venta no puede llevarse más stock del existente", async ({
  request,
}) => {
  const { token, userId, productoId } = loadState();
  const r = await request.post("/api/ventas", {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      usuario_id: userId,
      lineas: [{ producto_id: productoId, cantidad: 999 }],
    },
  });
  expect(r.status()).toBe(400);
  const body = (await r.json()) as { error: string };
  expect(body.error).toMatch(/Stock/i);
});
