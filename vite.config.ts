import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;
const DEFAULT_API_PORT = "3011";

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.INVENTARIO_API_PORT || env.VITE_API_PORT || DEFAULT_API_PORT;
  const apiTarget = `http://127.0.0.1:${apiPort}`;

  return {
    plugins: [react()],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? { protocol: "ws", host, port: 1420 }
        : undefined,
      watch: { ignored: ["**/src-tauri/**"] },
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
    preview: {
      proxy: {
        "/api": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
