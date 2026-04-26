import { test, expect, Page } from "@playwright/test";
import { requireEnv } from "../../scripts/lib/require-env";

const PASSWORD = requireEnv("E2E_TEST_PASSWORD");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3199";

async function bootstrapAuth(page: Page, token: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate((value) => {
    window.localStorage.setItem("token", value);
    document.cookie = `token=${value}; path=/`;
  }, token);
}

async function fetchProjects(page: Page) {
  return page.evaluate(async () => {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/projects", {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error(`projects fetch failed: ${res.status}`);
    return res.json();
  });
}

async function selectProject(page: Page, name: string) {
  const toggle = page.locator("aside div.relative button").first();
  await toggle.click();
  const option = page.locator("aside div.absolute button", { hasText: name }).last();
  await option.waitFor({ state: "visible" });
  await option.click();
  await expect(toggle).toContainText(name);
}

async function assertSelection(page: Page, name: string, id: string) {
  const toggle = page.locator("aside div.relative button").first();
  await expect(toggle).toContainText(name);
  const stored = await page.evaluate(() => localStorage.getItem("projectId"));
  expect(stored).toBe(id);
}

test.describe.serial("project-switcher-ui", () => {
  test("F-PS-06 end-to-end scenarios", async ({ page, request }) => {
    const timestamp = Date.now();
    const email = `ps-${timestamp}@test.com`;
    const userName = "PS Tester";

    const registerRes = await request.post(`${BASE_URL}/api/auth/register`, {
      data: { email, password: PASSWORD, name: userName },
    });
    expect(registerRes.status()).toBe(201);

    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email, password: PASSWORD },
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();
    const token: string = loginData.token;
    const userId: string = loginData.user.id;

    await bootstrapAuth(page, token);
    await page.goto(`${BASE_URL}/dashboard`);

    await page.getByText("No project yet").waitFor();

    const projectAName = `PS Auto ${timestamp}`;
    await page.getByRole("button", { name: "Create Project" }).click();
    await page.getByLabel("Project name").fill(projectAName);
    await page.getByRole("button", { name: "Create Project" }).last().click();
    await expect(page.locator("aside div.relative button").first()).toContainText(projectAName);

    const projectsAfterA = await fetchProjects(page);
    const projectA = projectsAfterA.data.find((p: any) => p.name === projectAName);
    expect(projectA).toBeTruthy();
    const storedProjectIdA = await page.evaluate(() => localStorage.getItem("projectId"));
    expect(storedProjectIdA).toBe(projectA.id);

    const projectBName = `PS Auto ${timestamp + 1}`;
    await page.getByRole("button", { name: "New Project" }).click();
    await page.getByLabel("Project name").fill(projectBName);
    await page.getByRole("button", { name: "Create Project" }).last().click();

    const projectsAfterB = await fetchProjects(page);
    const projectB = projectsAfterB.data.find((p: any) => p.name === projectBName);
    expect(projectB).toBeTruthy();

    const adminLogin = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") },
    });
    expect(adminLogin.status()).toBe(200);
    const adminToken = (await adminLogin.json()).token;
    const rechargeRes = await request.post(
      `${BASE_URL}/api/admin/users/${userId}/projects/${projectA.id}/recharge`,
      {
        data: { amount: 25, description: "project-switcher test" },
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    expect(rechargeRes.status()).toBe(201);

    await page.reload();

    const apiKeyName = `PS Key ${timestamp}`;
    const actionName = `PS Action ${timestamp}`;

    await page.evaluate(
      async ({ projectId, apiKeyName }) => {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/projects/${projectId}/keys`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: apiKeyName }),
        });
        if (!res.ok) throw new Error(`create key failed ${res.status}`);
      },
      { projectId: projectA.id, apiKeyName },
    );

    await page.evaluate(
      async ({ projectId, actionName }) => {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/projects/${projectId}/actions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: actionName,
            description: "PS action",
            model: "openai/gpt-4o-mini",
            messages: [{ role: "user", content: "hello {{topic}}" }],
            variables: [{ name: "topic", description: "topic", required: true }],
            changelog: "init",
          }),
        });
        if (!res.ok) throw new Error(`create action failed ${res.status}`);
      },
      { projectId: projectA.id, actionName },
    );

    await selectProject(page, projectBName);
    await assertSelection(page, projectBName, projectB.id);

    await page.goto(`${BASE_URL}/keys`);
    await page.getByRole("heading", { name: "API Keys" }).first().waitFor();
    await expect(page.getByText(apiKeyName)).toHaveCount(0);

    await page.goto(`${BASE_URL}/actions`);
    await page.getByRole("heading", { name: "Actions" }).first().waitFor();
    await expect(page.getByText(actionName)).toHaveCount(0);

    await selectProject(page, projectAName);
    await assertSelection(page, projectAName, projectA.id);

    await expect(page.getByText(actionName)).toBeVisible();
    await page.goto(`${BASE_URL}/keys`);
    await expect(page.getByText(apiKeyName)).toBeVisible();

    await page.goto(`${BASE_URL}/dashboard`);
    const walletCard = page.locator("aside div").filter({ hasText: "Wallet Balance" }).first();
    await expect(walletCard).toContainText("$25.00");

    await selectProject(page, projectBName);
    await expect(walletCard).toContainText("$0.00");

    await selectProject(page, projectAName);
    await page.reload();
    await assertSelection(page, projectAName, projectA.id);

    await selectProject(page, projectBName);
    await page.reload();
    await assertSelection(page, projectBName, projectB.id);
  });
});
