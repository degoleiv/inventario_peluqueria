import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";
import { usuariosRepo } from "../repositories/usuarios.js";
import { verifyAccessToken } from "../services/auth.service.js";
import { rolesService } from "../services/roles.service.js";

export function hasPermiso(permisos: string[] | undefined, modulo: string): boolean {
  if (!permisos?.length) return false;
  if (permisos.includes("*")) return true;
  return permisos.includes(modulo);
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) {
    next(new AppError("No autorizado", 401));
    return;
  }
  try {
    const jwtUser = verifyAccessToken(token);
    const dbUser = usuariosRepo.findById(jwtUser.sub);
    if (!dbUser || !dbUser.activo) {
      next(new AppError("Usuario inválido o inactivo", 401));
      return;
    }
    const permisos = rolesService.permisosParaRol(dbUser.rol);
    req.user = {
      sub: jwtUser.sub,
      email: dbUser.email,
      rol: dbUser.rol,
      permisos,
    };
    next();
  } catch (e) {
    next(e);
  }
}

/** Acceso total (configuración, usuarios, roles, auditoría sensible). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!hasPermiso(req.user?.permisos, "*")) {
    next(new AppError("Requiere permisos de administrador", 403));
    return;
  }
  next();
}

export function requirePermiso(modulo: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (hasPermiso(req.user?.permisos, modulo)) {
      next();
      return;
    }
    next(new AppError(`Sin acceso al módulo: ${modulo}`, 403));
  };
}

export function requireAlguno(...modulos: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const p = req.user?.permisos;
    if (hasPermiso(p, "*")) {
      next();
      return;
    }
    if (modulos.some((m) => hasPermiso(p, m))) {
      next();
      return;
    }
    next(new AppError("Sin permiso para esta acción", 403));
  };
}
