import bcrypt from "bcrypt";
import { BCRYPT_ROUNDS } from "../config.js";
import { AppError } from "../lib/AppError.js";
import { db, recordSyncEvent } from "../db.js";
import { usuariosRepo } from "../repositories/usuarios.js";
import { rolesService } from "./roles.service.js";

export const usuarioService = {
  async list() {
    return await usuariosRepo.list();
  },

  async create(params: {
    email: string;
    password: string;
    nombre?: string;
    rol?: string;
    telefono?: string | null;
    color_agenda?: string | null;
    foto_url?: string | null;
    tipo_comision?: string;
    valor_comision?: number;
  }) {
    const email = params.email.trim().toLowerCase();
    if (!email || params.password.length < 6) {
      throw new AppError("Email y contraseña (≥6) requeridos");
    }
    if (await usuariosRepo.findByEmail(email)) {
      throw new AppError("Email ya registrado");
    }
    const rol = (params.rol ?? "empleado").trim().toLowerCase();
    if (!(await rolesService.exists(rol))) {
      throw new AppError("Rol inválido o inexistente");
    }
    const hash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);
    let tipoCom = (params.tipo_comision ?? "porcentaje").trim().toLowerCase();
    if (tipoCom !== "porcentaje" && tipoCom !== "fijo") tipoCom = "porcentaje";
    const valorCom =
      params.valor_comision != null && Number.isFinite(Number(params.valor_comision))
        ? Number(params.valor_comision)
        : 0;

    const row = await usuariosRepo.create({
      email,
      password_hash: hash,
      nombre: params.nombre?.trim() || null,
      rol,
      telefono: params.telefono?.trim() || null,
      color_agenda: params.color_agenda?.trim() || null,
      foto_url: params.foto_url?.trim() || null,
      tipo_comision: tipoCom,
      valor_comision: valorCom,
    });
    await recordSyncEvent("usuario", "creado", { id: row.id, email: row.email });
    const { password_hash: _p, ...safe } = row;
    return safe;
  },

  async update(
    id: number,
    params: {
      rol?: string;
      password?: string;
      nombre?: string | null;
      telefono?: string | null;
      color_agenda?: string | null;
      foto_url?: string | null;
      activo?: boolean;
      tipo_comision?: string;
      valor_comision?: number;
    }
  ) {
    const u = await usuariosRepo.findById(id);
    if (!u) throw new AppError("Usuario no encontrado", 404);

    const nextRol =
      params.rol != null ? params.rol.trim().toLowerCase() : undefined;
    if (nextRol != null) {
      if (!(await rolesService.exists(nextRol))) throw new AppError("Rol inválido");
      if (u.rol === "admin" && nextRol !== "admin") {
        const admins = (await db
          .prepare(`SELECT COUNT(*) AS c FROM usuarios WHERE rol = 'admin'`)
          .get()) as { c: number };
        if (admins.c <= 1) {
          throw new AppError("Debe existir al menos un usuario administrador");
        }
      }
      await usuariosRepo.updateRol(id, nextRol);
    }

    if (params.nombre !== undefined) {
      await usuariosRepo.updateNombre(id, params.nombre?.trim() || null);
    }

    if (params.password != null && params.password.length > 0) {
      if (params.password.length < 6) throw new AppError("La contraseña debe tener al menos 6 caracteres");
      const hash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);
      await usuariosRepo.updatePasswordHash(id, hash);
    }

    if (params.telefono !== undefined) {
      await usuariosRepo.updateTelefono(id, params.telefono?.trim() || null);
    }
    if (params.color_agenda !== undefined) {
      await usuariosRepo.updateColorAgenda(id, params.color_agenda?.trim() || null);
    }
    if (params.foto_url !== undefined) {
      await usuariosRepo.updateFotoUrl(id, params.foto_url?.trim() || null);
    }
    if (params.activo !== undefined) {
      if (!params.activo && u.rol === "admin") {
        const admins = (await db
          .prepare(`SELECT COUNT(*) AS c FROM usuarios WHERE rol = 'admin' AND activo = 1`)
          .get()) as { c: number };
        if (admins.c <= 1) {
          throw new AppError("No se puede desactivar el último administrador activo");
        }
      }
      await usuariosRepo.setActivo(id, params.activo);
    }

    if (params.tipo_comision !== undefined || params.valor_comision !== undefined) {
      let tipo = params.tipo_comision != null ? params.tipo_comision.trim().toLowerCase() : u.tipo_comision;
      if (tipo !== "porcentaje" && tipo !== "fijo") tipo = "porcentaje";
      const valor =
        params.valor_comision !== undefined && Number.isFinite(Number(params.valor_comision))
          ? Number(params.valor_comision)
          : Number((u as { valor_comision?: number }).valor_comision ?? 0);
      await usuariosRepo.updateComision(id, tipo, valor);
    }

    await recordSyncEvent("usuario", "actualizado", { id });
    const row = (await usuariosRepo.findById(id))!;
    const { password_hash: _p, ...safe } = row;
    return safe;
  },

  async delete(id: number) {
    if ((await usuariosRepo.count()) <= 1) {
      throw new AppError("No se puede eliminar el último usuario");
    }
    const u = await usuariosRepo.findById(id);
    if (!u) throw new AppError("no encontrado", 404);
    if (u.rol === "admin") {
      const admins = (await db
        .prepare(`SELECT COUNT(*) AS c FROM usuarios WHERE rol = 'admin'`)
        .get()) as { c: number };
      if (admins.c <= 1) {
        throw new AppError("No se puede eliminar el último administrador");
      }
    }
    await usuariosRepo.delete(id);
    await recordSyncEvent("usuario", "eliminado", { id: u.id, email: u.email });
  },
};
