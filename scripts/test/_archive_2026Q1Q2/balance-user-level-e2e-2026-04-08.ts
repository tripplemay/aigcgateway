import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const MCP_URL = `${BASE}/mcp`;
const MOCK_PORT = Number(process.env.BU_MOCK_PORT ?? "3322");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}/v1`;
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ?? "docs/test-reports/balance-user-level-e2e-2026-04-08.json";

const prisma = new PrismaClient();

interface StepResult {
  name: string;
  ok: boolean;
  detail?: string;
}

interface RestoreState {
  providerId: string;
  baseUrl: string;
  authConfig: unknown;
  proxyUrl: string | null;
  channels: Array<{ id: string; status: string }>;
}

let userToken = "";
let adminToken = "";
let userId = "";
let projectA = "";
let projectB = "";
let apiKey = "";

const testerEmail = `bu_user_${Date.now()}@test.com`;
const testerPassword = requireEnv("E2E_TEST_PASSWORD");

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function buildMockResponse(prompt: string) {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "openai/gpt-4o-mini",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: `MOCK-${prompt}` },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
  };
}

async function startMockServer(): Promise<Server> {
  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const bodyText = await readBody(req);
      const payload = JSON.parse(bodyText || "{}");
      const lastUser = [...(payload.messages ?? [])].reverse().find((m: any) => m?.role === "user");
      const prompt = String(lastUser?.content ?? "");
      json(res, 200, buildMockResponse(prompt));
      return;
    }

    json(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve()));
  return server;
}

async function ensureMockProvider(): Promise<RestoreState> {
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
      capabilities: { streaming: true, json_mode: true, unknown: false },
    },
    create: {
      name: "openai/gpt-4o-mini",
      enabled: true,
      displayName: "OpenAI GPT-4o-mini",
      modality: "TEXT",
      contextWindow: 128000,
      maxTokens: 16384,
      capabilities: { streaming: true, json_mode: true, unknown: false },
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
    channels,
  };

  await prisma.provider.update({
    where: { id: provider.id },
    data: { baseUrl: MOCK_BASE, authConfig: { apiKey: "mock-key" }, proxyUrl: null },
  });

  for (const channel of channels) {
    await prisma.channel.update({ where: { id: channel.id }, data: { status: "DISABLED" } });
  }

  await prisma.channel.upsert({
    where: {
      providerId_modelId: {
        providerId: provider.id,
        modelId: model.id,
      },
    },
    update: {
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

  return restore;
}

async function restoreProvider(state: RestoreState | null) {
  if (!state) return;
  await prisma.provider.update({
    where: { id: state.providerId },
    data: { baseUrl: state.baseUrl, authConfig: state.authConfig as any, proxyUrl: state.proxyUrl },
  });
  for (const channel of state.channels) {
    await prisma.channel.update({ where: { id: channel.id }, data: { status: channel.status as any } });
  }
}

type AuthMode = "user" | "admin" | "key" | "none";

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

  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
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

async function registerUser() {
  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email: testerEmail, password: testerPassword, name: "BU Tester" }),
  });
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: testerEmail, password: testerPassword }),
  });
  userToken = String(login.body?.token ?? "");
  userId = String(login.body?.user?.id ?? "");
  if (!userToken || !userId) throw new Error("user login/token missing");
}

async function loginAdmin() {
  const res = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") }),
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

async function createProjectApiKey(projectId: string): Promise<string> {
  const res = await api(`/api/projects/${projectId}/keys`, {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: `key-${Date.now()}` }),
  });
  const key = String(res.body?.key ?? "");
  if (!key) throw new Error("api key missing");
  return key;
}

async function adminRecharge(projectId: string, amount: number) {
  await api(`/api/admin/users/${userId}/projects/${projectId}/recharge`, {
    method: "POST",
    auth: "admin",
    expect: 201,
    body: JSON.stringify({ amount, description: "balance-user-level-e2e" }),
  });
}

async function fetchProjects(): Promise<Array<{ id: string; name: string; balance: number }>> {
  const res = await api("/api/projects", { expect: 200 });
  return (res.body?.data ?? []).map((p: any) => ({
    id: String(p.id),
    name: String(p.name),
    balance: Number(p.balance),
  }));
}

async function callChatCompletion(prompt: string) {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a test helper." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`/v1/chat/completions failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function getTransactions(projectId: string) {
  const res = await api(`/api/projects/${projectId}/transactions`, { expect: 200 });
  return res.body?.data ?? [];
}

async function rawMcp(method: string, params?: Record<string, unknown>) {
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
  let body: any = null;
  if (text.trim().startsWith("{")) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  } else if (text.includes("data:")) {
    const dataPayload = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s?/, ""))
      .join("\n")
      .trim();
    if (dataPayload) {
      try {
        body = JSON.parse(dataPayload);
      } catch {
        body = dataPayload;
      }
    } else {
      body = text;
    }
  } else {
    body = text;
  }
  return { status: res.status, body, text };
}

async function callTool(name: string, args: Record<string, unknown>) {
  const rpc = await rawMcp("tools/call", { name, arguments: args });
  if (rpc.status >= 400) throw new Error(`HTTP ${rpc.status}: ${rpc.text}`);
  if (rpc.body?.error) throw new Error(`RPC error: ${JSON.stringify(rpc.body.error)}`);
  const result = rpc.body?.result ?? rpc.body;
  if (result?.isError) throw new Error(result?.content?.[0]?.text ?? `tool ${name} error`);
  return result;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function expectSharedBalanceChange(
  projectIds: { a: string; b: string },
  previous: number,
  direction: "increase" | "decrease",
  timeoutMs = 6000,
  intervalMs = 250,
) {
  const expiresAt = Date.now() + timeoutMs;
  while (Date.now() < expiresAt) {
    const projects = await fetchProjects();
    const a = projects.find((p) => p.id === projectIds.a);
    const b = projects.find((p) => p.id === projectIds.b);
    if (!a || !b) throw new Error("projects missing during balance check");
    if (Math.abs(a.balance - b.balance) > 0.000001) {
      throw new Error(`shared balance mismatch A=${a.balance} B=${b.balance}`);
    }
    const decreased = a.balance < previous - 0.000001;
    const increased = a.balance > previous + 0.000001;
    if ((direction === "decrease" && decreased) || (direction === "increase" && increased)) {
      return { balance: a.balance, delta: previous - a.balance };
    }
    await sleep(intervalMs);
  }
  throw new Error(
    `balance did not ${direction} (before=${previous}) within ${(timeoutMs / 1000).toFixed(1)}s`,
  );
}

function parseToolJson(result: any): any {
  const text = result?.content?.[0]?.text ?? "";
  if (!text) throw new Error("tool result missing text");
  return JSON.parse(text);
}

async function step(name: string, results: StepResult[], fn: () => Promise<string | undefined>) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message });
    throw error;
  }
}

async function main() {
  const results: StepResult[] = [];
  let server: Server | null = null;
  let restoreState: RestoreState | null = null;

  try {
    server = await startMockServer();
    restoreState = await ensureMockProvider();

    await step("register+login user", results, async () => {
      await registerUser();
      await loginAdmin();
      projectA = await createProject(`BU Project A ${Date.now()}`);
      projectB = await createProject(`BU Project B ${Date.now()}`);
      apiKey = await createProjectApiKey(projectA);
      await adminRecharge(projectA, 50);
      return `user=${testerEmail}`;
    });

    let latestBalance = 0;

    await step("shared balance across projects", results, async () => {
      const projects = await fetchProjects();
      const a = projects.find((p) => p.id === projectA);
      const b = projects.find((p) => p.id === projectB);
      if (!a || !b) throw new Error("projects missing");
      if (a.balance !== b.balance) {
        throw new Error(`balance mismatch A=${a.balance} B=${b.balance}`);
      }
      latestBalance = a.balance;
      return `balance=$${latestBalance.toFixed(4)}`;
    });

    await step("deduction via chat completion", results, async () => {
      await callChatCompletion("deduct once");
      const { balance, delta } = await expectSharedBalanceChange(
        { a: projectA, b: projectB },
        latestBalance,
        "decrease",
      );
      latestBalance = balance;
      return `delta=$${(-delta).toFixed(6)}, balance=$${latestBalance.toFixed(6)}`;
    });

    await step("transactions filtered per project", results, async () => {
      const txA = await getTransactions(projectA);
      const deduction = txA.find((t: any) => t.type === "DEDUCTION");
      if (!deduction) throw new Error(`project A transactions missing deduction: ${JSON.stringify(txA)}`);
      const txB = await getTransactions(projectB);
      if (txB.length !== 0) throw new Error(`project B should have no transactions, got ${txB.length}`);
      return `A tx count=${txA.length}`;
    });

    await step("admin recharge affects all projects", results, async () => {
      await adminRecharge(projectB, 20);
      const { balance } = await expectSharedBalanceChange(
        { a: projectA, b: projectB },
        latestBalance,
        "increase",
      );
      latestBalance = balance;
      return `balance=$${latestBalance.toFixed(6)}`;
    });

    await step("get_balance tool shows user balance", results, async () => {
      const init = await rawMcp("initialize", {
        protocolVersion: "2024-11-05",
        clientInfo: { name: "bu-e2e", version: "1.0.0" },
        capabilities: {},
      });
      if (init.status !== 200) throw new Error(`initialize failed: ${init.status}`);
      const tool = parseToolJson(await callTool("get_balance", { include_transactions: true }));
      const numeric = Number(String(tool.balance ?? "").replace(/[^0-9.-]/g, ""));
      if (Number.isNaN(numeric)) throw new Error(`tool balance not numeric: ${tool.balance}`);
      const diff = Math.abs(numeric - latestBalance);
      if (diff > 0.000001) throw new Error(`tool balance mismatch (tool=${numeric}, rest=${latestBalance})`);
      if (Array.isArray(tool.transactions) && tool.transactions.some((t: any) => t.type === "ADJUSTMENT")) {
        // fine, but ensure entries exist when include_transactions true
      }
      return JSON.stringify(tool, null, 2);
    });

    const projects = await fetchProjects();
    writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(
        {
          email: testerEmail,
          userId,
          projectA,
          projectB,
          results,
          finalBalance: projects.map((p) => ({ id: p.id, balance: p.balance })),
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error("[balance-user-level-e2e]", (error as Error).message);
    process.exitCode = 1;
  } finally {
    await restoreProvider(restoreState);
    await prisma.$disconnect();
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  }
}

main();
