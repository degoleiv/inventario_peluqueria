import "express-async-errors";
import express from "express";
import cors from "cors";
import { initDatabase } from "./db.js";
import { registerHttpRoutes } from "./registerHttpRoutes.js";
import { errorHandler } from "./middleware/errors.js";

const PORT = Number(process.env.INVENTARIO_API_PORT || 3010);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "5mb" }));

initDatabase()
  .then(() => {
    registerHttpRoutes(app);
    app.use(errorHandler);

    const server = app.listen(PORT, () => {
      console.log(`[inventario-api] http://127.0.0.1:${PORT}`);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `[inventario-api] Puerto ${PORT} ocupado (otra instancia del API). Cierra ese proceso o usa INVENTARIO_API_PORT=3011`
        );
      } else {
        console.error("[inventario-api]", err);
      }
      process.exit(1);
    });
  })
  .catch((err: unknown) => {
    console.error("[inventario-api] Error al inicializar la base de datos:", err);
    process.exit(1);
  });
