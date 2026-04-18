import { writeFileSync } from "fs";
import { chromium } from "@playwright/test";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/security-and-robustness-e2e-2026-04-08.json";

type Step = {
  name: string;
  ok: boolean;
  detail: string;
};

let token = "";
let projectId = "";

const email = `sr_${Date.now()}@test.local`;
const password = requireEnv("E2E_TEST_PASSWORD");

async function api(
  path: string,
  init?: RequestInit & { expect?: number; auth?: "jwt" | "none" },
) {
  const { expect, auth = "jwt", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "jwt" && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (expect && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, text };
}

async function registerAndLogin() {
  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email, password, name: "Security Tester" }),
  });
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });
  token = String(login.body?.token ?? "");
  if (!token) throw new Error("login token missing");
}

async function createProject() {
  const res = await api("/api/projects", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: `SR Project ${Date.now()}` }),
  });
  projectId = String(res.body?.id ?? "");
  if (!projectId) throw new Error("project id missing");
}

async function createKey(payload: Record<string, unknown>) {
  const res = await api(`/api/projects/${projectId}/keys`, {
    method: "POST",
    expect: 201,
    body: JSON.stringify(payload),
  });
  const key = String(res.body?.key ?? "");
  if (!key) throw new Error("api key missing");
  return key;
}

async function run() {
  const steps: Step[] = [];

  try {
    await registerAndLogin();
    await createProject();

    // AC1: chatCompletion=false 的 Key 调 /v1/actions/run 返回 403
    {
      const restrictedKey = await createKey({
        name: "no-chat-key",
        permissions: { chatCompletion: false },
      });
      const res = await fetch(`${BASE}/v1/actions/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${restrictedKey}`,
        },
        body: JSON.stringify({}),
      });
      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      const msg = JSON.stringify(body ?? "");
      const ok = res.status === 403 && /chatCompletion/i.test(msg);
      steps.push({
        name: "AC1 chatCompletion=false key is blocked on /v1/actions/run",
        ok,
        detail: `status=${res.status}, body=${msg}`,
      });
    }

    // AC2: MCP 非白名单 IP 调用被拒绝
    {
      const whitelistKey = await createKey({
        name: "ip-whitelist-key",
        ipWhitelist: ["127.0.0.1"],
      });
      const rpcBody = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/list",
        params: {},
      };

      const blocked = await fetch(`${BASE}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${whitelistKey}`,
          Accept: "application/json, text/event-stream",
          "x-forwarded-for": "203.0.113.10",
        },
        body: JSON.stringify(rpcBody),
      });
      const blockedText = await blocked.text();

      const allowed = await fetch(`${BASE}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${whitelistKey}`,
          Accept: "application/json, text/event-stream",
          "x-forwarded-for": "127.0.0.1",
        },
        body: JSON.stringify(rpcBody),
      });
      const allowedText = await allowed.text();

      const ok = blocked.status === 401 && allowed.status === 200;
      steps.push({
        name: "AC2 MCP request is rejected from non-whitelisted IP",
        ok,
        detail: `blocked=${blocked.status}, allowed=${allowed.status}, blockedBody=${blockedText.slice(0, 120)}, allowedBody=${allowedText.slice(0, 120)}`,
      });
    }

    const browser = await chromium.launch({ headless: true });
    try {
      // AC3: API Key 创建按钮在请求中 disabled
      {
        const ctx = await browser.newContext();
        await ctx.addCookies([{ name: "token", value: token, url: BASE }]);
        await ctx.addInitScript(
          ({ tk, pid }) => {
            localStorage.setItem("token", tk);
            localStorage.setItem("projectId", pid);
          },
          { tk: token, pid: projectId },
        );

        const page = await ctx.newPage();
        let sawCreateRequest = false;
        await page.route(`**/api/projects/${projectId}/keys`, async (route) => {
          const req = route.request();
          if (req.method() !== "POST") {
            await route.continue();
            return;
          }
          sawCreateRequest = true;
          const resp = await route.fetch();
          await new Promise((r) => setTimeout(r, 900));
          await route.fulfill({ response: resp });
        });

        await page.goto(`${BASE}/keys`, { waitUntil: "domcontentloaded" });
        const openCreate = page.locator(".fixed.bottom-8.right-8 button").first();
        await openCreate.waitFor({ state: "visible", timeout: 10000 });
        await openCreate.click();

        const modal = page.locator("div.fixed.inset-0.z-50").first();
        await modal.waitFor({ state: "visible", timeout: 10000 });
        const submit = modal.locator("div.px-8.py-6").last().locator("button").last();

        await submit.click();
        let disabledDuringRequest = false;
        for (let i = 0; i < 8; i++) {
          await page.waitForTimeout(100);
          if (await submit.isDisabled().catch(() => false)) {
            disabledDuringRequest = true;
            break;
          }
        }
        await page.waitForTimeout(1200);

        steps.push({
          name: "AC3 create key button is disabled while request is in-flight",
          ok: sawCreateRequest && disabledDuringRequest,
          detail: `sawCreateRequest=${sawCreateRequest}, disabledDuringRequest=${disabledDuringRequest}`,
        });
        await ctx.close();
      }

      // AC4: dashboard API 失败时不卡在 loading
      {
        const ctx = await browser.newContext();
        await ctx.addCookies([{ name: "token", value: token, url: BASE }]);
        await ctx.addInitScript(
          ({ tk, pid }) => {
            localStorage.setItem("token", tk);
            localStorage.setItem("projectId", pid);
          },
          { tk: token, pid: projectId },
        );
        const page = await ctx.newPage();
        let failedReqCount = 0;
        await page.route(`**/api/projects/${projectId}/**`, async (route) => {
          const url = route.request().url();
          if (
            /\/api\/projects\/[^/]+\/(balance|usage(\?|$)|usage\/daily|usage\/by-model|logs(\?|$))/.test(
              url,
            )
          ) {
            failedReqCount++;
            await route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({ error: { code: "internal_error", message: "mock dashboard api failure" } }),
            });
            return;
          }
          await route.continue();
        });

        await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);

        const h2Visible = await page.locator("h2").first().isVisible().catch(() => false);
        const skeletonCount = await page.locator(".animate-pulse").count();
        const ok = failedReqCount > 0 && h2Visible && skeletonCount === 0;
        steps.push({
          name: "AC4 dashboard is not stuck in loading when APIs fail",
          ok,
          detail: `failedReqCount=${failedReqCount}, h2Visible=${h2Visible}, skeletonCount=${skeletonCount}`,
        });
        await ctx.close();
      }
    } finally {
      await browser.close();
    }

    const passCount = steps.filter((s) => s.ok).length;
    const failCount = steps.length - passCount;

    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          userEmail: email,
          projectId,
          passCount,
          failCount,
          steps,
        },
        null,
        2,
      ),
      "utf8",
    );

    if (failCount > 0) {
      console.error(`[security-and-robustness-e2e] F-SR-05 failed: ${failCount} step(s) failed`);
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          userEmail: email,
          projectId,
          passCount: 0,
          failCount: 1,
          steps: [{ name: "script runtime", ok: false, detail: msg }],
        },
        null,
        2,
      ),
      "utf8",
    );
    console.error(`[security-and-robustness-e2e] script error: ${msg}`);
    process.exit(1);
  }
}

run();
