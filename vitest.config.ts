import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "src/**/__tests__/**/*.{test,spec}.{ts,tsx}",
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.test.ts",
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: [
      "node_modules",
      "dist",
      ".next",
      "tests/integration/**",
      "tests/e2e/**",
      "tests/mcp-test/**",
      "tests/perf/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "src/lib/**/*.{ts,tsx}",
        "src/components/**/*.{ts,tsx}",
        "src/app/api/**/*.{ts,tsx}",
      ],
      exclude: [
        "src/**/*.d.ts",
        "src/**/__tests__/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/components/ui/**",
        "src/app/(console)/**",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
