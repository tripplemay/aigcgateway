/**
 * MCP 集成测试 — 全链路验证
 *
 * 用法：BASE_URL=http://localhost:3099 API_KEY=pk_xxx npx tsx scripts/test-mcp.ts
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const API_KEY = process.env.API_KEY ?? "";
const MCP_URL = `${BASE}/mcp`;

let passed = 0;
let failed = 0;
let lastTraceId = "";

async function mcpRequest(method: string, params?: Record<string, unknown>) {
  const body = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params: params ?? {},
  };

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const contentType = res.headers.get("content-type") ?? "";

  // Handle SSE response
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const lines = text.split("\n");
    let lastData = "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        lastData = line.slice(6);
      }
    }
    if (lastData) {
      return JSON.parse(lastData);
    }
    throw new Error("No data in SSE response");
  }

  return res.json();
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const result = await mcpRequest("tools/call", { name, arguments: args });
  if (result.error) {
    throw new Error(`MCP error: ${JSON.stringify(result.error)}`);
  }
  return result.result ?? result;
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
  console.log("AIGC Gateway — MCP Integration Test");
  console.log(`MCP: ${MCP_URL}`);
  console.log(`Key: ${API_KEY.slice(0, 8)}...`);
  console.log("=".repeat(60));

  // 1. Initialize
  await step("1. MCP Initialize", async () => {
    const result = await mcpRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    });
    const serverInfo = result.result?.serverInfo ?? result.serverInfo;
    if (!serverInfo?.name) throw new Error("No serverInfo in response");
    console.log(`(server: ${serverInfo.name} v${serverInfo.version}) `);
  });

  // 2. List Tools
  await step("2. List Tools", async () => {
    const result = await mcpRequest("tools/list");
    const tools = result.result?.tools ?? result.tools ?? [];
    if (tools.length < 7) throw new Error(`Expected >= 7 tools, got ${tools.length}`);
    const names = tools.map((t: { name: string }) => t.name);
    console.log(`(${tools.length} tools: ${names.join(", ")}) `);
  });

  // 3. list_models
  await step("3. list_models", async () => {
    const result = await callTool("list_models");
    const content = result.content?.[0]?.text ?? "";
    const models = JSON.parse(content);
    if (!Array.isArray(models)) throw new Error("Expected array");
    console.log(`(${models.length} models) `);
  });

  // 4. chat
  await step("4. chat (deepseek/v3)", async () => {
    const result = await callTool("chat", {
      model: "deepseek/v3",
      messages: [{ role: "user", content: "Say OK" }],
      max_tokens: 10,
    });
    const content = result.content?.[0]?.text ?? "";
    const data = JSON.parse(content);
    if (!data.traceId) throw new Error("No traceId");
    if (!data.content) throw new Error("No content");
    lastTraceId = data.traceId;
    console.log(`(traceId: ${data.traceId}, tokens: ${data.usage?.totalTokens}) `);
  });

  // 5. list_logs
  await step("5. list_logs (find MCP call)", async () => {
    const result = await callTool("list_logs", { limit: 5 });
    const content = result.content?.[0]?.text ?? "";
    const logs = JSON.parse(content);
    if (!Array.isArray(logs) || logs.length === 0) throw new Error("No logs returned");
    const found = logs.find((l: { traceId: string }) => l.traceId === lastTraceId);
    if (!found) console.log(`(traceId ${lastTraceId} not found yet — may be async) `);
    else console.log(`(found traceId: ${found.traceId}, cost: ${found.cost}) `);
  });

  // 6. get_log_detail
  await step("6. get_log_detail", async () => {
    if (!lastTraceId) throw new Error("No traceId from chat step");
    const result = await callTool("get_log_detail", { trace_id: lastTraceId });
    const content = result.content?.[0]?.text ?? "";
    const detail = JSON.parse(content);
    if (!detail.prompt) throw new Error("No prompt in detail");
    if (!detail.model) throw new Error("No model in detail");
    console.log(`(model: ${detail.model}, status: ${detail.status}) `);
  });

  // 7. get_balance
  await step("7. get_balance", async () => {
    const result = await callTool("get_balance", { include_transactions: true });
    const content = result.content?.[0]?.text ?? "";
    const data = JSON.parse(content);
    if (!data.balance) throw new Error("No balance");
    console.log(`(balance: ${data.balance}, txns: ${data.transactions?.length ?? 0}) `);
  });

  // 8. get_usage_summary
  await step("8. get_usage_summary (7d)", async () => {
    const result = await callTool("get_usage_summary", { period: "7d" });
    const content = result.content?.[0]?.text ?? "";
    const data = JSON.parse(content);
    if (data.totalCalls === undefined) throw new Error("No totalCalls");
    console.log(`(calls: ${data.totalCalls}, cost: ${data.totalCost}) `);
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
