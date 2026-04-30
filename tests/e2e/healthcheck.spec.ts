import { test, expect } from "@playwright/test";

/**
 * BL-TEST-INFRA-IMPORT fix-round-2 smoke spec.
 *
 * Proves the Playwright pipeline + dev server boot + Next routing all
 * work end-to-end without depending on app state, seed data, or
 * external services. The three feature specs in this directory each
 * exercise a real user flow and break for app-evolution reasons (auto
 * default project on register, balance moved user-level, security log
 * markup change). Those are queued as follow-up batches; this spec
 * exists so CI's e2e-tests job has a deterministic ≥1 PASS without
 * relying on continue-on-error.
 *
 * Hardcoded port 3199 matches playwright.config.ts default and the
 * existing specs. CI's Playwright webServer brings dev up on the
 * same port.
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3199";

test.describe("smoke @healthcheck", () => {
  test("GET /login returns 200 and renders body", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/login`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).toBeVisible();
  });
});
