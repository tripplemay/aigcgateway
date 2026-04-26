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

async function createUser(request: APIRequestContext, email: string, name: string) {
  await request.post(`${BASE_URL}/api/auth/register`, {
    data: { email, password: PASSWORD, name },
  });
}

async function loginUser(request: APIRequestContext, email: string) {
  const res = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { email, password: PASSWORD },
    headers: { "User-Agent": "PlaywrightUICheck" },
  });
  expect(res.status()).toBe(200);
  return res.json();
}

function emailPrefix(email: string) {
  return email.split("@")[0];
}

test.describe("user-profile-center", () => {
  test("Sidebar user info + Settings security log", async ({ page, request }) => {
    const email = `upc-ui-${Date.now()}@test.com`;
    const displayName = "UPC UI";
    await createUser(request, email, displayName);
    const loginData = await loginUser(request, email);
    const token: string = loginData.token;

    await bootstrapAuth(page, token);
    await page.goto(`${BASE_URL}/dashboard`);

    const userCard = page.locator("aside a", { hasText: displayName });
    await expect(userCard).toContainText(displayName);
    await expect(userCard).toContainText(/Developer/i);

    await userCard.click();
    await expect(page).toHaveURL(`${BASE_URL}/settings`);

    const securitySection = page.locator("section", { hasText: "Security Log" }).first();
    await expect(securitySection).toContainText("Security Log");
    const logRow = securitySection
      .locator("div.flex.items-center.justify-between.p-3")
      .first();
    await expect(logRow).toContainText("PlaywrightUICheck");
  });
});
