import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup/global.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    reporters: ["default", ["json", { outputFile: "tests/results/vitest-results.json" }]],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["server/services/**/*.ts", "server/middleware/**/*.ts", "server/lib/**/*.ts"],
      reportsDirectory: "tests/results/coverage",
      thresholds: {
        lines: 45,
        statements: 45,
        functions: 40,
        branches: 70,
      },
    },
  },
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".mts", ".cjs", ".json"],
  },
});
