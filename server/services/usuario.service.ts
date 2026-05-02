import bcrypt from "bcrypt";
import { BCRYPT_ROUNDS } from "../config.js";
import { AppError } from "../lib/AppError.js";
import { recordSyncEvent } from "../db.js";
import { usuariosRepo } from "../repositories/usuarios.js";

export const usuarioService = {
  list() {
    return usuariosRepo.list();
  },

  async create(params: {
    email: string;
    password: string;
    nombre?: string;
    rol?: string;
  }) {
    const email = params.email.trim().toLowerCase();
    if (!email || params.password.length < 6) {
      throw new AppError("Email y contraseña (≥6) requeridos");
    }
    if (usuariosRepo.findByEmail(email)) {
      throw new AppError("Email ya registrado");
    }
    const hash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);
    const rol = params.rol === "admin" ? "admin" : "empleado";
    const row = usuariosRepo.create({
      email,
      password_hash: hash,
      nombre: params.nombre?.trim() || null,
      rol,
    });
    recordSyncEvent("usuario", "creado", { id: row.id, email: row.email });
    const { password_hash: _p, ...safe } = row;
    return safe;
  },

  delete(id: number) {
    if (usuariosRepo.count() <= 1) {
      throw new AppError("No se puede eliminar el último usuario");
    }
    const u = usuariosRepo.findById(id);
    if (!u) throw new AppError("no encontrado", 404);
    usuariosRepo.delete(id);
    recordSyncEvent("usuario", "eliminado", { id: u.id, email: u.email });
  },
};
