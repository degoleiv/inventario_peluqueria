import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";
import { verifyAccessToken } from "../services/auth.service.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) {
    next(new AppError("No autorizado", 401));
    return;
  }
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.rol !== "admin") {
    next(new AppError("Requiere rol administrador", 403));
    return;
  }
  next();
}
