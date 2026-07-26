/**
 * 异常场景测试
 *
 * 用法：BASE_URL=http://localhost:3199 npx tsx scripts/e2e-errors.ts
 */

import { prisma } from "@/lib/prisma";
import { randomBytes } from "node:crypto";
import { sanitizeErrorMessage } from "@/lib/engine/types";
import { requireEnv } from "./lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const E2E_TEST_PASSWORD = requireEnv("E2E_TEST_PASSWORD");
let passed = 0;
let failed = 0;
let skipped = 0;
// BL-DEEPSEEK-V4-HOTFIX F-DSV4-07：原硬编码 "deepseek/v3"（旧 NAME_MAP 产物，
// DeepSeek 直连下线后该名已不存在）。改为运行时从 /v1/models 取实际别名。
let textModel = "";

async function resolveTextModel(apiKey: string) {
  const res = await fetch(`${BASE}/v1/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) return;
  const body = await res.json().catch(() => null);
  const list: Array<{ id?: string; modality?: string }> = body?.data ?? [];
  textModel = list.find((m) => (m.modality ?? "text") === "text")?.id ?? "";
}

/** 环境无可用模型时，需要真实成功调用的用例记 SKIP 而非 FAIL */
class SkipStep extends Error {}

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
  console.log("AIGC Gateway — Error Scenario Tests");
  console.log("=".repeat(60));

  // Setup: register + login + create project + key (balance = 0)
  // BL-SEC-POLISH H-42: fail fast on setup errors. A silent setup failure
  // would cascade into confusing step-level failures downstream.
  const email = `err_${Date.now()}@test.com`;
  let token = "";
  let projectId = "";
  let apiKey = "";
  let keyId = "";

  const fatal = (stage: string, detail: unknown): never => {
    console.error(`[e2e-errors] setup FAILED at ${stage}:`, detail);
    process.exit(1);
  };

  try {
    const reg = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: E2E_TEST_PASSWORD }),
    });
    if (!reg.ok) fatal("register", `HTTP ${reg.status} ${await reg.text()}`);

    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: E2E_TEST_PASSWORD }),
    });
    if (!login.ok) fatal("login", `HTTP ${login.status} ${await login.text()}`);
    const loginData = await login.json();
    token = loginData.token;
    if (!token) fatal("login", "missing token in response");

    const projRes = await fetch(`${BASE}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Error Test Project" }),
    });
    if (!projRes.ok) fatal("create project", `HTTP ${projRes.status} ${await projRes.text()}`);
    const proj = await projRes.json();
    projectId = proj.id;
    if (!projectId) fatal("create project", "missing project id");

    const keyRes = await fetch(`${BASE}/api/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "err-key" }),
    });
    if (!keyRes.ok) fatal("create key", `HTTP ${keyRes.status} ${await keyRes.text()}`);
    const keyData = await keyRes.json();
    apiKey = keyData.key;
    keyId = keyData.id;
    if (!apiKey || !keyId) fatal("create key", "missing key/id in response");
    await resolveTextModel(apiKey);
  } catch (err) {
    fatal("setup", err);
  }

  // 1. Insufficient balance → 402
  await step("1. Insufficient balance → 402", async () => {
    // fix_round 2 / DSV4-DEF-02：余额校验发生在模型解析之后，环境无模型时
    // 会先返回 404 model_not_found，断言的根本不是 402 语义。
    if (!textModel) throw new SkipStep("no text model available from /v1/models");
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: textModel,
        messages: [{ role: "user", content: "test" }],
      }),
    });
    if (res.status !== 402) throw new Error(`Expected 402, got ${res.status}`);
    const body = await res.json();
    if (body.error?.code !== "insufficient_balance") throw new Error(`Code: ${body.error?.code}`);
  });

  // 2. Invalid API Key → 401
  await step("2. Invalid API Key → 401", async () => {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer pk_invalid_key" },
      body: JSON.stringify({
        model: textModel,
        messages: [{ role: "user", content: "test" }],
      }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // 3. Revoked Key → 401
  await step("3. Revoke Key then call → 401", async () => {
    // Revoke
    await fetch(`${BASE}/api/keys/${keyId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    // Try to use revoked key
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: textModel,
        messages: [{ role: "user", content: "test" }],
      }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // 4. Non-existent model → 404
  await step("4. Non-existent model → 404", async () => {
    // Create a new key since previous one was revoked
    const newKeyRes = await fetch(`${BASE}/api/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "err-key-2" }),
    });
    const newKey = (await newKeyRes.json()).key;

    // Fund the project first
    const orderRes = await fetch(`${BASE}/api/projects/${projectId}/recharge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: 10, paymentMethod: "alipay" }),
    });
    const orderId = (await orderRes.json()).orderId;
    await fetch(`${BASE}/api/webhooks/alipay`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `out_trade_no=${orderId}&trade_status=TRADE_SUCCESS&total_amount=10`,
    });

    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${newKey}` },
      body: JSON.stringify({
        model: "nonexistent/model-999",
        messages: [{ role: "user", content: "test" }],
      }),
    });
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  // 5. Concurrent deduction — no over-deduct
  await step("5. Concurrent deduction — no over-deduct", async () => {
    // Create fresh project with $0.01 balance
    const projRes2 = await fetch(`${BASE}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Concurrent Test" }),
    });
    const proj2 = await projRes2.json();
    const keyRes2 = await fetch(`${BASE}/api/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "concurrent" }),
    });
    const key2 = (await keyRes2.json()).key;

    // Fund with $1
    const orderRes2 = await fetch(`${BASE}/api/projects/${proj2.id}/recharge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: 1, paymentMethod: "alipay" }),
    });
    const orderId2 = (await orderRes2.json()).orderId;
    await fetch(`${BASE}/api/webhooks/alipay`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `out_trade_no=${orderId2}&trade_status=TRADE_SUCCESS&total_amount=1`,
    });

    if (!textModel) throw new SkipStep("no text model available from /v1/models");
    // 10 concurrent calls
    const calls = Array.from({ length: 10 }, () =>
      fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key2}` },
        body: JSON.stringify({
          model: textModel,
          messages: [{ role: "user", content: "1" }],
          max_tokens: 1,
        }),
      }).then((r) => r.status),
    );
    const statuses = await Promise.all(calls);
    const successes = statuses.filter((s) => s === 200).length;
    if (successes === 0) throw new Error("All failed");

    // Wait for async deductions to settle
    await new Promise((r) => setTimeout(r, 2000));

    // Verify balance >= 0 (no over-deduct)
    const balRes = await fetch(`${BASE}/api/projects/${proj2.id}/balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const balData = await balRes.json();
    const finalBalance = balData.balance;
    // Allow tiny negative (< $0.01) per design doc, but not significantly negative
    if (finalBalance < -0.01) throw new Error(`Over-deducted! Balance: ${finalBalance}`);
    console.log(`(${successes}/10 succeeded, balance: $${finalBalance}) `);
  });

  // BL-073
  // Register a throwaway account so we can exercise the email-verify
  // error paths without polluting the primary test user.
  const verifyEmail = `ev_${Date.now()}@test.com`;
  await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: verifyEmail, password: E2E_TEST_PASSWORD }),
  });
  const verifyUser = await prisma.user.findUnique({ where: { email: verifyEmail } });

  // BL-073
  // Unknown token must be rejected with invalid_token (400).
  await step("6. BL-073 email-verify: invalid token → 400", async () => {
    const res = await fetch(`${BASE}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not-a-real-token-" + randomBytes(8).toString("hex") }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const body = await res.json();
    if (body.error?.code !== "invalid_token") {
      throw new Error(`code=${body.error?.code}`);
    }
  });

  // BL-073
  // Manually craft an expired row and confirm the handler rejects it
  // with token_expired (covers the guard for stale links that slipped
  // past the UI).
  await step("7. BL-073 email-verify: expired token → 400", async () => {
    if (!verifyUser) throw new Error("verify-test user missing");
    const expired = await prisma.emailVerificationToken.create({
      data: {
        token: `expired_${randomBytes(12).toString("hex")}`,
        userId: verifyUser.id,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const res = await fetch(`${BASE}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: expired.token }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const body = await res.json();
    if (body.error?.code !== "token_expired") {
      throw new Error(`code=${body.error?.code}`);
    }
  });

  // BL-073
  // Verifying the same account twice must be idempotent — a second
  // call returns 200 with an 'already verified' message, not an
  // error. Uses a fresh throwaway user to avoid bleeding into the
  // previous assertions.
  await step("8. BL-073 email-verify: already-verified repeat is idempotent", async () => {
    const email2 = `ev2_${Date.now()}@test.com`;
    await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email2, password: E2E_TEST_PASSWORD }),
    });
    const u = await prisma.user.findUnique({ where: { email: email2 } });
    if (!u) throw new Error("repeat-test user missing");
    const tk = await prisma.emailVerificationToken.findFirst({
      where: { userId: u.id, used: false },
      orderBy: { createdAt: "desc" },
    });
    if (!tk) throw new Error("token missing");

    // First verify — must succeed.
    const first = await fetch(`${BASE}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tk.token }),
    });
    if (first.status !== 200) throw new Error(`first verify status=${first.status}`);

    // Second verify — once the flag is set, the handler short-circuits
    // with "already verified" (200) before re-marking the token used.
    // A brand-new unused token on an already-verified account must
    // therefore still return 200 rather than 400.
    const tk2 = await prisma.emailVerificationToken.create({
      data: {
        token: `idemp_${randomBytes(12).toString("hex")}`,
        userId: u.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const repeat = await fetch(`${BASE}/api/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tk2.token }),
    });
    if (repeat.status !== 200) {
      throw new Error(`repeat verify status=${repeat.status}, expected 200`);
    }
  });

  // F-AF2-03 regression — sanitizeErrorMessage must not leak internal placeholders
  await step("F-AF2-03 sanitize: [infra removed] → user-friendly message", async () => {
    const result = sanitizeErrorMessage("Model error at endpoint us-east-1: connection refused");
    if (result.includes("[infra removed]")) {
      throw new Error(`Placeholder leaked: ${result}`);
    }
    if (!result.includes("list_models")) {
      throw new Error(`Expected user-friendly message with list_models, got: ${result}`);
    }
  });

  await step("F-AF2-03 sanitize: [contact removed] stripped clean", async () => {
    const result = sanitizeErrorMessage("Error occurred. QQ群:836739524 for help.");
    if (result.includes("[contact removed]")) {
      throw new Error(`Placeholder leaked: ${result}`);
    }
    if (result.includes("836739524")) {
      throw new Error(`Contact info leaked: ${result}`);
    }
  });

  await step("F-AF2-03 sanitize: [rid removed] stripped clean", async () => {
    const result = sanitizeErrorMessage("Failed with Request ID: req-abc123def456.");
    if (result.includes("[rid removed]")) {
      throw new Error(`Placeholder leaked: ${result}`);
    }
    if (result.includes("req-abc123def456")) {
      throw new Error(`Request ID leaked: ${result}`);
    }
  });

  await step("F-AF2-03 sanitize: [upstream preview removed] stripped clean", async () => {
    const result = sanitizeErrorMessage("Bad request. Content preview: some data here.");
    if (result.includes("[upstream preview removed]")) {
      throw new Error(`Placeholder leaked: ${result}`);
    }
    if (result.includes("Content preview")) {
      throw new Error(`Preview leaked: ${result}`);
    }
  });

  // BL-IMG-I2I-VISION fix_round 1 regression (IIV-DEF-01) — /v1/images/edits
  // 必须与 generations 同属 image 权限域：imageGeneration=false 的 Key 调用
  // edits 应 403 forbidden（修复前：200 + SUCCESS CallLog + 扣费）。
  await step("IIV-DEF-01 edits with imageGeneration=false key → 403 forbidden", async () => {
    const keyRes = await fetch(`${BASE}/api/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "err-key-no-image" }),
    });
    if (!keyRes.ok) throw new Error(`create key failed: HTTP ${keyRes.status}`);
    const keyData = await keyRes.json();
    const restrictedKey: string = keyData.key;
    if (!restrictedKey || !keyData.id) throw new Error("missing key/id in response");
    // 权限收紧直接走 DB（与控制台建 key 解耦，测试确定性）
    await prisma.apiKey.update({
      where: { id: keyData.id },
      data: { permissions: { imageGeneration: false } },
    });

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5kSuQmCC",
      "base64",
    );
    const form = new FormData();
    form.append("image", new Blob([png], { type: "image/png" }), "t.png");
    form.append("prompt", "permission check");
    form.append("model", "seedream-4-5");
    const res = await fetch(`${BASE}/v1/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${restrictedKey}` },
      body: form,
    });
    if (res.status !== 403) throw new Error(`Expected 403, got ${res.status}`);
    const body = await res.json();
    if (body.error?.code !== "forbidden") throw new Error(`Code: ${body.error?.code}`);
    if (!/imageGeneration/.test(body.error?.message ?? "")) {
      throw new Error(`Message: ${body.error?.message}`);
    }
  });

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} PASS | ${failed} FAIL | ${skipped} SKIP`);
  if (skipped > 0) {
    console.log("(SKIP = 环境缺可用模型，非回归)");
  }
  console.log("=".repeat(60));
  await prisma.$disconnect().catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
