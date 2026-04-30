import { defineConfig, devices } from "@playwright/test";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Playwright config for aigcgateway E2E suite.
 *
 * Port/baseURL resolution:
 *   1. E2E_BASE_URL — full URL override (e.g. http://127.0.0.1:3199)
 *   2. E2E_PORT     — port-only override; host stays `localhost`
 *   3. PORT         — fallback, matches Next dev server convention
 *   4. 3199         — repo default; existing specs hardcode 3199 in their
 *                    own BASE_URL fallback, and Codex's codex-env.sh
 *                    pins PORT=3199 too. Keeping the same default here
 *                    means CI's e2e job doesn't need a separate env var
 *                    to make webServer + spec URLs agree.
 */

// BL-TEST-INFRA-IMPORT fix-round-2: make `npm run test:e2e` self-contained
// in fresh shells. Spec files import requireEnv at module top-level (e.g.
// `const PASSWORD = requireEnv("E2E_TEST_PASSWORD")`), which exits 1 when
// the env is unset. Source scripts/test/codex-env.sh once here so a bare
// `npm run test:e2e` works without manually `source`-ing the script first.
// Existing env (CI, caller) wins — we only fill in the gaps.
const envScript = resolve(process.cwd(), "scripts/test/codex-env.sh");
if (existsSync(envScript)) {
  try {
    const buf = execSync(`bash -c 'set -a; source "${envScript}"; env -0'`, {
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const entry of buf.toString("utf8").split("\u0000")) {
      if (!entry) continue;
      const eq = entry.indexOf("=");
      if (eq <= 0) continue;
      const key = entry.slice(0, eq);
      if (process.env[key] === undefined) {
        process.env[key] = entry.slice(eq + 1);
      }
    }
  } catch {
    // bash unavailable or codex-env.sh bad — fall through; specs that need
    // these vars will exit with the standard `Missing env: <NAME>` message.
  }
}

const E2E_PORT = process.env.E2E_PORT ?? process.env.PORT ?? "3199";
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
