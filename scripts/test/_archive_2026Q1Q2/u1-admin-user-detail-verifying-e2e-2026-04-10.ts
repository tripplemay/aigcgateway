import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/u1-admin-user-detail-verifying-e2e-2026-04-10.json";

const prisma = new PrismaClient();

type Step = { id: string; name: string; ok: boolean; detail: string };
type AuthMode = "none" | "user" | "admin" | "key";

const testerEmail = `u1_user_${Date.now()}@test.com`;
const testerPassword = requireEnv("E2E_TEST_PASSWORD");
const adminCreds = { email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") };

let userId = "";
let userToken = "";
let adminToken = "";
let apiKey = "";
let newApiKey = "";
let projectA = "";
let projectB = "";

function approxEqual(a: number, b: number, diff = 0.0001) {
  return Math.abs(a - b) <= diff;
}

async function api(
  path: string,
  init?: RequestInit & { auth?: AuthMode; expect?: number },
): Promise<{ status: number; body: any; text: string }> {
  const { auth = "none", expect, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "user" && userToken) headers.Authorization = `Bearer ${userToken}`;
  if (auth === "admin" && adminToken) headers.Authorization = `Bearer ${adminToken}`;
  if (auth === "key" && apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, text };
}

async function login(email: string, password: string) {
  return api("/api/auth/login", {
    method: "POST",
    auth: "none",
    body: JSON.stringify({ email, password }),
  });
}

async function bootstrap() {
  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email: testerEmail, password: testerPassword, name: "U1 Tester" }),
  });

  const userLogin = await login(testerEmail, testerPassword);
  if (userLogin.status !== 200) throw new Error(`user login failed: ${userLogin.status}`);
  userToken = String(userLogin.body?.token ?? "");
  userId = String(userLogin.body?.user?.id ?? "");
  if (!userToken || !userId) throw new Error("user token/id missing");

  const adminLogin = await login(adminCreds.email, adminCreds.password);
  if (adminLogin.status !== 200) throw new Error(`admin login failed: ${adminLogin.status}`);
  adminToken = String(adminLogin.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");

  const projectARes = await api("/api/projects", {
    method: "POST",
    auth: "user",
    expect: 201,
    body: JSON.stringify({ name: `U1 Project A ${Date.now()}` }),
  });
  const projectBRes = await api("/api/projects", {
    method: "POST",
    auth: "user",
    expect: 201,
    body: JSON.stringify({ name: `U1 Project B ${Date.now()}` }),
  });
  projectA = String(projectARes.body?.id ?? "");
  projectB = String(projectBRes.body?.id ?? "");

  const keyRes = await api("/api/keys", {
    method: "POST",
    auth: "user",
    expect: 201,
    body: JSON.stringify({ name: "U1 Primary Key" }),
  });
  apiKey = String(keyRes.body?.key ?? "");
  if (!apiKey) throw new Error("api key missing");

  await prisma.callLog.create({
    data: {
      projectId: projectA,
      modelName: "openai/gpt-4o-mini",
      promptSnapshot: { role: "user", content: "u1 last active seed" },
      status: "SUCCESS",
      responseContent: "ok",
      totalTokens: 10,
      createdAt: new Date(),
    },
  });
}

async function seedTransactions() {
  const recharge = await api(`/api/admin/users/${userId}/recharge`, {
    method: "POST",
    auth: "admin",
    expect: 201,
    body: JSON.stringify({ amount: 25, description: "u1-manual-recharge" }),
  });
  const rechargeBalance = Number(recharge.body?.balance ?? 0);

  let balanceAfter = rechargeBalance;
  for (let i = 0; i < 11; i += 1) {
    balanceAfter = Number((balanceAfter - 0.01).toFixed(8));
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: 0.01 } },
      }),
      prisma.transaction.create({
        data: {
          userId,
          projectId: projectA,
          type: "DEDUCTION",
          amount: -0.01,
          balanceAfter,
          status: "COMPLETED",
          description: `u1-seeded-deduction-${i + 1}`,
        },
      }),
    ]);
  }
}

async function createReplacementKey() {
  const res = await api("/api/keys", {
    method: "POST",
    auth: "user",
    expect: 201,
    body: JSON.stringify({ name: "U1 Replacement Key" }),
  });
  newApiKey = String(res.body?.key ?? "");
  if (!newApiKey) throw new Error("replacement api key missing");
}

async function bootstrapAdminPage(token: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`);
  await page.evaluate((value) => {
    window.localStorage.setItem("token", value);
    document.cookie = `token=${value}; path=/`;
  }, token);
  return { browser, page };
}

async function main() {
  const steps: Step[] = [];
  let failCount = 0;

  const runStep = async (id: string, name: string, fn: () => Promise<string>) => {
    try {
      const detail = await fn();
      steps.push({ id, name, ok: true, detail });
    } catch (error) {
      failCount += 1;
      steps.push({
        id,
        name,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  try {
    await bootstrap();
    await seedTransactions();

    await runStep("AC1", "Admin 用户详情 API 返回余额、lastActive、项目与分页交易", async () => {
      const detail = await api(`/api/admin/users/${userId}`, { auth: "admin", expect: 200 });
      const txns = await api(`/api/admin/users/${userId}/transactions?page=1&pageSize=10`, {
        auth: "admin",
        expect: 200,
      });

      if (!detail.body?.lastActive) throw new Error("lastActive is null");
      if (!approxEqual(Number(detail.body?.balance ?? 0), 24.89)) {
        throw new Error(`unexpected balance=${detail.body?.balance}`);
      }
      if ((detail.body?.projects ?? []).length !== 2) {
        throw new Error(`unexpected projects=${(detail.body?.projects ?? []).length}`);
      }
      if (Number(txns.body?.pagination?.total ?? 0) < 12) {
        throw new Error(`unexpected transaction total=${txns.body?.pagination?.total}`);
      }

      return `balance=${detail.body.balance}, lastActive=${detail.body.lastActive}, projects=${detail.body.projects.length}, tx_total=${txns.body.pagination.total}`;
    });

    await runStep("AC2", "Admin 用户详情页展示余额、最近活跃、分页和危险操作入口", async () => {
      const { browser, page } = await bootstrapAdminPage(adminToken);
      try {
        await page.goto(`${BASE}/admin/users/${userId}`);
        await page.waitForLoadState("networkidle");

        const pageText = await page.textContent("body");
        if (!pageText?.includes(testerEmail)) throw new Error("detail page missing user email");
        if (!pageText.includes("Balance")) throw new Error("detail page missing balance card");
        if (!pageText.includes("Last Active")) throw new Error("detail page missing lastActive label");
        if (!pageText.includes("Balance History")) throw new Error("detail page missing history section");
        if (!pageText.includes("Administrative Controls")) {
          throw new Error("detail page missing danger zone");
        }
        const nextVisible = await page.getByRole("button", { name: "Next" }).isVisible();
        if (!nextVisible) throw new Error("transactions pagination not visible");

        return "detail page rendered with balance, lastActive, history pagination and danger controls";
      } finally {
        await browser.close();
      }
    });

    await runStep("AC3", "项目卡片包含调用数和 Key 数", async () => {
      const detail = await api(`/api/admin/users/${userId}`, { auth: "admin", expect: 200 });
      const firstProject = detail.body?.projects?.[0];
      if (!firstProject) throw new Error("no project found in detail response");
      if (!("keyCount" in firstProject)) {
        throw new Error("project detail missing keyCount");
      }

      const { browser, page } = await bootstrapAdminPage(adminToken);
      try {
        await page.goto(`${BASE}/admin/users/${userId}`);
        await page.waitForLoadState("networkidle");
        const projectSection = page.getByText("Registered Projects").locator("..");
        const sectionText = (await projectSection.textContent()) ?? "";
        if (!/keys?/i.test(sectionText)) {
          throw new Error("project cards do not display key count");
        }
        return `project keyCount=${firstProject.keyCount}`;
      } finally {
        await browser.close();
      }
    });

    await runStep("AC4", "暂停用户后无法登录且现有 API Key 无法调用；恢复后重新正常", async () => {
      const suspend = await api(`/api/admin/users/${userId}/suspend`, {
        method: "POST",
        auth: "admin",
        expect: 200,
        body: JSON.stringify({ suspended: true }),
      });
      const suspendedLogin = await login(testerEmail, testerPassword);
      const suspendedApi = await fetch(`${BASE}/v1/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (suspendedLogin.status !== 403) {
        throw new Error(`suspended login status=${suspendedLogin.status}`);
      }
      if (![401, 403].includes(suspendedApi.status)) {
        throw new Error(`suspended api status=${suspendedApi.status}`);
      }

      await api(`/api/admin/users/${userId}/suspend`, {
        method: "POST",
        auth: "admin",
        expect: 200,
        body: JSON.stringify({ suspended: false }),
      });
      const restoredLogin = await login(testerEmail, testerPassword);
      if (restoredLogin.status !== 200) {
        throw new Error(`restored login status=${restoredLogin.status}`);
      }
      userToken = String(restoredLogin.body?.token ?? userToken);
      await createReplacementKey();
      const restoredApi = await fetch(`${BASE}/v1/models`, {
        headers: { Authorization: `Bearer ${newApiKey}` },
      });
      if (restoredApi.status !== 200) {
        throw new Error(`restored api status=${restoredApi.status}`);
      }

      return `keysAffected=${suspend.body?.keysAffected ?? 0}, suspended_login=${suspendedLogin.status}, restored_api=${restoredApi.status}`;
    });

    await runStep("AC5", "删除用户后从列表消失且无法登录", async () => {
      const { browser, page } = await bootstrapAdminPage(adminToken);
      try {
        await page.goto(`${BASE}/admin/users/${userId}`);
        await page.waitForLoadState("networkidle");
        await page.getByRole("button", { name: "Delete Profile" }).click();
        await page.getByPlaceholder(testerEmail).fill(testerEmail);
        await page.getByRole("button", { name: "Delete Profile" }).last().click();
        await page.waitForURL(`${BASE}/admin/users`);
      } finally {
        await browser.close();
      }

      const users = await api("/api/admin/users?page=1&pageSize=50", { auth: "admin", expect: 200 });
      const exists = (users.body?.data ?? []).some((u: any) => u.id === userId || u.email === testerEmail);
      if (exists) throw new Error("deleted user still exists in list");

      const deletedLogin = await login(testerEmail, testerPassword);
      if (deletedLogin.status !== 403) {
        throw new Error(`deleted login status=${deletedLogin.status}`);
      }
      return `deleted_login=${deletedLogin.status}, list_contains=${exists}`;
    });
  } finally {
    const output = {
      batch: "U1-admin-user-detail",
      feature: "F-U1-07",
      executedAt: new Date().toISOString(),
      baseUrl: BASE,
      passCount: steps.filter((s) => s.ok).length,
      failCount,
      steps,
    };
    writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
    await prisma.$disconnect();
  }

  if (failCount > 0) {
    throw new Error(`[u1-admin-user-detail-e2e] ${failCount} step(s) failed`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
