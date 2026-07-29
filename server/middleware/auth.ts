import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";
import { usuariosRepo } from "../repositories/usuarios.js";
import { verifyAccessToken } from "../services/auth.service.js";
import { rolesService } from "../services/roles.service.js";

/** Acciones granulares definidas por módulo. */
export type AccionPermiso = "ver" | "crear" | "editar" | "eliminar";

/** Normaliza permisos legacy (alias de módulo). */
function normalizarModulo(modulo: string): string {
  if (modulo === "compras" || modulo === "pedidos_proveedores" || modulo === "proveedores") {
    return "pedidos";
  }
  return modulo;
}

/**
 * ¿El conjunto de permisos habilita `modulo` (ver, sin acción específica)?
 * Compat: si el permiso está como "modulo" simple sin `:accion`, se considera acceso total al módulo.
 */
export function hasPermiso(permisos: string[] | undefined, modulo: string): boolean {
  return hasAccion(permisos, modulo, "ver");
}

/**
 * ¿Puede ejecutar `accion` sobre `modulo`?
 * Reglas:
 *  - "*" → todo.
 *  - "modulo" (sin `:accion`) → todas las acciones del módulo (compat con roles viejos).
 *  - "modulo:accion" → solo esa acción.
 *  - Alias legacy (compras, proveedores, pedidos_proveedores) → mapean a "pedidos".
 */
export function hasAccion(
  permisos: string[] | undefined,
  modulo: string,
  accion: AccionPermiso
): boolean {
  if (!permisos?.length) return false;
  if (permisos.includes("*")) return true;
  const target = normalizarModulo(modulo);
  for (const p of permisos) {
    if (p === "*") return true;
    const norm = normalizarModulo(p);
    if (norm === target) return true; // compat: módulo simple otorga todas las acciones
    if (norm === `${target}:${accion}`) return true;
    // Permisos ya guardados como "modulo:accion" pero con alias legacy
    const [modPart, accPart] = norm.split(":");
    if (modPart && accPart && normalizarModulo(modPart) === target && accPart === accion) return true;
  }
  return false;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) {
    next(new AppError("No autorizado", 401));
    return;
  }
  void (async () => {
    try {
      const jwtUser = verifyAccessToken(token);
      const dbUser = await usuariosRepo.findById(jwtUser.sub);
      if (!dbUser || !dbUser.activo) {
        next(new AppError("Usuario inválido o inactivo", 401));
        return;
      }
      const permisos = await rolesService.permisosParaRol(dbUser.rol);
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
  })();
}

/** Acceso total (configuración, usuarios, roles, auditoría sensible). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!hasAccion(req.user?.permisos, "*", "ver")) {
    next(new AppError("Requiere permisos de administrador", 403));
    return;
  }
  next();
}

/** Requiere ver el módulo (compat con firma histórica). */
export function requirePermiso(modulo: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (hasAccion(req.user?.permisos, modulo, "ver")) {
      next();
      return;
    }
    next(new AppError(`Sin acceso al módulo: ${modulo}`, 403));
  };
}

/** Requiere una acción granular específica sobre un módulo. */
export function requirePermisoAccion(modulo: string, accion: AccionPermiso) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (hasAccion(req.user?.permisos, modulo, accion)) {
      next();
      return;
    }
    next(new AppError(`Sin permiso para ${accion} en ${modulo}`, 403));
  };
}

export function requireAlguno(...modulos: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const p = req.user?.permisos;
    if (hasAccion(p, "*", "ver")) {
      next();
      return;
    }
    if (modulos.some((m) => hasAccion(p, m, "ver"))) {
      next();
      return;
    }
    next(new AppError("Sin permiso para esta acción", 403));
  };
}
