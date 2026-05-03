import Database from "better-sqlite3";
import { AppError } from "../lib/AppError.js";
import { proveedorRepository, type ProveedorRow } from "../repositories/proveedor.repository.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProveedorDto = {
  id: number;
  nombre: string;
  nit: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
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

function parseEstado(body: Record<string, unknown>, fallback: "activo" | "inactivo"): "activo" | "inactivo" {
  const v = typeof body.estado === "string" ? body.estado.trim().toLowerCase() : "";
  if (v === "inactivo" || v === "activo") return v;
  if (!v) return fallback;
  throw new AppError('El estado debe ser "activo" o "inactivo"');
}

function isUniqueConstraint(e: unknown): boolean {
  return e instanceof Database.SqliteError && e.code === "SQLITE_CONSTRAINT_UNIQUE";
}

function parseEstadoFiltroQuery(v: unknown): "todos" | "activo" | "inactivo" {
  if (typeof v !== "string") return "todos";
  const t = v.trim().toLowerCase();
  if (t === "activo" || t === "inactivo") return t;
  return "todos";
}

export const proveedoresService = {
  list(opts: {
    incluirInactivos: boolean;
    userMayViewInactive: boolean;
    search?: string;
    estado?: string;
  }): ProveedorDto[] {
    const rawSearch = typeof opts.search === "string" ? opts.search.trim() : "";
    const inner = rawSearch.replace(/%/g, "").replace(/_/g, "");
    const searchPattern = inner ? `%${inner}%` : null;
    const estadoF = parseEstadoFiltroQuery(opts.estado);
    const incluirTodosLosEstados =
      opts.userMayViewInactive && (opts.incluirInactivos || estadoF === "inactivo");

    const rows = proveedorRepository.listFiltered({
      forceSoloActivos: !opts.userMayViewInactive,
      incluirTodosLosEstados,
      estado: estadoF,
      searchPattern,
    });
    return rows.map(toDto);
  },

  getById(id: number): ProveedorDto {
    const r = proveedorRepository.findById(id);
    if (!r) throw new AppError("Proveedor no encontrado", 404);
    return toDto(r);
  },

  create(body: Record<string, unknown>): ProveedorDto {
    const nombre = parseNombre(body);
    const nit = parseNit(body);
    const email = parseEmail(body);
    const telefono = parseTelefono(body);
    const direccion = parseDireccion(body);
    const estado = parseEstado(body, "activo");
    const now = new Date().toISOString();

    if (proveedorRepository.findByNitNormalized(nit)) {
      throw new AppError("Ya existe un proveedor con ese NIT", 409);
    }

    try {
      const info = proveedorRepository.insert({
        nombre,
        nit,
        telefono,
        email,
        direccion,
        estado,
        fecha_creacion: now,
        fecha_actualizacion: now,
        created_at: now,
      });
      const id = Number(info.lastInsertRowid);
      const row = proveedorRepository.findById(id);
      if (!row) throw new AppError("Error al crear proveedor", 500);
      return toDto(row);
    } catch (e) {
      if (isUniqueConstraint(e)) {
        throw new AppError("Ya existe un proveedor con ese NIT", 409);
      }
      throw e;
    }
  },

  update(id: number, body: Record<string, unknown>): ProveedorDto {
    const cur = proveedorRepository.findById(id);
    if (!cur) throw new AppError("Proveedor no encontrado", 404);

    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : cur.nombre;
    if (!nombre) throw new AppError("El nombre es obligatorio");
    const nit = typeof body.nit === "string" ? body.nit.trim() : cur.nit;
    if (!nit) throw new AppError("El NIT es obligatorio");
    const email = body.email !== undefined ? parseEmail(body) : cur.email;
    const telefono = body.telefono !== undefined ? parseTelefono(body) : cur.telefono;
    const direccion = body.direccion !== undefined ? parseDireccion(body) : cur.direccion;
    const estadoCur: "activo" | "inactivo" = cur.estado === "inactivo" ? "inactivo" : "activo";
    const estado =
      body.estado !== undefined ? parseEstado(body, estadoCur) : estadoCur;
    const now = new Date().toISOString();

    const dup = proveedorRepository.findByNitNormalized(nit, id);
    if (dup) throw new AppError("Ya existe otro proveedor con ese NIT", 409);

    try {
      proveedorRepository.update(id, {
        nombre,
        nit,
        telefono,
        email,
        direccion,
        estado,
        fecha_actualizacion: now,
      });
    } catch (e) {
      if (isUniqueConstraint(e)) {
        throw new AppError("Ya existe otro proveedor con ese NIT", 409);
      }
      throw e;
    }

    const row = proveedorRepository.findById(id);
    if (!row) throw new AppError("Proveedor no encontrado", 404);
    return toDto(row);
  },

  patchEstado(id: number, body: Record<string, unknown>): ProveedorDto {
    if (typeof body.estado !== "string" || !body.estado.trim()) {
      throw new AppError('El campo "estado" es obligatorio', 400);
    }
    const estado = parseEstado(body, "activo");
    const cur = proveedorRepository.findById(id);
    if (!cur) throw new AppError("Proveedor no encontrado", 404);
    const now = new Date().toISOString();
    proveedorRepository.setEstado(id, estado, now);
    const row = proveedorRepository.findById(id);
    if (!row) throw new AppError("Proveedor no encontrado", 404);
    return toDto(row);
  },

  /**
   * Elimina el registro si no hay pedidos asociados (FK RESTRICT).
   * Si hay pedidos, responde error claro (409).
   */
  deletePermanently(id: number): void {
    const cur = proveedorRepository.findById(id);
    if (!cur) throw new AppError("Proveedor no encontrado", 404);
    const n = proveedorRepository.countPedidosByProveedorId(id);
    if (n > 0) {
      throw new AppError(
        `No se puede eliminar: el proveedor tiene ${n} pedido(s) asociado(s). Podés desactivarlo desde el interruptor de estado.`,
        409
      );
    }
    try {
      proveedorRepository.deleteById(id);
    } catch (e) {
      const code = e instanceof Database.SqliteError ? String(e.code) : "";
      if (e instanceof Database.SqliteError && code.includes("CONSTRAINT")) {
        throw new AppError(
          "No se puede eliminar: el proveedor está referenciado en pedidos u otros registros.",
          409
        );
      }
      throw e;
    }
  },
};
