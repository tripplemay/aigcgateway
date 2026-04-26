import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, writeFileSync } from "fs";
import { Prisma, PrismaClient } from "@prisma/client";
import { runModelSync } from "@/lib/sync/model-sync";
import { requireEnv } from "../lib/require-env";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3322");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/p4-1b-output-routing-e2e-2026-04-08.json";

type Step = { name: string; ok: boolean; detail: string };

let token = "";
let projectId = "";
let apiKey = "";
const email = `p4b_${Date.now()}@test.local`;
const password = requireEnv("E2E_TEST_PASSWORD");

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function startMockServer() {
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/openai/models") {
      json(res, 200, { data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] });
      return;
    }
    if (req.method === "GET" && req.url === "/openrouter/models") {
      json(res, 200, {
        data: [
          {
            id: "gpt-4o",
            name: "OpenRouter GPT-4o",
            context_length: 128000,
            top_provider: { max_completion_tokens: 4096 },
            pricing: { prompt: "0.000005", completion: "0.000015" },
          },
        ],
      });
      return;
    }
    if (req.method === "POST" && req.url === "/openai/chat/completions") {
      await readBody(req);
      json(res, 200, {
        id: "chatcmpl-openai",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4o",
        choices: [{ index: 0, message: { role: "assistant", content: "provider:openai" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
      return;
    }
    if (req.method === "POST" && req.url === "/openrouter/chat/completions") {
      await readBody(req);
      json(res, 200, {
        id: "chatcmpl-openrouter",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4o",
        choices: [{ index: 0, message: { role: "assistant", content: "provider:openrouter" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
      return;
    }
    await readBody(req);
    json(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve()));
  return server;
}

async function api(
  path: string,
  init?: RequestInit & { expect?: number; auth?: "jwt" | "key" | "none" },
) {
  const { expect, auth = "jwt", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "jwt" && token) headers.Authorization = `Bearer ${token}`;
  if (auth === "key" && apiKey) headers.Authorization = `Bearer ${apiKey}`;

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

async function prepareProvidersAndSync() {
  // 隔离测试数据：避免启动时已有大规模 channels 触发 reconcile 守护阈值
  await prisma.healthCheck.deleteMany({});
  await prisma.channel.deleteMany({});
  await prisma.model.deleteMany({});

  await prisma.provider.updateMany({
    where: { name: { notIn: ["openai", "openrouter"] } },
    data: { status: "DISABLED" },
  });

  await prisma.provider.update({
    where: { name: "openai" },
    data: {
      status: "ACTIVE",
      baseUrl: `${MOCK_BASE}/openai`,
      authConfig: { apiKey: "mock-openai-key" },
      proxyUrl: null,
    },
  });
  await prisma.provider.update({
    where: { name: "openrouter" },
    data: {
      status: "ACTIVE",
      baseUrl: `${MOCK_BASE}/openrouter`,
      authConfig: { apiKey: "mock-openrouter-key" },
      proxyUrl: null,
    },
  });

  await prisma.providerConfig.updateMany({
    where: { provider: { name: { in: ["openai", "openrouter"] } } },
    data: { docUrls: Prisma.JsonNull },
  });

  await runModelSync();

  const model = await prisma.model.findUnique({ where: { name: "gpt-4o" }, select: { id: true } });
  if (!model) throw new Error("gpt-4o canonical model not found after sync");

  const channels = await prisma.channel.findMany({
    where: { modelId: model.id, provider: { name: { in: ["openai", "openrouter"] } } },
    include: { provider: true },
  });

  for (const ch of channels) {
    const priority = ch.provider.name === "openrouter" ? 1 : 5;
    await prisma.channel.update({ where: { id: ch.id }, data: { priority, status: "ACTIVE" } });
  }

  await prisma.model.update({
    where: { id: model.id },
    data: {
      enabled: true,
      capabilities: {
        streaming: true,
        json_mode: true,
        function_calling: true,
      },
    },
  });
}

async function setupUserAndKey() {
  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email, password, name: "P4B Tester" }),
  });
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });
  token = String(login.body?.token ?? "");
  if (!token) throw new Error("login token missing");

  const p = await api("/api/projects", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: `P4B Project ${Date.now()}` }),
  });
  projectId = String(p.body?.id ?? "");
  if (!projectId) throw new Error("project id missing");

  const k = await api(`/api/projects/${projectId}/keys`, {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: "p4b-key" }),
  });
  apiKey = String(k.body?.key ?? "");
  if (!apiKey) throw new Error("api key missing");

  // chat 调用需要用户余额 > 0
  await prisma.user.updateMany({ where: { email }, data: { balance: 20 } });
}

async function callMcpListModels() {
  const rpcBody = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: {
      name: "list_models",
      arguments: { modality: "text" },
    },
  };
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json, text/event-stream",
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
        // continue
      }
    }
  }

  if (!rpc) {
    return { status: res.status, parsed: null as Array<{ name: string }> | null, raw: text };
  }
  const result = rpc?.result ?? rpc;
  const raw = result?.content?.[0]?.text ?? "";
  try {
    const parsed = JSON.parse(raw) as Array<{ name: string }>;
    return { status: res.status, parsed, raw };
  } catch {
    return { status: res.status, parsed: null as Array<{ name: string }> | null, raw };
  }
}

async function run() {
  const steps: Step[] = [];
  const mock = await startMockServer();

  try {
    await prepareProvidersAndSync();
    await setupUserAndKey();

    // AC1: list_models MCP 返回 canonical name
    {
      const out = await callMcpListModels();
      const names = (out.parsed ?? []).map((m) => m.name);
      const ok =
        out.status === 200 &&
        !!out.parsed &&
        names.includes("gpt-4o") &&
        !names.some((n) => n === "openai/gpt-4o" || n === "openrouter/gpt-4o");
      steps.push({
        name: "AC1 list_models returns canonical names",
        ok,
        detail: `status=${out.status}, parsed=${!!out.parsed}, includes_gpt4o=${names.includes("gpt-4o")}, prefixed_present=${names.some((n) => n.includes("/gpt-4o"))}, raw=${String(out.raw).slice(0, 120)}`,
      });
    }

    // AC2: /v1/models 返回 canonical name
    {
      const res = await api("/v1/models?modality=text", { auth: "key", expect: 200 });
      const ids = (res.body?.data ?? []).map((m: any) => String(m.id));
      const ok =
        ids.includes("gpt-4o") &&
        !ids.includes("openai/gpt-4o") &&
        !ids.includes("openrouter/gpt-4o");
      steps.push({
        name: "AC2 /v1/models returns canonical IDs",
        ok,
        detail: `ids_has_gpt4o=${ids.includes("gpt-4o")}, ids_prefixed=${ids.filter((id: string) => id.includes('/gpt-4o')).join(",")}`,
      });
    }

    // AC3: chat/completions model=gpt-4o 路由到最优 channel（priority 最小）
    {
      const res = await api("/v1/chat/completions", {
        method: "POST",
        auth: "key",
        expect: 200,
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: "route test" }],
          stream: false,
        }),
      });
      const content = String(res.body?.choices?.[0]?.message?.content ?? "");
      const ok = content.includes("provider:openrouter");
      steps.push({
        name: "AC3 chat route picks highest-priority ACTIVE channel",
        ok,
        detail: `content=${content}`,
      });
    }

    // AC4: fallback 文件已删除
    {
      const exists = existsSync("src/lib/sync/model-capabilities-fallback.ts");
      steps.push({
        name: "AC4 legacy fallback file is removed",
        ok: !exists,
        detail: `file_exists=${exists}`,
      });
    }

    const passCount = steps.filter((s) => s.ok).length;
    const failCount = steps.length - passCount;
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          mockBase: MOCK_BASE,
          projectId,
          passCount,
          failCount,
          steps,
        },
        null,
        2,
      ),
      "utf8",
    );

    if (failCount > 0) {
      console.error(`[p4-1b-output-routing-e2e] F-P4B-05 failed: ${failCount} step(s) failed`);
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          mockBase: MOCK_BASE,
          projectId,
          passCount: 0,
          failCount: 1,
          steps: [{ name: "script runtime", ok: false, detail: msg }],
        },
        null,
        2,
      ),
      "utf8",
    );
    console.error(`[p4-1b-output-routing-e2e] script error: ${msg}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
    await new Promise<void>((resolve) => mock.close(() => resolve()));
  }
}

run();
