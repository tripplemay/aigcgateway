import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, writeFileSync } from "fs";
import Redis from "ioredis";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3341");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;
const OUTPUT =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/m1a-alias-backend-verifying-e2e-2026-04-09.json";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@aigc-gateway.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";

const TEST_EMAIL = `m1a_${Date.now()}@test.local`;
const TEST_PASSWORD = "Test1234";

type Step = { id: string; name: string; ok: boolean; detail: string };

type ApiOptions = RequestInit & {
  auth?: "none" | "jwt" | "key";
  expect?: number;
};

let adminToken = "";
let userToken = "";
let apiKey = "";
let userId = "";
let projectId = "";

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function startMockServer() {
  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/openai/chat/completions") {
      await readBody(req);
      json(res, 200, {
        id: "chatcmpl-m1a-mock",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "m1a-mock-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "m1a-mock-ok" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      });
      return;
    }

    await readBody(req);
    json(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve()));
  return server;
}

async function api(path: string, options?: ApiOptions) {
  const { auth = "none", expect, ...rest } = options ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };

  if (auth === "jwt") {
    const token = path.startsWith("/api/admin") ? adminToken : userToken;
    if (token) headers.authorization = `Bearer ${token}`;
  } else if (auth === "key" && apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (expect && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }

  return { status: res.status, body, text };
}

async function loginAdmin() {
  const res = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  adminToken = String(res.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");
}

async function setupUserProjectAndKey() {
  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, name: "M1A Tester" }),
  });

  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  userToken = String(login.body?.token ?? "");
  userId = String(login.body?.user?.id ?? "");
  if (!userToken) throw new Error("user token missing");
  if (!userId) throw new Error("user id missing");

  const project = await api("/api/projects", {
    method: "POST",
    auth: "jwt",
    expect: 201,
    body: JSON.stringify({ name: `M1A Project ${Date.now()}` }),
  });
  projectId = String(project.body?.id ?? "");
  if (!projectId) throw new Error("project id missing");

  const key = await api(`/api/projects/${projectId}/keys`, {
    method: "POST",
    auth: "jwt",
    expect: 201,
    body: JSON.stringify({ name: "m1a-key" }),
  });
  apiKey = String(key.body?.key ?? "");
  if (!apiKey) throw new Error("api key missing");

  const rechargeOrder = await api(`/api/projects/${projectId}/recharge`, {
    method: "POST",
    auth: "jwt",
    expect: 201,
    body: JSON.stringify({ amount: 20, paymentMethod: "alipay" }),
  });

  const orderId = String(rechargeOrder.body?.orderId ?? "");
  if (!orderId) throw new Error("recharge order id missing");

  await api(`/api/webhooks/alipay`, {
    method: "POST",
    auth: "none",
    expect: 200,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `out_trade_no=${encodeURIComponent(orderId)}&trade_status=TRADE_SUCCESS`,
  });

  await api(`/api/admin/users/${userId}/projects/${projectId}/recharge`, {
    method: "POST",
    auth: "jwt",
    expect: 201,
    body: JSON.stringify({ amount: 20, description: "m1a e2e user-balance recharge" }),
  });
}

async function pickModelForLink() {
  const created = await api("/api/admin/models", {
    method: "POST",
    auth: "jwt",
    expect: 201,
    body: JSON.stringify({
      name: `m1a-seed-model-${Date.now()}`,
      displayName: "M1A Seed Model",
      modality: "TEXT",
      enabled: false,
    }),
  });
  return created.body as { id: string; name: string; modality: string };
}

async function forceMockRoute(modelId: string) {
  const providers = await api("/api/admin/providers", {
    method: "GET",
    auth: "jwt",
    expect: 200,
  });
  const openaiProvider = (providers.body?.data ?? []).find((p: any) => p.name === "openai");
  if (!openaiProvider) throw new Error("openai provider not found");

  await api(`/api/admin/providers/${openaiProvider.id}`, {
    method: "PATCH",
    auth: "jwt",
    expect: 200,
    body: JSON.stringify({
      status: "ACTIVE",
      baseUrl: `${MOCK_BASE}/openai`,
      apiKey: "mock-openai-key",
      proxyUrl: null,
    }),
  });

  await api("/api/admin/channels", {
    method: "POST",
    auth: "jwt",
    expect: 201,
    body: JSON.stringify({
      providerId: openaiProvider.id,
      modelId,
      realModelId: "m1a-mock-model",
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 1, outputPer1M: 1 },
      sellPrice: { unit: "token", inputPer1M: 2, outputPer1M: 2 },
    }),
  });
}

async function getModelEnabled(modelId: string): Promise<boolean | null> {
  const res = await api(`/api/admin/models`, { method: "GET", auth: "jwt", expect: 200 });
  const found = (res.body?.data ?? []).find((m: any) => m.id === modelId);
  if (!found) return null;
  return Boolean(found.enabled);
}

async function clearModelsCacheIfPossible() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.del("models:list", "models:list:TEXT", "models:list:IMAGE");
  } catch {
    // ignore cache clear failure
  } finally {
    redis.disconnect();
  }
}

async function callMcpTool(name: string, args: Record<string, unknown>) {
  const rpcBody = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: { name, arguments: args },
  };

  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(rpcBody),
  });

  const text = await res.text();
  let rpc: any = null;
  try {
    rpc = JSON.parse(text);
  } catch {
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice("data: ".length).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        rpc = JSON.parse(payload);
        break;
      } catch {
        // ignore parse error
      }
    }
  }

  return { status: res.status, rpc, raw: text };
}

async function run() {
  const steps: Step[] = [];
  const mockServer = await startMockServer();

  let aliasId = "";
  let aliasName = "";
  let modelId = "";

  try {
    await loginAdmin();
    await setupUserProjectAndKey();

    const pickedModel = await pickModelForLink();
    modelId = pickedModel.id;

    await forceMockRoute(modelId);

    aliasName = `m1a-alias-${Date.now()}`;

    const createAlias = await api("/api/admin/model-aliases", {
      method: "POST",
      auth: "jwt",
      expect: 201,
      body: JSON.stringify({ alias: aliasName, brand: "OpenAI", modality: "TEXT" }),
    });
    aliasId = String(createAlias.body?.id ?? "");

    await api(`/api/admin/model-aliases/${aliasId}/link`, {
      method: "POST",
      auth: "jwt",
      expect: 201,
      body: JSON.stringify({ modelId }),
    });

    await api(`/api/admin/model-aliases/${aliasId}`, {
      method: "PATCH",
      auth: "jwt",
      expect: 200,
      body: JSON.stringify({ enabled: true, description: "m1a e2e alias" }),
    });
    await clearModelsCacheIfPossible();

    // AC1: Admin 创建别名并挂载后，/v1/models 可见
    {
      const models = await api("/v1/models?modality=text", {
        method: "GET",
        auth: "none",
        expect: 200,
      });
      const data = Array.isArray(models.body?.data) ? models.body.data : [];
      const hit = data.find((m: any) => m.id === aliasName);
      const providerNamePresent = hit && Object.prototype.hasOwnProperty.call(hit, "provider_name");
      steps.push({
        id: "AC1",
        name: "Admin create alias + link model then /v1/models shows alias",
        ok: !!hit && !providerNamePresent,
        detail: `alias_found=${!!hit}, provider_name_present=${!!providerNamePresent}, total=${data.length}`,
      });
    }

    // AC2: 别名调用 /v1/chat/completions 成功路由
    {
      const chat = await api("/v1/chat/completions", {
        method: "POST",
        auth: "key",
        body: JSON.stringify({
          model: aliasName,
          messages: [{ role: "user", content: "ping" }],
          stream: false,
        }),
      });

      const content = String(chat.body?.choices?.[0]?.message?.content ?? "");
      const ok = chat.status === 200 && content.includes("m1a-mock-ok");

      steps.push({
        id: "AC2",
        name: "Alias chat completion routes successfully",
        ok,
        detail: `status=${chat.status}, content=${content}`,
      });
    }

    // AC3: 别名不存在返回 404
    {
      const bad = await api("/v1/chat/completions", {
        method: "POST",
        auth: "key",
        body: JSON.stringify({
          model: `missing-${Date.now()}`,
          messages: [{ role: "user", content: "ping" }],
          stream: false,
        }),
      });

      steps.push({
        id: "AC3",
        name: "Unknown alias returns 404",
        ok: bad.status === 404,
        detail: `status=${bad.status}, error_code=${bad.body?.error?.code ?? "n/a"}`,
      });
    }

    // AC4: 挂载后 Model.enabled 自动为 true
    {
      const enabled = await getModelEnabled(modelId);
      steps.push({
        id: "AC4",
        name: "Model.enabled becomes true after link",
        ok: enabled === true,
        detail: `enabled=${enabled}`,
      });
    }

    // AC5: MCP list_models + chat 正常
    {
      const mcpModels = await callMcpTool("list_models", { modality: "text" });
      const modelsText = String(
        mcpModels.rpc?.result?.content?.[0]?.text ?? mcpModels.rpc?.content?.[0]?.text ?? "",
      );

      let parsed: Array<{ name?: string }> = [];
      try {
        parsed = JSON.parse(modelsText);
      } catch {
        parsed = [];
      }

      const hasAlias = parsed.some((m) => m?.name === aliasName);

      const mcpChat = await callMcpTool("chat", {
        model: aliasName,
        messages: [{ role: "user", content: "hello from mcp" }],
      });
      const mcpChatText = String(
        mcpChat.rpc?.result?.content?.[0]?.text ?? mcpChat.rpc?.content?.[0]?.text ?? "",
      );
      const mcpChatIsError = Boolean(mcpChat.rpc?.result?.isError ?? mcpChat.rpc?.isError);
      let parsedMcpChat: any = null;
      try {
        parsedMcpChat = JSON.parse(mcpChatText);
      } catch {
        parsedMcpChat = null;
      }
      const contentText =
        typeof parsedMcpChat?.content === "string" ? parsedMcpChat.content : mcpChatText;
      const mcpChatOk =
        mcpChat.status === 200 && !mcpChatIsError && contentText.includes("m1a-mock-ok");

      steps.push({
        id: "AC5",
        name: "MCP list_models and chat work with alias",
        ok: mcpModels.status === 200 && hasAlias && mcpChatOk,
        detail: `list_status=${mcpModels.status}, has_alias=${hasAlias}, chat_status=${mcpChat.status}, chat_is_error=${mcpChatIsError}, chat_contains_mock=${contentText.includes("m1a-mock-ok")}, chat_text=${contentText.slice(0, 120)}`,
      });
    }

    // AC6: 移除挂载后 Model.enabled 自动 false（无其它别名关联）
    {
      await api(`/api/admin/model-aliases/${aliasId}/link/${modelId}`, {
        method: "DELETE",
        auth: "jwt",
        expect: 200,
      });

      const enabled = await getModelEnabled(modelId);

      steps.push({
        id: "AC6",
        name: "Model.enabled becomes false after unlink when no aliases remain",
        ok: enabled === false,
        detail: `enabled=${enabled}`,
      });
    }
  } finally {
    try {
      if (aliasId) {
        await api(`/api/admin/model-aliases/${aliasId}`, {
          method: "DELETE",
          auth: "jwt",
        });
      }
    } catch {
      // ignore cleanup failure
    }

    await new Promise<void>((resolve, reject) => {
      mockServer.close((err) => (err ? reject(err) : resolve()));
    });
  }

  const passCount = steps.filter((s) => s.ok).length;
  const failCount = steps.length - passCount;

  const result = {
    batch: "M1a-alias-backend-core",
    feature: "F-M1a-06",
    executedAt: new Date().toISOString(),
    baseUrl: BASE,
    passCount,
    failCount,
    steps,
  };

  if (!existsSync("docs/test-reports")) {
    throw new Error("docs/test-reports not found");
  }

  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));

  if (failCount > 0) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {});
