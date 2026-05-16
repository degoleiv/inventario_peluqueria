import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { BCRYPT_ROUNDS, getJwtSecret, JWT_EXPIRY_SEC } from "../config.js";
import { AppError } from "../lib/AppError.js";
import { usuariosRepo } from "../repositories/usuarios.js";
import { rolesService } from "./roles.service.js";

export type JwtUser = { sub: number; email: string; rol: string };

export function signAccessToken(payload: JwtUser): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: JWT_EXPIRY_SEC,
    algorithm: "HS256",
  });
}

export async function login(email: string, password: string) {
  const u = await usuariosRepo.findByEmail(email.trim());
  if (!u || !u.activo) throw new AppError("Credenciales inválidas", 401);
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) throw new AppError("Credenciales inválidas", 401);
  const token = signAccessToken({ sub: u.id, email: u.email, rol: u.rol });
  const permisos = await rolesService.permisosParaRol(u.rol);
  return {
    accessToken: token,
    expiresIn: JWT_EXPIRY_SEC,
    user: {
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      rol: u.rol,
      permisos,
    },
  };
}

export async function bootstrapFirstAdmin(email: string, password: string, nombre?: string) {
  if ((await usuariosRepo.count()) > 0) {
    throw new AppError("Ya existe un usuario; no se puede inicializar de nuevo", 403);
  }
  if (!email.trim() || password.length < 6) {
    throw new AppError("Email válido y contraseña de al menos 6 caracteres", 400);
  }
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const u = await usuariosRepo.create({
    email: email.trim().toLowerCase(),
    password_hash: hash,
    nombre: nombre?.trim() || null,
    rol: "admin",
  });
  const token = signAccessToken({ sub: u.id, email: u.email, rol: u.rol });
  const permisos = await rolesService.permisosParaRol(u.rol);
  return {
    accessToken: token,
    expiresIn: JWT_EXPIRY_SEC,
    user: { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, permisos },
  };
}

export function verifyAccessToken(token: string): JwtUser {
  try {
    const p = jwt.verify(token, getJwtSecret()) as unknown as JwtUser & { sub: number };
    return { sub: p.sub, email: p.email, rol: p.rol };
  } catch {
    throw new AppError("Token inválido o expirado", 401);
  }
}

/** Nuevo JWT a partir del usuario ya autenticado (sesión deslizante). */
export async function refreshAccessTokenSession(jwtUser: JwtUser) {
  const u = await usuariosRepo.findById(jwtUser.sub);
  if (!u || !u.activo) throw new AppError("Usuario inválido o inactivo", 401);
  const token = signAccessToken({ sub: u.id, email: u.email, rol: u.rol });
  const permisos = await rolesService.permisosParaRol(u.rol);
  return {
    accessToken: token,
    expiresIn: JWT_EXPIRY_SEC,
    user: {
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      rol: u.rol,
      permisos,
    },
  };
}
