import { db } from "../db.js";
import { AppError } from "../lib/AppError.js";

const CLAVES = {
  puntos_activo: "puntos_activo",
  puntos_ratio: "puntos_por_unidad_moneda",
  puntos_valor_redencion: "puntos_valor_redencion",
} as const;

async function getValor(clave: string): Promise<string | null> {
  const row = (await db.prepare(`SELECT valor FROM configuracion WHERE clave = ?`).get(clave)) as
    | { valor: string }
    | undefined;
  return row?.valor ?? null;
}

async function setValor(clave: string, valor: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
    )
    .run(clave, valor);
}

function hexOrThrow(v: string, label: string): string {
  const s = v.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(s)) {
    throw new AppError(`${label}: usar formato #RRGGBB`);
  }
  return s;
}

export const configuracionService = {
  /** Descuento en moneda por cada punto canjeado en venta (0 = canje desactivado). */
  async getPuntosValorRedencion(): Promise<number> {
    const v = await getValor(CLAVES.puntos_valor_redencion);
    const n = v != null && v !== "" ? Number(v) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  },

  async getPuntosConfig(): Promise<{
    activo: boolean;
    puntos_por_unidad_moneda: number;
    valor_redencion_moneda: number;
  }> {
    const a = await getValor(CLAVES.puntos_activo);
    const r = await getValor(CLAVES.puntos_ratio);
    const activo = a === "1" || a === "true";
    const raw = r != null && r !== "" ? Number(r) : 1;
    const puntos_por_unidad_moneda = Number.isFinite(raw) && raw >= 0 ? raw : 1;
    return {
      activo,
      puntos_por_unidad_moneda,
      valor_redencion_moneda: await configuracionService.getPuntosValorRedencion(),
    };
  },

  async updatePuntosConfig(body: Record<string, unknown>) {
    if (typeof body.activo === "boolean") {
      await setValor(CLAVES.puntos_activo, body.activo ? "1" : "0");
    }
    if (body.puntos_por_unidad_moneda != null) {
      const n = Number(body.puntos_por_unidad_moneda);
      if (!Number.isFinite(n) || n < 0) {
        throw new AppError("puntos_por_unidad_moneda debe ser un número ≥ 0");
      }
      await setValor(CLAVES.puntos_ratio, String(n));
    }
    if (body.valor_redencion_moneda != null) {
      const n = Number(body.valor_redencion_moneda);
      if (!Number.isFinite(n) || n < 0) {
        throw new AppError("valor_redencion_moneda debe ser un número ≥ 0");
      }
      await setValor(CLAVES.puntos_valor_redencion, String(n));
    }
    return await configuracionService.getPuntosConfig();
  },

  async getBranding(): Promise<{
    nombre_negocio: string;
    logo_data_url: string | null;
    color_primario: string;
    color_secundario: string;
    theme_mode: "light" | "dark" | "auto";
  }> {
    const nombre = (await getValor("brand_nombre_negocio"))?.trim() || "Peluquería";
    const logo = await getValor("brand_logo_data_url");
    const p = (await getValor("brand_color_primario"))?.trim() || "#b8956a";
    const s = (await getValor("brand_color_secundario"))?.trim() || "#5a524d";
    const tm = (await getValor("brand_theme_mode"))?.trim().toLowerCase();
    const theme_mode = tm === "dark" || tm === "auto" || tm === "light" ? tm : "light";
    return {
      nombre_negocio: nombre,
      logo_data_url: logo && logo.length > 0 ? logo : null,
      color_primario: p,
      color_secundario: s,
      theme_mode,
    };
  },

  async updateBranding(body: Record<string, unknown>) {
    if (typeof body.nombre_negocio === "string" && body.nombre_negocio.trim()) {
      await setValor("brand_nombre_negocio", body.nombre_negocio.trim().slice(0, 120));
    }
    if (body.logo_data_url === null) {
      await setValor("brand_logo_data_url", "");
    } else if (typeof body.logo_data_url === "string") {
      const raw = body.logo_data_url.trim();
      if (raw.length > 450_000) {
        throw new AppError("Logo demasiado grande (máx. ~300KB en base64)");
      }
      if (raw && !raw.startsWith("data:image/")) {
        throw new AppError("Logo: usar imagen en base64 data:image/…");
      }
      await setValor("brand_logo_data_url", raw);
    }
    if (typeof body.color_primario === "string") {
      await setValor("brand_color_primario", hexOrThrow(body.color_primario, "color_primario"));
    }
    if (typeof body.color_secundario === "string") {
      await setValor("brand_color_secundario", hexOrThrow(body.color_secundario, "color_secundario"));
    }
    if (typeof body.theme_mode === "string") {
      const t = body.theme_mode.trim().toLowerCase();
      if (t !== "light" && t !== "dark" && t !== "auto") {
        throw new AppError("theme_mode: light, dark o auto");
      }
      await setValor("brand_theme_mode", t);
    }
    return await configuracionService.getBranding();
  },

  async getTienda(): Promise<{
    nombre_comercial: string;
    direccion: string;
    telefono: string;
    moneda: string;
    impuesto_pct: number | null;
  }> {
    const imp = await getValor("tienda_impuesto_pct");
    const impNum = imp != null && imp !== "" ? Number(imp) : null;
    return {
      nombre_comercial: (await getValor("tienda_nombre_comercial"))?.trim() || "",
      direccion: (await getValor("tienda_direccion"))?.trim() || "",
      telefono: (await getValor("tienda_telefono"))?.trim() || "",
      moneda: (await getValor("tienda_moneda"))?.trim() || "ARS",
      impuesto_pct: impNum != null && Number.isFinite(impNum) && impNum >= 0 ? impNum : null,
    };
  },

  async updateTienda(body: Record<string, unknown>) {
    if (typeof body.nombre_comercial === "string") {
      await setValor("tienda_nombre_comercial", body.nombre_comercial.trim().slice(0, 200));
    }
    if (typeof body.direccion === "string") {
      await setValor("tienda_direccion", body.direccion.trim().slice(0, 400));
    }
    if (typeof body.telefono === "string") {
      await setValor("tienda_telefono", body.telefono.trim().slice(0, 40));
    }
    if (typeof body.moneda === "string" && body.moneda.trim()) {
      await setValor("tienda_moneda", body.moneda.trim().toUpperCase().slice(0, 8));
    }
    if (body.impuesto_pct === null) {
      await setValor("tienda_impuesto_pct", "");
    } else if (body.impuesto_pct != null) {
      const n = Number(body.impuesto_pct);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new AppError("impuesto_pct entre 0 y 100");
      }
      await setValor("tienda_impuesto_pct", String(n));
    }
    return await configuracionService.getTienda();
  },

  async getSistemaPrefs(): Promise<{
    modo_offline: boolean;
    notificaciones: boolean;
    backup_auto: boolean;
  }> {
    return {
      modo_offline: (await getValor("sis_modo_offline")) === "1",
      notificaciones: (await getValor("sis_notificaciones")) !== "0",
      backup_auto: (await getValor("sis_backup_auto")) === "1",
    };
  },

  async updateSistemaPrefs(body: Record<string, unknown>) {
    if (typeof body.modo_offline === "boolean") {
      await setValor("sis_modo_offline", body.modo_offline ? "1" : "0");
    }
    if (typeof body.notificaciones === "boolean") {
      await setValor("sis_notificaciones", body.notificaciones ? "1" : "0");
    }
    if (typeof body.backup_auto === "boolean") {
      await setValor("sis_backup_auto", body.backup_auto ? "1" : "0");
    }
    return await configuracionService.getSistemaPrefs();
  },
};
