/**
 * Compat: reexporta el middleware de autenticación central (`server/middleware/auth.ts`).
 * Uso: `import { requireAdmin, requireAuth } from "./middlewares/auth.middleware.js"`.
 */
export {
  hasPermiso,
  hasAccion,
  requireAdmin,
  requireAuth,
  requirePermiso,
  requirePermisoAccion,
  requireAlguno,
} from "../middleware/auth.js";
export type { AccionPermiso } from "../middleware/auth.js";
