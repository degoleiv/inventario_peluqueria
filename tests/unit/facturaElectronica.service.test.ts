import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { facturaElectronicaService } from "../../server/services/facturaElectronica.service.js";
import { ventaService } from "../../server/services/venta.service.js";
import { productoService } from "../../server/services/producto.service.js";
import { createAdminUser } from "../setup/factories.js";
import { db } from "../../server/db.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
  userSeq = 0;
  prodSeq = 0;
});

let userSeq = 0;
let prodSeq = 0;

async function ventaConTotal(total: number, fecha = "2030-09-10T10:00:00Z") {
  const u = await createAdminUser(`fac${++userSeq}@test.com`, "secret123", `Admin ${userSeq}`);
  const p = (await productoService.create({
    nombre: `Servicio ${++prodSeq}`,
    stock: 1000,
    precio_venta: total,
    precio_compra: 0,
  })) as { id: number };
  const v = await ventaService.create({
    usuario_id: u.id,
    fecha,
    lineas: [{ producto_id: p.id, cantidad: 1 }],
  });
  return v.id;
}

describe("facturaElectronica.emitirParaVenta (caja blanca)", () => {
  it("404 si la venta no existe", async () => {
    await expect(facturaElectronicaService.emitirParaVenta(99999)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("emite factura con número correlativo, uuid, hash y totales calculados", async () => {
    const ventaId = await ventaConTotal(1210);
    const f = (await facturaElectronicaService.emitirParaVenta(ventaId)) as Record<string, unknown>;
    expect(f.numero).toBe(1);
    expect(typeof f.uuid).toBe("string");
    expect((f.uuid as string).length).toBeGreaterThan(10);
    expect(typeof f.hash_integridad).toBe("string");
    /* Con IVA 21%: neto = 1210 / 1.21 = 1000.00; iva = 210.00 */
    expect(f.neto).toBe(1000);
    expect(f.iva_monto).toBe(210);
    expect(f.iva_alicuota).toBe(21);
    expect(f.estado).toBe("emitida");
  });

  it("rechaza emitir factura duplicada para la misma venta (409)", async () => {
    const ventaId = await ventaConTotal(100);
    await facturaElectronicaService.emitirParaVenta(ventaId);
    await expect(facturaElectronicaService.emitirParaVenta(ventaId)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("incrementa el correlativo en cada emisión", async () => {
    const v1 = await ventaConTotal(100);
    const v2 = await ventaConTotal(200);
    const f1 = (await facturaElectronicaService.emitirParaVenta(v1)) as { numero: number };
    const f2 = (await facturaElectronicaService.emitirParaVenta(v2)) as { numero: number };
    expect(f2.numero).toBe(f1.numero + 1);
  });

  it("genera XML válido con UUID y hash embebidos", async () => {
    const ventaId = await ventaConTotal(100);
    const f = (await facturaElectronicaService.emitirParaVenta(ventaId)) as {
      id: number;
      uuid: string;
      hash_integridad: string;
    };
    const doc = (await facturaElectronicaService.documento(f.id, "xml")) as {
      contentType: string;
      body: string;
    };
    expect(doc.contentType).toBe("application/xml");
    expect(doc.body).toContain(f.uuid);
    expect(doc.body).toContain(f.hash_integridad);
    expect(doc.body).toMatch(/<\?xml/);
  });
});

describe("facturaElectronica.documento", () => {
  it("404 si no existe", async () => {
    await expect(facturaElectronicaService.documento(99999, "xml")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("formato JSON devuelve content-type application/json", async () => {
    const ventaId = await ventaConTotal(100);
    const f = (await facturaElectronicaService.emitirParaVenta(ventaId)) as { id: number };
    const doc = (await facturaElectronicaService.documento(f.id, "json")) as {
      contentType: string;
      body: string;
    };
    expect(doc.contentType).toBe("application/json");
    const parsed = JSON.parse(doc.body) as Record<string, unknown>;
    expect(parsed.uuid).toBeDefined();
    expect(parsed.hash_integridad).toBeDefined();
  });
});

describe("facturaElectronica.list / getById / getByVentaId", () => {
  it("getById 404 si no existe", async () => {
    await expect(facturaElectronicaService.getById(99999)).rejects.toMatchObject({ status: 404 });
  });

  it("list filtra por rango de fecha_emision", async () => {
    const v = await ventaConTotal(100);
    await facturaElectronicaService.emitirParaVenta(v);
    /* Forzamos fecha_emision a un año específico */
    await db
      .prepare(`UPDATE facturas_electronicas SET fecha_emision = '2030-09-15T10:00:00Z'`)
      .run();
    const sept = (await facturaElectronicaService.list(
      "2030-09-01",
      "2030-09-30T23:59:59Z"
    )) as unknown[];
    expect(sept.length).toBe(1);
    const enero = (await facturaElectronicaService.list(
      "2030-01-01",
      "2030-01-31T23:59:59Z"
    )) as unknown[];
    expect(enero.length).toBe(0);
  });

  it("getByVentaId devuelve la factura asociada", async () => {
    const v = await ventaConTotal(100);
    const f = (await facturaElectronicaService.emitirParaVenta(v)) as { id: number };
    const found = (await facturaElectronicaService.getByVentaId(v)) as { id: number };
    expect(found.id).toBe(f.id);
  });
});
