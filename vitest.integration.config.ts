import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration suite talks to a real PostgreSQL container via
    // Testcontainers. Node env + longer timeouts are mandatory.
    environment: "node",
    include: ["tests/integration/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", ".next"],
    globals: true,
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
