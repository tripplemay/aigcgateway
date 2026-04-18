import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync, writeFileSync } from "fs";
import { Prisma, PrismaClient } from "@prisma/client";
import { runModelSync } from "@/lib/sync/model-sync";
import { requireEnv } from "../lib/require-env";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3323");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/p4-2-docs-cleanup-e2e-2026-04-08.json";

type Step = { name: string; ok: boolean; detail: string };

let adminToken = "";
let userToken = "";
let projectId = "";
let apiKey = "";
const email = `p4d_${Date.now()}@test.local`;
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
  init?: RequestInit & { expect?: number; auth?: "admin" | "jwt" | "key" | "none" },
) {
  const { expect, auth = "jwt", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };

  if (auth === "admin" && adminToken) headers.Authorization = `Bearer ${adminToken}`;
  if (auth === "jwt" && userToken) headers.Authorization = `Bearer ${userToken}`;
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

function checkSdkReadmeCanonical() {
  const readme = readFileSync("sdk/README.md", "utf8");
  const modelLiterals: string[] = [];
  const re = /model\s*:\s*['\"]([^'\"]+)['\"]/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(readme))) {
    modelLiterals.push(m[1]);
  }
  const slashModels = modelLiterals.filter((x) => x.includes("/"));
  return {
    modelLiterals,
    slashModels,
    ok: slashModels.length === 0,
  };
}

async function prepareProvidersAndSync() {
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
      capabilities: { streaming: true, json_mode: true, function_calling: true },
    },
  });
}

async function setupUsersAndKeys() {
  const adminLogin = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") }),
  });
  adminToken = String(adminLogin.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");

  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email, password, name: "P4D Tester" }),
  });
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });
  userToken = String(login.body?.token ?? "");
  if (!userToken) throw new Error("user token missing");

  const p = await api("/api/projects", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: `P4D Project ${Date.now()}` }),
  });
  projectId = String(p.body?.id ?? "");

  const k = await api(`/api/projects/${projectId}/keys`, {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: "p4d-key" }),
  });
  apiKey = String(k.body?.key ?? "");

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
    const readmeCheck = checkSdkReadmeCanonical();
    steps.push({
      name: "AC1 SDK README examples use canonical model names",
      ok: readmeCheck.ok,
      detail: `modelLiterals=${JSON.stringify(readmeCheck.modelLiterals)}, slashModels=${JSON.stringify(readmeCheck.slashModels)}`,
    });

    await prepareProvidersAndSync();
    await setupUsersAndKeys();

    // AC2 model-capabilities page uniqueness (via page data source /api/admin/models)
    {
      const res = await api("/api/admin/models", { auth: "admin", expect: 200 });
      const rows = (res.body?.data ?? []) as Array<{
        name: string;
        enabled: boolean;
        activeChannelCount: number;
      }>;
      const visible = rows.filter((r) => r.enabled && r.activeChannelCount > 0);
      const names = visible.map((r) => r.name);
      const uniqueSize = new Set(names).size;
      const hasGpt4o = names.includes("gpt-4o");
      const gpt4oCount = names.filter((x) => x === "gpt-4o").length;
      const ok = uniqueSize === names.length && hasGpt4o && gpt4oCount === 1;
      steps.push({
        name: "AC2 model-capabilities data has unique canonical models",
        ok,
        detail: `visible=${names.length}, unique=${uniqueSize}, gpt4oCount=${gpt4oCount}`,
      });
    }

    // AC3 list_models -> chat using canonical name succeeds
    {
      const mcp = await callMcpListModels();
      const names = (mcp.parsed ?? []).map((m) => m.name);
      const canonicalOk =
        mcp.status === 200 &&
        !!mcp.parsed &&
        names.includes("gpt-4o") &&
        !names.some((n) => n.includes("/gpt-4o"));

      const chat = await api("/v1/chat/completions", {
        method: "POST",
        auth: "key",
        expect: 200,
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: "p4d route test" }],
          stream: false,
        }),
      });

      const content = String(chat.body?.choices?.[0]?.message?.content ?? "");
      const chatOk = content.includes("provider:openrouter");

      steps.push({
        name: "AC3 end-to-end works with canonical name (list_models -> chat)",
        ok: canonicalOk && chatOk,
        detail: `mcpStatus=${mcp.status}, hasGpt4o=${names.includes("gpt-4o")}, prefixed=${names.filter((n) => n.includes("/gpt-4o")).join(",")}, chatContent=${content}`,
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
      console.error(`[p4-2-docs-cleanup-e2e] failed: ${failCount} step(s) failed`);
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
    console.error(`[p4-2-docs-cleanup-e2e] script error: ${msg}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
    await new Promise<void>((resolve) => mock.close(() => resolve()));
  }
}

run();
