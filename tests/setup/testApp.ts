import "express-async-errors";
import express, { type Express } from "express";
import cors from "cors";
import { ensureDb } from "./db.js";
import { registerHttpRoutes } from "../../server/registerHttpRoutes.js";
import { errorHandler } from "../../server/middleware/errors.js";

let cached: Express | null = null;

export async function buildTestApp(opts: { fresh?: boolean } = {}): Promise<Express> {
  await ensureDb();
  if (cached && !opts.fresh) return cached;
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "1mb" }));
  registerHttpRoutes(app);
  app.use(errorHandler);
  if (!opts.fresh) cached = app;
  return app;
}
