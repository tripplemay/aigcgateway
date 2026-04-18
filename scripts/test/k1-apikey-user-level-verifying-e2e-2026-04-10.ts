import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const MCP_URL = `${BASE}/mcp`;
const MOCK_PORT = Number(process.env.K1_MOCK_PORT ?? "3344");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}/v1`;
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/k1-apikey-user-level-verifying-e2e-2026-04-10.json";

const prisma = new PrismaClient();

type Step = { id: string; name: string; ok: boolean; detail: string };
type AuthMode = "none" | "user" | "admin" | "key";

const testerEmail = `k1_user_${Date.now()}@test.com`;
const testerPassword = requireEnv("E2E_TEST_PASSWORD");
const adminCreds = { email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") };

let userToken = "";
let adminToken = "";
let userId = "";
let apiKey = "";
let projectA = "";
let projectB = "";
let aliasName = "";

interface RestoreState {
  providerId: string;
  baseUrl: string;
  authConfig: unknown;
  proxyUrl: string | null;
  channelStatuses: Array<{ id: string; status: string }>;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function startMockServer(): Promise<Server> {
  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const bodyText = await readBody(req);
      const payload = JSON.parse(bodyText || "{}");
      const lastUser = [...(payload.messages ?? [])].reverse().find((m: any) => m?.role === "user");
      const prompt = String(lastUser?.content ?? "");
      json(res, 200, {
        id: "chatcmpl-k1-mock",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4o-mini",
        choices: [{ index: 0, message: { role: "assistant", content: `MOCK-${prompt}` }, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
      });
      return;
    }

    json(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve()));
  return server;
}

async function api(
  path: string,
  init?: RequestInit & { expect?: number; auth?: AuthMode },
): Promise<{ status: number; body: any; text: string }> {
  const { expect, auth = "user", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "user" && userToken) headers.Authorization = `Bearer ${userToken}`;
  if (auth === "admin" && adminToken) headers.Authorization = `Bearer ${adminToken}`;
  if (auth === "key" && apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, text };
}

async function registerAndLoginUser() {
  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email: testerEmail, password: testerPassword, name: "K1 Tester" }),
  });
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: testerEmail, password: testerPassword }),
  });
  userToken = String(login.body?.token ?? "");
  const user = await prisma.user.findUnique({
    where: { email: testerEmail },
    select: { id: true },
  });
  userId = String(user?.id ?? "");
  if (!userToken || !userId) throw new Error("user login/token missing");
}

async function loginAdmin() {
  const res = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify(adminCreds),
  });
  adminToken = String(res.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");
}

async function createProject(name: string): Promise<string> {
  const res = await api("/api/projects", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name }),
  });
  const id = String(res.body?.id ?? "");
  if (!id) throw new Error(`project id missing for ${name}`);
  return id;
}

async function ensureMockRouting(alias: string): Promise<RestoreState> {
  const provider = await prisma.provider.findUniqueOrThrow({
    where: { name: "openai" },
    select: { id: true, baseUrl: true, authConfig: true, proxyUrl: true },
  });

  const model = await prisma.model.upsert({
    where: { name: "openai/gpt-4o-mini" },
    update: {
      enabled: true,
      displayName: "OpenAI GPT-4o-mini",
      modality: "TEXT",
      contextWindow: 128000,
      maxTokens: 16384,
      capabilities: { streaming: true, json_mode: true },
    },
    create: {
      name: "openai/gpt-4o-mini",
      enabled: true,
      displayName: "OpenAI GPT-4o-mini",
      modality: "TEXT",
      contextWindow: 128000,
      maxTokens: 16384,
      capabilities: { streaming: true, json_mode: true },
    },
  });

  const channels = await prisma.channel.findMany({
    where: { modelId: model.id },
    select: { id: true, status: true },
  });

  const restore: RestoreState = {
    providerId: provider.id,
    baseUrl: provider.baseUrl,
    authConfig: provider.authConfig,
    proxyUrl: provider.proxyUrl,
    channelStatuses: channels,
  };

  await prisma.provider.update({
    where: { id: provider.id },
    data: { baseUrl: MOCK_BASE, authConfig: { apiKey: "mock-key" }, proxyUrl: null, status: "ACTIVE" },
  });

  for (const c of channels) {
    await prisma.channel.update({ where: { id: c.id }, data: { status: "DISABLED" } });
  }

  await prisma.channel.upsert({
    where: { providerId_modelId: { providerId: provider.id, modelId: model.id } },
    update: {
      realModelId: "gpt-4o-mini",
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
      sellPrice: { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
    },
    create: {
      providerId: provider.id,
      modelId: model.id,
      realModelId: "gpt-4o-mini",
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
      sellPrice: { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
    },
  });

  const modelAlias = await prisma.modelAlias.upsert({
    where: { alias },
    update: { enabled: true, modality: "TEXT", brand: "OPENAI" },
    create: { alias, enabled: true, modality: "TEXT", brand: "OPENAI" },
  });

  await prisma.aliasModelLink.upsert({
    where: { aliasId_modelId: { aliasId: modelAlias.id, modelId: model.id } },
    update: {},
    create: { aliasId: modelAlias.id, modelId: model.id },
  });

  return restore;
}

async function restoreProvider(state: RestoreState | null) {
  if (!state) return;
  await prisma.provider.update({
    where: { id: state.providerId },
    data: { baseUrl: state.baseUrl, authConfig: state.authConfig as any, proxyUrl: state.proxyUrl },
  });
  for (const c of state.channelStatuses) {
    await prisma.channel.update({ where: { id: c.id }, data: { status: c.status as any } });
  }
}

async function callChat(prompt: string, extraHeaders?: Record<string, string>) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model: aliasName,
      messages: [
        { role: "system", content: "You are a test helper." },
        { role: "user", content: prompt },
      ],
      stream: false,
    }),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

async function createAction(projectId: string, name: string) {
  const res = await api(`/api/projects/${projectId}/actions`, {
    method: "POST",
    expect: 201,
    body: JSON.stringify({
      name,
      model: aliasName,
      messages: [{ role: "user", content: `action-${name}` }],
      variables: [],
      changelog: "init",
    }),
  });
  return String(res.body?.id ?? "");
}

async function runAction(actionId: string, projectId?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (projectId) headers["X-Project-Id"] = projectId;

  const res = await fetch(`${BASE}/v1/actions/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action_id: actionId, variables: {}, stream: false }),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

async function mcpCall(method: string, params?: Record<string, unknown>) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function run() {
  const steps: Step[] = [];
  let restore: RestoreState | null = null;
  const mock = await startMockServer();
  aliasName = `k1-chat-${Date.now().toString(36)}`;

  try {
    await registerAndLoginUser();
    await loginAdmin();

    projectA = await createProject("K1 Project A");
    projectB = await createProject("K1 Project B");

    await prisma.user.update({ where: { id: userId }, data: { defaultProjectId: projectA } });

    restore = await ensureMockRouting(aliasName);

    const keyRes = await api("/api/keys", {
      method: "POST",
      expect: 201,
      body: JSON.stringify({ name: "k1-user-key" }),
    });
    apiKey = String(keyRes.body?.key ?? "");

    // Test precondition: top up balance.
    // Try new route first; if not available, fallback to legacy route so AC1/AC2 can execute.
    let preflightRecharged = false;
    const preflightNew = await api(`/api/admin/users/${userId}/recharge`, {
      method: "POST",
      auth: "admin",
      body: JSON.stringify({ amount: 20, description: "k1-preflight-recharge-new" }),
    });
    if (preflightNew.status === 201) {
      preflightRecharged = true;
    } else {
      const preflightOld = await api(`/api/admin/users/${userId}/projects/${projectA}/recharge`, {
        method: "POST",
        auth: "admin",
        body: JSON.stringify({ amount: 20, description: "k1-preflight-recharge-old" }),
      });
      preflightRecharged = preflightOld.status === 201;
    }
    if (!preflightRecharged) {
      throw new Error("preflight recharge failed on both new and old routes");
    }

    const keysList = await api("/api/keys", { expect: 200 });
    const ownKeys = Array.isArray(keysList.body?.data) ? keysList.body.data : [];
    steps.push({
      id: "AC4",
      name: "/api/keys 用户级 Key 管理",
      ok: !!apiKey && ownKeys.length > 0,
      detail: `created=${!!apiKey}, listed=${ownKeys.length}`,
    });

    const userBefore = await prisma.user.findUnique({ where: { id: userId }, select: { balance: true } });
    const chatRes = await callChat("k1-chat-with-key");
    await new Promise((r) => setTimeout(r, 300));
    const userAfter = await prisma.user.findUnique({ where: { id: userId }, select: { balance: true } });
    const before = Number(userBefore?.balance ?? 0);
    const after = Number(userAfter?.balance ?? 0);
    steps.push({
      id: "AC1",
      name: "Key 调 chat 成功并扣 User.balance",
      ok: chatRes.status === 200 && after < before,
      detail: `status=${chatRes.status}, balance_before=${before}, balance_after=${after}`,
    });

    const actionA = await createAction(projectA, "k1-action-a");
    const actionB = await createAction(projectB, "k1-action-b");
    const runA = await runAction(actionA, projectA);
    const runB = await runAction(actionB, projectB);
    steps.push({
      id: "AC2",
      name: "同一 Key 切换 X-Project-Id 访问不同项目 Actions",
      ok: runA.status === 200 && runB.status === 200,
      detail: `runA=${runA.status}, runB=${runB.status}`,
    });

    await prisma.user.update({ where: { id: userId }, data: { defaultProjectId: null } });
    const chatNoProject = await callChat("k1-chat-no-project");
    const actionNoProject = await runAction(actionA);
    steps.push({
      id: "AC3",
      name: "无项目上下文时 chat 可用、actions 返回 400",
      ok: chatNoProject.status === 200 && actionNoProject.status === 400,
      detail: `chat=${chatNoProject.status}, action=${actionNoProject.status}`,
    });

    const oldKeysRoute = await api(`/api/projects/${projectA}/keys`);
    steps.push({
      id: "AC4b",
      name: "旧 /api/projects/:id/keys 路径已删除",
      ok: oldKeysRoute.status === 404,
      detail: `actual_status=${oldKeysRoute.status}`,
    });

    const newRecharge = await api(`/api/admin/users/${userId}/recharge`, {
      method: "POST",
      auth: "admin",
      body: JSON.stringify({ amount: 1, description: "k1-recharge" }),
    });
    const oldRecharge = await api(`/api/admin/users/${userId}/projects/${projectA}/recharge`, {
      method: "POST",
      auth: "admin",
      body: JSON.stringify({ amount: 1, description: "k1-recharge-old" }),
    });
    steps.push({
      id: "AC5",
      name: "充值 API 新路径可用且旧路径删除",
      ok: newRecharge.status === 201 && oldRecharge.status === 404,
      detail: `new=${newRecharge.status}, old=${oldRecharge.status}`,
    });

    const init = await mcpCall("initialize", {
      protocolVersion: "2024-11-05",
      clientInfo: { name: "k1-e2e", version: "1.0.0" },
      capabilities: {},
    });
    const tools = await mcpCall("tools/list");
    steps.push({
      id: "AC6",
      name: "MCP 连接可初始化并返回 tools",
      ok: init.status === 200 && tools.status === 200 && tools.text.includes("result"),
      detail: `init=${init.status}, tools=${tools.status}`,
    });

    const passCount = steps.filter((s) => s.ok).length;
    const failCount = steps.length - passCount;

    const report = {
      batch: "K1-apikey-user-level",
      feature: "F-K1-09",
      executedAt: new Date().toISOString(),
      baseUrl: BASE,
      passCount,
      failCount,
      steps,
    };

    writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
    if (failCount > 0) process.exitCode = 1;
  } catch (err) {
    console.error("[k1-apikey-user-level-e2e]", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await restoreProvider(restore);
    await prisma.$disconnect();
    mock.close();
  }
}

run();
