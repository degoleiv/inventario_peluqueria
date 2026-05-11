import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { proveedoresService } from "../../server/services/proveedores.service.js";
import { db } from "../../server/db.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

const ADMIN_OPTS = { incluirInactivos: true, userMayViewInactive: true };

describe("proveedores.service.create (caja blanca)", () => {
  it("crea proveedor válido", async () => {
    const p = await proveedoresService.create({
      nombre: "Distribuidora Sur",
      nit: "900-111-222",
      email: "ventas@sur.test",
      telefono: "555-100",
      direccion: "Av. Sur 123",
    });
    expect(p.id).toBeDefined();
    expect(p.nombre).toBe("Distribuidora Sur");
    expect(p.estado).toBe("activo");
    expect(p.email).toBe("ventas@sur.test");
  });

  it("rechaza nombre vacío", async () => {
    await expect(
      proveedoresService.create({ nombre: "", nit: "111" })
    ).rejects.toThrow(/nombre/);
  });

  it("rechaza NIT vacío", async () => {
    await expect(
      proveedoresService.create({ nombre: "X", nit: "" })
    ).rejects.toThrow(/NIT/);
  });

  it("rechaza email con formato inválido", async () => {
    await expect(
      proveedoresService.create({ nombre: "X", nit: "1", email: "no-es-email" })
    ).rejects.toThrow(/email/i);
  });

  it("rechaza icono_url con esquema inválido", async () => {
    await expect(
      proveedoresService.create({
        nombre: "X",
        nit: "1",
        icono_url: "ftp://server/img.png",
      })
    ).rejects.toThrow(/icono/i);
  });

  it("rechaza estado fuera del enum", async () => {
    await expect(
      proveedoresService.create({ nombre: "X", nit: "1", estado: "rarito" })
    ).rejects.toThrow(/estado/);
  });

  it("rechaza NIT duplicado con 409", async () => {
    await proveedoresService.create({ nombre: "A", nit: "DUP-001" });
    await expect(
      proveedoresService.create({ nombre: "B", nit: "DUP-001" })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("acepta icono_url con http(s) o data:image/", async () => {
    const a = await proveedoresService.create({
      nombre: "Img1",
      nit: "ICO-1",
      icono_url: "https://cdn.test/x.png",
    });
    expect(a.icono_url).toBe("https://cdn.test/x.png");
    const b = await proveedoresService.create({
      nombre: "Img2",
      nit: "ICO-2",
      icono_url: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(b.icono_url).toMatch(/^data:image\//);
  });
});

describe("proveedores.service.update / patchEstado", () => {
  it("404 si no existe", async () => {
    await expect(
      proveedoresService.update(99999, { nombre: "X" })
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      proveedoresService.patchEstado(99999, { estado: "inactivo" })
    ).rejects.toMatchObject({ status: 404 });
  });

  it("update conserva valores no enviados", async () => {
    const p = await proveedoresService.create({
      nombre: "Original",
      nit: "U-001",
      email: "a@b.test",
    });
    const upd = await proveedoresService.update(p.id, { nombre: "Modificado" });
    expect(upd.nombre).toBe("Modificado");
    expect(upd.email).toBe("a@b.test");
    expect(upd.nit).toBe("U-001");
  });

  it("update rechaza NIT duplicado de otro proveedor", async () => {
    await proveedoresService.create({ nombre: "A", nit: "X-1" });
    const b = await proveedoresService.create({ nombre: "B", nit: "X-2" });
    await expect(
      proveedoresService.update(b.id, { nit: "X-1" })
    ).rejects.toMatchObject({ status: 409 });
  });

  it("patchEstado exige body.estado", async () => {
    const p = await proveedoresService.create({ nombre: "X", nit: "ES-1" });
    await expect(proveedoresService.patchEstado(p.id, {})).rejects.toThrow(/estado/);
  });

  it("patchEstado cambia activo↔inactivo", async () => {
    const p = await proveedoresService.create({ nombre: "X", nit: "ES-2" });
    expect(p.estado).toBe("activo");
    const off = await proveedoresService.patchEstado(p.id, { estado: "inactivo" });
    expect(off.estado).toBe("inactivo");
    const on = await proveedoresService.patchEstado(p.id, { estado: "activo" });
    expect(on.estado).toBe("activo");
  });
});

describe("proveedores.service.list (caja negra - filtros)", () => {
  it("oculta inactivos a usuarios sin permiso", async () => {
    const a = await proveedoresService.create({ nombre: "Visible", nit: "V-1" });
    await proveedoresService.create({ nombre: "Oculto", nit: "V-2" });
    await proveedoresService.patchEstado(a.id, { estado: "inactivo" });
    /* Usuario sin permiso (userMayViewInactive=false) ve sólo activos */
    const visibles = await proveedoresService.list({
      incluirInactivos: false,
      userMayViewInactive: false,
    });
    expect(visibles.find((p) => p.nit === "V-1")).toBeUndefined();
    expect(visibles.find((p) => p.nit === "V-2")).toBeDefined();
  });

  it("admin con incluirInactivos=true ve los dos", async () => {
    const a = await proveedoresService.create({ nombre: "X", nit: "L-1" });
    await proveedoresService.patchEstado(a.id, { estado: "inactivo" });
    await proveedoresService.create({ nombre: "Y", nit: "L-2" });
    const todos = await proveedoresService.list(ADMIN_OPTS);
    expect(todos.length).toBe(2);
  });

  it("filtra por search en nombre", async () => {
    await proveedoresService.create({ nombre: "Perfumería Vega", nit: "S-1" });
    await proveedoresService.create({ nombre: "Cosmetics Arce", nit: "S-2" });
    const r = await proveedoresService.list({ ...ADMIN_OPTS, search: "Vega" });
    expect(r.length).toBe(1);
    expect(r[0].nombre).toContain("Vega");
  });
});

describe("proveedores.service.deletePermanently", () => {
  it("404 si no existe", async () => {
    await expect(proveedoresService.deletePermanently(99999)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("borra proveedor sin pedidos asociados", async () => {
    const p = await proveedoresService.create({ nombre: "Solo", nit: "D-1" });
    await proveedoresService.deletePermanently(p.id);
    await expect(proveedoresService.getById(p.id)).rejects.toMatchObject({ status: 404 });
  });

  it("rechaza con 409 si tiene pedidos asociados", async () => {
    const p = await proveedoresService.create({ nombre: "Con pedidos", nit: "D-2" });
    /* Insertamos un pedido directo asociado al proveedor */
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO pedidos_proveedor (proveedor_id, fecha, total, created_at) VALUES (?, ?, 100, ?)`
      )
      .run(p.id, "2030-05-01", now);
    await expect(proveedoresService.deletePermanently(p.id)).rejects.toMatchObject({
      status: 409,
    });
  });
});
