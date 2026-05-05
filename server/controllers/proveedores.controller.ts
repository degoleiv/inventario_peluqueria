import type { Request, Response } from "express";
import { hasPermiso } from "../middleware/auth.js";
import { AppError } from "../lib/AppError.js";
import { proveedoresService } from "../services/proveedores.service.js";

function parseId(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "id inválido" });
    return null;
  }
  return Math.floor(id);
}

export const proveedoresController = {
  list(req: Request, res: Response): void {
    const incluirInactivos = req.query.incluir_inactivos === "1";
    const puedeGestionar = hasPermiso(req.user?.permisos, "pedidos");
    if (incluirInactivos && !puedeGestionar) {
      throw new AppError("Sin permiso para incluir proveedores inactivos", 403);
    }
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const estado = typeof req.query.estado === "string" ? req.query.estado : undefined;
    if (estado?.trim().toLowerCase() === "inactivo" && !puedeGestionar) {
      throw new AppError("Sin permiso para filtrar proveedores inactivos", 403);
    }
    res.json(
      proveedoresService.list({
        incluirInactivos,
        userMayViewInactive: puedeGestionar,
        search,
        estado,
      })
    );
  },

  getById(req: Request, res: Response): void {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(proveedoresService.getById(id));
  },

  create(req: Request, res: Response): void {
    res.status(201).json(proveedoresService.create(req.body as Record<string, unknown>));
  },

  update(req: Request, res: Response): void {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(proveedoresService.update(id, req.body as Record<string, unknown>));
  },

  patchEstado(req: Request, res: Response): void {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(proveedoresService.patchEstado(id, req.body as Record<string, unknown>));
  },

  remove(req: Request, res: Response): void {
    const id = parseId(req, res);
    if (id == null) return;
    proveedoresService.deletePermanently(id);
    res.status(204).send();
  },
};
