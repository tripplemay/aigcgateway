import "../../tests/helpers/load-test-env";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { startMockProvider, jsonResponse } from "../../tests/mocks/provider-server";
import { createTestUser, createTestProject, createTestApiKey } from "../../tests/factories";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const MCP_URL = `${BASE}/mcp`;
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3316");
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/security-billing-polish-reverifying-local-e2e-2026-04-07.json";

const prisma = new PrismaClient();

type StepResult = { name: string; ok: boolean; detail?: string };
type RestoreState = {
  providerId: string;
  baseUrl: string;
  authConfig: unknown;
  textChannelStates: Array<{ id: string; status: string }>;
  imageChannelStates: Array<{ id: string; status: string }>;
};

let token = "";
let userId = "";
let projectId = "";
let apiKey = "";
let MOCK_BASE = "";

/** Custom image handler: validate prompt/size for error sanitization tests */
function customImageHandler(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
  body: string,
): boolean {
  if (req.method === "POST" && req.url === "/v1/images/generations") {
    const parsed = JSON.parse(body || "{}");
    const prompt = String(parsed.prompt ?? "");
    const size = String(parsed.size ?? "");

    if (!prompt.trim()) {
      jsonResponse(res, 400, {
        error: {
          code: "invalid_prompt",
          message: "prompt empty; QQ 12345678; endpoint volcengine/cn-beijing; Request ID req-abc",
        },
      });
      return true;
    }

    if (size && size !== "1024x1024") {
      jsonResponse(res, 400, {
        error: {
          code: "invalid_size",
          message: "invalid size; QQ 987654; volcengine endpoint cn-beijing; RequestId rid-xyz",
        },
      });
      return true;
    }
  }
  return false;
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

async function rawMcp(method: string, params?: Record<string, unknown>) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params ?? {} }),
  });

  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    const dataLine = text
      .split("\n")
      .find((line) => line.startsWith("data: "))
      ?.slice("data: ".length);
    if (dataLine) {
      try {
        body = JSON.parse(dataLine);
      } catch {
        body = text;
      }
    } else {
      body = text;
    }
  }
  return { status: res.status, body, text };
}

async function callToolRaw(name: string, args: Record<string, unknown> = {}) {
  const rpc = await rawMcp("tools/call", { name, arguments: args });
  if (rpc.status >= 400) return { ok: false, error: rpc.text };
  if (rpc.body?.error) return { ok: false, error: JSON.stringify(rpc.body.error) };
  const result = rpc.body?.result ?? rpc.body;
  if (result?.isError)
    return { ok: false, error: String(result?.content?.[0]?.text ?? "tool_error") };
  return { ok: true, result };
}

function parseToolJson(result: any): any {
  const text = result?.content?.[0]?.text ?? "";
  if (!text) throw new Error("No text content in tool result");
  return JSON.parse(text);
}

function assertNoLeak(text: string) {
  const lowered = text.toLowerCase();
  const forbidden = ["qq", "request id", "requestid", "cn-beijing", "rid-"];
  for (const s of forbidden) {
    if (lowered.includes(s)) {
      throw new Error(`leak detected: ${s} in ${text}`);
    }
  }
}

async function registerAndLogin() {
  const user = await createTestUser(BASE, { prefix: "sb", name: "SB Local Tester" });
  token = user.token;
  const dbUser = await prisma.user.findUnique({
    where: { email: user.email },
    select: { id: true },
  });
  userId = String(dbUser?.id ?? "");
  if (!userId) throw new Error("registerAndLogin: user not found in database");
}

async function createProjectAndKey() {
  const project = await createTestProject(BASE, token, { name: `SB Project ${Date.now()}` });
  projectId = project.id;

  await prisma.user.update({
    where: { id: userId },
    data: { defaultProjectId: projectId, balance: 1 },
  });

  const key = await createTestApiKey(BASE, token, {
    name: "sb-local-key",
    rateLimit: 120,
  });
  apiKey = key.key;
}

async function prepareRouting(): Promise<RestoreState> {
  const provider = await prisma.provider.findUniqueOrThrow({
    where: { name: "openai" },
    select: { id: true, baseUrl: true, authConfig: true },
  });

  const textModel = await prisma.model.upsert({
    where: { name: "openai/gpt-4o-mini" },
    update: { enabled: true, modality: "TEXT", displayName: "OpenAI GPT-4o-mini" },
    create: {
      name: "openai/gpt-4o-mini",
      enabled: true,
      modality: "TEXT",
      displayName: "OpenAI GPT-4o-mini",
      capabilities: { streaming: true, unknown: false },
    },
  });

  const imageModel = await prisma.model.upsert({
    where: { name: "openai/dall-e-3" },
    update: { enabled: true, modality: "IMAGE", displayName: "OpenAI DALL-E 3" },
    create: {
      name: "openai/dall-e-3",
      enabled: true,
      modality: "IMAGE",
      displayName: "OpenAI DALL-E 3",
      capabilities: { unknown: false },
    },
  });

  const textChannels = await prisma.channel.findMany({
    where: { modelId: textModel.id },
    select: { id: true, status: true },
  });
  const imageChannels = await prisma.channel.findMany({
    where: { modelId: imageModel.id },
    select: { id: true, status: true },
  });

  await prisma.provider.update({
    where: { id: provider.id },
    data: { baseUrl: MOCK_BASE, authConfig: { apiKey: "mock-key" }, proxyUrl: null },
  });

  for (const c of [...textChannels, ...imageChannels]) {
    await prisma.channel.update({ where: { id: c.id }, data: { status: "DISABLED" } });
  }

  // tiny token price to force MIN_CHARGE path (1 token => 1e-9 < 1e-8)
  await prisma.channel.upsert({
    where: {
      providerId_modelId: {
        providerId: provider.id,
        modelId: textModel.id,
      },
    },
    update: {
      status: "ACTIVE",
      priority: 1,
      costPrice: { unit: "token", inputPer1M: 0.0001, outputPer1M: 0.0001, currency: "USD" },
      sellPrice: { unit: "token", inputPer1M: 0.001, outputPer1M: 0.001, currency: "USD" },
    },
    create: {
      providerId: provider.id,
      modelId: textModel.id,
      realModelId: "gpt-4o-mini",
      status: "ACTIVE",
      priority: 1,
      costPrice: { unit: "token", inputPer1M: 0.0001, outputPer1M: 0.0001, currency: "USD" },
      sellPrice: { unit: "token", inputPer1M: 0.001, outputPer1M: 0.001, currency: "USD" },
    },
  });

  await prisma.channel.upsert({
    where: {
      providerId_modelId: {
        providerId: provider.id,
        modelId: imageModel.id,
      },
    },
    update: {
      status: "ACTIVE",
      priority: 1,
      costPrice: { unit: "call", perCall: 0.001, currency: "USD" },
      sellPrice: { unit: "call", perCall: 0.002, currency: "USD" },
    },
    create: {
      providerId: provider.id,
      modelId: imageModel.id,
      realModelId: "dall-e-3",
      status: "ACTIVE",
      priority: 1,
      costPrice: { unit: "call", perCall: 0.001, currency: "USD" },
      sellPrice: { unit: "call", perCall: 0.002, currency: "USD" },
    },
  });

  // Ensure aliases exist and link to models (router resolves via ModelAlias)
  const textAlias = await prisma.modelAlias.upsert({
    where: { alias: "openai/gpt-4o-mini" },
    update: { enabled: true, modality: "TEXT" },
    create: { alias: "openai/gpt-4o-mini", enabled: true, modality: "TEXT" },
  });
  await prisma.aliasModelLink.upsert({
    where: { aliasId_modelId: { aliasId: textAlias.id, modelId: textModel.id } },
    update: {},
    create: { aliasId: textAlias.id, modelId: textModel.id },
  });

  const imageAlias = await prisma.modelAlias.upsert({
    where: { alias: "openai/dall-e-3" },
    update: { enabled: true, modality: "IMAGE" },
    create: { alias: "openai/dall-e-3", enabled: true, modality: "IMAGE" },
  });
  await prisma.aliasModelLink.upsert({
    where: { aliasId_modelId: { aliasId: imageAlias.id, modelId: imageModel.id } },
    update: {},
    create: { aliasId: imageAlias.id, modelId: imageModel.id },
  });

  return {
    providerId: provider.id,
    baseUrl: provider.baseUrl,
    authConfig: provider.authConfig,
    textChannelStates: textChannels.map((c) => ({ id: c.id, status: c.status })),
    imageChannelStates: imageChannels.map((c) => ({ id: c.id, status: c.status })),
  };
}

async function restoreRouting(state: RestoreState) {
  await prisma.provider.update({
    where: { id: state.providerId },
    data: { baseUrl: state.baseUrl, authConfig: state.authConfig as any },
  });
  for (const c of [...state.textChannelStates, ...state.imageChannelStates]) {
    await prisma.channel.update({ where: { id: c.id }, data: { status: c.status as any } });
  }
}

async function step(name: string, out: StepResult[], fn: () => Promise<string | undefined>) {
  try {
    const detail = await fn();
    out.push({ name, ok: true, detail });
  } catch (err) {
    out.push({ name, ok: false, detail: (err as Error).message });
  }
}

async function main() {
  const checks: StepResult[] = [];
  const mock = await startMockProvider({ port: MOCK_PORT, onRequest: customImageHandler });
  MOCK_BASE = `${mock.baseUrl}/v1`;
  const restore = await prepareRouting();

  try {
    await registerAndLogin();
    await createProjectAndKey();

    await step("mcp initialize", checks, async () => {
      const init = await rawMcp("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "sb-tester", version: "1.0.0" },
      });
      if (init.status !== 200) throw new Error(`initialize failed: ${init.status}`);
      return "ok";
    });

    await step("F-SB-01 MCP generate_image invalid size sanitized", checks, async () => {
      const r = await callToolRaw("generate_image", {
        model: "openai/dall-e-3",
        prompt: "x",
        size: "999x999",
      });
      if (r.ok) throw new Error("expected error");
      const err = String(r.error ?? "");
      assertNoLeak(err);
      return err;
    });

    await step("F-SB-01 REST generate_image empty prompt handled", checks, async () => {
      const res = await api("/api/v1/images/generations", {
        method: "POST",
        auth: "key",
        body: JSON.stringify({ model: "openai/dall-e-3", prompt: "   ", size: "1024x1024" }),
      });
      const raw = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
      // Whether error or success, ensure no sensitive info leaks
      assertNoLeak(raw);
      return `status=${res.status}`;
    });

    await step("F-SB-03 empty content blocked at gateway", checks, async () => {
      const r = await callToolRaw("chat", {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "   " }],
      });
      if (r.ok) throw new Error("expected invalid_request error");
      const err = String(r.error ?? "");
      if (!err.includes("invalid_request")) throw new Error(`unexpected error: ${err}`);
      return err;
    });

    await step("F-SB-02 chat call deducts balance", checks, async () => {
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { balance: true },
      });
      const r = await callToolRaw("chat", {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      });
      if (!r.ok) throw new Error(`chat failed: ${r.error}`);

      let delta = 0;
      for (let i = 0; i < 5; i++) {
        const after = await prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { balance: true },
        });
        delta = Number(before.balance) - Number(after.balance);
        if (delta > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (delta <= 0) throw new Error(`expected balance decrease, got delta=${delta}`);
      return `delta=${delta.toFixed(8)}`;
    });
  } finally {
    await restoreRouting(restore).catch(() => undefined);
    await mock.close();
    await prisma.$disconnect();
  }

  const fail = checks.filter((c) => !c.ok).length;
  const report = {
    batch: "security-billing-polish",
    generatedAt: new Date().toISOString(),
    environment: BASE,
    checks,
    pass: checks.length - fail,
    fail,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  const report = {
    batch: "security-billing-polish",
    generatedAt: new Date().toISOString(),
    environment: BASE,
    checks: [] as StepResult[],
    fatal: (err as Error).stack ?? String(err),
    pass: 0,
    fail: 1,
  };
  writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.error((err as Error).stack ?? String(err));
  process.exit(1);
});
