import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/AppError.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const ts = new Date().toISOString();
  const ctx = `${req.method} ${req.originalUrl}`;

  if (err instanceof AppError) {
    const codeTag = err.code ? ` (${err.code})` : "";
    console.warn(`[api][${ts}] AppError ${err.status}${codeTag} — ${ctx} — ${err.message}`);
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }

  console.error(`[api][${ts}] Error inesperado — ${ctx}`);
  if (err instanceof Error) {
    console.error(err.stack ?? err.message);
  } else {
    console.error(err);
  }

  const exposeDetails = process.env.NODE_ENV !== "production";
  const details =
    err instanceof Error
      ? err.message.slice(0, 600)
      : typeof err === "string"
        ? err.slice(0, 600)
        : undefined;
  res.status(500).json({
    error: "Error interno del servidor",
    code: "INTERNAL",
    ...(exposeDetails && details ? { details } : {}),
  });
}
