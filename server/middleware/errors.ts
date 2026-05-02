import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error("[api]", err);
  res.status(500).json({ error: "Error interno" });
}
