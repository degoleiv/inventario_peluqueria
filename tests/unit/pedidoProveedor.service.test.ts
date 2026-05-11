import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import {
  pedidoProveedorService,
  parseDay,
  validatePedidoFechasYMontos,
  indicadorPago,
} from "../../server/services/pedidoProveedor.service.js";
import { db } from "../../server/db.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

async function crearProveedor(nombre = "Distribuidor Norte", nit = "NIT-PR-001"): Promise<number> {
  const now = new Date().toISOString();
  const info = await db
    .prepare(
      `INSERT INTO proveedores (nombre, nit, telefono, email, created_at) VALUES (?, ?, NULL, NULL, ?)`
    )
    .run(nombre, nit, now);
  return Number(info.lastInsertRowid);
}

async function crearProductoBasico(nombre = "Producto Test", stock = 0): Promise<number> {
  const now = new Date().toISOString();
  const info = await db
    .prepare(
      `INSERT INTO productos (nombre, stock, precio_compra, precio_venta, created_at, updated_at)
       VALUES (?, ?, 0, 0, ?, ?)`
    )
    .run(nombre, stock, now, now);
  return Number(info.lastInsertRowid);
}

describe("parseDay (función pura)", () => {
  it("acepta YYYY-MM-DD válido", () => {
    expect(parseDay("2030-05-10")).toBe("2030-05-10");
  });

  it("trunca cadenas ISO conservando la fecha", () => {
    expect(parseDay("2030-05-10T10:00:00.000Z")).toBe("2030-05-10");
  });

  it("retorna null para entradas no reconocibles", () => {
    expect(parseDay(null)).toBeNull();
    expect(parseDay(123 as unknown as string)).toBeNull();
    expect(parseDay("hoy")).toBeNull();
    expect(parseDay("2030/05/10")).toBeNull();
  });
});

describe("validatePedidoFechasYMontos (caja blanca - reglas)", () => {
  it("acepta caso feliz", () => {
    expect(() =>
      validatePedidoFechasYMontos({
        fecha: "2030-05-01",
        fecha_pago_con_descuento: "2030-05-10",
        fecha_pago_maxima: "2030-05-30",
        valor_pago_con_descuento: 80,
        valor_pago_sin_descuento: 100,
      })
    ).not.toThrow();
  });

  it("rechaza fecha_pago_con_descuento > fecha_pago_maxima", () => {
    expect(() =>
      validatePedidoFechasYMontos({
        fecha: "2030-05-01",
        fecha_pago_con_descuento: "2030-06-15",
        fecha_pago_maxima: "2030-05-30",
      })
    ).toThrow(/descuento.*máxima/i);
  });

  it("rechaza fecha pedido > fecha_pago_con_descuento", () => {
    expect(() =>
      validatePedidoFechasYMontos({
        fecha: "2030-05-20",
        fecha_pago_con_descuento: "2030-05-10",
      })
    ).toThrow(/pedido.*descuento/i);
  });

  it("rechaza fecha pedido > fecha_pago_maxima", () => {
    expect(() =>
      validatePedidoFechasYMontos({
        fecha: "2030-06-01",
        fecha_pago_maxima: "2030-05-30",
      })
    ).toThrow(/pedido.*máxima/i);
  });

  it("rechaza valor con descuento > valor sin descuento", () => {
    expect(() =>
      validatePedidoFechasYMontos({
        fecha: "2030-05-01",
        valor_pago_con_descuento: 200,
        valor_pago_sin_descuento: 100,
      })
    ).toThrow(/con descuento.*sin descuento/i);
  });

  it("rechaza valores negativos", () => {
    expect(() =>
      validatePedidoFechasYMontos({
        fecha: "2030-05-01",
        valor_pago_con_descuento: -5,
      })
    ).toThrow(/valor.*con descuento/i);
  });
});

describe("indicadorPago (función derivada - estados)", () => {
  const fecha = "2030-05-01";
  it("retorna 'pagado' si estado=pagado", () => {
    expect(indicadorPago({ estado: "pagado", fecha })).toBe("pagado");
  });

  it("retorna 'parcial' si estado=parcial", () => {
    expect(indicadorPago({ estado: "parcial", fecha })).toBe("parcial");
  });

  it("retorna 'sin_plazos_configurados' cuando no hay fd ni fm", () => {
    expect(indicadorPago({ estado: "pendiente", fecha })).toBe("sin_plazos_configurados");
  });

  it("retorna 'vencido' si hoy > fecha_pago_maxima", () => {
    expect(
      indicadorPago({
        estado: "pendiente",
        fecha: "2020-01-01",
        fecha_pago_maxima: "2020-02-01",
      })
    ).toBe("vencido");
  });

  it("retorna 'sin_descuento_configurado' cuando solo hay fm en el futuro", () => {
    /* Año muy futuro asegura que today <= fm */
    expect(
      indicadorPago({
        estado: "pendiente",
        fecha: "2099-01-01",
        fecha_pago_maxima: "2099-12-31",
      })
    ).toBe("sin_descuento_configurado");
  });
});

describe("pedidoProveedor.service.create (caja blanca - transacción)", () => {
  it("rechaza si lineas vacío", async () => {
    const prov = await crearProveedor();
    await expect(
      pedidoProveedorService.create({ proveedor_id: prov, lineas: [] })
    ).rejects.toThrow(/línea/);
  });

  it("rechaza si proveedor_id ausente o inexistente", async () => {
    await expect(
      pedidoProveedorService.create({ lineas: [{ producto_id: 1, cantidad: 1 }] })
    ).rejects.toThrow(/proveedor_id/);
    await expect(
      pedidoProveedorService.create({
        proveedor_id: 99999,
        lineas: [{ producto_id: 1, cantidad: 1 }],
      })
    ).rejects.toThrow(/Proveedor/);
  });

  it("rechaza línea con cantidad inválida o costo negativo", async () => {
    const prov = await crearProveedor();
    const pid = await crearProductoBasico();
    await expect(
      pedidoProveedorService.create({
        proveedor_id: prov,
        lineas: [{ producto_id: pid, cantidad: 0, costo_unitario: 5 }],
      })
    ).rejects.toThrow(/Cantidad/);
    await expect(
      pedidoProveedorService.create({
        proveedor_id: prov,
        lineas: [{ producto_id: pid, cantidad: 1, costo_unitario: -3 }],
      })
    ).rejects.toThrow(/Costo/);
  });

  it("crea pedido, suma stock al producto y registra movimiento ENTRADA", async () => {
    const prov = await crearProveedor();
    const pid = await crearProductoBasico("Tinte", 5);
    const ped = (await pedidoProveedorService.create({
      proveedor_id: prov,
      fecha: "2030-05-01",
      lineas: [{ producto_id: pid, cantidad: 10, costo_unitario: 200 }],
    })) as Record<string, unknown>;
    expect(ped.total).toBe(2000);
    const stockAfter = (await db.prepare(`SELECT stock FROM productos WHERE id=?`).get(pid)) as {
      stock: number;
    };
    expect(stockAfter.stock).toBe(15);
    const mov = (await db
      .prepare(
        `SELECT tipo, cantidad FROM movimientos_inventario WHERE producto_id=? AND pedido_proveedor_id=?`
      )
      .get(pid, ped.id)) as { tipo: string; cantidad: number };
    expect(mov.tipo).toBe("ENTRADA");
    expect(mov.cantidad).toBe(10);
  });

  it("crea producto nuevo desde la línea (nuevo_producto)", async () => {
    const prov = await crearProveedor();
    const ped = (await pedidoProveedorService.create({
      proveedor_id: prov,
      fecha: "2030-05-01",
      lineas: [
        {
          nuevo_producto: { nombre: "Crema brand-new", precio_venta: 350 },
          cantidad: 4,
          costo_unitario: 250,
        },
      ],
    })) as { id: number; lineas: { producto_id: number; subtotal: number }[] };
    expect(ped.lineas).toHaveLength(1);
    expect(ped.lineas[0].subtotal).toBe(1000);
    /* El producto debe existir y traer el stock inicial = cantidad pedida */
    const prod = (await db
      .prepare(`SELECT nombre, stock FROM productos WHERE id=?`)
      .get(ped.lineas[0].producto_id)) as { nombre: string; stock: number };
    expect(prod.nombre).toBe("Crema brand-new");
    expect(prod.stock).toBe(4);
  });

  it("rollback: si una línea falla, no se modifica stock de líneas previas", async () => {
    const prov = await crearProveedor();
    const pid = await crearProductoBasico("Tijera", 3);
    await expect(
      pedidoProveedorService.create({
        proveedor_id: prov,
        fecha: "2030-05-01",
        lineas: [
          { producto_id: pid, cantidad: 5, costo_unitario: 100 },
          { producto_id: 99999, cantidad: 1, costo_unitario: 50 },
        ],
      })
    ).rejects.toThrow(/no existe/);
    const stock = (await db.prepare(`SELECT stock FROM productos WHERE id=?`).get(pid)) as {
      stock: number;
    };
    expect(stock.stock).toBe(3);
  });
});

describe("pedidoProveedor.service.updateMeta", () => {
  it("404 si no existe", async () => {
    await expect(pedidoProveedorService.updateMeta(99999, {})).rejects.toMatchObject({
      status: 404,
    });
  });

  it("permite cambiar estado y referencia sin tocar stock", async () => {
    const prov = await crearProveedor();
    const pid = await crearProductoBasico("X", 0);
    const p = (await pedidoProveedorService.create({
      proveedor_id: prov,
      fecha: "2030-05-01",
      lineas: [{ producto_id: pid, cantidad: 2, costo_unitario: 10 }],
    })) as { id: number };
    const stockAntes = (await db.prepare(`SELECT stock FROM productos WHERE id=?`).get(pid)) as {
      stock: number;
    };
    const upd = (await pedidoProveedorService.updateMeta(p.id, {
      estado: "pagado",
      referencia: "FACT-001",
    })) as Record<string, unknown>;
    expect(upd.estado).toBe("pagado");
    expect(upd.referencia).toBe("FACT-001");
    const stockDespues = (await db.prepare(`SELECT stock FROM productos WHERE id=?`).get(pid)) as {
      stock: number;
    };
    expect(stockDespues.stock).toBe(stockAntes.stock);
  });
});

describe("pedidoProveedor.service.list", () => {
  it("filtra por proveedor_id y referencia", async () => {
    const prov1 = await crearProveedor("P1", "NIT-1");
    const prov2 = await crearProveedor("P2", "NIT-2");
    const pid = await crearProductoBasico("Z", 0);
    const a = (await pedidoProveedorService.create({
      proveedor_id: prov1,
      fecha: "2030-05-01",
      referencia: "ALPHA-100",
      lineas: [{ producto_id: pid, cantidad: 1, costo_unitario: 1 }],
    })) as { id: number };
    await pedidoProveedorService.create({
      proveedor_id: prov2,
      fecha: "2030-05-02",
      referencia: "BETA-200",
      lineas: [{ producto_id: pid, cantidad: 1, costo_unitario: 1 }],
    });
    const soloProv1 = (await pedidoProveedorService.list({ proveedor_id: prov1 })) as unknown[];
    expect(soloProv1.length).toBe(1);
    const soloAlpha = (await pedidoProveedorService.list({ referencia: "alpha" })) as {
      id: number;
    }[];
    expect(soloAlpha.length).toBe(1);
    expect(soloAlpha[0].id).toBe(a.id);
  });
});
