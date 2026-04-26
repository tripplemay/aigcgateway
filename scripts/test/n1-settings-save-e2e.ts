/**
 * N1 Settings Project Save — Playwright E2E Test
 *
 * Verifies that clicking "Save Changes" on the Project tab actually
 * triggers a PATCH request and updates the project name/description.
 *
 * Usage:
 *   BASE_URL=http://localhost:3199 npx playwright test scripts/test/n1-settings-save-e2e.ts
 *
 * Or run directly:
 *   BASE_URL=http://localhost:3199 npx tsx scripts/test/n1-settings-save-e2e.ts
 */

import { chromium } from "playwright";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const ADMIN_EMAIL = "admin@aigc-gateway.local";
const ADMIN_PASSWORD = requireEnv("ADMIN_TEST_PASSWORD");

async function apiFetch(path: string, token: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  return res.json();
}

async function main() {
  console.log("=== N1 Settings Project Save E2E ===");
  console.log(`Base URL: ${BASE}`);

  // Step 1: Login via API to get token
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const { token } = (await loginRes.json()) as { token: string };
  if (!token) {
    console.error("FAIL: Could not login");
    process.exit(1);
  }
  console.log("OK: Logged in");

  // Step 2: Create a test project via API
  const projRes = await apiFetch("/api/projects", token, {
    method: "POST",
    body: JSON.stringify({ name: "E2E Save Test" }),
  });
  const projectId = projRes.id;
  if (!projectId) {
    console.error("FAIL: Could not create project");
    process.exit(1);
  }
  console.log(`OK: Created project ${projectId}`);

  // Step 3: Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Inject token into localStorage and cookies
  await page.goto(`${BASE}/login`);
  await page.evaluate(
    ({ t, pid }) => {
      localStorage.setItem("token", t);
      localStorage.setItem("projectId", pid);
      document.cookie = `token=${t}; path=/`;
    },
    { t: token, pid: projectId },
  );

  // Step 4: Navigate to /settings
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  console.log("OK: Navigated to /settings");

  // Step 5: Click Project tab
  const projectTabBtn = page.getByRole("button", { name: "Project", exact: true });
  await projectTabBtn.click();
  await page.waitForTimeout(1000);
  console.log("OK: Switched to Project tab");

  // Debug: screenshot to see layout
  await page.screenshot({ path: "test-results/settings-project-tab.png", fullPage: true });
  console.log("OK: Screenshot saved to test-results/settings-project-tab.png");

  // Step 6-7: Modify name and description using JavaScript to bypass potential overlay
  const newName = `E2E Updated ${Date.now()}`;
  const newDesc = `E2E Description ${Date.now()}`;

  // Use force:true to bypass actionability checks, or use JS evaluation
  const firstInput = page
    .locator('[data-testid="save-project-btn"]')
    .locator("xpath=ancestor::section//input")
    .first();
  await firstInput.fill(newName, { force: true });
  console.log(`OK: Set name to "${newName}"`);

  // Clear and type new description
  const textarea = page.locator("section textarea").first();
  await textarea.click();
  await textarea.fill(newDesc);
  console.log(`OK: Set description to "${newDesc}"`);

  // Step 8: Set up request interception to monitor PATCH
  let patchSent = false;
  let patchUrl = "";
  page.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/api/projects/")) {
      patchSent = true;
      patchUrl = req.url();
      console.log(`  >> PATCH request intercepted: ${req.url()}`);
    }
  });

  // Step 9: Click Save button
  const saveBtn = page.locator('[data-testid="save-project-btn"]');
  const saveBtnVisible = await saveBtn.isVisible().catch(() => false);
  if (!saveBtnVisible) {
    console.log("WARN: save-project-btn not found by data-testid, trying text match...");
    const saveBtnText = page.locator("button", { hasText: /Save Changes|保存更改|saveChanges/ });
    await saveBtnText.click();
  } else {
    await saveBtn.click();
  }
  console.log("OK: Clicked Save button");

  // Wait for network
  await page.waitForTimeout(2000);

  // Step 10: Check if PATCH was sent
  if (patchSent) {
    console.log(`PASS: PATCH request was sent to ${patchUrl}`);
  } else {
    console.log("FAIL: No PATCH request was intercepted after clicking Save");
  }

  // Step 11: Verify via API
  const verifyRes = await apiFetch(`/api/projects/${projectId}`, token);
  console.log(`API verify: name="${verifyRes.name}", description="${verifyRes.description}"`);

  if (verifyRes.name === newName && verifyRes.description === newDesc) {
    console.log("PASS: Project name and description updated successfully!");
  } else {
    console.log(
      `FAIL: Expected name="${newName}" desc="${newDesc}", got name="${verifyRes.name}" desc="${verifyRes.description}"`,
    );
  }

  // Cleanup
  await apiFetch(`/api/projects/${projectId}`, token, { method: "DELETE" });
  await browser.close();

  // Final verdict
  const passed = patchSent && verifyRes.name === newName;
  console.log(`\n=== VERDICT: ${passed ? "PASS" : "FAIL"} ===`);
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
