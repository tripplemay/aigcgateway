import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { startMockProvider } from "../../tests/mocks/provider-server";
import { createTestUser, createTestProject, createTestApiKey } from "../../tests/factories";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const MCP_URL = `${BASE}/mcp`;
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3313");
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ?? "docs/test-reports/mcp-dx-round2-local-e2e-2026-04-06.json";

const prisma = new PrismaClient();

type StepResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

type RestoreState = {
  providerId: string;
  baseUrl: string;
  authConfig: unknown;
  channelStates: Array<{ id: string; status: string }>;
};

let token = "";
let userId = "";
let projectId = "";
let apiKey = "";
let MOCK_BASE = "";

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
  return { res, body, text };
}

async function rawMcpRequest(method: string, params?: Record<string, unknown>) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params: params ?? {},
    }),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    const lines = text.split("\n");
    let lastData = "";
    for (const line of lines) {
      if (line.startsWith("data: ")) lastData = line.slice(6);
    }
    body = lastData ? JSON.parse(lastData) : text;
  }
  return { status: res.status, body, text };
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const rpc = await rawMcpRequest("tools/call", { name, arguments: args });
  if (rpc.status >= 400) throw new Error(`HTTP ${rpc.status}: ${rpc.text}`);
  if (rpc.body?.error) throw new Error(`RPC error: ${JSON.stringify(rpc.body.error)}`);
  const result = rpc.body?.result ?? rpc.body;
  if (result?.isError) {
    throw new Error(result?.content?.[0]?.text ?? `tool ${name} returned isError`);
  }
  return result;
}

async function callToolExpectError(name: string, args: Record<string, unknown> = {}) {
  const rpc = await rawMcpRequest("tools/call", { name, arguments: args });
  if (rpc.status >= 400) return rpc.text;
  if (rpc.body?.error) return JSON.stringify(rpc.body.error);
  const result = rpc.body?.result ?? rpc.body;
  if (result?.isError) return String(result?.content?.[0]?.text ?? "tool_error");
  throw new Error(`Expected error for ${name}, got success: ${JSON.stringify(result)}`);
}

function parseToolJson(result: any): any {
  const text = result?.content?.[0]?.text ?? "";
  if (!text) throw new Error("No text content in MCP result");
  return JSON.parse(text);
}

async function registerAndLogin() {
  const user = await createTestUser(BASE, { prefix: "dx2", name: "DX2 Local Tester" });
  token = user.token;
  userId = user.userId;
}

async function createProjectAndKey() {
  const project = await createTestProject(BASE, token, { name: `DX2 Project ${Date.now()}` });
  projectId = project.id;

  await prisma.user.update({
    where: { id: userId },
    data: { defaultProjectId: projectId, balance: 20 },
  });

  const key = await createTestApiKey(BASE, token, { name: "dx2-local-key" });
  apiKey = key.key;
}

async function ensureLocalModels(): Promise<RestoreState> {
  const provider = await prisma.provider.findUniqueOrThrow({
    where: { name: "openai" },
    select: { id: true, baseUrl: true, authConfig: true },
  });

  const textModel = await prisma.model.upsert({
    where: { name: "openai/gpt-4o-mini" },
    update: {
      displayName: "OpenAI GPT-4o-mini",
      modality: "TEXT",
      contextWindow: 128000,
      maxTokens: 16384,
      capabilities: { streaming: true, json_mode: true, unknown: false },
    },
    create: {
      name: "openai/gpt-4o-mini",
      displayName: "OpenAI GPT-4o-mini",
      modality: "TEXT",
      contextWindow: 128000,
      maxTokens: 16384,
      capabilities: { streaming: true, json_mode: true, unknown: false },
    },
  });

  const imageModel = await prisma.model.upsert({
    where: { name: "openai/dall-e-3" },
    update: {
      displayName: "OpenAI DALL-E 3",
      modality: "IMAGE",
      capabilities: { unknown: false },
    },
    create: {
      name: "openai/dall-e-3",
      displayName: "OpenAI DALL-E 3",
      modality: "IMAGE",
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

  const restore: RestoreState = {
    providerId: provider.id,
    baseUrl: provider.baseUrl,
    authConfig: provider.authConfig,
    channelStates: [...textChannels, ...imageChannels].map((c) => ({ id: c.id, status: c.status })),
  };

  await prisma.provider.update({
    where: { id: provider.id },
    data: { baseUrl: MOCK_BASE, authConfig: { apiKey: "mock-openai-key" } },
  });

  for (const c of [...textChannels, ...imageChannels]) {
    await prisma.channel.update({ where: { id: c.id }, data: { status: "DISABLED" } });
  }

  await prisma.channel.upsert({
    where: {
      providerId_modelId: {
        providerId: provider.id,
        modelId: textModel.id,
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
      modelId: textModel.id,
      realModelId: "gpt-4o-mini",
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
      sellPrice: { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
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
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "call", perCall: 0.01, currency: "USD" },
      sellPrice: { unit: "call", perCall: 0.012, currency: "USD" },
    },
    create: {
      providerId: provider.id,
      modelId: imageModel.id,
      realModelId: "dall-e-3",
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "call", perCall: 0.01, currency: "USD" },
      sellPrice: { unit: "call", perCall: 0.012, currency: "USD" },
    },
  });

  return restore;
}

async function restoreLocalModels(state: RestoreState) {
  await prisma.provider.update({
    where: { id: state.providerId },
    data: { baseUrl: state.baseUrl, authConfig: state.authConfig as any },
  });
  for (const channel of state.channelStates) {
    await prisma.channel.update({
      where: { id: channel.id },
      data: { status: channel.status as any },
    });
  }
}

async function createAction(input: {
  name: string;
  content: string;
  variables: Array<{ name: string; description: string; required: boolean }>;
}) {
  const res = await api(`/api/projects/${projectId}/actions`, {
    method: "POST",
    expect: 201,
    body: JSON.stringify({
      name: input.name,
      description: input.name,
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: input.content }],
      variables: input.variables,
      changelog: "init",
    }),
  });
  return res.body;
}

async function createTemplate(input: {
  name: string;
  description: string;
  steps: Array<{ actionId: string; order: number; role: string }>;
}) {
  const res = await api(`/api/projects/${projectId}/templates`, {
    method: "POST",
    expect: 201,
    body: JSON.stringify(input),
  });
  return res.body;
}

async function createProjectAndKeyForRateLimit(): Promise<{ pid: string; rawKey: string }> {
  const p = await api("/api/projects", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: `DX2 RL ${Date.now()}` }),
  });
  const pid = String(p.body?.id ?? "");
  if (!pid) throw new Error("rate-limit project id missing");

  const k = await api("/api/keys", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: "dx2-rate-limit-key", rateLimit: 1 }),
  });
  const rawKey = String(k.body?.key ?? "");
  if (!rawKey) throw new Error("rate-limit key missing");

  await prisma.user.update({ where: { id: userId }, data: { balance: 20 } });
  return { pid, rawKey };
}

async function step(name: string, results: StepResult[], fn: () => Promise<string | undefined>) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message });
  }
}

async function main() {
  const results: StepResult[] = [];
  const mockServer = await startMockProvider({ port: MOCK_PORT });
  MOCK_BASE = `${mockServer.baseUrl}/v1`;
  const restoreState = await ensureLocalModels();
  let actionId = "";
  let templateId = "";
  let traceId = "";

  try {
    await registerAndLogin();
    await createProjectAndKey();

    await step("tools/list includes 13 tools", results, async () => {
      const rpc = await rawMcpRequest("tools/list");
      if (rpc.status >= 400 || rpc.body?.error) {
        throw new Error(`tools/list failed: ${rpc.status} ${JSON.stringify(rpc.body)}`);
      }
      const tools = rpc.body?.result?.tools ?? [];
      const names = tools.map((t: any) => t.name).sort();
      const required = [
        "chat",
        "generate_image",
        "get_action_detail",
        "get_balance",
        "get_log_detail",
        "get_template_detail",
        "get_usage_summary",
        "list_actions",
        "list_logs",
        "list_models",
        "list_templates",
        "run_action",
        "run_template",
      ];
      for (const tool of required) {
        if (!names.includes(tool)) throw new Error(`missing tool ${tool}`);
      }
      if (tools.length !== 13) throw new Error(`expected 13 tools, got ${tools.length}`);
      return names.join(", ");
    });

    await step("generate_image tool description contains size guidance", results, async () => {
      const rpc = await rawMcpRequest("tools/list");
      const tools = rpc.body?.result?.tools ?? [];
      const imageTool = tools.find((t: any) => t.name === "generate_image");
      const desc = String(imageTool?.description ?? "");
      const required = [
        "openai/gpt-image-1",
        "1024x1024",
        "1536x1024",
        "openai/dall-e-3",
        "1792x1024",
      ];
      for (const s of required) {
        if (!desc.includes(s)) throw new Error(`description missing ${s}`);
      }
      return "size guidance present";
    });

    await step("list_models quality gate", results, async () => {
      const data = parseToolJson(await callTool("list_models"));
      if (!Array.isArray(data) || data.length === 0) throw new Error("empty model list");
      if (data.length > 28) throw new Error(`expected <= 28 models, got ${data.length}`);

      const lowered = data.map((m: any) => String(m.name).toLowerCase());
      if (new Set(lowered).size !== lowered.length)
        throw new Error("case-insensitive duplicates found");

      for (const m of data) {
        const caps = m.capabilities;
        if (!caps || typeof caps !== "object" || Object.keys(caps).length === 0) {
          throw new Error(`empty capabilities for ${m.name}`);
        }
        if (String(m.price ?? "").trim() === "$0")
          throw new Error(`$0 pricing noise for ${m.name}`);
        if (m.price === null) throw new Error(`null price for ${m.name}`);
      }
      return `${data.length} deduped models`;
    });

    await step("list_models show_all_channels=true", results, async () => {
      const data = parseToolJson(await callTool("list_models", { show_all_channels: true }));
      if (!Array.isArray(data) || data.length === 0) throw new Error("empty model list");
      const sample = data.find((m: any) => Array.isArray(m.channels));
      if (!sample) throw new Error("channels field missing under show_all_channels");
      return `${sample.name} channels=${sample.channels.length}`;
    });

    const actionA = await createAction({
      name: "dx2-action-a",
      content: "ACTION {{topic}}",
      variables: [{ name: "topic", description: "topic", required: true }],
    });
    actionId = actionA.id;
    const actionB = await createAction({
      name: "dx2-action-b",
      content: "STEP2 {{previous_output}}",
      variables: [{ name: "previous_output", description: "previous", required: true }],
    });
    const template = await createTemplate({
      name: "dx2-template",
      description: "dx2-template",
      steps: [
        { actionId: actionA.id, order: 0, role: "SEQUENTIAL" },
        { actionId: actionB.id, order: 1, role: "SEQUENTIAL" },
      ],
    });
    templateId = template.id;

    await step("all 13 tools callable (smoke)", results, async () => {
      parseToolJson(await callTool("get_balance"));
      parseToolJson(await callTool("list_actions"));
      parseToolJson(await callTool("list_templates"));
      parseToolJson(
        await callTool("run_action", { action_id: actionId, variables: { topic: "smoke" } }),
      );
      parseToolJson(
        await callTool("run_template", { template_id: templateId, variables: { topic: "smoke" } }),
      );

      const chatResult = parseToolJson(
        await callTool("chat", {
          model: "openai/gpt-4o-mini",
          messages: [{ role: "user", content: "DX2 chat smoke" }],
        }),
      );
      traceId = String(chatResult.traceId ?? "");
      if (!traceId) throw new Error("chat traceId missing");

      parseToolJson(
        await callTool("generate_image", { model: "openai/dall-e-3", prompt: "red cube" }),
      );
      parseToolJson(await callTool("list_logs", { limit: 5 }));
      parseToolJson(await callTool("get_log_detail", { trace_id: traceId }));
      parseToolJson(await callTool("get_usage_summary", { period: "7d" }));
      parseToolJson(await callTool("get_action_detail", { action_id: actionId }));
      parseToolJson(await callTool("get_template_detail", { template_id: templateId }));
      return `traceId=${traceId}`;
    });

    await step("get_action_detail returns messages and variables", results, async () => {
      const data = parseToolJson(await callTool("get_action_detail", { action_id: actionId }));
      if (!data.activeVersion) throw new Error("activeVersion missing");
      if (!Array.isArray(data.activeVersion.messages) || data.activeVersion.messages.length === 0) {
        throw new Error("activeVersion.messages missing");
      }
      if (
        !Array.isArray(data.activeVersion.variables) ||
        data.activeVersion.variables.length === 0
      ) {
        throw new Error("activeVersion.variables missing");
      }
      if (!Array.isArray(data.versions) || data.versions.length === 0)
        throw new Error("versions missing");
      return `versions=${data.versions.length}`;
    });

    await step("get_template_detail returns orchestration steps", results, async () => {
      const data = parseToolJson(
        await callTool("get_template_detail", { template_id: templateId }),
      );
      if (data.executionMode !== "sequential")
        throw new Error(`executionMode=${data.executionMode}`);
      if (!Array.isArray(data.steps) || data.steps.length < 2) throw new Error("steps missing");
      if (
        !Array.isArray(data.reservedVariables) ||
        !data.reservedVariables.includes("{{previous_output}}")
      ) {
        throw new Error("reservedVariables missing {{previous_output}}");
      }
      return `steps=${data.steps.length}`;
    });

    await step("error: insufficient balance", results, async () => {
      await prisma.user.update({ where: { id: userId }, data: { balance: 0 } });
      const msg = await callToolExpectError("chat", {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "balance check" }],
      });
      if (!msg.toLowerCase().includes("insufficient balance")) {
        throw new Error(`unexpected message: ${msg}`);
      }
      await prisma.user.update({ where: { id: userId }, data: { balance: 20 } });
      return "insufficient balance message verified";
    });

    await step("error: model not found", results, async () => {
      const msg = await callToolExpectError("chat", {
        model: "openai/not-exist-model",
        messages: [{ role: "user", content: "model check" }],
      });
      if (!msg.toLowerCase().includes("not found")) throw new Error(`unexpected message: ${msg}`);
      return "model_not_found message verified";
    });

    await step("error: invalid parameter type", results, async () => {
      const rpc = await rawMcpRequest("tools/call", {
        name: "chat",
        arguments: {
          model: "openai/gpt-4o-mini",
          messages: "not-an-array",
        },
      });
      const text = JSON.stringify(rpc.body);
      const hasValidationError =
        rpc.status >= 400 ||
        Boolean(rpc.body?.error) ||
        text.includes("invalid_type") ||
        text.toLowerCase().includes("invalid");
      if (!hasValidationError) throw new Error(`expected validation error, got ${text}`);
      return "schema validation error verified";
    });

    await step("error: rate limit exceeded", results, async () => {
      const isolated = await createProjectAndKeyForRateLimit();
      const oldApiKey = apiKey;
      apiKey = isolated.rawKey;
      await callTool("chat", {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "rate-limit pass 1" }],
      });
      const msg = await callToolExpectError("chat", {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "rate-limit pass 2" }],
      });
      if (!msg.toLowerCase().includes("rate limit")) throw new Error(`unexpected message: ${msg}`);
      apiKey = oldApiKey;
      return `rate limit message verified (project=${isolated.pid})`;
    });
  } finally {
    try {
      await restoreLocalModels(restoreState);
    } catch {}
    await mockServer.close();
    await prisma.$disconnect();
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const summary = {
    passed,
    failed,
    results,
    projectId,
    apiKeyPrefix: apiKey.slice(0, 8),
    actionId,
    templateId,
    traceId,
  };
  writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  const fatal = { fatal: (error as Error).message };
  try {
    writeFileSync(OUTPUT_FILE, JSON.stringify(fatal, null, 2));
  } catch {}
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
