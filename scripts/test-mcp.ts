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
    const imageModel = models.find(
      (m: { modality?: string; name?: string }) => m.modality === "image",
    );
    selectedImageModel = imageModel?.name ?? "";
    console.log(
      `(${models.length} models${selectedImageModel ? `, image=${selectedImageModel}` : ""}) `,
    );
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
    console.log(
      `(traceId: ${data.traceId}, model: ${selectedImageModel}, images: ${data.images.length}) `,
    );
  });

  await step("11. Verify CallLog.source='mcp' (generate_image)", async () => {
    await new Promise((r) => setTimeout(r, 500));
    const detail = await getLogDetail(imageTraceId);
    if (detail.source !== "mcp") {
      throw new Error(`Expected source='mcp', got source='${detail.source}'`);
    }
    console.log(`(source: ${detail.source}) `);
  });

  // F-ACF-01 regression — zero-image delivery must be status=FILTERED + cost=0.
  // We cannot force an upstream to return empty images in a deterministic way
  // so this step verifies the invariant on any existing log where the invariant
  // would be violated (SUCCESS with sellPrice>0 but images_count=0). If none
  // exist the test passes trivially.
  await step("11b. F-ACF-01 zero-image invariant", async () => {
    const logs = JSON.parse(
      parseTextContent(await callTool("list_logs", { status: "success", limit: 50 })),
    );
    for (const l of logs) {
      const detail = await getLogDetail(l.traceId);
      if (detail.modality !== "IMAGE") continue;
      const images = detail.responseSummary?.images_count;
      if (images === 0 && Number(detail.cost ?? 0) > 0) {
        throw new Error(
          `Invariant violated: traceId=${l.traceId} status=SUCCESS images_count=0 cost=${detail.cost}`,
        );
      }
    }
    console.log("(no zero-image SUCCESS logs with non-zero cost) ");
  });

  // F-ACF-02 regression — any alias the router refuses to serve must NOT
  // appear in list_models (ghost-model consistency). Conversely every alias
  // returned by list_models must be callable end-to-end.
  await step("11c. F-ACF-02 list_models / chat consistency", async () => {
    const models = JSON.parse(parseTextContent(await callTool("list_models", {})));
    const textAliases = (Array.isArray(models) ? models : (models.data ?? []))
      .filter((m: { modality?: string }) => m.modality === "text" || m.modality === "TEXT")
      .slice(0, 3);
    for (const m of textAliases) {
      const alias = m.id ?? m.alias ?? m.name;
      if (!alias) continue;
      const res = await callTool("chat", {
        model: alias,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      });
      const content = parseTextContent(res);
      if (res.isError && /CHANNEL_UNAVAILABLE|not available/i.test(content)) {
        throw new Error(
          `Ghost model leak: alias ${alias} is in list_models but router refuses it: ${content}`,
        );
      }
    }
    console.log(`(${textAliases.length} sampled aliases routable) `);
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

  // F-ACF-04 regression — full create_action → v2 → activate(v1) → run_template cycle.
  // Verifies run_template's `steps[].input` reflects the ACTIVE version, not the latest.
  await step("16b. F-ACF-04 run_template active version cycle", async () => {
    const created = JSON.parse(
      parseTextContent(
        await callTool("create_action", {
          name: `F-ACF-04-${Date.now()}`,
          description: "regression",
          model: selectedTextModel ?? "deepseek-v3",
          messages: [{ role: "user", content: "V1_MARKER say hi" }],
        }),
      ),
    );
    const actionId: string = created.id ?? created.action?.id;
    if (!actionId) {
      console.log("(create_action not supported, skipping) ");
      return;
    }
    const v2 = JSON.parse(
      parseTextContent(
        await callTool("create_action_version", {
          action_id: actionId,
          messages: [{ role: "user", content: "V2_MARKER say hi" }],
        }),
      ),
    );
    const v1Id: string | undefined = created.activeVersionId ?? created.active_version_id;
    if (!v1Id) {
      console.log("(no v1 id, skipping activate) ");
      return;
    }
    await callTool("activate_version", { version_id: v1Id });
    const tpl = JSON.parse(
      parseTextContent(
        await callTool("create_template", {
          name: `tpl-f-acf-04-${Date.now()}`,
          steps: [{ order: 1, actionId, role: "SEQUENTIAL" }],
        }),
      ),
    );
    const tplId: string = tpl.id ?? tpl.template?.id;
    if (!tplId) {
      console.log("(create_template not supported, skipping) ");
      return;
    }
    const runRes = await callTool("run_template", { template_id: tplId });
    const run = JSON.parse(parseTextContent(runRes));
    const input = JSON.stringify(run.steps?.[0]?.input ?? "");
    if (!input.includes("V1_MARKER")) {
      throw new Error(`run_template used wrong version. input=${input}`);
    }
    console.log(`(active v1 prompt honored; v2 id=${v2.id ?? "n/a"}) `);
  });

  // F-ACF-07 regression — returned image URLs must be proxy URLs, never upstream hosts.
  await step("16c. F-ACF-07 image URLs are proxied", async () => {
    if (!selectedImageModel) {
      console.log("(no image model, skipping) ");
      return;
    }
    const res = await callTool("generate_image", {
      model: selectedImageModel,
      prompt: "a tiny red dot",
      size: "1024x1024",
    });
    const data = JSON.parse(parseTextContent(res));
    const urls: string[] = data.images ?? [];
    for (const u of urls) {
      if (/bizyair|aliyuncs|comfyui|openai\.com|cloudfront|googleapis/i.test(u)) {
        throw new Error(`Upstream host leaked in image URL: ${u}`);
      }
      if (!/\/v1\/images\/proxy\//.test(u)) {
        throw new Error(`Image URL not routed through proxy: ${u}`);
      }
    }
    console.log(`(${urls.length} proxied image URLs) `);
  });

  // F-ACF-09 regression — XSS in requestParams.prompt must be escaped on read.
  await step("16d. F-ACF-09 XSS recursive escape", async () => {
    if (!selectedImageModel) {
      console.log("(no image model, skipping) ");
      return;
    }
    const payload = "<img src=x onerror=alert(1)>";
    const res = await callTool("generate_image", {
      model: selectedImageModel,
      prompt: payload,
      size: "1024x1024",
    });
    const gen = JSON.parse(parseTextContent(res));
    const traceId = gen.traceId;
    if (!traceId) throw new Error("No traceId from generate_image");
    await new Promise((r) => setTimeout(r, 500));
    const detail = await getLogDetail(traceId);
    const serialized = JSON.stringify(detail.parameters);
    if (serialized.includes("<img") || serialized.includes("onerror")) {
      throw new Error(`XSS payload not escaped in parameters: ${serialized}`);
    }
    if (!serialized.includes("&lt;img")) {
      throw new Error(`Expected escaped &lt;img, got: ${serialized}`);
    }
    console.log("(XSS payload escaped) ");
  });

  // F-AF-02 regression — reasoning models must surface reasoning_tokens
  // through get_log_detail.usage and list_logs entries.
  await step("16f. F-AF-02 reasoning_tokens roundtrip", async () => {
    const listRes = await callTool("list_models");
    const models: Array<{ name?: string; capabilities?: Record<string, unknown> }> = JSON.parse(
      parseTextContent(listRes),
    );
    const reasoningModel = models.find(
      (m) =>
        typeof m.name === "string" &&
        (m.name.includes("r1") ||
          m.name.includes("reason") ||
          m.name.includes("thinking") ||
          m.name.includes("o1") ||
          m.name.includes("o3")),
    );
    if (!reasoningModel?.name) {
      console.log("(no reasoning model available, skipping) ");
      return;
    }
    const chatRes = await callTool("chat", {
      model: reasoningModel.name,
      messages: [{ role: "user", content: "Solve 17 * 23 and reply with only the number." }],
      max_tokens: 64,
    });
    const chat = JSON.parse(parseTextContent(chatRes));
    if (!chat.traceId) throw new Error("No traceId from reasoning chat");
    const chatReasoning = chat.usage?.reasoningTokens ?? chat.usage?.reasoning_tokens;
    if (typeof chatReasoning !== "number" || chatReasoning <= 0) {
      console.log("(model returned no reasoning_tokens, skipping) ");
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
    const detail = await getLogDetail(chat.traceId);
    if (detail.usage?.reasoningTokens !== chatReasoning) {
      throw new Error(
        `get_log_detail.usage.reasoningTokens mismatch: chat=${chatReasoning}, log=${detail.usage?.reasoningTokens}`,
      );
    }
    console.log(`(reasoningTokens: ${chatReasoning}) `);
  });

  // F-AF-03 regression — MCP DX three-in-one improvements.
  await step("16g. F-AF-03 get_project_info exposes apiBaseUrl", async () => {
    const res = await callTool("get_project_info");
    const info = JSON.parse(parseTextContent(res));
    if (!info.apiBaseUrl || typeof info.apiBaseUrl !== "string") {
      throw new Error(`apiBaseUrl missing: ${JSON.stringify(info)}`);
    }
    if (!/\/v1$/.test(info.apiBaseUrl)) {
      throw new Error(`apiBaseUrl should end with /v1, got ${info.apiBaseUrl}`);
    }
    console.log(`(apiBaseUrl: ${info.apiBaseUrl}) `);
  });

  await step("16h. F-AF-03 chat messages-as-string tolerated or friendly error", async () => {
    try {
      const res = await callTool("chat", {
        model: "deepseek/v3",
        messages: '[{"role":"user","content":"Say OK"}]' as unknown as object,
        max_tokens: 5,
      });
      const text = parseTextContent(res);
      // success path — JSON.parse coerced the string to a valid messages array.
      if (!text) throw new Error("empty chat response");
      console.log("(string JSON parsed into messages) ");
    } catch (e) {
      const msg = (e as Error).message;
      if (/Expected array, received string/.test(msg)) {
        throw new Error(`raw Zod error leaked: ${msg}`);
      }
      if (!/messages must be an array/.test(msg)) {
        throw new Error(`unexpected error: ${msg}`);
      }
      console.log("(friendly error surfaced) ");
    }
  });

  await step("16i. F-AF-03 list_logs since filter", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await callTool("list_logs", { since: future, limit: 10 });
    const text = parseTextContent(res);
    const parsed = JSON.parse(text);
    const results = Array.isArray(parsed) ? parsed : parsed.results;
    if (!Array.isArray(results) || results.length !== 0) {
      throw new Error(`Expected 0 logs with since in future, got ${JSON.stringify(results)}`);
    }
    console.log("(future since returned 0 rows) ");
  });

  // F-ACF-12 regression — IDOR-safe not-found message for cross-project probes.
  await step("16e. F-ACF-12 unified not-found message", async () => {
    const res = await callTool("get_log_detail", { trace_id: "does-not-exist-xyz" });
    const text = parseTextContent(res);
    if (!/not found in this project/i.test(text)) {
      throw new Error(`Unexpected not-found text: ${text}`);
    }
    console.log("(unified wording) ");
  });

  // ============================================================
  // REGRESSION-BACKFILL — F-RB-01 BILLING-REFACTOR
  // ============================================================

  // BL-120 / BILLING-REFACTOR
  // Asserts the deducted chat cost equals what list_models says the
  // alias should cost, given the reported token usage. Catches
  // silent pricing drift between the cost calculator and the
  // pricing field exposed to customers.
  await step("RB-01.1 billing: list_models pricing = deducted amount", async () => {
    const models = JSON.parse(parseTextContent(await callTool("list_models")));
    const alias = (models as Array<Record<string, unknown>>).find((m) => m.name === "deepseek/v3");
    if (!alias) {
      console.log("(deepseek/v3 alias missing, skipping) ");
      return;
    }
    const pricing = alias.pricing as Record<string, unknown>;
    const inputPerM = Number(pricing.inputPerMillion ?? 0);
    const outputPerM = Number(pricing.outputPerMillion ?? 0);
    const chatRes = JSON.parse(
      parseTextContent(
        await callTool("chat", {
          model: "deepseek/v3",
          messages: [{ role: "user", content: "Say OK" }],
          max_tokens: 5,
        }),
      ),
    );
    if (!chatRes.traceId) throw new Error("No traceId from RB billing chat");
    await new Promise((r) => setTimeout(r, 500));
    const detail = await getLogDetail(chatRes.traceId);
    const prompt = Number(detail.usage?.promptTokens ?? 0);
    const completion = Number(detail.usage?.completionTokens ?? 0);
    const expected = (prompt * inputPerM + completion * outputPerM) / 1_000_000;
    const actual = parseMoney(detail.cost);
    if (Math.abs(expected - actual) > 0.00000001) {
      throw new Error(
        `billing drift: list_models=${expected}, deducted=${actual}, tokens=${prompt}/${completion}`,
      );
    }
    console.log(`(expected=${expected}, actual=${actual}) `);
  });

  // BL-120 / BILLING-REFACTOR
  // Asserts image generation cost exactly matches the alias perCall
  // price exposed via list_models — no rounding or exchange-rate
  // surprises between the cost calculator and the customer-facing
  // catalogue.
  await step("RB-01.2 billing: image generate cost = alias perCall", async () => {
    if (!selectedImageModel) {
      console.log("(no image alias, skipping) ");
      return;
    }
    const models = JSON.parse(parseTextContent(await callTool("list_models")));
    const imageAlias = (models as Array<Record<string, unknown>>).find(
      (m) => m.name === selectedImageModel,
    );
    const expected = Number((imageAlias?.pricing as Record<string, unknown>)?.perCall ?? 0);
    if (!Number.isFinite(expected) || expected <= 0) {
      console.log("(image alias has no perCall price, skipping) ");
      return;
    }
    const imgRes = JSON.parse(
      parseTextContent(
        await callTool("generate_image", {
          model: selectedImageModel,
          prompt: "a tiny blue dot",
          size: "1024x1024",
        }),
      ),
    );
    if (!imgRes.traceId) throw new Error("No traceId from image gen");
    await new Promise((r) => setTimeout(r, 500));
    const detail = await getLogDetail(imgRes.traceId);
    const actual = parseMoney(detail.cost);
    if (Math.abs(expected - actual) > 0.00000001) {
      throw new Error(`image billing drift: list_models=${expected}, deducted=${actual}`);
    }
    console.log(`(perCall=${expected}) `);
  });

  // BL-120 / BILLING-REFACTOR
  // Sanity: pricing numbers surfaced to customers must have clean
  // decimal representations (≤ 6 places). Catches float noise leaking
  // from CNY↔USD conversion into the public catalogue.
  await step("RB-01.3 billing: list_models pricing has no float noise", async () => {
    const models = JSON.parse(parseTextContent(await callTool("list_models")));
    for (const m of models as Array<Record<string, unknown>>) {
      const pricing = m.pricing as Record<string, unknown>;
      if (!pricing) continue;
      for (const [key, val] of Object.entries(pricing)) {
        if (typeof val !== "number" || val === 0) continue;
        const decimals = (val.toString().split(".")[1] ?? "").length;
        if (decimals > 6) {
          throw new Error(`float noise in ${m.name}.${key}: ${val} (${decimals} decimals)`);
        }
      }
    }
    console.log("(no float noise) ");
  });

  // ============================================================
  // REGRESSION-BACKFILL — F-RB-02 AUDIT-SEC
  // ============================================================

  // BL-120 / AUDIT-SEC
  // list_models must only surface enabled aliases. Deprecated/
  // disabled ones stay hidden so customers never call into dead
  // channels. A direct DB mutation would be more thorough but is
  // out of scope for this harness — we assert every returned row
  // lacks a truthy `deprecated` flag.
  await step("RB-02.1 audit-sec: list_models excludes deprecated aliases", async () => {
    const models = JSON.parse(parseTextContent(await callTool("list_models")));
    for (const m of models as Array<Record<string, unknown>>) {
      if (m.deprecated) {
        throw new Error(`deprecated alias leaked into list_models: ${m.name}`);
      }
    }
    console.log(`(${(models as unknown[]).length} clean) `);
  });

  // BL-120 / AUDIT-SEC
  // Every IMAGE alias must report a non-empty supportedSizes array so
  // clients can validate size before dispatching. An empty list would
  // force every call through a 400 round trip.
  await step("RB-02.2 audit-sec: image models expose supportedSizes", async () => {
    const models = JSON.parse(parseTextContent(await callTool("list_models")));
    const imageAliases = (models as Array<Record<string, unknown>>).filter(
      (m) => m.modality === "image",
    );
    if (imageAliases.length === 0) {
      console.log("(no image aliases, skipping) ");
      return;
    }
    for (const a of imageAliases) {
      const sizes = a.supportedSizes as unknown;
      if (!Array.isArray(sizes) || sizes.length === 0) {
        throw new Error(`image alias ${a.name} missing supportedSizes`);
      }
    }
    console.log(`(${imageAliases.length} image aliases OK) `);
  });

  // BL-120 / AUDIT-SEC
  // free_only filter must return only aliases whose sellPrice
  // resolves to zero across every pricing field (protects the
  // "Free" shelf from silently showing paid models).
  await step("RB-02.3 audit-sec: free_only returns zero-priced aliases", async () => {
    let models;
    try {
      models = JSON.parse(parseTextContent(await callTool("list_models", { free_only: true })));
    } catch {
      console.log("(free_only param not supported, skipping) ");
      return;
    }
    for (const m of models as Array<Record<string, unknown>>) {
      const pricing = (m.pricing as Record<string, unknown>) ?? {};
      for (const v of Object.values(pricing)) {
        if (typeof v === "number" && v > 0) {
          throw new Error(`free_only leaked priced alias ${m.name}: ${JSON.stringify(pricing)}`);
        }
      }
    }
    console.log(`(${(models as unknown[]).length} free aliases) `);
  });

  // ============================================================
  // REGRESSION-BACKFILL — F-RB-03 DX-POLISH
  // ============================================================

  // BL-120 / DX-POLISH
  // chat tool must refuse image-modality aliases with a clear
  // invalid_model_modality error rather than forwarding an image
  // request to the text pipeline and failing deeper.
  await step("RB-03.1 dx-polish: chat rejects image modality model", async () => {
    if (!selectedImageModel) {
      console.log("(no image alias, skipping) ");
      return;
    }
    try {
      const res = await callTool("chat", {
        model: selectedImageModel,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      });
      const text = parseTextContent(res);
      if (/invalid_model_modality|modality/i.test(text)) {
        console.log("(modality mismatch surfaced) ");
        return;
      }
      throw new Error(`chat(image alias) should fail, got: ${text.slice(0, 120)}`);
    } catch (e) {
      const msg = (e as Error).message;
      if (/modality|invalid_model/i.test(msg)) {
        console.log("(modality mismatch error) ");
        return;
      }
      throw e;
    }
  });

  // BL-120 / DX-POLISH
  // capability=vision filter must only surface text-modality models —
  // "vision" here means "text model that can read images", not IMAGE
  // generation models.
  await step("RB-03.2 dx-polish: capability=vision returns only text models", async () => {
    let models;
    try {
      models = JSON.parse(
        parseTextContent(await callTool("list_models", { capability: "vision" })),
      );
    } catch {
      console.log("(capability filter not supported, skipping) ");
      return;
    }
    for (const m of models as Array<Record<string, unknown>>) {
      if (m.modality !== "text") {
        throw new Error(`vision filter leaked non-text: ${m.name} (${m.modality})`);
      }
    }
    console.log(`(${(models as unknown[]).length} text-with-vision) `);
  });

  // BL-120 / DX-POLISH
  // json_mode response must survive JSON.parse and carry no leading
  // ```json fence — the response post-processor should strip it.
  await step("RB-03.3 dx-polish: json_mode strips markdown fence", async () => {
    const res = await callTool("chat", {
      model: "deepseek/v3",
      messages: [{ role: "user", content: 'Respond with JSON {"ok":true}. Do not add any prose.' }],
      response_format: { type: "json_object" },
      max_tokens: 32,
    });
    const data = JSON.parse(parseTextContent(res));
    const content = data.content ?? "";
    if (/^```/m.test(content)) {
      throw new Error(`markdown fence leaked into json_mode content: ${content.slice(0, 80)}`);
    }
    try {
      JSON.parse(content);
    } catch {
      throw new Error(`json_mode content is not valid JSON: ${content.slice(0, 80)}`);
    }
    console.log("(clean JSON) ");
  });

  await step("17. get_usage_summary (7d)", async () => {
    const result = await callTool("get_usage_summary", { period: "7d" });
    const data = JSON.parse(parseTextContent(result));
    if (data.totalCalls === undefined) throw new Error("No totalCalls");
    console.log(`(calls: ${data.totalCalls}, cost: ${data.totalCost}) `);
  });

  // 18. F-AF2-02 regression — list_logs supports status=timeout filter
  await step("18. F-AF2-02 list_logs timeout filter via MCP", async () => {
    const result = await callTool("list_logs", { status: "timeout", limit: 1 });
    const text = parseTextContent(result);
    // Should not throw a validation error — "timeout" is a valid status
    if (text.includes("invalid_enum_value") || text.includes("Invalid enum value")) {
      throw new Error("list_logs rejected 'timeout' as status value");
    }
  });

  // 19. F-AF2-04 regression — non-reasoning model logs must not expose reasoningTokens
  await step("19. F-AF2-04 reasoningTokens filtered for non-reasoning models", async () => {
    // Use the trace from earlier chat call (lastTraceId) — likely a non-reasoning model
    if (!lastTraceId) {
      console.log("(skipped — no prior chat trace) ");
      return;
    }
    const result = await callTool("get_log_detail", { trace_id: lastTraceId });
    const data = JSON.parse(parseTextContent(result));
    // If the model is non-reasoning, reasoningTokens should not appear
    // We can't know for sure which model was used, but if reasoningTokens IS present
    // on a non-reasoning model, that's the bug we're catching
    if (data.usage?.reasoningTokens !== undefined) {
      // Verify it's actually a reasoning model by checking list_models
      const modelsResult = await callTool("list_models", {});
      const models = JSON.parse(parseTextContent(modelsResult));
      const modelInfo = models.find(
        (m: { name: string; reasoning?: boolean }) => m.name === data.model,
      );
      if (modelInfo && !modelInfo.reasoning) {
        throw new Error(
          `Non-reasoning model ${data.model} exposed reasoningTokens=${data.usage.reasoningTokens}`,
        );
      }
    }
  });

  // 20. F-AF2-05 regression — get_log_detail must not HTML-encode response strings
  await step("20. F-AF2-05 no HTML entity encoding in get_log_detail", async () => {
    if (!lastTraceId) {
      console.log("(skipped — no prior chat trace) ");
      return;
    }
    const result = await callTool("get_log_detail", { trace_id: lastTraceId });
    const text = parseTextContent(result);
    // Check that common HTML entities are NOT present in the raw JSON
    if (text.includes("&#x27;") || text.includes("&amp;") || text.includes("&lt;")) {
      throw new Error("get_log_detail contains HTML entity encoding in response");
    }
  });

  // 21. F-AF2-06 regression — run_action usage must use snake_case matching run_template
  await step("21. F-AF2-06 run_action usage format alignment", async () => {
    // Create a quick action and run it
    const created = JSON.parse(
      parseTextContent(
        await callTool("create_action", {
          name: `F-AF2-06-${Date.now()}`,
          description: "usage format test",
          model: selectedTextModel ?? "gpt-4o-mini",
          messages: [{ role: "user", content: "say ok" }],
        }),
      ),
    );
    const actionId: string = created.id ?? created.action?.id;
    if (!actionId) {
      console.log("(create_action unavailable, skipping) ");
      return;
    }
    const runRes = await callTool("run_action", { action_id: actionId });
    const data = JSON.parse(parseTextContent(runRes));
    if (!data.usage) throw new Error("run_action missing usage");
    // Must use snake_case keys matching run_template
    if (data.usage.prompt_tokens === undefined) {
      throw new Error("run_action usage missing prompt_tokens (snake_case)");
    }
    if (data.usage.output_tokens === undefined) {
      throw new Error("run_action usage missing output_tokens (snake_case)");
    }
    if (data.usage.total_tokens === undefined) {
      throw new Error("run_action usage missing total_tokens (snake_case)");
    }
    // Must NOT use old camelCase format
    if (data.usage.promptTokens !== undefined) {
      throw new Error("run_action usage still uses camelCase promptTokens");
    }
  });

  // 22. F-AF2-07 regression — update_action model change auto-creates version
  await step("22. F-AF2-07 update_action model change → new version", async () => {
    // Create a fresh action
    const created = JSON.parse(
      parseTextContent(
        await callTool("create_action", {
          name: `F-AF2-07-${Date.now()}`,
          description: "version test",
          model: selectedTextModel ?? "gpt-4o-mini",
          messages: [{ role: "user", content: "say ok" }],
        }),
      ),
    );
    const actionId: string = created.id ?? created.action?.id;
    if (!actionId) {
      console.log("(create_action unavailable, skipping) ");
      return;
    }
    // Update model → should auto-create a new version
    const updateRes = await callTool("update_action", {
      action_id: actionId,
      model: "deepseek-v3",
    });
    const updateData = JSON.parse(parseTextContent(updateRes));
    if (!updateData.version_id) {
      throw new Error("update_action model change did not create new version");
    }
    if (!updateData.message.includes("version")) {
      throw new Error(`Expected version creation message, got: ${updateData.message}`);
    }
    // Update name only → should NOT create a new version
    const nameRes = await callTool("update_action", {
      action_id: actionId,
      name: "renamed",
    });
    const nameData = JSON.parse(parseTextContent(nameRes));
    if (nameData.version_id) {
      throw new Error("Name-only update should not create a version");
    }
  });

  // 23. F-AF2-08 regression — public template detail must not expose actionId
  await step("23. F-AF2-08 public template actionId redacted", async () => {
    const listRes = await callTool("list_public_templates", {});
    const templates = JSON.parse(parseTextContent(listRes));
    if (!Array.isArray(templates) || templates.length === 0) {
      console.log("(no public templates, skipping) ");
      return;
    }
    const tplId = templates[0].id;
    const detailRes = await callTool("get_template_detail", { template_id: tplId });
    const detail = JSON.parse(parseTextContent(detailRes));
    if (!detail.isPublicPreview) {
      console.log("(template is owned, not public preview — skipping) ");
      return;
    }
    for (const step of detail.steps ?? []) {
      if (step.actionId && step.actionId !== "(public-preview)") {
        throw new Error(`Public preview leaks actionId: ${step.actionId}`);
      }
      if (step.activeVersionId) {
        throw new Error(`Public preview leaks activeVersionId: ${step.activeVersionId}`);
      }
    }
  });

  // 24. F-AF2-09 regression — chat response must include cost field
  await step("24. F-AF2-09 chat response includes cost", async () => {
    const result = await callTool("chat", {
      model: selectedTextModel ?? "gpt-4o-mini",
      messages: [{ role: "user", content: "say ok" }],
    });
    const data = JSON.parse(parseTextContent(result));
    if (!data.cost) throw new Error("chat response missing cost field");
    if (!data.cost.startsWith("$")) throw new Error(`cost format wrong: ${data.cost}`);
  });

  // 25. F-AP-01 regression — get_balance pagination (limit/offset/hasMore)
  await step("25. F-AP-01 get_balance pagination", async () => {
    const result = await callTool("get_balance", {
      include_transactions: true,
      limit: 2,
      offset: 0,
    });
    const data = JSON.parse(parseTextContent(result));
    if (!data.balance) throw new Error("Missing balance");
    if (data.hasMore === undefined) throw new Error("Missing hasMore field");
    if (!Array.isArray(data.transactions)) throw new Error("Missing transactions array");
    if (data.transactions.length > 2) throw new Error("limit=2 returned more than 2");
  });

  // 26. F-AP-02 regression — list_logs accepts action_id/template_id params
  await step("26. F-AP-02 list_logs action_id filter", async () => {
    // Just verify the param is accepted (no validation error)
    const result = await callTool("list_logs", { action_id: "nonexistent", limit: 1 });
    const text = parseTextContent(result);
    if (text.includes("invalid_enum_value") || text.includes("Unrecognized key")) {
      throw new Error("list_logs rejected action_id param");
    }
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
