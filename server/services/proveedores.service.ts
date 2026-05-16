import { AppError } from "../lib/AppError.js";
import {
  isOurMediaUrl,
  saveImageDataUrl,
  unlinkMediaPublicPath,
} from "../lib/mediaStore.js";
import { proveedorRepository, type ProveedorRow } from "../repositories/proveedor.repository.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProveedorDto = {
  id: number;
  nombre: string;
  nit: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  icono_url: string | null;
  vendedor_nombre: string | null;
  vendedor_celular: string | null;
  estado: "activo" | "inactivo";
  fecha_creacion: string;
  fecha_actualizacion: string;
};

function toDto(r: ProveedorRow): ProveedorDto {
  const est = r.estado === "inactivo" ? "inactivo" : "activo";
  return {
    id: r.id,
    nombre: r.nombre,
    nit: r.nit,
    telefono: r.telefono,
    email: r.email,
    direccion: r.direccion,
    icono_url: r.icono_url ?? null,
    vendedor_nombre: r.vendedor_nombre ?? null,
    vendedor_celular: r.vendedor_celular ?? null,
    estado: est,
    fecha_creacion: r.fecha_creacion,
    fecha_actualizacion: r.fecha_actualizacion,
  };
}

function parseNombre(body: Record<string, unknown>): string {
  const v = typeof body.nombre === "string" ? body.nombre.trim() : "";
  if (!v) throw new AppError("El nombre es obligatorio");
  return v;
}

function parseNit(body: Record<string, unknown>): string {
  const v = typeof body.nit === "string" ? body.nit.trim() : "";
  if (!v) throw new AppError("El NIT es obligatorio");
  return v;
}

function parseEmail(body: Record<string, unknown>): string | null {
  if (body.email == null || body.email === "") return null;
  if (typeof body.email !== "string") throw new AppError("Email inválido");
  const t = body.email.trim();
  if (!t) return null;
  if (!EMAIL_RE.test(t)) throw new AppError("El formato del email no es válido");
  return t;
}

function parseTelefono(body: Record<string, unknown>): string | null {
  if (body.telefono == null || body.telefono === "") return null;
  if (typeof body.telefono !== "string") return null;
  const t = body.telefono.trim();
  return t || null;
}

function parseDireccion(body: Record<string, unknown>): string | null {
  if (body.direccion == null || body.direccion === "") return null;
  if (typeof body.direccion !== "string") return null;
  const t = body.direccion.trim();
  return t || null;
}

function parseVendedorNombre(body: Record<string, unknown>): string | null {
  if (body.vendedor_nombre == null || body.vendedor_nombre === "") return null;
  if (typeof body.vendedor_nombre !== "string") return null;
  const t = body.vendedor_nombre.trim();
  if (!t) return null;
  if (t.length > 200) throw new AppError("El nombre del vendedor es demasiado largo");
  return t;
}

function parseVendedorCelular(body: Record<string, unknown>): string | null {
  if (body.vendedor_celular == null || body.vendedor_celular === "") return null;
  if (typeof body.vendedor_celular !== "string") return null;
  const t = body.vendedor_celular.trim();
  if (!t) return null;
  if (t.length > 60) throw new AppError("El celular del vendedor es demasiado largo");
  return t;
}

async function resolveIconoUrlForDb(value: unknown, previous: string | null): Promise<string | null> {
  if (value == null || value === "") {
    await unlinkMediaPublicPath(isOurMediaUrl(previous) ? previous : undefined);
    return null;
  }
  if (typeof value !== "string") throw new AppError("URL de icono inválida");
  const t = value.trim();
  if (!t) {
    await unlinkMediaPublicPath(isOurMediaUrl(previous) ? previous : undefined);
    return null;
  }
  const low = t.toLowerCase();
  if (low.startsWith("/api/media/")) {
    if (t.length > 500) throw new AppError("URL de icono inválida");
    if (previous && previous !== t && isOurMediaUrl(previous)) await unlinkMediaPublicPath(previous);
    return t;
  }
  if (low.startsWith("http://") || low.startsWith("https://")) {
    if (t.length > 4000) throw new AppError("URL de icono demasiado larga");
    if (previous && previous !== t && isOurMediaUrl(previous)) await unlinkMediaPublicPath(previous);
    return t;
  }
  if (low.startsWith("data:image/")) {
    const saved = await saveImageDataUrl(t, "proveedores", 15 * 1024 * 1024);
    if (previous && previous !== saved && isOurMediaUrl(previous)) await unlinkMediaPublicPath(previous);
    return saved;
  }
  throw new AppError("El icono debe ser URL (http/https), data:image/… o ruta /api/media/…");
}

function parseEstado(body: Record<string, unknown>, fallback: "activo" | "inactivo"): "activo" | "inactivo" {
  const v = typeof body.estado === "string" ? body.estado.trim().toLowerCase() : "";
  if (v === "inactivo" || v === "activo") return v;
  if (!v) return fallback;
  throw new AppError('El estado debe ser "activo" o "inactivo"');
}

function sqliteErrCode(e: unknown): string {
  if (e != null && typeof e === "object" && "code" in e) {
    return String((e as { code: unknown }).code);
  }
  return "";
}

function isAnyConstraint(e: unknown): boolean {
  const c = sqliteErrCode(e);
  return c.includes("CONSTRAINT") || c.startsWith("SQLITE_CONSTRAINT");
}

function parseEstadoFiltroQuery(v: unknown): "todos" | "activo" | "inactivo" {
  if (typeof v !== "string") return "todos";
  const t = v.trim().toLowerCase();
  if (t === "activo" || t === "inactivo") return t;
  return "todos";
}

export const proveedoresService = {
  async list(opts: {
    incluirInactivos: boolean;
    userMayViewInactive: boolean;
    search?: string;
    estado?: string;
  }): Promise<ProveedorDto[]> {
    const rawSearch = typeof opts.search === "string" ? opts.search.trim() : "";
    const inner = rawSearch.replace(/%/g, "").replace(/_/g, "");
    const searchPattern = inner ? `%${inner}%` : null;
    const estadoF = parseEstadoFiltroQuery(opts.estado);
    const incluirTodosLosEstados =
      opts.userMayViewInactive && (opts.incluirInactivos || estadoF === "inactivo");

    const rows = await proveedorRepository.listFiltered({
      forceSoloActivos: !opts.userMayViewInactive,
      incluirTodosLosEstados,
      estado: estadoF,
      searchPattern,
    });
    return rows.map(toDto);
  },

  async getById(id: number): Promise<ProveedorDto> {
    const r = await proveedorRepository.findById(id);
    if (!r) throw new AppError("Proveedor no encontrado", 404);
    return toDto(r);
  },

  async create(body: Record<string, unknown>): Promise<ProveedorDto> {
    const nombre = parseNombre(body);
    const nit = parseNit(body);
    const email = parseEmail(body);
    const telefono = parseTelefono(body);
    const direccion = parseDireccion(body);
    const icono_url = await resolveIconoUrlForDb(body.icono_url ?? null, null);
    const vendedor_nombre = parseVendedorNombre(body);
    const vendedor_celular = parseVendedorCelular(body);
    const estado = parseEstado(body, "activo");
    const now = new Date().toISOString();

    const info = await proveedorRepository.insert({
      nombre,
      nit,
      telefono,
      email,
      direccion,
      icono_url,
      vendedor_nombre,
      vendedor_celular,
      estado,
      fecha_creacion: now,
      fecha_actualizacion: now,
      created_at: now,
    });
    const id = Number(info.lastInsertRowid);
    const row = await proveedorRepository.findById(id);
    if (!row) throw new AppError("Error al crear proveedor", 500);
    return toDto(row);
  },

  async update(id: number, body: Record<string, unknown>): Promise<ProveedorDto> {
    const cur = await proveedorRepository.findById(id);
    if (!cur) throw new AppError("Proveedor no encontrado", 404);

    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : cur.nombre;
    if (!nombre) throw new AppError("El nombre es obligatorio");
    const nit = typeof body.nit === "string" ? body.nit.trim() : cur.nit;
    if (!nit) throw new AppError("El NIT es obligatorio");
    const email = body.email !== undefined ? parseEmail(body) : cur.email;
    const telefono = body.telefono !== undefined ? parseTelefono(body) : cur.telefono;
    const direccion = body.direccion !== undefined ? parseDireccion(body) : cur.direccion;
    const icono_url =
      body.icono_url !== undefined
        ? await resolveIconoUrlForDb(body.icono_url, cur.icono_url ?? null)
        : (cur.icono_url ?? null);
    const vendedor_nombre =
      body.vendedor_nombre !== undefined ? parseVendedorNombre(body) : (cur.vendedor_nombre ?? null);
    const vendedor_celular =
      body.vendedor_celular !== undefined
        ? parseVendedorCelular(body)
        : (cur.vendedor_celular ?? null);
    const estadoCur: "activo" | "inactivo" = cur.estado === "inactivo" ? "inactivo" : "activo";
    const estado = body.estado !== undefined ? parseEstado(body, estadoCur) : estadoCur;
    const now = new Date().toISOString();

    await proveedorRepository.update(id, {
      nombre,
      nit,
      telefono,
      email,
      direccion,
      icono_url,
      vendedor_nombre,
      vendedor_celular,
      estado,
      fecha_actualizacion: now,
    });

    const row = await proveedorRepository.findById(id);
    if (!row) throw new AppError("Proveedor no encontrado", 404);
    return toDto(row);
  },

  async patchEstado(id: number, body: Record<string, unknown>): Promise<ProveedorDto> {
    if (typeof body.estado !== "string" || !body.estado.trim()) {
      throw new AppError('El campo "estado" es obligatorio', 400);
    }
    const estado = parseEstado(body, "activo");
    const cur = await proveedorRepository.findById(id);
    if (!cur) throw new AppError("Proveedor no encontrado", 404);
    const now = new Date().toISOString();
    await proveedorRepository.setEstado(id, estado, now);
    const row = await proveedorRepository.findById(id);
    if (!row) throw new AppError("Proveedor no encontrado", 404);
    return toDto(row);
  },

  /**
   * Elimina el registro si no hay pedidos ni productos asociados.
   */
  async deletePermanently(id: number): Promise<void> {
    const cur = await proveedorRepository.findById(id);
    if (!cur) throw new AppError("Proveedor no encontrado", 404);
    const nProductos = await proveedorRepository.countProductosByProveedorId(id);
    if (nProductos > 0) {
      throw new AppError(
        `No se puede eliminar: el proveedor tiene ${nProductos} producto(s) asociado(s). Reasigná o quitá el proveedor en Inventario, o desactivá el proveedor.`,
        409
      );
    }
    const nPedidos = await proveedorRepository.countPedidosByProveedorId(id);
    if (nPedidos > 0) {
      throw new AppError(
        `No se puede eliminar: el proveedor tiene ${nPedidos} pedido(s) asociado(s). Podés desactivarlo desde el interruptor de estado.`,
        409
      );
    }
    try {
      await proveedorRepository.deleteById(id);
    } catch (e) {
      if (isAnyConstraint(e)) {
        throw new AppError(
          "No se puede eliminar: el proveedor está referenciado en productos, pedidos u otros registros.",
          409
        );
      }
      throw e;
    }
  },
};
