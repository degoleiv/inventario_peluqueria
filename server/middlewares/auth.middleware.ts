/**
 * Compat: reexporta el middleware de autenticación central (`server/middleware/auth.ts`).
 * Uso: `import { requireAdmin, requireAuth } from "./middlewares/auth.middleware.js"`.
 */
export { hasPermiso, requireAdmin, requireAuth, requirePermiso, requireAlguno } from "../middleware/auth.js";
