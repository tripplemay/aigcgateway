/**
 * 异常场景测试
 *
 * 用法：BASE_URL=http://localhost:3099 npx tsx scripts/e2e-errors.ts
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
let passed = 0;
let failed = 0;

async function step(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name}... `);
  try { await fn(); console.log("✅ PASS"); passed++; }
  catch (e) { console.log(`❌ FAIL: ${(e as Error).message}`); failed++; }
}

async function main() {
  console.log("=".repeat(60));
  console.log("AIGC Gateway — Error Scenario Tests");
  console.log("=".repeat(60));

  // Setup: register + login + create project + key (balance = 0)
  const email = `err_${Date.now()}@test.com`;
  let token = "";
  let projectId = "";
  let apiKey = "";
  let keyId = "";

  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234" }),
  });
  await reg.json();

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Test1234" }),
  });
  const loginData = await login.json();
  token = loginData.token;

  const projRes = await fetch(`${BASE}/api/projects`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "Error Test Project" }),
  });
  const proj = await projRes.json();
  projectId = proj.id;

  const keyRes = await fetch(`${BASE}/api/projects/${projectId}/keys`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: "err-key" }),
  });
  const keyData = await keyRes.json();
  apiKey = keyData.key;
  keyId = keyData.id;

  // 1. Insufficient balance → 402
  await step("1. Insufficient balance → 402", async () => {
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "deepseek/v3", messages: [{ role: "user", content: "test" }] }),
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
      body: JSON.stringify({ model: "deepseek/v3", messages: [{ role: "user", content: "test" }] }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // 3. Revoked Key → 401
  await step("3. Revoke Key then call → 401", async () => {
    // Revoke
    await fetch(`${BASE}/api/projects/${projectId}/keys/${keyId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    // Try to use revoked key
    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "deepseek/v3", messages: [{ role: "user", content: "test" }] }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // 4. Non-existent model → 404
  await step("4. Non-existent model → 404", async () => {
    // Create a new key since previous one was revoked
    const newKeyRes = await fetch(`${BASE}/api/projects/${projectId}/keys`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "err-key-2" }),
    });
    const newKey = (await newKeyRes.json()).key;

    // Fund the project first
    const orderRes = await fetch(`${BASE}/api/projects/${projectId}/recharge`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: 10, paymentMethod: "alipay" }),
    });
    const orderId = (await orderRes.json()).orderId;
    await fetch(`${BASE}/api/webhooks/alipay`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `out_trade_no=${orderId}&trade_status=TRADE_SUCCESS&total_amount=10`,
    });

    const res = await fetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${newKey}` },
      body: JSON.stringify({ model: "nonexistent/model-999", messages: [{ role: "user", content: "test" }] }),
    });
    if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  });

  // 5. Concurrent deduction — no over-deduct
  await step("5. Concurrent deduction — no over-deduct", async () => {
    // Create fresh project with $0.01 balance
    const projRes2 = await fetch(`${BASE}/api/projects`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "Concurrent Test" }),
    });
    const proj2 = await projRes2.json();
    const keyRes2 = await fetch(`${BASE}/api/projects/${proj2.id}/keys`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: "concurrent" }),
    });
    const key2 = (await keyRes2.json()).key;

    // Fund with $1
    const orderRes2 = await fetch(`${BASE}/api/projects/${proj2.id}/recharge`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: 1, paymentMethod: "alipay" }),
    });
    const orderId2 = (await orderRes2.json()).orderId;
    await fetch(`${BASE}/api/webhooks/alipay`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `out_trade_no=${orderId2}&trade_status=TRADE_SUCCESS&total_amount=1`,
    });

    // 10 concurrent calls
    const calls = Array.from({ length: 10 }, () =>
      fetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key2}` },
        body: JSON.stringify({ model: "deepseek/v3", messages: [{ role: "user", content: "1" }], max_tokens: 1 }),
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

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} PASS | ${failed} FAIL`);
  console.log("=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
