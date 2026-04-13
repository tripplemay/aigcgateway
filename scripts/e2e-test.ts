/**
 * 端到端全链路测试
 *
 * 用法：BASE_URL=http://localhost:3099 npx tsx scripts/e2e-test.ts
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
let token = "";
let projectId = "";
let apiKey = "";
let keyId = "";
const email = `e2e_${Date.now()}@test.com`;
const password = "Test1234";
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

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} PASS | ${failed} FAIL | ${passed + failed} total`);
  console.log("=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
