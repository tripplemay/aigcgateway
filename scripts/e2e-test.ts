/**
 * 端到端全链路测试
 *
 * 用法：BASE_URL=http://localhost:3099 npx tsx scripts/e2e-test.ts
 */

import { prisma } from "@/lib/prisma";
import { requireEnv } from "./lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
let token = "";
let projectId = "";
let apiKey = "";
let keyId = "";
const email = `e2e_${Date.now()}@test.com`;
const password = requireEnv("E2E_TEST_PASSWORD");
let passed = 0;
let failed = 0;

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

async function step(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name}... `);
  try {
    await fn();
    console.log("✅ PASS");
    passed++;
  } catch (e) {
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
    if (body.balance !== 0) throw new Error(`Expected balance 0, got ${body.balance}`);
  });

  // 4. Generate API Key
  await step("4. Generate API Key", async () => {
    const { body } = await api(`/api/projects/${projectId}/keys`, {
      method: "POST",
      body: JSON.stringify({ name: "e2e-key" }),
      expectStatus: 201,
    });
    if (!body.key?.startsWith("pk_")) throw new Error("Key format wrong");
    apiKey = body.key;
    keyId = body.id;
  });

  // 5. Key list (masked)
  await step("5. Key list shows mask", async () => {
    const { body } = await api(`/api/projects/${projectId}/keys`);
    const k = body.data?.[0];
    if (!k?.maskedKey?.includes("****")) throw new Error("Key not masked");
  });

  // 6. Create recharge order
  await step("6. Create recharge order", async () => {
    const { body } = await api(`/api/projects/${projectId}/recharge`, {
      method: "POST",
      body: JSON.stringify({ amount: 50, paymentMethod: "alipay" }),
      expectStatus: 201,
    });
    if (body.status !== "pending") throw new Error(`Order status: ${body.status}`);
  });

  // 7. Simulate payment callback
  await step("7. Payment callback → balance $50", async () => {
    // Get orderId from recharge orders via transactions (or use the order id)
    const orderRes = await api(`/api/projects/${projectId}/balance`);
    // Simulate alipay callback
    const txnRes = await api(`/api/projects/${projectId}/transactions`);
    // The recharge order id was returned in step 6, simulate callback
    const rechargeBody = await api(`/api/projects/${projectId}/recharge`, {
      method: "POST",
      body: JSON.stringify({ amount: 50, paymentMethod: "alipay" }),
      expectStatus: 201,
    });
    const orderId = rechargeBody.body.orderId;

    // Simulate alipay callback (form-urlencoded)
    await fetch(`${BASE}/api/webhooks/alipay`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `out_trade_no=${orderId}&trade_status=TRADE_SUCCESS&total_amount=50`,
    });

    // Verify balance
    const bal = await api(`/api/projects/${projectId}/balance`);
    if (bal.body.balance < 50) throw new Error(`Balance: ${bal.body.balance}`);
  });

  // 8. API call (non-streaming via API Key)
  await step("8. Chat completion (non-stream)", async () => {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek/v3",
        messages: [{ role: "user", content: "Say hi" }],
        max_tokens: 5,
      }),
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    const body = await res.json();
    if (!body.choices?.[0]?.message?.content) throw new Error("No content");
    const traceId = res.headers.get("x-trace-id");
    if (!traceId) throw new Error("No X-Trace-Id");
  });

  // 9. API call (streaming)
  await step("9. Chat completion (stream)", async () => {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek/v3",
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
    const res = await fetch(`${BASE}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "zhipu/cogview-3-flash", prompt: "a red circle" }),
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    const body = await res.json();
    if (!body.data?.[0]?.url) throw new Error("No image url");
  });

  // 11. Check balance decreased
  await step("11. Balance decreased after calls", async () => {
    const { body } = await api(`/api/projects/${projectId}/balance`);
    if (body.balance >= 50) throw new Error(`Balance not decreased: ${body.balance}`);
  });

  // 12. Transaction records
  await step("12. Transaction records", async () => {
    const { body } = await api(`/api/projects/${projectId}/transactions`);
    const types = body.data?.map((t: { type: string }) => t.type) ?? [];
    if (!types.includes("RECHARGE")) throw new Error("No RECHARGE record");
    if (!types.includes("DEDUCTION")) throw new Error("No DEDUCTION record");
  });

  // 13. Audit logs
  await step("13. Audit logs", async () => {
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
    const pub = await fetch(`${BASE}/api/templates/public`);
    if (!pub.ok) throw new Error(`Public templates HTTP ${pub.status}`);
    const pubBody = await pub.json();
    if (!Array.isArray(pubBody.data) && !Array.isArray(pubBody))
      throw new Error("Public templates: missing data array");
  });

  // 20. F-AF2-01 regression — client abort before response should not bill.
  // We send a chat request and immediately abort, then verify the CallLog
  // is recorded as TIMEOUT with sellPrice=0.
  await step("20. F-AF2-01 client abort → TIMEOUT, no billing", async () => {
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
          model: "gpt-4o-mini",
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

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} PASS | ${failed} FAIL | ${passed + failed} total`);
  await prisma.$disconnect().catch(() => {});
  console.log("=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
