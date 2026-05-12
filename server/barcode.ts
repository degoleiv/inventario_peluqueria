import { db } from "./db.js";

const OFF_URL = "https://world.openfoodfacts.org/api/v2/product";
const OBF_URL = "https://world.openbeautyfacts.org/api/v2/product";
const EAN_SEARCH_API = "https://api.ean-search.org/api";
/** Plan trial sin API key (~100 consultas/día). Belleza y categorías varias. */
const UPCITEMDB_TRIAL = "https://api.upcitemdb.com/prod/trial/lookup";
const LOOKUP_TIMEOUT_MS = Number(process.env.BARCODE_LOOKUP_TIMEOUT_MS) || 8000;
const USER_AGENT =
  process.env.BARCODE_USER_AGENT?.trim() ||
  "InventarioPeluqueria/0.1 (local inventory; contact: github.com)";

export type ProductoNormalizado = {
  codigo_barras: string;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  descripcion: string | null;
  imagen_url: string | null;
  fuente:
    | "inventario"
    | "cache"
    | "openfoodfacts"
    | "openbeautyfacts"
    | "upcitemdb"
    | "ean_search"
    | "manual";
};

function nowIso() {
  return new Date().toISOString();
}

function pickProductName(product: Record<string, unknown>): string {
  const keys = [
    "product_name",
    "generic_name",
    "product_name_es",
    "product_name_en",
    "abbreviated_product_name",
    "product_name_fr",
    "product_name_de",
    "product_name_it",
  ];
  for (const k of keys) {
    const v = product[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function normalizeOffPayload(
  codigo: string,
  product: Record<string, unknown> | undefined,
  fuente: "openfoodfacts" | "openbeautyfacts"
): ProductoNormalizado | null {
  if (!product) return null;
  const nombre = pickProductName(product);
  if (!nombre.trim()) return null;
  const marca =
    typeof product.brands === "string" ? product.brands.split(",")[0]?.trim() || null : null;
  const cat =
    typeof product.categories === "string"
      ? product.categories.split(",").pop()?.trim() || null
      : null;
  const descripcion =
    typeof product.generic_name === "string"
      ? product.generic_name
      : typeof product.ingredients_text === "string"
        ? product.ingredients_text
        : null;
  const imagen =
    typeof product.image_url === "string"
      ? product.image_url
      : typeof product.image_front_url === "string"
        ? product.image_front_url
        : null;

  return {
    codigo_barras: codigo,
    nombre: nombre.trim(),
    marca,
    categoria: cat,
    descripcion: descripcion ? String(descripcion).slice(0, 2000) : null,
    imagen_url: imagen,
    fuente,
  };
}

/** Respuesta JSON de EAN-Search.org (barcode-lookup) — tolerante a variantes. */
function normalizeEanSearchPayload(
  codigo: string,
  body: unknown
): ProductoNormalizado | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  let nombre = "";
  let marca: string | null = null;
  let cat: string | null = null;

  if (Array.isArray(o.product) && o.product[0] && typeof o.product[0] === "object") {
    const p = o.product[0] as Record<string, unknown>;
    nombre = typeof p.name === "string" ? p.name : typeof p.productname === "string" ? p.productname : "";
    marca = typeof p.brand === "string" ? p.brand : typeof p.manufacturer === "string" ? p.manufacturer : null;
    cat = typeof p.categoryName === "string" ? p.categoryName : null;
  }
  if (!nombre && typeof o.name === "string") nombre = o.name;
  if (!nombre && typeof o.productname === "string") nombre = o.productname;

  if (!nombre.trim()) return null;

  return {
    codigo_barras: codigo,
    nombre: nombre.trim(),
    marca,
    categoria: cat,
    descripcion: null,
    imagen_url: null,
    fuente: "ean_search",
  };
}

/** UPCitemdb trial: sin registro; límite aprox. 100 req/día. Incluye Health & Beauty entre otras categorías. */
async function fetchUpcitemdb(codigo: string): Promise<ProductoNormalizado | null> {
  if (process.env.BARCODE_UPCITEMDB_DISABLED === "1") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const url = `${UPCITEMDB_TRIAL}?upc=${encodeURIComponent(codigo.trim())}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      code?: string;
      items?: Array<Record<string, unknown>>;
    };
    if (body.code !== "OK" || !Array.isArray(body.items) || body.items.length === 0) return null;
    const it = body.items[0];
    const title = typeof it.title === "string" ? it.title.trim() : "";
    if (!title) return null;
    const brand = typeof it.brand === "string" ? it.brand.trim() || null : null;
    const cat = typeof it.category === "string" ? it.category.trim() || null : null;
    const descRaw = typeof it.description === "string" ? it.description.trim() : "";
    const descripcion = descRaw ? descRaw.slice(0, 2000) : null;
    let imagen_url: string | null = null;
    if (Array.isArray(it.images)) {
      for (const img of it.images) {
        if (typeof img === "string" && /^https?:\/\//i.test(img)) {
          imagen_url = img;
          break;
        }
      }
    }

    return {
      codigo_barras: codigo.trim(),
      nombre: title,
      marca: brand,
      categoria: cat,
      descripcion,
      imagen_url,
      fuente: "upcitemdb",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getCacheRow(codigo: string): Promise<ProductoNormalizado | null> {
  const row = (await db
    .prepare(
      `SELECT respuesta_json FROM productos_cache_api WHERE codigo_barras = ?`
    )
    .get(codigo.trim())) as { respuesta_json: string } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.respuesta_json) as ProductoNormalizado;
    return { ...parsed, fuente: "cache" };
  } catch {
    return null;
  }
}

async function saveCache(codigo: string, data: ProductoNormalizado) {
  const json = JSON.stringify(data);
  await db
    .prepare(
      `INSERT OR REPLACE INTO productos_cache_api (codigo_barras, respuesta_json, fecha_consulta)
     VALUES (?, ?, ?)`
    )
    .run(codigo, json, nowIso());
}

async function fetchOpenFactsProduct(
  baseUrl: string,
  codigo: string,
  fuente: "openfoodfacts" | "openbeautyfacts"
): Promise<ProductoNormalizado | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const url = `${baseUrl}/${encodeURIComponent(codigo)}.json`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      status?: number;
      product?: Record<string, unknown>;
    };
    if (body.status !== 1 || !body.product) return null;
    return normalizeOffPayload(codigo, body.product, fuente);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchOpenFoodFacts(codigo: string): Promise<ProductoNormalizado | null> {
  return fetchOpenFactsProduct(OFF_URL, codigo, "openfoodfacts");
}

async function fetchOpenBeautyFacts(codigo: string): Promise<ProductoNormalizado | null> {
  return fetchOpenFactsProduct(OBF_URL, codigo, "openbeautyfacts");
}

/** EAN-Search.org (cuenta + token). Sin token no se llama (RF-13 EAN-DB / proveedor externo opcional). */
async function fetchEanSearchOrg(codigo: string): Promise<ProductoNormalizado | null> {
  const token = process.env.EAN_SEARCH_ORG_TOKEN?.trim();
  if (!token) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const params = new URLSearchParams({
      token,
      op: "barcode-lookup",
      format: "json",
      ean: codigo.trim(),
    });
    const res = await fetch(`${EAN_SEARCH_API}?${params}`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return normalizeEanSearchPayload(codigo, body);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type LookupResult =
  | { ok: true; data: ProductoNormalizado }
  | { ok: false; manual: true };

export async function lookupBarcode(codigo: string): Promise<LookupResult> {
  const trimmed = codigo.trim();
  if (!trimmed) return { ok: false, manual: true };

  const inv = (await db
    .prepare(
      `SELECT nombre, marca, categoria, descripcion, imagen_url FROM productos WHERE codigo_barras = ?`
    )
    .get(trimmed)) as
    | {
        nombre: string;
        marca: string | null;
        categoria: string | null;
        descripcion: string | null;
        imagen_url: string | null;
      }
    | undefined;
  if (inv) {
    return {
      ok: true,
      data: {
        codigo_barras: trimmed,
        nombre: inv.nombre,
        marca: inv.marca,
        categoria: inv.categoria,
        descripcion: inv.descripcion,
        imagen_url: inv.imagen_url,
        fuente: "inventario",
      },
    };
  }

  const cached = await getCacheRow(trimmed);
  if (cached) return { ok: true, data: cached };

  const fromObf = await fetchOpenBeautyFacts(trimmed);
  if (fromObf) {
    await saveCache(trimmed, fromObf);
    return { ok: true, data: fromObf };
  }

  const fromOff = await fetchOpenFoodFacts(trimmed);
  if (fromOff) {
    await saveCache(trimmed, fromOff);
    return { ok: true, data: fromOff };
  }

  const fromUpc = await fetchUpcitemdb(trimmed);
  if (fromUpc) {
    await saveCache(trimmed, fromUpc);
    return { ok: true, data: fromUpc };
  }

  const fromEan = await fetchEanSearchOrg(trimmed);
  if (fromEan) {
    await saveCache(trimmed, fromEan);
    return { ok: true, data: fromEan };
  }

  return { ok: false, manual: true };
}
