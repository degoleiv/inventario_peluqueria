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
  async list(req: Request, res: Response): Promise<void> {
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
      await proveedoresService.list({
        incluirInactivos,
        userMayViewInactive: puedeGestionar,
        search,
        estado,
      })
    );
  },

  async getById(req: Request, res: Response): Promise<void> {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(await proveedoresService.getById(id));
  },

  async create(req: Request, res: Response): Promise<void> {
    res.status(201).json(await proveedoresService.create(req.body as Record<string, unknown>));
  },

  async update(req: Request, res: Response): Promise<void> {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(await proveedoresService.update(id, req.body as Record<string, unknown>));
  },

  async patchEstado(req: Request, res: Response): Promise<void> {
    const id = parseId(req, res);
    if (id == null) return;
    res.json(await proveedoresService.patchEstado(id, req.body as Record<string, unknown>));
  },

  async remove(req: Request, res: Response): Promise<void> {
    const id = parseId(req, res);
    if (id == null) return;
    await proveedoresService.deletePermanently(id);
    res.status(204).send();
  },
};
