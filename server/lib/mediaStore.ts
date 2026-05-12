import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { inventarioDbFilePath } from "../db.js";
import { AppError } from "./AppError.js";

/** Prefijo que se guarda en SQLite y se expone al cliente (mismo origen que el API o proxy). */
export const MEDIA_PUBLIC_PREFIX = "/api/media";

const DATA_URL_RE = /^data:([^;]+);base64,([\s\S]+)$/i;

export type MediaScope = "branding" | "cert" | "productos" | "proveedores" | "usuarios" | "gastos";

const SCOPES = new Set<string>(["branding", "cert", "productos", "proveedores", "usuarios", "gastos"]);

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
};

/** Carpeta en disco: junto al `.sqlite` (p. ej. `%APPDATA%/inventario-peluqueria/media`) o `INVENTARIO_MEDIA_DIR`. */
export function inventarioMediaRoot(): string {
  const fromEnv = process.env.INVENTARIO_MEDIA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(path.dirname(inventarioDbFilePath()), "media");
}

export function isOurMediaUrl(s: string | null | undefined): boolean {
  if (s == null) return false;
  return s.trim().startsWith(`${MEDIA_PUBLIC_PREFIX}/`);
}

function extForMime(mimeRaw: string): string {
  const mime = mimeRaw.toLowerCase().split(";")[0].trim();
  return MIME_EXT[mime] ?? ".bin";
}

function assertScope(scope: string): asserts scope is MediaScope {
  if (!SCOPES.has(scope)) throw new AppError("Ámbito de archivo inválido", 400);
}

function isValidScope(scope: string): scope is MediaScope {
  return SCOPES.has(scope);
}

const FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/i;

export function mediaPublicPathToAbsolute(publicPath: string): string | null {
  const t = publicPath.trim();
  if (!isOurMediaUrl(t)) return null;
  const rel = t.slice(MEDIA_PUBLIC_PREFIX.length + 1);
  const parts = rel.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [scope, file] = parts;
  if (!isValidScope(scope)) return null;
  if (!FILENAME_RE.test(file)) return null;
  const base = path.resolve(inventarioMediaRoot());
  const abs = path.resolve(base, scope, path.basename(file));
  const prefix = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  if (!abs.startsWith(prefix)) return null;
  return abs;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function unlinkMediaPublicPath(publicPath: string | null | undefined): Promise<void> {
  if (!publicPath || !isOurMediaUrl(publicPath)) return;
  const abs = mediaPublicPathToAbsolute(publicPath);
  if (!abs) return;
  try {
    await fs.unlink(abs);
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code !== "ENOENT") throw e;
  }
}

export async function readMediaFileBuffer(publicPath: string): Promise<Buffer | null> {
  const abs = mediaPublicPathToAbsolute(publicPath);
  if (!abs) return null;
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

export type SaveDataUrlOptions = {
  scope: MediaScope;
  maxBytes: number;
  /** Si se define, solo se permiten estos MIME (normalizado en minúsculas). */
  allowedMime?: Set<string>;
};

/**
 * Decodifica un data URL, escribe en `media/<scope>/<uuid>.<ext>` y devuelve `/api/media/scope/file`.
 */
export async function saveDataUrlToDisk(dataUrl: string, opts: SaveDataUrlOptions): Promise<string> {
  assertScope(opts.scope);
  const trimmed = dataUrl.trim();
  const m = DATA_URL_RE.exec(trimmed);
  if (!m) throw new AppError("Formato data URL inválido (se esperaba base64)", 400);
  const mime = m[1].toLowerCase().split(";")[0].trim();
  if (opts.allowedMime && !opts.allowedMime.has(mime)) {
    throw new AppError("Tipo de archivo no permitido", 400);
  }
  const b64 = m[2].replace(/\s/g, "");
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new AppError("Base64 inválido", 400);
  }
  if (buf.length === 0) throw new AppError("Archivo vacío", 400);
  if (buf.length > opts.maxBytes) {
    throw new AppError(`Archivo demasiado grande (máx. ${Math.ceil(opts.maxBytes / 1024 / 1024)} MB)`, 400);
  }
  const root = inventarioMediaRoot();
  const dir = path.join(root, opts.scope);
  await ensureDir(dir);
  const ext = extForMime(mime);
  const name = `${randomUUID()}${ext}`;
  const abs = path.join(dir, name);
  await fs.writeFile(abs, buf);
  return `${MEDIA_PUBLIC_PREFIX}/${opts.scope}/${name}`;
}

/** Imagen para branding / productos / iconos (no PDF). */
export async function saveImageDataUrl(dataUrl: string, scope: MediaScope, maxBytes: number): Promise<string> {
  const trimmed = dataUrl.trim();
  if (!trimmed.toLowerCase().startsWith("data:image/")) {
    throw new AppError("Se esperaba una imagen data:image/…", 400);
  }
  return saveDataUrlToDisk(trimmed, {
    scope,
    maxBytes,
    allowedMime: new Set([
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/gif",
      "image/svg+xml",
    ]),
  });
}

/** Comprobante de gasto: imagen o PDF. */
export async function saveGastoComprobanteDataUrl(dataUrl: string, maxBytes: number): Promise<string> {
  const trimmed = dataUrl.trim();
  const low = trimmed.toLowerCase();
  if (!low.startsWith("data:image/") && !low.startsWith("data:application/pdf")) {
    throw new AppError("Solo se aceptan imagen o PDF en base64", 400);
  }
  return saveDataUrlToDisk(trimmed, {
    scope: "gastos",
    maxBytes,
    allowedMime: new Set([
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/gif",
      "application/pdf",
    ]),
  });
}
