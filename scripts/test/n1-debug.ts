/**
 * Quick debug script to inspect the Project tab rendering
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";

async function main() {
  // Login
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: "admin123" }),
  });
  const { token } = (await loginRes.json()) as { token: string };

  // Create project
  const projRes = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: "Debug Project" }),
  });
  const { id: projectId } = (await projRes.json()) as { id: string };
  console.log("Project:", projectId);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // Set auth
  await page.goto(`${BASE}/login`);
  await page.evaluate(
    ({ t, pid }) => {
      localStorage.setItem("token", t);
      localStorage.setItem("projectId", pid);
      document.cookie = `token=${t}; path=/`;
    },
    { t: token, pid: projectId },
  );

  // Go to settings
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");

  // Click Project tab
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.waitForTimeout(2000);

  // Screenshot
  await page.screenshot({ path: "test-results/debug-1920.png", fullPage: true });
  console.log("Screenshot saved: test-results/debug-1920.png");

  // Check what's in the content area
  const mainContent = await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return "NO MAIN ELEMENT";
    return {
      innerHTML: main.innerHTML.substring(0, 2000),
      childCount: main.children.length,
      firstChildTag: main.children[0]?.tagName,
      textContent: main.textContent?.substring(0, 500),
    };
  });
  console.log("Main content:", JSON.stringify(mainContent, null, 2));

  // Check for console errors
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  // Re-navigate to catch errors
  await page.goto(`${BASE}/settings`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.waitForTimeout(2000);

  if (errors.length > 0) {
    console.log("Console errors:", errors);
  }

  // Check if save button exists
  const saveBtnExists = await page.locator('[data-testid="save-project-btn"]').count();
  console.log("Save button count:", saveBtnExists);

  // Check if the form section exists
  const sectionCount = await page.locator("main section").count();
  console.log("Section count in main:", sectionCount);

  // Try clicking save with force
  if (saveBtnExists > 0) {
    console.log("Attempting force click on save button...");

    // Monitor network
    let patchSeen = false;
    page.on("request", (req) => {
      if (req.method() === "PATCH") {
        patchSeen = true;
        console.log(`  PATCH intercepted: ${req.url()}`);
      }
    });

    await page.locator('[data-testid="save-project-btn"]').click({ force: true });
    await page.waitForTimeout(3000);
    console.log("PATCH sent:", patchSeen);
  }

  // Cleanup
  await fetch(`${BASE}/api/projects/${projectId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await browser.close();
}

main().catch(console.error);
