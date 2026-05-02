import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { BCRYPT_ROUNDS, getJwtSecret, JWT_EXPIRY_SEC } from "../config.js";
import { AppError } from "../lib/AppError.js";
import { usuariosRepo } from "../repositories/usuarios.js";

export type JwtUser = { sub: number; email: string; rol: string };

export async function login(email: string, password: string) {
  const u = usuariosRepo.findByEmail(email.trim());
  if (!u || !u.activo) throw new AppError("Credenciales inválidas", 401);
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) throw new AppError("Credenciales inválidas", 401);
  const token = jwt.sign(
    { sub: u.id, email: u.email, rol: u.rol } satisfies JwtUser,
    getJwtSecret(),
    { expiresIn: JWT_EXPIRY_SEC }
  );
  return {
    accessToken: token,
    expiresIn: JWT_EXPIRY_SEC,
    user: {
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      rol: u.rol,
    },
  };
}

export async function bootstrapFirstAdmin(email: string, password: string, nombre?: string) {
  if (usuariosRepo.count() > 0) {
    throw new AppError("Ya existe un usuario; no se puede inicializar de nuevo", 403);
  }
  if (!email.trim() || password.length < 6) {
    throw new AppError("Email válido y contraseña de al menos 6 caracteres", 400);
  }
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const u = usuariosRepo.create({
    email: email.trim().toLowerCase(),
    password_hash: hash,
    nombre: nombre?.trim() || null,
    rol: "admin",
  });
  const token = jwt.sign(
    { sub: u.id, email: u.email, rol: u.rol } satisfies JwtUser,
    getJwtSecret(),
    { expiresIn: JWT_EXPIRY_SEC }
  );
  return {
    accessToken: token,
    expiresIn: JWT_EXPIRY_SEC,
    user: { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol },
  };
}

export function verifyAccessToken(token: string): JwtUser {
  try {
    const p = jwt.verify(token, getJwtSecret()) as JwtUser & { sub: number };
    return { sub: p.sub, email: p.email, rol: p.rol };
  } catch {
    throw new AppError("Token inválido o expirado", 401);
  }
}
