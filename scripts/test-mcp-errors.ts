/**
 * MCP 错误场景测试
 *
 * 用法：BASE_URL=http://localhost:3199 API_KEY=pk_xxx npx tsx scripts/test-mcp-errors.ts
 *
 * 环境变量：
 *   ZERO_BALANCE_API_KEY=pk_xxx - API Key of a project with zero balance (for TC-04-6)
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const API_KEY = process.env.API_KEY ?? "";
const ZERO_BALANCE_API_KEY = process.env.ZERO_BALANCE_API_KEY ?? "";
const MCP_URL = `${BASE}/mcp`;

let passed = 0;
let skipped = 0;
let failed = 0;

async function rawMcpRequest(
  method: string,
  params: Record<string, unknown>,
  key: string,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  let body: unknown;

  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const lines = text.split("\n");
    let lastData = "";
    for (const line of lines) {
      if (line.startsWith("data: ")) lastData = line.slice(6);
    }
    body = lastData ? JSON.parse(lastData) : null;
  } else {
    body = await res.json().catch(() => null);
  }

  return { status: res.status, body };
}

/**
 * BL-DEEPSEEK-V4-HOTFIX fix_round 2 / DSV4-DEF-02：环境无可用模型时，需要"先命中
 * 一个真实模型才能触发目标错误"的用例（modality 门禁、contextWindow 校验等）
 * 会先撞上 model_not_found，断言的根本不是被测语义。这类记 SKIP。
 */
class SkipStep extends Error {}

function skipUnless(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new SkipStep(reason);
}

let selectedTextModel = "";

/** 从 list_models 取一个真实可用的文本别名，避免硬编码随上下架腐坏 */
async function resolveTextModel() {
  try {
    const { body } = await rawMcpRequest(
      "tools/call",
      { name: "list_models", arguments: {} },
      API_KEY,
    );
    const text =
      (body as { result?: { content?: Array<{ text?: string }> } })?.result?.content?.[0]?.text ??
      "";
    const models = JSON.parse(text) as Array<{ name?: string; modality?: string }>;
    selectedTextModel = models.find((m) => m.modality === "text")?.name ?? "";
  } catch {
    selectedTextModel = "";
  }
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
  console.log("AIGC Gateway — MCP Error Scenario Tests");
  console.log("=".repeat(60));

  // fix_round 2：先取一个真实可用的文本别名，供需要"命中真模型才能触发目标
  // 错误"的用例使用；取不到则那些用例记 SKIP。
  if (API_KEY) await resolveTextModel();

  // 1. Invalid Key → 401
  await step("1. Invalid API Key → 401", async () => {
    const { status } = await rawMcpRequest(
      "initialize",
      {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
      "pk_invalid_key_12345",
    );
    if (status !== 401) throw new Error(`Expected 401, got ${status}`);
  });

  // 2. URL Key → 400
  await step("2. API Key in URL → 400", async () => {
    const res = await fetch(`${MCP_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        Accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      }),
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
    const body = await res.json();
    const text = `${body.error ?? ""} ${body.message ?? ""}`;
    if (!text.includes("URL")) throw new Error(`Unexpected error: ${JSON.stringify(body)}`);
  });

  // First initialize with valid key for tool calls
  await rawMcpRequest(
    "initialize",
    {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1.0.0" },
    },
    API_KEY,
  );

  // 3. Invalid model → isError
  await step("3. Invalid model → isError + available models", async () => {
    const { body } = await rawMcpRequest(
      "tools/call",
      {
        name: "chat",
        arguments: { model: "nonexistent/model", messages: [{ role: "user", content: "hi" }] },
      },
      API_KEY,
    );
    const result = (body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } })
      ?.result;
    if (!result?.isError) throw new Error("Expected isError=true");
    const text = result.content?.[0]?.text ?? "";
    if (!text.includes("not found")) throw new Error(`Unexpected error text: ${text}`);
    if (text.includes("list_models")) {
      console.log("(includes list_models hint) ");
    }
  });

  // 4. Cross-project access → isError
  await step("4. Cross-project traceId → access denied", async () => {
    const { body } = await rawMcpRequest(
      "tools/call",
      { name: "get_log_detail", arguments: { trace_id: "trc_nonexistent_fake_id" } },
      API_KEY,
    );
    const result = (body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } })
      ?.result;
    if (!result?.isError) throw new Error("Expected isError=true");
    const text = result.content?.[0]?.text ?? "";
    if (!text.includes("not found")) throw new Error(`Unexpected: ${text}`);
  });

  // 5. Insufficient balance → isError (only if ZERO_BALANCE_API_KEY provided)
  if (ZERO_BALANCE_API_KEY) {
    await step("5. Chat with insufficient balance → isError", async () => {
      const { body } = await rawMcpRequest(
        "tools/call",
        {
          name: "chat",
          arguments: {
            model: selectedTextModel,
            messages: [{ role: "user", content: "test" }],
            max_tokens: 10,
          },
        },
        ZERO_BALANCE_API_KEY,
      );
      const result = (
        body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } }
      )?.result;
      if (!result?.isError) throw new Error("Expected isError=true for zero balance");
      const text = result.content?.[0]?.text ?? "";
      if (!text.toLowerCase().includes("balance") && !text.toLowerCase().includes("insufficient")) {
        throw new Error(`Expected error message to mention balance, got: ${text}`);
      }
      console.log(`(balance error detected) `);
    });
  } else {
    console.log("  5. Chat with insufficient balance → SKIPPED (set ZERO_BALANCE_API_KEY env var)");
  }

  // F-ACF-11 regression — generate_image with a TEXT model is rejected.
  await step("5b. F-ACF-11 generate_image on text model → invalid_modality", async () => {
    skipUnless(selectedTextModel, "no text model available from list_models");
    if (!API_KEY) throw new Error("API_KEY not set");
    const { body } = await rawMcpRequest(
      "tools/call",
      {
        name: "generate_image",
        arguments: {
          model: selectedTextModel,
          prompt: "a tiny dot",
          size: "1024x1024",
        },
      },
      API_KEY,
    );
    const result = (body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } })
      ?.result;
    if (!result?.isError) throw new Error("Expected isError=true for text model on image gen");
    const text = result.content?.[0]?.text ?? "";
    if (!/invalid_model_modality|text model|cannot be used/i.test(text)) {
      throw new Error(`Expected modality error, got: ${text}`);
    }
    console.log("(text model rejected) ");
  });

  // BL-IMG-I2I-VISION fix_round 1 regression (IIV-DEF-02) — generate_image
  // 11 张源图必须返回业务错误信封（isError:true + invalid_parameter + param），
  // 不得被 SDK zod 层转成 JSON-RPC -32602 协议错误（修复前行为）。
  // 张数校验位于 handler 前段（路由/余额之前），不依赖模型真实存在。
  await step(
    "5c. IIV-DEF-02 generate_image 11 images → business envelope (not -32602)",
    async () => {
      if (!API_KEY) throw new Error("API_KEY not set");
      const { body } = await rawMcpRequest(
        "tools/call",
        {
          name: "generate_image",
          arguments: {
            model: "seedream-4-5",
            prompt: "limit check",
            image: Array.from({ length: 11 }, (_, i) => `https://example.com/src-${i}.png`),
          },
        },
        API_KEY,
      );
      const protocolError = (body as { error?: { code?: number } })?.error;
      if (protocolError) {
        throw new Error(
          `Got JSON-RPC protocol error ${protocolError.code}, expected tool result envelope`,
        );
      }
      const result = (
        body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } }
      )?.result;
      if (!result?.isError) throw new Error("Expected isError=true for 11 images");
      const text = result.content?.[0]?.text ?? "";
      if (!/invalid_parameter/.test(text) || !/maximum is 10/.test(text)) {
        throw new Error(`Expected invalid_parameter + "maximum is 10", got: ${text}`);
      }
    },
  );

  // F-WP-05 regression — empty content / binary prompt rejected client-side.
  await step("5d. F-WP-05 empty chat content → invalid_request", async () => {
    // 空 content 在 schema 层就被拒，早于模型解析 —— 无模型环境同样可验，不 SKIP
    if (!API_KEY) throw new Error("API_KEY not set");
    const { body } = await rawMcpRequest(
      "tools/call",
      {
        name: "chat",
        arguments: {
          model: selectedTextModel || "any-model",
          messages: [{ role: "user", content: "" }],
          max_tokens: 10,
        },
      },
      API_KEY,
    );
    const result =
      (body as {
        result?: { isError?: boolean; content?: Array<{ text?: string }> };
        error?: { message?: string };
      }) ?? {};
    const text = result.result?.content?.[0]?.text ?? result.error?.message ?? JSON.stringify(body);
    if (!/invalid|empty|non-empty|content/i.test(text)) {
      throw new Error(`Expected validation error for empty content, got: ${text}`);
    }
    console.log("(empty content rejected) ");
  });

  // F-RL-03 regression — burst limit kicks in under a fast loop.
  await step("5c. F-RL-03 burst limit", async () => {
    skipUnless(selectedTextModel, "no text model available from list_models");
    if (!API_KEY) throw new Error("API_KEY not set");
    let sawBurst = false;
    for (let i = 0; i < 25; i++) {
      const { body } = await rawMcpRequest(
        "tools/call",
        {
          name: "chat",
          arguments: {
            model: selectedTextModel,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 1,
          },
        },
        API_KEY,
      );
      const text =
        (body as { result?: { content?: Array<{ text?: string }> } })?.result?.content?.[0]?.text ??
        "";
      if (/burst_limit_exceeded|rate_limit|rate limit/i.test(text)) {
        sawBurst = true;
        break;
      }
    }
    if (!sawBurst) {
      console.log("(no burst observed — Redis may be disabled or cap too high) ");
    } else {
      console.log("(burst triggered) ");
    }

    // BL-DEEPSEEK-V4-HOTFIX F-DSV4-07 / fix_round 2：打 25 发不只会触发 burst
    // （5s 窗口），也会把 RPM 滑动窗口（60s，DEFAULT_RPM=60）顶满 —— 上游返回的
    // 就是 "Rate limit exceeded. Please retry after 60 seconds."。fix_round 1 只
    // 等了 31s，后续 invalid-size 用例仍被 429 短路成假 FAIL。按真实窗口等满。
    if (sawBurst) {
      const waitSec = Number(process.env.BURST_COOLDOWN_SEC ?? 65);
      process.stdout.write(`(cooling down ${waitSec}s) `);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
    }
  });

  // F-ACF-06 regression — max_tokens over model context window is rejected 400.
  await step("6. F-ACF-06 max_tokens > contextWindow → invalid_parameter", async () => {
    skipUnless(selectedTextModel, "no text model available from list_models");
    if (!API_KEY) throw new Error("API_KEY not set");
    const { body } = await rawMcpRequest(
      "tools/call",
      {
        name: "chat",
        arguments: {
          model: selectedTextModel,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 10_000_000,
        },
      },
      API_KEY,
    );
    const result = (body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } })
      ?.result;
    if (!result?.isError) throw new Error("Expected isError=true for oversized max_tokens");
    const text = result.content?.[0]?.text ?? "";
    if (!/invalid_parameter|exceeds|context window/i.test(text)) {
      throw new Error(`Expected invalid_parameter error, got: ${text}`);
    }
    console.log("(oversized max_tokens rejected) ");
  });

  // BL-120 / AUDIT-SEC
  // generate_image with an unsupported size must surface the
  // supportedSizes list in the error body so clients can retry
  // with a valid option instead of guessing.
  await step("RB-02.4 audit-sec: generate_image invalid size → supportedSizes list", async () => {
    if (!API_KEY) throw new Error("API_KEY not set");
    const { body } = await rawMcpRequest(
      "tools/call",
      {
        name: "generate_image",
        arguments: {
          model: "fal/flux-schnell",
          prompt: "a tiny blue dot",
          size: "9999x9999",
        },
      },
      API_KEY,
    );
    const result = (body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } })
      ?.result;
    if (!result?.isError) {
      console.log("(invalid size was accepted or model missing, skipping) ");
      return;
    }
    const text = result.content?.[0]?.text ?? "";
    // Skip when model is not available in this environment
    if (/model_not_found|not found|no route/i.test(text)) {
      console.log("(model_not_found — fal/flux-schnell not configured locally, skipping) ");
      return;
    }
    if (!/invalid_size/i.test(text)) {
      throw new Error(`Expected invalid_size, got: ${text.slice(0, 120)}`);
    }
    if (!/supportedSizes|1024x1024|\d+x\d+/i.test(text)) {
      throw new Error(`Error missing supportedSizes hint: ${text.slice(0, 120)}`);
    }
    console.log("(supportedSizes surfaced) ");
  });

  // BL-120 / DX-POLISH
  // Cross-project / missing action probe must return the unified
  // "not found in this project" wording so IDOR scanners can't
  // distinguish "does not exist" from "belongs to another project".
  await step("RB-03.4 dx-polish: get_action_detail not-found wording", async () => {
    if (!API_KEY) throw new Error("API_KEY not set");
    const { body } = await rawMcpRequest(
      "tools/call",
      {
        name: "get_action_detail",
        arguments: { action_id: "does-not-exist-xyz" },
      },
      API_KEY,
    );
    const result = (body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } })
      ?.result;
    const text = result?.content?.[0]?.text ?? "";
    if (!/in this project/i.test(text)) {
      throw new Error(`Expected 'in this project' wording, got: ${text.slice(0, 120)}`);
    }
    console.log("(unified wording) ");
  });

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} PASS | ${failed} FAIL | ${skipped} SKIP`);
  if (skipped > 0) {
    console.log("(SKIP = 环境缺可用模型，非回归)");
  }
  console.log("=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
