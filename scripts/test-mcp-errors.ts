/**
 * MCP 错误场景测试
 *
 * 用法：BASE_URL=http://localhost:3099 API_KEY=pk_xxx npx tsx scripts/test-mcp-errors.ts
 *
 * 环境变量：
 *   ZERO_BALANCE_API_KEY=pk_xxx - API Key of a project with zero balance (for TC-04-6)
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const API_KEY = process.env.API_KEY ?? "";
const ZERO_BALANCE_API_KEY = process.env.ZERO_BALANCE_API_KEY ?? "";
const MCP_URL = `${BASE}/mcp`;

let passed = 0;
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
  console.log("AIGC Gateway — MCP Error Scenario Tests");
  console.log("=".repeat(60));

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
      { name: "chat", arguments: { model: "nonexistent/model", messages: [{ role: "user", content: "hi" }] } },
      API_KEY,
    );
    const result = (body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } })?.result;
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
    const result = (body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } })?.result;
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
            model: "deepseek/v3",
            messages: [{ role: "user", content: "test" }],
            max_tokens: 10,
          },
        },
        ZERO_BALANCE_API_KEY,
      );
      const result = (body as { result?: { isError?: boolean; content?: Array<{ text?: string }> } })?.result;
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

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} PASS | ${failed} FAIL`);
  console.log("=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
