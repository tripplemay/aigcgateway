import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const MCP_URL = `${BASE}/mcp`;
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3312");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}/v1`;
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/mcp-capability-enhancement-local-e2e-2026-04-05.json";

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
let projectId = "";
let apiKey = "";
const email = `mce_${Date.now()}@test.com`;
const password = requireEnv("E2E_TEST_PASSWORD");

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

function extractPrompt(body: any): string {
  const lastUser = [...(body.messages ?? [])]
    .reverse()
    .find((m: any) => m?.role === "user");
  return String(lastUser?.content ?? "");
}

function buildMockOutput(input: string, jsonMode: boolean): string {
  if (jsonMode) {
    return JSON.stringify({ ok: true, prompt: input });
  }
  if (input.startsWith("SPLIT:")) {
    const parts = input
      .slice("SPLIT:".length)
      .trim()
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((content) => ({ content }));
    return JSON.stringify(parts);
  }
  if (input.startsWith("BRANCH:")) return `BRANCH(${input.slice("BRANCH:".length).trim()})`;
  if (input.startsWith("MERGE:")) return `MERGE(${input.slice("MERGE:".length).trim()})`;
  return `OUT(${input.trim()})`;
}

async function startMockServer() {
  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const text = await readBody(req);
      const body = JSON.parse(text || "{}");
      const prompt = extractPrompt(body);
      const output = buildMockOutput(prompt, body.response_format?.type === "json_object");
      const created = Math.floor(Date.now() / 1000);
      const usage = { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 };

      if (body.stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        const mid = Math.ceil(output.length / 2);
        const chunks = [output.slice(0, mid), output.slice(mid)].filter(Boolean);
        for (const piece of chunks) {
          const chunk = {
            id: "chatcmpl-mock",
            object: "chat.completion.chunk",
            created,
            model: body.model ?? "openai/gpt-4o-mini",
            choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
          };
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        const finalChunk = {
          id: "chatcmpl-mock",
          object: "chat.completion.chunk",
          created,
          model: body.model ?? "openai/gpt-4o-mini",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage,
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      json(res, 200, {
        id: "chatcmpl-mock",
        object: "chat.completion",
        created,
        model: body.model ?? "openai/gpt-4o-mini",
        choices: [{ index: 0, message: { role: "assistant", content: output }, finish_reason: "stop" }],
        usage,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/v1/images/generations") {
      json(res, 200, {
        created: Math.floor(Date.now() / 1000),
        data: [{ url: "https://example.com/mock-image.png" }],
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
  if (!res.ok) {
    throw new Error(`MCP ${method} HTTP ${res.status}: ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split("\n");
    let lastData = "";
    for (const line of lines) {
      if (line.startsWith("data: ")) lastData = line.slice(6);
    }
    if (!lastData) {
      throw new Error(`Unable to parse MCP response: ${text.slice(0, 200)}`);
    }
    return JSON.parse(lastData);
  }
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const result = await rawMcpRequest("tools/call", { name, arguments: args });
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result.result ?? result;
}

function parseTextContent(result: any): string {
  const text = result?.content?.[0]?.text ?? "";
  if (!text) throw new Error("No text content in MCP result");
  return text;
}

async function registerAndLogin() {
  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email, password, name: "MCE Local Tester" }),
  });
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });
  token = login.body.token;
}

async function createProjectAndKey() {
  const projectName = `MCE Project ${Date.now()}`;
  const project = await api("/api/projects", {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: projectName }),
  });
  projectId = String(project.body?.id ?? "");

  if (!projectId) {
    const projects = await api("/api/projects", { method: "GET", expect: 200 });
    const matched = (projects.body?.data ?? []).find((p: any) => p.name === projectName);
    projectId = String(matched?.id ?? "");
  }

  if (!projectId) {
    throw new Error(`create project returned no usable id: ${JSON.stringify(project.body)}`);
  }

  const key = await api(`/api/projects/${projectId}/keys`, {
    method: "POST",
    expect: 201,
    body: JSON.stringify({ name: "mce-local-key" }),
  });
  apiKey = String(key.body?.key ?? "");

  if (!apiKey) {
    throw new Error(`create key returned no raw key: ${JSON.stringify(key.body)}`);
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { balance: 20 },
  });
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
      capabilities: { streaming: true, json_mode: true, tools: true, unknown: false },
    },
    create: {
      name: "openai/gpt-4o-mini",
      displayName: "OpenAI GPT-4o-mini",
      modality: "TEXT",
      contextWindow: 128000,
      maxTokens: 16384,
      capabilities: { streaming: true, json_mode: true, tools: true, unknown: false },
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
      providerId_modelId_realModelId: {
        providerId: provider.id,
        modelId: textModel.id,
        realModelId: "gpt-4o-mini",
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
      providerId_modelId_realModelId: {
        providerId: provider.id,
        modelId: imageModel.id,
        realModelId: "dall-e-3",
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

async function waitForLog(where: Record<string, unknown>, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const log = await prisma.callLog.findFirst({ where: where as any, orderBy: { createdAt: "desc" } });
    if (log) return log;
    await new Promise((r) => setTimeout(r, 300));
  }
  return prisma.callLog.findFirst({ where: where as any, orderBy: { createdAt: "desc" } });
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
  const server = await startMockServer();
  const restoreState = await ensureLocalModels();

  let actionId = "";
  let templateId = "";
  let templateRunId = "";
  let streamTraceId = "";

  try {
    await registerAndLogin();
    await createProjectAndKey();

    await step("MCP initialize + SERVER_INSTRUCTIONS", results, async () => {
      const init = await rawMcpRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "codex-evaluator", version: "1.0.0" },
      });
      const result = init.result ?? init;
      if (!result?.serverInfo?.name) throw new Error("missing serverInfo.name");
      const instructions = String(result.instructions ?? "");
      const required = ["Quick Start", "list_actions", "run_template", "get_usage_summary"];
      for (const item of required) {
        if (!instructions.includes(item)) throw new Error(`instructions missing ${item}`);
      }
      return result.serverInfo.name;
    });

    await step("tools/list includes 11 tools", results, async () => {
      const list = await rawMcpRequest("tools/list");
      const tools = list.result?.tools ?? [];
      const names = tools.map((t: any) => t.name).sort();
      const required = [
        "list_models",
        "chat",
        "generate_image",
        "list_logs",
        "get_log_detail",
        "get_balance",
        "get_usage_summary",
        "list_actions",
        "run_action",
        "list_templates",
        "run_template",
      ];
      for (const name of required) {
        if (!names.includes(name)) throw new Error(`missing tool ${name}`);
      }
      if (tools.length !== 11) throw new Error(`expected 11 tools, got ${tools.length}`);
      return names.join(", ");
    });

    await step("list_models returns capabilities + no case duplicates", results, async () => {
      const result = await callTool("list_models");
      const data = JSON.parse(parseTextContent(result));
      if (!Array.isArray(data) || data.length === 0) throw new Error("list_models returned empty");
      const lowered = data.map((m: any) => String(m.name).toLowerCase());
      if (new Set(lowered).size !== lowered.length) throw new Error("case-insensitive duplicates found");
      if (data.some((m: any) => m.capabilities === null || m.capabilities === undefined)) {
        throw new Error("capabilities missing");
      }
      return `${data.length} models`;
    });

    await step("get_balance", results, async () => {
      const result = await callTool("get_balance");
      const data = JSON.parse(parseTextContent(result));
      if (data.balance === undefined) throw new Error("balance missing");
      return String(data.balance);
    });

    await step("list_actions empty guidance", results, async () => {
      const result = await callTool("list_actions");
      const data = JSON.parse(parseTextContent(result));
      if (!Array.isArray(data.data) || data.data.length !== 0) throw new Error("expected empty actions");
      if (!String(data.message ?? "").includes("/actions")) throw new Error("missing actions guidance");
      return data.message;
    });

    await step("list_templates empty guidance", results, async () => {
      const result = await callTool("list_templates");
      const data = JSON.parse(parseTextContent(result));
      if (!Array.isArray(data.data) || data.data.length !== 0) throw new Error("expected empty templates");
      if (!String(data.message ?? "").includes("/templates")) throw new Error("missing templates guidance");
      return data.message;
    });

    const action = await createAction({
      name: "mce-action",
      content: "ACTION {{topic}}",
      variables: [{ name: "topic", description: "topic", required: true }],
    });
    actionId = action.id;
    const action2 = await createAction({
      name: "mce-template-step-2",
      content: "STEP2 {{previous_output}}",
      variables: [{ name: "previous_output", description: "prev", required: true }],
    });
    const template = await createTemplate({
      name: "mce-template",
      description: "mce-template",
      steps: [
        { actionId: action.id, order: 0, role: "SEQUENTIAL" },
        { actionId: action2.id, order: 1, role: "SEQUENTIAL" },
      ],
    });
    templateId = template.id;

    await step("list_actions with data", results, async () => {
      const result = await callTool("list_actions");
      const data = JSON.parse(parseTextContent(result));
      if (!Array.isArray(data.data) || data.data.length < 1) throw new Error("actions not listed");
      if ("message" in data) throw new Error("unexpected message on non-empty actions");
      return `${data.data.length} actions`;
    });

    await step("list_templates with data", results, async () => {
      const result = await callTool("list_templates");
      const data = JSON.parse(parseTextContent(result));
      if (!Array.isArray(data.data) || data.data.length < 1) throw new Error("templates not listed");
      if ("message" in data) throw new Error("unexpected message on non-empty templates");
      return `${data.data.length} templates`;
    });

    await step("run_action", results, async () => {
      const result = await callTool("run_action", { action_id: actionId, variables: { topic: "alpha" } });
      const data = JSON.parse(parseTextContent(result));
      if (!String(data.output ?? "").includes("ACTION alpha")) throw new Error("unexpected run_action output");
      if (!data.traceId) throw new Error("missing traceId");
      return data.traceId;
    });

    await step("run_template", results, async () => {
      const result = await callTool("run_template", { template_id: templateId, variables: { topic: "beta" } });
      const data = JSON.parse(parseTextContent(result));
      if (!String(data.output ?? "").includes("STEP2 OUT(ACTION beta)")) {
        throw new Error(`unexpected run_template output: ${data.output}`);
      }
      const log = await waitForLog({ projectId, templateRunId: { not: null } });
      if (!log?.templateRunId) throw new Error("missing templateRunId log");
      templateRunId = log.templateRunId;
      return templateRunId;
    });

    await step("chat stream=true", results, async () => {
      const result = await callTool("chat", {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "MCE STREAM HELLO" }],
        stream: true,
      });
      const data = JSON.parse(parseTextContent(result));
      if (!String(data.content ?? "").includes("MCE STREAM HELLO")) throw new Error("stream content mismatch");
      if (typeof data.ttftMs !== "number" || data.ttftMs < 0) throw new Error("ttftMs missing");
      if (!data.traceId) throw new Error("missing stream traceId");
      streamTraceId = data.traceId;
      return JSON.stringify({ traceId: data.traceId, ttftMs: data.ttftMs });
    });

    await step("get_log_detail includes ttftMs", results, async () => {
      const result = await callTool("get_log_detail", { trace_id: streamTraceId });
      const data = JSON.parse(parseTextContent(result));
      if (typeof data.ttftMs !== "number") throw new Error("ttftMs missing from get_log_detail");
      if (data.source !== "mcp") throw new Error(`unexpected source ${data.source}`);
      return JSON.stringify({ ttftMs: data.ttftMs, source: data.source });
    });

    await step("chat response_format=json_object", results, async () => {
      const result = await callTool("chat", {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "MCE JSON HELLO" }],
        response_format: { type: "json_object" },
      });
      const data = JSON.parse(parseTextContent(result));
      const parsed = JSON.parse(String(data.content ?? ""));
      if (parsed.ok !== true) throw new Error("json_object content not valid JSON");
      return JSON.stringify(parsed);
    });

    await step("generate_image", results, async () => {
      const result = await callTool("generate_image", {
        model: "openai/dall-e-3",
        prompt: "a red square",
        size: "1024x1024",
      });
      const data = JSON.parse(parseTextContent(result));
      if (!Array.isArray(data.images) || data.images.length !== 1) throw new Error("image result missing");
      return data.images[0];
    });

    await step("list_logs", results, async () => {
      const result = await callTool("list_logs", { limit: 5 });
      const data = JSON.parse(parseTextContent(result));
      if (!Array.isArray(data) || data.length === 0) throw new Error("list_logs empty");
      return `${data.length} logs`;
    });

    await step("get_usage_summary source/day grouping", results, async () => {
      const result = await callTool("get_usage_summary", { source: "mcp", group_by: "source", period: "7d" });
      const data = JSON.parse(parseTextContent(result));
      const group = (data.groups ?? []).find((g: any) => g.key === "mcp");
      if (!group) throw new Error("missing mcp source group");
      return JSON.stringify(group);
    });

    await step("get_usage_summary action_id + group_by=action", results, async () => {
      const result = await callTool("get_usage_summary", {
        action_id: actionId,
        group_by: "action",
        period: "7d",
      });
      const data = JSON.parse(parseTextContent(result));
      const groups = data.groups ?? [];
      if (!Array.isArray(groups) || groups.length === 0) throw new Error("missing action groups");
      if (!String(groups[0].key ?? "").includes("mce-action")) throw new Error("action name missing in group key");
      return JSON.stringify(groups[0]);
    });

    await step("get_usage_summary template_id + group_by=template", results, async () => {
      const result = await callTool("get_usage_summary", {
        template_id: templateId,
        group_by: "template",
        period: "7d",
      });
      const data = JSON.parse(parseTextContent(result));
      const groups = data.groups ?? [];
      if (!Array.isArray(groups) || groups.length === 0) {
        throw new Error(`missing template groups for template_id=${templateId}`);
      }
      if (!String(groups[0].key ?? "").includes("mce-template")) {
        throw new Error(`template name missing in group key: ${groups[0].key}`);
      }
      return JSON.stringify(groups[0]);
    });
  } finally {
    await restoreLocalModels(restoreState);
    server.close();
    await prisma.$disconnect();
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const summary = { passed, failed, results, projectId, apiKeyPrefix: apiKey.slice(0, 8), actionId, templateId, templateRunId, streamTraceId };
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
