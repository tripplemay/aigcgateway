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
let imageTraceId = "";
let selectedImageModel = "";

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

  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const lines = text.split("\n");
    let lastData = "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        lastData = line.slice(6);
      }
    }
    if (lastData) return JSON.parse(lastData);
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

function parseTextContent(result: unknown): string {
  const text = (result as { content?: Array<{ text?: string }> })?.content?.[0]?.text ?? "";
  if (!text) throw new Error("No text content in MCP tool result");
  return text;
}

function parseMoney(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "");
    const parsed = Number(cleaned);
    if (!Number.isNaN(parsed)) return parsed;
  }
  throw new Error(`Cannot parse money value: ${String(value)}`);
}

async function getLogDetail(traceId: string) {
  const result = await callTool("get_log_detail", { trace_id: traceId });
  return JSON.parse(parseTextContent(result));
}

async function apiChatCall(model: string, messages: Array<{ role: string; content: string }>) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 10,
    }),
  });

  if (!res.ok) {
    throw new Error(`API chat error ${res.status}: ${await res.text()}`);
  }

  return {
    traceId: res.headers.get("x-trace-id") ?? "",
    body: await res.json(),
  };
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

  await step("2. List Tools", async () => {
    const result = await mcpRequest("tools/list");
    const tools = result.result?.tools ?? result.tools ?? [];
    if (tools.length < 7) throw new Error(`Expected >= 7 tools, got ${tools.length}`);
    const names = tools.map((t: { name: string }) => t.name);
    console.log(`(${tools.length} tools: ${names.join(", ")}) `);
  });

  await step("3. list_models", async () => {
    const result = await callTool("list_models");
    const models = JSON.parse(parseTextContent(result));
    if (!Array.isArray(models)) throw new Error("Expected array");
    const imageModel = models.find((m: { modality?: string; name?: string }) => m.modality === "image");
    selectedImageModel = imageModel?.name ?? "";
    console.log(`(${models.length} models${selectedImageModel ? `, image=${selectedImageModel}` : ""}) `);
  });

  let balanceBefore = 0;
  await step("4. get_balance (before chat)", async () => {
    const result = await callTool("get_balance");
    const data = JSON.parse(parseTextContent(result));
    if (data.balance === undefined) throw new Error("No balance");
    balanceBefore = data.balance;
    console.log(`(balance: ${balanceBefore}) `);
  });

  let mcpTokens = 0;
  await step("5. chat (deepseek/v3, MCP)", async () => {
    const result = await callTool("chat", {
      model: "deepseek/v3",
      messages: [{ role: "user", content: "Say OK" }],
      max_tokens: 10,
    });
    const data = JSON.parse(parseTextContent(result));
    if (!data.traceId) throw new Error("No traceId");
    if (!data.content) throw new Error("No content");
    lastTraceId = data.traceId;
    mcpTokens = data.usage?.totalTokens ?? 0;
    console.log(`(traceId: ${data.traceId}, tokens: ${mcpTokens}) `);
  });

  await step("6. get_balance (after chat)", async () => {
    const result = await callTool("get_balance");
    const data = JSON.parse(parseTextContent(result));
    if (data.balance === undefined) throw new Error("No balance");
    const balanceAfter = data.balance;
    if (balanceAfter >= balanceBefore) {
      throw new Error(`Balance should decrease: before=${balanceBefore}, after=${balanceAfter}`);
    }
    console.log(`(before: ${balanceBefore}, after: ${balanceAfter}) `);
  });

  await step("7. Verify CallLog.source='mcp' (get_log_detail)", async () => {
    await new Promise((r) => setTimeout(r, 500));
    const detail = await getLogDetail(lastTraceId);
    if (detail.source !== "mcp") {
      throw new Error(`Expected source='mcp', got source='${detail.source}'`);
    }
    console.log(`(source: ${detail.source}) `);
  });

  let apiTraceId = "";
  await step("8. chat (deepseek/v3, API) for billing comparison", async () => {
    const response = await apiChatCall("deepseek/v3", [{ role: "user", content: "Say OK" }]);
    if (!response.body.usage) throw new Error("No usage in API response");
    if (!response.traceId) throw new Error("No X-Trace-Id in API response");
    apiTraceId = response.traceId;
    console.log(`(traceId: ${apiTraceId}, tokens: ${response.body.usage.total_tokens}) `);
  });

  await step("9. Verify billing consistency (MCP vs API)", async () => {
    await new Promise((r) => setTimeout(r, 500));
    const mcpDetail = await getLogDetail(lastTraceId);
    const apiDetail = await getLogDetail(apiTraceId);
    const mcpCost = parseMoney(mcpDetail.cost);
    const apiCost = parseMoney(apiDetail.cost);
    if (mcpCost === 0) throw new Error("MCP cost was 0, cannot compare");
    const costDiff = Math.abs(mcpCost - apiCost) / mcpCost;
    if (costDiff > 0.05) {
      throw new Error(
        `Cost diff too high: ${(costDiff * 100).toFixed(2)}%, MCP=${mcpCost}, API=${apiCost}`,
      );
    }
    console.log(`(diff: ${(costDiff * 100).toFixed(2)}%) `);
  });

  await step("10. generate_image (normal call)", async () => {
    if (!selectedImageModel) throw new Error("No image model found from list_models");
    const result = await callTool("generate_image", {
      model: selectedImageModel,
      prompt: "a red circle",
      size: "1024x1024",
    });
    const data = JSON.parse(parseTextContent(result));
    if (!data.images || !Array.isArray(data.images) || data.images.length === 0) {
      throw new Error("No images in response");
    }
    if (!data.traceId) throw new Error("No traceId");
    imageTraceId = data.traceId;
    console.log(`(traceId: ${data.traceId}, model: ${selectedImageModel}, images: ${data.images.length}) `);
  });

  await step("11. Verify CallLog.source='mcp' (generate_image)", async () => {
    await new Promise((r) => setTimeout(r, 500));
    const detail = await getLogDetail(imageTraceId);
    if (detail.source !== "mcp") {
      throw new Error(`Expected source='mcp', got source='${detail.source}'`);
    }
    console.log(`(source: ${detail.source}) `);
  });

  await step("12. generate_image (invalid model error)", async () => {
    const result = await callTool("generate_image", {
      model: "nonexistent/image-model",
      prompt: "a test",
      size: "1024x1024",
    });
    const content = parseTextContent(result);
    if (!result.isError) {
      throw new Error("Expected isError=true for invalid model");
    }
    if (!content.toLowerCase().includes("not found")) {
      throw new Error(`Unexpected error text: ${content}`);
    }
    console.log("(error returned as expected) ");
  });

  await step("13. list_logs (model filter: deepseek/v3)", async () => {
    const result = await callTool("list_logs", { model: "deepseek/v3", limit: 10 });
    const logs = JSON.parse(parseTextContent(result));
    if (!Array.isArray(logs)) throw new Error("Expected array");
    for (const log of logs) {
      if (log.model !== "deepseek/v3") {
        throw new Error(`Expected model='deepseek/v3', got '${log.model}'`);
      }
    }
    console.log(`(${logs.length} logs, all model=deepseek/v3) `);
  });

  await step("14. list_logs (status filter: success)", async () => {
    const result = await callTool("list_logs", { status: "success", limit: 10 });
    const logs = JSON.parse(parseTextContent(result));
    if (!Array.isArray(logs)) throw new Error("Expected array");
    for (const log of logs) {
      if (log.status !== "success") {
        throw new Error(`Expected status='success', got '${log.status}'`);
      }
    }
    console.log(`(${logs.length} logs, all status=success) `);
  });

  await step("15. list_logs (search: 'Say OK')", async () => {
    const result = await callTool("list_logs", { search: "Say OK", limit: 10 });
    const logs = JSON.parse(parseTextContent(result));
    if (!Array.isArray(logs) || logs.length === 0) {
      throw new Error("No logs found with search term 'Say OK'");
    }
    console.log(`(${logs.length} logs found with search) `);
  });

  await step("16. get_log_detail (first chat log)", async () => {
    if (!lastTraceId) throw new Error("No traceId from chat step");
    const detail = await getLogDetail(lastTraceId);
    if (!detail.prompt) throw new Error("No prompt in detail");
    if (!detail.model) throw new Error("No model in detail");
    console.log(`(model: ${detail.model}, status: ${detail.status}) `);
  });

  await step("17. get_usage_summary (7d)", async () => {
    const result = await callTool("get_usage_summary", { period: "7d" });
    const data = JSON.parse(parseTextContent(result));
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
