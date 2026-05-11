import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "ui",
    environment: "jsdom",
    include: ["tests/ui/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/ui/setup.ts"],
    globals: false,
    testTimeout: 15_000,
    reporters: ["default", ["json", { outputFile: "tests/results/vitest-ui-results.json" }]],
  },
});
