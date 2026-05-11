import { defineConfig } from "@playwright/test";
import path from "node:path";
import os from "node:os";

const POS_DB = path.join(os.tmpdir(), "inventario-e2e-pos.sqlite");
const POS_PORT = 3012;

export default defineConfig({
  testDir: "./tests/e2e-pos",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "tests/results/playwright-pos-results.json" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${POS_PORT}`,
  },
  projects: [{ name: "api" }],
  webServer: {
    command: `npx tsx server/index.ts`,
    url: `http://127.0.0.1:${POS_PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      INVENTARIO_DB_PATH: POS_DB,
      INVENTARIO_API_PORT: String(POS_PORT),
      JWT_SECRET: "e2e-pos-secret",
      NODE_ENV: "test",
    },
  },
});
