import { test, expect, Page, APIRequestContext } from "@playwright/test";
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

async function createProject(request: APIRequestContext, token: string, name: string) {
  const res = await request.post(`${BASE_URL}/api/projects`, {
    data: { name },
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return String(body.id);
}

test.describe("balance-user-level-ui", () => {
  test("F-BU-08 Sidebar wallet remains constant when switching projects", async ({ page, request }) => {
    const timestamp = Date.now();
    const email = `bu-ui-${timestamp}@test.com`;

    const registerRes = await request.post(`${BASE_URL}/api/auth/register`, {
      data: { email, password: PASSWORD, name: "BU UI Tester" },
    });
    expect(registerRes.status()).toBe(201);

    const loginRes = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email, password: PASSWORD },
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();
    const userToken: string = loginData.token;
    const userId: string = loginData.user.id;

    const projectAName = `BU UI Project A ${timestamp}`;
    const projectBName = `BU UI Project B ${timestamp}`;
    const projectAId = await createProject(request, userToken, projectAName);
    await createProject(request, userToken, projectBName);

    const adminLogin = await request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") },
    });
    expect(adminLogin.status()).toBe(200);
    const adminToken: string = (await adminLogin.json()).token;

    // BL-TEST-INFRA-IMPORT fix-round-1: balance moved from project-level
    // to user-level (BL-USER-LEVEL-BALANCE batch). The old admin recharge
    // URL `/admin/users/:userId/projects/:projectId/recharge` no longer
    // exists; recharge now targets the user record directly via
    // `/api/admin/users/:id/recharge` (src/app/api/admin/users/[id]/
    // recharge/route.ts) and the User.balance column. The test's premise
    // (sidebar wallet stays constant when switching projects) is
    // unchanged — under user-level balance the sidebar reads the user's
    // single balance regardless of selected project.
    const rechargeRes = await request.post(`${BASE_URL}/api/admin/users/${userId}/recharge`, {
      data: { amount: 30, description: "bu-ui-test" },
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(rechargeRes.status()).toBe(201);
    void projectAId; // retained for compatibility with the original spec signature

    await bootstrapAuth(page, userToken);
    await page.goto(`${BASE_URL}/dashboard`);

    const walletCard = page.locator("aside div").filter({ hasText: "Wallet Balance" }).first();
    await expect(walletCard).toContainText("Wallet Balance");
    const initialText = await walletCard.innerText();

    const dropdown = page.locator("aside div.relative button").first();
    await dropdown.click();
    const option = page.locator("aside div.absolute button", { hasText: projectBName }).last();
    await option.waitFor({ state: "visible" });
    await option.click();

    const afterText = await walletCard.innerText();
    expect(afterText).toBe(initialText);
  });
});
