import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { ensureDb, resetDb } from "../setup/db.js";
import { configuracionService } from "../../server/services/configuracion.service.js";

beforeAll(async () => {
  await ensureDb();
});

beforeEach(async () => {
  await resetDb();
});

describe("configuracion.service / branding", () => {
  it("getBranding devuelve valores por defecto si no hay configuración", async () => {
    const b = await configuracionService.getBranding();
    expect(b.nombre_negocio).toBe("Peluquería");
    expect(b.logo_data_url).toBeNull();
    expect(b.color_primario).toMatch(/^#[0-9a-f]{6}$/i);
    expect(b.theme_mode).toBe("light");
  });

  it("updateBranding persiste nombre y colores válidos", async () => {
    const b = await configuracionService.updateBranding({
      nombre_negocio: "Mi Peluquería SA",
      color_primario: "#FF8800",
      color_secundario: "#112233",
      theme_mode: "dark",
    });
    expect(b.nombre_negocio).toBe("Mi Peluquería SA");
    expect(b.color_primario).toBe("#FF8800");
    expect(b.color_secundario).toBe("#112233");
    expect(b.theme_mode).toBe("dark");
  });

  it("updateBranding rechaza color con formato inválido", async () => {
    await expect(
      configuracionService.updateBranding({ color_primario: "rojo" })
    ).rejects.toThrow(/color_primario/);
    await expect(
      configuracionService.updateBranding({ color_secundario: "#123" })
    ).rejects.toThrow(/color_secundario/);
  });

  it("updateBranding rechaza theme_mode fuera del enum", async () => {
    await expect(
      configuracionService.updateBranding({ theme_mode: "rainbow" })
    ).rejects.toThrow(/theme_mode/);
  });

  it("logo_data_url=null limpia el logo, base64 inválido se rechaza", async () => {
    await configuracionService.updateBranding({
      logo_data_url: "data:image/png;base64,iVBORw0KGgo=",
    });
    const conLogo = await configuracionService.getBranding();
    expect(conLogo.logo_data_url).toMatch(/^data:image\//);

    const sinLogo = await configuracionService.updateBranding({ logo_data_url: null });
    expect(sinLogo.logo_data_url).toBeNull();

    await expect(
      configuracionService.updateBranding({ logo_data_url: "no-es-data-url" })
    ).rejects.toThrow(/Logo/);
  });

  it("logo > 450KB se rechaza", async () => {
    const big = "data:image/png;base64," + "A".repeat(450_001);
    await expect(
      configuracionService.updateBranding({ logo_data_url: big })
    ).rejects.toThrow(/grande/);
  });

  it("trunca el nombre de negocio a 120 caracteres", async () => {
    const long = "x".repeat(200);
    const b = await configuracionService.updateBranding({ nombre_negocio: long });
    expect(b.nombre_negocio.length).toBe(120);
  });
});

describe("configuracion.service / puntos de fidelidad", () => {
  it("getPuntosConfig devuelve defaults (activo=false, ratio=1, redencion=0)", async () => {
    const c = await configuracionService.getPuntosConfig();
    expect(c.activo).toBe(false);
    expect(c.puntos_por_unidad_moneda).toBe(1);
    expect(c.valor_redencion_moneda).toBe(0);
  });

  it("updatePuntosConfig persiste configuración válida", async () => {
    const c = await configuracionService.updatePuntosConfig({
      activo: true,
      puntos_por_unidad_moneda: 0.5,
      valor_redencion_moneda: 10,
    });
    expect(c.activo).toBe(true);
    expect(c.puntos_por_unidad_moneda).toBe(0.5);
    expect(c.valor_redencion_moneda).toBe(10);
  });

  it("rechaza puntos_por_unidad_moneda negativo", async () => {
    await expect(
      configuracionService.updatePuntosConfig({ puntos_por_unidad_moneda: -1 })
    ).rejects.toThrow(/puntos_por_unidad_moneda/);
  });

  it("rechaza valor_redencion_moneda negativo o no numérico", async () => {
    await expect(
      configuracionService.updatePuntosConfig({ valor_redencion_moneda: -5 })
    ).rejects.toThrow(/valor_redencion/);
    await expect(
      configuracionService.updatePuntosConfig({ valor_redencion_moneda: "abc" })
    ).rejects.toThrow(/valor_redencion/);
  });

  it("getPuntosValorRedencion clamp >= 0", async () => {
    const v = await configuracionService.getPuntosValorRedencion();
    expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe("configuracion.service / tienda", () => {
  it("getTienda devuelve defaults", async () => {
    const t = await configuracionService.getTienda();
    expect(t.moneda).toBe("ARS");
    expect(t.impuesto_pct).toBeNull();
  });

  it("normaliza moneda a mayúsculas y trunca a 8 caracteres", async () => {
    const t = await configuracionService.updateTienda({ moneda: "usdtokendolar" });
    expect(t.moneda).toBe("USDTOKEN");
  });

  it("rechaza impuesto_pct fuera del rango [0,100]", async () => {
    await expect(
      configuracionService.updateTienda({ impuesto_pct: 150 })
    ).rejects.toThrow(/impuesto/);
    await expect(
      configuracionService.updateTienda({ impuesto_pct: -1 })
    ).rejects.toThrow(/impuesto/);
  });

  it("impuesto_pct=null limpia el campo", async () => {
    await configuracionService.updateTienda({ impuesto_pct: 21 });
    const con = await configuracionService.getTienda();
    expect(con.impuesto_pct).toBe(21);
    const sin = await configuracionService.updateTienda({ impuesto_pct: null });
    expect(sin.impuesto_pct).toBeNull();
  });
});

describe("configuracion.service / certificado laboral", () => {
  it("getCertificadoLaboral devuelve campos vacíos por defecto", async () => {
    const c = await configuracionService.getCertificadoLaboral();
    expect(c.firma_data_url).toBeNull();
    expect(c.nombre_quien_expide).toBe("");
    expect(c.ciudad_certificado).toBe("");
  });

  it("update persiste nombre y ciudad", async () => {
    const c = await configuracionService.updateCertificadoLaboral({
      nombre_quien_expide: "Sandra López",
      ciudad_certificado: "Bogotá",
    });
    expect(c.nombre_quien_expide).toBe("Sandra López");
    expect(c.ciudad_certificado).toBe("Bogotá");
  });

  it("firma data url base64 válida se acepta y null limpia", async () => {
    const ok = await configuracionService.updateCertificadoLaboral({
      firma_data_url: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(ok.firma_data_url).toMatch(/^data:image\//);
    const limpio = await configuracionService.updateCertificadoLaboral({
      firma_data_url: null,
    });
    expect(limpio.firma_data_url).toBeNull();
  });

  it("rechaza firma > 450KB", async () => {
    const big = "data:image/png;base64," + "A".repeat(450_001);
    await expect(
      configuracionService.updateCertificadoLaboral({ firma_data_url: big })
    ).rejects.toThrow(/grande/);
  });
});

describe("configuracion.service / preferencias del sistema", () => {
  it("getSistemaPrefs devuelve notificaciones=true por defecto", async () => {
    const p = await configuracionService.getSistemaPrefs();
    expect(p.notificaciones).toBe(true);
    expect(p.modo_offline).toBe(false);
    expect(p.backup_auto).toBe(false);
  });

  it("update persiste flags booleanos", async () => {
    const p = await configuracionService.updateSistemaPrefs({
      modo_offline: true,
      notificaciones: false,
      backup_auto: true,
    });
    expect(p.modo_offline).toBe(true);
    expect(p.notificaciones).toBe(false);
    expect(p.backup_auto).toBe(true);
  });
});
