import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";

async function main() {
  console.log("=== N1 Save Button Verification ===");

  // Login
  const { token } = (await (
    await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@aigc-gateway.local", password: "admin123" }),
    })
  ).json()) as { token: string };

  // Create project
  const { id: pid } = (await (
    await fetch(`${BASE}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Save Verify Test" }),
    })
  ).json()) as { id: string };
  console.log(`Project: ${pid}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  // Auth
  await page.goto(`${BASE}/login`);
  await page.evaluate(
    ({ t, p }) => {
      localStorage.setItem("token", t);
      localStorage.setItem("projectId", p);
      document.cookie = `token=${t}; path=/`;
    },
    { t: token, p: pid },
  );

  // Navigate to settings
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");

  // Click Project tab (NO force)
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.waitForTimeout(1500);

  // Screenshot
  await page.screenshot({ path: "test-results/save-verify.png", fullPage: true });

  // Monitor PATCH
  let patchSent = false;
  page.on("request", (req) => {
    if (req.method() === "PATCH" && req.url().includes("/api/projects/")) {
      patchSent = true;
      console.log(`  >> PATCH: ${req.url()}`);
    }
  });

  // Fill name (NO force)
  const nameInput = page.locator("section input:not([readonly])").first();
  const newName = `Updated ${Date.now()}`;
  await nameInput.fill(newName);
  console.log(`Filled name: ${newName}`);

  // Click save (NO force)
  await page.locator('[data-testid="save-project-btn"]').click();
  console.log("Clicked Save");
  await page.waitForTimeout(2000);

  // Verify via API
  const project = (await (
    await fetch(`${BASE}/api/projects/${pid}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()) as { name: string };

  const passed = patchSent && project.name === newName;
  console.log(`PATCH sent: ${patchSent}`);
  console.log(`API name: "${project.name}" (expected: "${newName}")`);
  console.log(`\n=== ${passed ? "PASS" : "FAIL"} ===`);

  // Cleanup
  await fetch(`${BASE}/api/projects/${pid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await browser.close();
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
