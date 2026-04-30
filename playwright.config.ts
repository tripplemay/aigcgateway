import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for aigcgateway E2E suite.
 *
 * Port/baseURL resolution:
 *   1. E2E_BASE_URL — full URL override (e.g. http://127.0.0.1:3199)
 *   2. E2E_PORT     — port-only override; host stays `localhost`
 *   3. PORT         — fallback, matches Next dev server convention
 *   4. 3000         — historical default
 */
const E2E_PORT = process.env.E2E_PORT ?? process.env.PORT ?? "3000";
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E_BASE_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
