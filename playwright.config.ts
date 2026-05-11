import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import os from "node:os";

const E2E_DB = path.join(os.tmpdir(), "inventario-peluqueria-e2e.sqlite");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "tests/results/playwright-results.json" }],
    ["html", { outputFolder: "tests/results/playwright-html", open: "never" }],
  ],
  use: {
    baseURL: "http://localhost:1420",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      INVENTARIO_DB_PATH: E2E_DB,
      JWT_SECRET: "e2e-secret",
      NODE_ENV: "test",
    },
  },
});
