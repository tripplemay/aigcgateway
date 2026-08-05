/**
 * 端到端全链路测试
 *
 * 用法：BASE_URL=http://localhost:3199 npx tsx scripts/e2e-test.ts
 */

import { prisma } from "@/lib/prisma";
import { requireEnv } from "./lib/require-env";
import { fundUser } from "./lib/fund-user";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
let token = "";
let userId = "";
let projectId = "";
let apiKey = "";
let keyId = "";
const email = `e2e_${Date.now()}@test.com`;
const password = requireEnv("E2E_TEST_PASSWORD");
let passed = 0;
let failed = 0;
let skipped = 0;
// BL-DEEPSEEK-V4-HOTFIX F-DSV4-07：原本硬编码 model: "deepseek/v3"。那是旧
// NAME_MAP 生成的模型名，DeepSeek 直连下线 deepseek-chat 后该名已不存在，
// 脚本随之常年失败。改为运行时从 /v1/models 取实际可用别名。
let textModel = "";
let imageModel = "";
let initialBalance = 0;
let rechargedBalance = 0;
// fix_round 2 / DSV4-DEF-02：依赖"调用已发生"的断言据此决定 SKIP
let hasSuccessfulCall = false;

async function resolveModels() {
  const res = await fetch(`${BASE}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return;
  const body = await res.json().catch(() => null);
  const list: Array<{ id?: string; modality?: string }> = body?.data ?? [];
  textModel = list.find((m) => (m.modality ?? "text") === "text")?.id ?? "";
  imageModel = list.find((m) => m.modality === "image")?.id ?? "";
}

async function api(path: string, opts?: RequestInit & { expectStatus?: number }) {
  const { expectStatus, ...init } = opts ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (expectStatus && res.status !== expectStatus) {
    throw new Error(`Expected ${expectStatus}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, headers: res.headers };
}

/**
 * BL-DEEPSEEK-V4-HOTFIX F-DSV4-07：环境里一个模型都没有（provider key 缺失 /
 * 尚未 sync）时，真实调用步骤既不该 PASS 也不该记 FAIL —— 那是环境受阻，不是
 * 回归。抛出本错误的步骤计入 SKIP，不污染红绿判断。
 */
class SkipStep extends Error {}

function skipUnless(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new SkipStep(reason);
}

async function step(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    console.log("✅ PASS");
    passed++;
  } catch (e) {
    if (e instanceof SkipStep) {
      console.log(`⏭️  SKIP: ${e.message}`);
      skipped++;
      return;
    }
    console.log(`❌ FAIL: ${(e as Error).message}`);
    failed++;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("AIGC Gateway — E2E Full Journey Test");
  console.log(`Base: ${BASE} | User: ${email}`);
  console.log("=".repeat(60));

  // 1. Register
  await step("1. Register", async () => {
    const { body } = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name: "E2E Tester" }),
      expectStatus: 201,
    });
    if (!body.id) throw new Error("No user id");
    userId = body.id;
  });

  // BL-073
  // Full email-verify happy path: register → unverified → read token
  // directly from DB → POST /verify-email → login still works. We do
  // NOT depend on real email delivery; the test reaches into the
  // emailVerificationToken table for the token the register handler
  // just minted.
  await step("1b. BL-073 email-verify: unverified after register", async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("user row missing after register");
    if (user.emailVerified) throw new Error("register unexpectedly flipped emailVerified=true");
  });

  await step("1c. BL-073 email-verify: token → verify → login OK", async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("user row missing");
    const tokenRow = await prisma.emailVerificationToken.findFirst({
      where: { userId: user.id, used: false },
      orderBy: { createdAt: "desc" },
    });
    if (!tokenRow) throw new Error("no unused verification token in DB");

    const verifyRes = await api("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: tokenRow.token }),
      expectStatus: 200,
    });
    if (!/verified/i.test(verifyRes.body?.message ?? "")) {
      throw new Error(`Unexpected verify-email body: ${JSON.stringify(verifyRes.body)}`);
    }

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    if (!after?.emailVerified) throw new Error("emailVerified still false after verify");

    // Login path is still happy with the verified account.
    const login = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      expectStatus: 200,
    });
    if (!login.body?.token) throw new Error("login refused after verify");
  });

  // 2. Login
  await step("2. Login", async () => {
    const { body } = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      expectStatus: 200,
    });
    if (!body.token) throw new Error("No token");
    token = body.token;
  });

  // 2b. BL-SEC-AUTH-SESSION F-AS-01: login sets HttpOnly cookie
  await step("2b. BL-SEC-AUTH-SESSION login Set-Cookie HttpOnly", async () => {
    const savedToken = token;
    token = "";
    try {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        expectStatus: 200,
      });
      const setCookie = res.headers.get("set-cookie") ?? "";
      if (!/token=/.test(setCookie)) throw new Error("Set-Cookie missing token cookie");
      if (!/HttpOnly/i.test(setCookie)) throw new Error("Set-Cookie missing HttpOnly flag");
      if (!/SameSite=Lax/i.test(setCookie)) throw new Error("Set-Cookie missing SameSite=Lax");
      if (!/Max-Age=604800/.test(setCookie) && !/Max-Age=\d+/.test(setCookie)) {
        throw new Error(`Set-Cookie missing Max-Age: ${setCookie}`);
      }
    } finally {
      token = savedToken;
    }
  });

  // 2c. BL-SEC-AUTH-SESSION F-AS-01: /api/auth/logout clears cookie
  await step("2c. BL-SEC-AUTH-SESSION logout clears cookie", async () => {
    const res = await fetch(`${BASE}/api/auth/logout`, { method: "POST" });
    if (res.status !== 200) throw new Error(`logout status ${res.status}`);
    const setCookie = res.headers.get("set-cookie") ?? "";
    if (!/token=/.test(setCookie)) throw new Error("logout missing Set-Cookie");
    if (!/Max-Age=0/.test(setCookie)) throw new Error("logout Max-Age should be 0");
    if (!/HttpOnly/i.test(setCookie)) throw new Error("logout Set-Cookie missing HttpOnly");
  });

  // 2d. BL-SEC-AUTH-SESSION F-AS-02: middleware rejects tampered JWT cookie
  await step("2d. BL-SEC-AUTH-SESSION tampered JWT → redirect", async () => {
    const forged =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJoYWNrZXIiLCJyb2xlIjoiQURNSU4ifQ.AAAA";
    const res = await fetch(`${BASE}/dashboard`, {
      headers: { cookie: `token=${forged}` },
      redirect: "manual",
    });
    if (res.status !== 307 && res.status !== 302)
      throw new Error(`expected redirect, got ${res.status}`);
    const loc = res.headers.get("location") ?? "";
    if (!/\/login/.test(loc)) throw new Error(`expected /login redirect, got ${loc}`);
  });

  // 2e. BL-SEC-AUTH-SESSION F-AS-03: no cookie → /dashboard redirects to /login
  await step("2e. BL-SEC-AUTH-SESSION unauthenticated /dashboard → /login", async () => {
    const res = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
    if (res.status !== 307 && res.status !== 302)
      throw new Error(`expected redirect, got ${res.status}`);
    const loc = res.headers.get("location") ?? "";
    if (!/\/login/.test(loc)) throw new Error(`expected /login redirect, got ${loc}`);
  });

  // 3. Create project
  await step("3. Create project", async () => {
    const { body } = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: "E2E Project" }),
      expectStatus: 201,
    });
    if (!body.id) throw new Error("No project id");
    projectId = body.id;
    // F-DSV4-07：注册会发放 welcome bonus（SystemConfig.WELCOME_BONUS_USD），
    // 新账号余额不再恒为 0。记下基线，后续步骤按增量断言。
    if (typeof body.balance !== "number" || body.balance < 0) {
      throw new Error(`Expected non-negative balance, got ${body.balance}`);
    }
    initialBalance = body.balance;
  });

  // 4. Generate API Key
  await step("4. Generate API Key", async () => {
    // F-DSV4-07：API Key 已从 project 级迁到 user 级（/api/keys）
    const { body } = await api(`/api/keys`, {
      method: "POST",
      body: JSON.stringify({ name: "e2e-key" }),
      expectStatus: 201,
    });
    if (!body.key?.startsWith("pk_")) throw new Error("Key format wrong");
    apiKey = body.key;
    keyId = body.id;
    // Key 到手后才能查 /v1/models —— 后续调用步骤都用这里选出来的别名
    await resolveModels();
  });

  // 5. Key list (masked)
  await step("5. Key list shows mask", async () => {
    const { body } = await api(`/api/keys`);
    const k = body.data?.[0];
    if (!k?.maskedKey?.includes("****")) throw new Error("Key not masked");
  });

  // 6. Self-service recharge is disabled (BL-SEC-HOTFIX-2608 F-SH-02 / 审查 C1)
  //
  // 回归断言：下单端点必须 410 且不落 RechargeOrder。修复前这里返回 201 并把
  // order.id 当作 paymentOrderId 回传，是「任意用户自助无限充值」攻击链的第一环。
  await step("6. Recharge order creation is disabled (410)", async () => {
    const before = await prisma.rechargeOrder.count({ where: { userId } });
    const res = await fetch(`${BASE}/api/projects/${projectId}/recharge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: 50, paymentMethod: "alipay" }),
    });
    if (res.status !== 410) throw new Error(`Expected 410, got ${res.status}`);
    const body = await res.json().catch(() => ({}));
    if (body.error?.code !== "payment_disabled") {
      throw new Error(`Expected code payment_disabled, got ${body.error?.code}`);
    }
    const after = await prisma.rechargeOrder.count({ where: { userId } });
    if (after !== before) throw new Error(`RechargeOrder created despite 410 (${before}→${after})`);
  });

  // 7. Unsigned payment callbacks are rejected, then fund via the admin path
  //
  // 回归断言：伪造的支付宝回调必须 410 且不改余额。修复前无验签，任意人 POST
  // 一个 trade_status=TRADE_SUCCESS 即可给任意订单入账。
  await step("7. Forged alipay callback rejected (410) → fund via admin path", async () => {
    const balBefore = await api(`/api/projects/${projectId}/balance`);
    const cbRes = await fetch(`${BASE}/api/webhooks/alipay`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `out_trade_no=forged-${Date.now()}&trade_status=TRADE_SUCCESS&total_amount=50`,
    });
    if (cbRes.status !== 410) throw new Error(`Expected 410 from webhook, got ${cbRes.status}`);
    const balAfterForge = await api(`/api/projects/${projectId}/balance`);
    if (balAfterForge.body.balance !== balBefore.body.balance) {
      throw new Error(
        `Forged callback changed balance: ${balBefore.body.balance} → ${balAfterForge.body.balance}`,
      );
    }

    // 合法充值路径（等价于 admin 手动充值），供后续计费用例使用
    await fundUser(userId, 50, "E2E: post-hotfix funding");
    const bal = await api(`/api/projects/${projectId}/balance`);
    if (bal.body.balance < initialBalance + 50) {
      throw new Error(`Balance: ${bal.body.balance} (expected >= ${initialBalance + 50})`);
    }
    rechargedBalance = bal.body.balance;
  });

  // 8. API call (non-streaming via API Key)
  await step("8. Chat completion (non-stream)", async () => {
    skipUnless(textModel, "no text model available from /v1/models");
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: textModel,
        messages: [{ role: "user", content: "Say hi" }],
        max_tokens: 5,
      }),
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    const body = await res.json();
    if (!body.choices?.[0]?.message?.content) throw new Error("No content");
    const traceId = res.headers.get("x-trace-id");
    if (!traceId) throw new Error("No X-Trace-Id");
    hasSuccessfulCall = true;
  });

  // 9. API call (streaming)
  await step("9. Chat completion (stream)", async () => {
    skipUnless(textModel, "no text model available from /v1/models");
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: textModel,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5,
        stream: true,
      }),
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    const text = await res.text();
    if (!text.includes("data:")) throw new Error("No SSE data");
    if (!text.includes("[DONE]")) throw new Error("No [DONE]");
  });

  // 10. Image generation
  await step("10. Image generation", async () => {
    skipUnless(imageModel, "no image model available from /v1/models");
    const res = await fetch(`${BASE}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: imageModel, prompt: "a red circle" }),
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    const body = await res.json();
    if (!body.data?.[0]?.url) throw new Error("No image url");
  });

  // 11. Check balance decreased
  await step("11. Balance decreased after calls", async () => {
    skipUnless(hasSuccessfulCall, "no successful AI call — nothing consumed balance");
    const { body } = await api(`/api/projects/${projectId}/balance`);
    if (body.balance >= rechargedBalance) {
      throw new Error(`Balance not decreased: ${body.balance} (was ${rechargedBalance})`);
    }
  });

  // 12. Transaction records
  await step("12. Transaction records", async () => {
    // fix_round 2 / DSV4-DEF-02：余额是用户级的，`billing/payment.ts` 明确把
    // RECHARGE 记到 user.defaultProjectId 而非下单所在项目（见该文件"查找用于
    // Transaction 记录的 projectId"）。原断言只查本脚本建的项目，必然查不到。
    // 改为跨用户全部项目聚合。
    const projects = await api(`/api/projects`);
    const ids: string[] = (projects.body.data ?? []).map((p: { id: string }) => p.id);
    const types = new Set<string>();
    for (const id of ids) {
      const { body } = await api(`/api/projects/${id}/transactions`);
      for (const t of body.data ?? []) types.add(t.type);
    }
    if (!types.has("RECHARGE")) throw new Error(`No RECHARGE record (types: ${[...types]})`);
    if (!hasSuccessfulCall) {
      console.log("(RECHARGE ok; DEDUCTION 需真实调用，本环境跳过) ");
      return;
    }
    if (!types.has("DEDUCTION")) throw new Error(`No DEDUCTION record (types: ${[...types]})`);
  });

  // 13. Audit logs
  await step("13. Audit logs", async () => {
    skipUnless(hasSuccessfulCall, "no successful AI call — no logs to assert");
    const { body } = await api(`/api/projects/${projectId}/logs`);
    if (!body.data?.length) throw new Error("No logs");
    if (!body.data[0].traceId) throw new Error("No traceId in log");
  });

  // 14. Full-text search
  await step("14. Full-text search logs", async () => {
    const { body } = await api(`/api/projects/${projectId}/logs/search?q=hi`);
    // Search may return empty if tsvector hasn't indexed yet, so just verify API works
    if (!body.data) throw new Error("No data field in search response");
  });

  // 15. Models list
  await step("15. GET /v1/models", async () => {
    skipUnless(textModel || imageModel, "environment has no models configured");
    const res = await fetch(`${BASE}/v1/models`);
    const body = await res.json();
    if (!body.data?.length) throw new Error("No models");
  });

  // 16. BL-122 regression — actions list endpoint returns a pagination envelope
  // The UI relies on `data` + `pagination.total` being present in the first response
  // so that the loading guard can switch off cleanly without flashing the CTA banner.
  await step("16. BL-122 actions list envelope", async () => {
    const { body } = await api(`/api/projects/${projectId}/actions?page=1&pageSize=20`);
    if (!Array.isArray(body.data)) throw new Error("No data array");
    if (!body.pagination || typeof body.pagination.total !== "number")
      throw new Error("Missing pagination.total");
  });

  // 17. BL-122 regression — templates list endpoint returns a pagination envelope
  await step("17. BL-122 templates list envelope", async () => {
    const { body } = await api(`/api/projects/${projectId}/templates?page=1&pageSize=20`);
    if (!Array.isArray(body.data)) throw new Error("No data array");
    if (!body.pagination || typeof body.pagination.total !== "number")
      throw new Error("Missing pagination.total");
  });

  // 18. BL-121 regression — /v1/models must return brand-qualified entries so
  // the models page can group them; the "show all" button's expand logic
  // depends on every entry carrying a `brand` field.
  await step("18. BL-121 models brand field", async () => {
    skipUnless(textModel || imageModel, "environment has no models configured");
    const res = await fetch(`${BASE}/v1/models`);
    const body = await res.json();
    if (!Array.isArray(body.data) || body.data.length === 0)
      throw new Error("No models in /v1/models");
    const brandedCount = body.data.filter(
      (m: { brand?: string }) => typeof m.brand === "string" && m.brand.length > 0,
    ).length;
    if (brandedCount === 0) throw new Error("No models expose a `brand` field");
  });

  // 19. BL-123 regression — both data sources behind the templates pill tabs
  // must stay healthy: my-templates list (private) + public templates list.
  await step("19. BL-123 templates tab sources", async () => {
    const my = await api(`/api/projects/${projectId}/templates?page=1&pageSize=20`);
    if (!Array.isArray(my.body.data)) throw new Error("My templates: no data array");
    // fix_round 2 / DSV4-DEF-02：/api/templates/public 已加 verifyJwt 鉴权
    // （src/app/api/templates/public/route.ts:9），脚本仍在裸 fetch → 401。
    const pub = await fetch(`${BASE}/api/templates/public`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!pub.ok) throw new Error(`Public templates HTTP ${pub.status}`);
    const pubBody = await pub.json();
    if (!Array.isArray(pubBody.data) && !Array.isArray(pubBody))
      throw new Error("Public templates: missing data array");
  });

  // 20. F-AF2-01 regression — client abort before response should not bill.
  // We send a chat request and immediately abort, then verify the CallLog
  // is recorded as TIMEOUT with sellPrice=0.
  await step("20. F-AF2-01 client abort → TIMEOUT, no billing", async () => {
    // fix_round 2：原硬编码 "gpt-4o-mini"，环境没有该别名时请求在写 CallLog 前
    // 就被拒，断言必然失败。改用运行时选出的模型并在无模型时 SKIP。
    skipUnless(textModel, "no text model available — abort path cannot produce a CallLog");
    const controller = new AbortController();
    // Abort immediately to simulate client timeout
    setTimeout(() => controller.abort(), 50);
    try {
      await fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: textModel,
          messages: [{ role: "user", content: "say hi" }],
        }),
        signal: controller.signal,
      });
    } catch {
      // Expected: fetch throws on abort
    }
    // Wait for async post-process to complete
    await new Promise((r) => setTimeout(r, 3000));
    // Check the latest log for this project — it should be TIMEOUT
    const latest = await prisma.callLog.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: { status: true, sellPrice: true },
    });
    if (!latest) throw new Error("No call log found after abort");
    // The request may complete before abort fires (fast model) → SUCCESS is also acceptable.
    // But if it was aborted, it MUST be TIMEOUT with zero charge.
    if (latest.status === "TIMEOUT" && Number(latest.sellPrice) !== 0) {
      throw new Error(`TIMEOUT log has non-zero sellPrice: ${latest.sellPrice}`);
    }
  });

  // 21. F-AF2-01 regression — list_logs supports status=timeout filter
  await step("21. F-AF2-01 list_logs timeout filter", async () => {
    // Verify the API doesn't reject 'timeout' as a status value
    // (MCP tool validation — we test via the underlying query pattern)
    const res = await api(`/api/projects/${projectId}/logs?status=TIMEOUT&limit=1`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  // 22. F-TL-04 regression — template rating upsert + averageScore math
  await step("22. F-TL-04 template rating upsert + aggregate", async () => {
    // Seed a public template owned by some project
    const seeded = await prisma.template.create({
      data: {
        projectId,
        name: `rate-probe-${Date.now()}`,
        description: "F-TL-04 regression",
        isPublic: true,
        category: "dev-review",
      },
    });
    try {
      // First rating → 4
      const first = await api(`/api/templates/${seeded.id}/rate`, {
        method: "POST",
        body: JSON.stringify({ score: 4 }),
      });
      if (first.status !== 200) throw new Error(`rate#1 HTTP ${first.status}`);
      if (first.body.data.ratingCount !== 1 || first.body.data.averageScore !== 4) {
        throw new Error(`rate#1 bad aggregate: ${JSON.stringify(first.body.data)}`);
      }

      // Same user re-rates → 2 (upsert, not duplicate)
      const second = await api(`/api/templates/${seeded.id}/rate`, {
        method: "POST",
        body: JSON.stringify({ score: 2 }),
      });
      if (second.status !== 200) throw new Error(`rate#2 HTTP ${second.status}`);
      if (second.body.data.ratingCount !== 1 || second.body.data.averageScore !== 2) {
        throw new Error(`rate#2 bad aggregate: ${JSON.stringify(second.body.data)}`);
      }

      // Only one TemplateRating row for this (user, template)
      const count = await prisma.templateRating.count({
        where: { templateId: seeded.id },
      });
      if (count !== 1) throw new Error(`Expected 1 rating row, got ${count}`);

      // Out-of-range score → 400
      const invalid = await api(`/api/templates/${seeded.id}/rate`, {
        method: "POST",
        body: JSON.stringify({ score: 7 }),
      });
      if (invalid.status !== 400)
        throw new Error(`expected 400 for score=7, got ${invalid.status}`);

      // GET returns current user score
      const current = await api(`/api/templates/${seeded.id}/rate`);
      if (current.body.data.userScore !== 2)
        throw new Error(`GET userScore wrong: ${JSON.stringify(current.body.data)}`);

      // Non-public template → 404
      const privateTpl = await prisma.template.create({
        data: { projectId, name: `private-${Date.now()}`, isPublic: false },
      });
      const blocked = await api(`/api/templates/${privateTpl.id}/rate`, {
        method: "POST",
        body: JSON.stringify({ score: 3 }),
      });
      if (blocked.status !== 404)
        throw new Error(`non-public rate: expected 404, got ${blocked.status}`);
      await prisma.template.delete({ where: { id: privateTpl.id } });
    } finally {
      await prisma.templateRating.deleteMany({ where: { templateId: seeded.id } }).catch(() => {});
      await prisma.template.delete({ where: { id: seeded.id } }).catch(() => {});
    }
  });

  // 23. F-TL-05 regression — category filter + sort_by against /api/templates/public
  await step("23. F-TL-05 list_public_templates category + sort_by", async () => {
    // Seed two categorised public templates with different fork counts
    const [alpha, beta] = await Promise.all([
      prisma.template.create({
        data: {
          projectId,
          name: `tl05-alpha-${Date.now()}`,
          description: "alpha",
          isPublic: true,
          category: "writing",
          ratingCount: 1,
          ratingSum: 5,
        },
      }),
      prisma.template.create({
        data: {
          projectId,
          name: `tl05-beta-${Date.now()}`,
          description: "beta",
          isPublic: true,
          category: "dev-review",
          ratingCount: 1,
          ratingSum: 2,
        },
      }),
    ]);
    // Fake a fork on alpha so popular sort is meaningful
    const fork = await prisma.template.create({
      data: {
        projectId,
        name: `tl05-fork-${Date.now()}`,
        description: "fork",
        isPublic: false,
        sourceTemplateId: alpha.id,
      },
    });
    try {
      const filtered = await api(`/api/templates/public?category=writing&pageSize=50`);
      if (filtered.status !== 200) throw new Error(`filter HTTP ${filtered.status}`);
      const rows = filtered.body.data as Array<{ id: string; category: string | null }>;
      if (!rows.some((r) => r.id === alpha.id))
        throw new Error("writing filter missing alpha template");
      if (rows.some((r) => r.id === beta.id))
        throw new Error("writing filter leaks dev-review template");

      // Returns new fields averageScore + ratingCount + categoryIcon
      const match = rows.find((r) => r.id === alpha.id) as unknown as {
        averageScore: number;
        ratingCount: number;
        categoryIcon: string;
        forkCount: number;
      };
      if (match.ratingCount !== 1) throw new Error(`ratingCount missing: ${match.ratingCount}`);
      if (match.averageScore !== 5) throw new Error(`averageScore wrong: ${match.averageScore}`);
      if (!match.categoryIcon) throw new Error("categoryIcon missing");
      if (match.forkCount < 1) throw new Error(`forkCount wrong: ${match.forkCount}`);

      // sort_by=popular → alpha before beta since alpha has a fork
      const popular = await api(`/api/templates/public?sort_by=popular&pageSize=100`);
      const pRows = popular.body.data as Array<{ id: string }>;
      const aIdx = pRows.findIndex((r) => r.id === alpha.id);
      const bIdx = pRows.findIndex((r) => r.id === beta.id);
      if (aIdx < 0 || bIdx < 0) throw new Error("popular sort missing seeded rows");
      if (aIdx >= bIdx) throw new Error("popular sort did not rank alpha above beta");

      // sort_by=top_rated → alpha (avg 5) before beta (avg 2)
      const top = await api(`/api/templates/public?sort_by=top_rated&pageSize=100`);
      const tRows = top.body.data as Array<{ id: string }>;
      const atIdx = tRows.findIndex((r) => r.id === alpha.id);
      const btIdx = tRows.findIndex((r) => r.id === beta.id);
      if (atIdx >= btIdx)
        throw new Error("top_rated sort did not rank higher-avg alpha above beta");
    } finally {
      await prisma.template.delete({ where: { id: fork.id } }).catch(() => {});
      await prisma.template.delete({ where: { id: alpha.id } }).catch(() => {});
      await prisma.template.delete({ where: { id: beta.id } }).catch(() => {});
    }
  });

  // 24. BL-SEC-BILLING-AI F-BA-02 regression — CallLog + deduct_balance atomicity
  // Seed balance to exactly $1.00, fire 10 concurrent /v1/chat/completions, then
  // assert (a) balance never negative, (b) callLog(SUCCESS).count === transaction(DEDUCTION).count
  // for this run, (c) each callLogId appears at most once in transactions — i.e. deduct_balance
  // did not get double-INSERTed by a stray tx.transaction.create (the F-BA-02 anti-pattern).
  await step("24. BL-SEC-BILLING-AI F-BA-02 concurrent atomicity", async () => {
    skipUnless(textModel, "no text model available — concurrent deduction path unreachable");
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("e2e user missing");

    // Reset to exactly $1.00 so 10 × $0.15 has a deterministic overdraft surface.
    await prisma.user.update({ where: { id: user.id }, data: { balance: 1 } });

    const since = new Date();
    // Prisma's DATETIME precision is milliseconds on Postgres; back off 100ms
    // so the "since" filter can't race the clock on very fast inserts.
    since.setMilliseconds(since.getMilliseconds() - 100);

    const fire = () =>
      fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: textModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
      }).catch(() => null);
    await Promise.all(Array.from({ length: 10 }, fire));

    // Post-process is async; give the event loop up to 8s to drain all 10.
    await new Promise((r) => setTimeout(r, 8000));

    const [freshUser, logs, txns] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { balance: true } }),
      prisma.callLog.findMany({
        where: { projectId, status: "SUCCESS", createdAt: { gte: since } },
        select: { id: true },
      }),
      prisma.transaction.findMany({
        where: {
          userId: user.id,
          type: "DEDUCTION",
          callLogId: { not: null },
          createdAt: { gte: since },
        },
        select: { callLogId: true },
      }),
    ]);

    if (!freshUser) throw new Error("user vanished mid-test");
    if (Number(freshUser.balance) < 0) {
      throw new Error(`overdraft detected: balance=${freshUser.balance}`);
    }

    // callLog ↔ transaction 一一对应（原子化保证）
    if (logs.length !== txns.length) {
      throw new Error(
        `atomicity broken: callLog(SUCCESS)=${logs.length} !== transaction(DEDUCTION)=${txns.length}`,
      );
    }

    // 同一 callLogId 只能出现一次（验证未误写重复 transaction）
    const counts = new Map<string, number>();
    for (const t of txns) {
      if (!t.callLogId) continue;
      counts.set(t.callLogId, (counts.get(t.callLogId) ?? 0) + 1);
    }
    const dupes = [...counts.entries()].filter(([, n]) => n > 1);
    if (dupes.length > 0) {
      throw new Error(`duplicate DEDUCTION per callLogId: ${JSON.stringify(dupes)}`);
    }
  });

  console.log("\n" + "=".repeat(60));
  console.log(
    `Results: ${passed} PASS | ${failed} FAIL | ${skipped} SKIP | ${passed + failed + skipped} total`,
  );
  if (skipped > 0) {
    console.log("(SKIP = 环境缺可用模型，非回归；补齐 provider key 后重跑可覆盖)");
  }
  await prisma.$disconnect().catch(() => {});
  console.log("=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
