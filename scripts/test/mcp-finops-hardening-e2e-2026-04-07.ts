import "../../tests/helpers/load-test-env";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { startMockProvider, jsonResponse } from "../../tests/mocks/provider-server";
import { createTestUser, createTestProject, createTestApiKey } from "../../tests/factories";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const MCP_URL = `${BASE}/mcp`;
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3314");
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/mcp-finops-hardening-verifying-local-e2e-2026-04-07.json";

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

/** Custom image handler: return 400 for size "999x999" to test error sanitization */
function customImageHandler(
  req: import("http").IncomingMessage,
  res: import("http").ServerResponse,
  body: string,
): boolean {
  if (req.method === "POST" && req.url === "/v1/images/generations") {
    const parsed = JSON.parse(body || "{}");
    if (parsed.size === "999x999") {
      jsonResponse(res, 400, {
        error: {
          message:
            "invalid_size; contact QQ 123456; docs: https://evil.example/debug ; key=sk-live-abc123",
          code: "invalid_size",
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

function parseToolJson(result: any): any {
  const text = result?.content?.[0]?.text ?? "";
  if (!text) throw new Error("No text content in MCP result");
  return JSON.parse(text);
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

async function callToolRaw(name: string, args: Record<string, unknown> = {}) {
  const rpc = await rawMcpRequest("tools/call", { name, arguments: args });
  if (rpc.status >= 400) return { ok: false, error: rpc.text };
  if (rpc.body?.error) return { ok: false, error: JSON.stringify(rpc.body.error) };
  const result = rpc.body?.result ?? rpc.body;
  if (result?.isError)
    return { ok: false, error: String(result?.content?.[0]?.text ?? "tool_error") };
  return { ok: true, result };
}

async function registerAndLogin() {
  const user = await createTestUser(BASE, { prefix: "mh", name: "MH Local Tester" });
  token = user.token;
  const dbUser = await prisma.user.findUnique({
    where: { email: user.email },
    select: { id: true },
  });
  userId = String(dbUser?.id ?? "");
  if (!userId) throw new Error("registerAndLogin: user not found in database");
}

async function createProjectAndKey() {
  const project = await createTestProject(BASE, token, { name: `MH Project ${Date.now()}` });
  projectId = project.id;

  await prisma.user.update({
    where: { id: userId },
    data: { defaultProjectId: projectId, balance: 20 },
  });

  const key = await createTestApiKey(BASE, token, {
    name: "mh-local-key",
    rateLimit: 120,
  });
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

  const imageModel = await prisma.model.upsert({
    where: { name: "openai/dall-e-3" },
    update: {
      enabled: true,
      displayName: "OpenAI DALL-E 3",
      modality: "IMAGE",
      capabilities: { unknown: false },
    },
    create: {
      name: "openai/dall-e-3",
      enabled: true,
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
    data: { baseUrl: MOCK_BASE, authConfig: { apiKey: "mock-openai-key" }, proxyUrl: null },
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

function parseDollar(v: unknown): number {
  return Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
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
  const mockServer = await startMockProvider({ port: MOCK_PORT, onRequest: customImageHandler });
  MOCK_BASE = `${mockServer.baseUrl}/v1`;
  const restoreState = await ensureLocalModels();

  let actionId = "";
  let v1 = "";
  let v2 = "";
  let templateId = "";

  try {
    await registerAndLogin();
    await createProjectAndKey();

    await step("mcp initialize", results, async () => {
      const init = await rawMcpRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "mh-tester", version: "1.0.0" },
      });
      if (init.status !== 200) throw new Error(`initialize status=${init.status}`);
      if (!init.body?.result?.serverInfo?.name) throw new Error("serverInfo missing");
      return String(init.body.result.serverInfo.name);
    });

    const action = await createAction({
      name: "mh-action",
      content: "OLD {{topic}}",
      variables: [{ name: "topic", description: "topic", required: true }],
    });
    actionId = String(action.id);
    v1 = String(action.activeVersionId);

    const v2Resp = await api(`/api/projects/${projectId}/actions/${actionId}/versions`, {
      method: "POST",
      expect: 201,
      body: JSON.stringify({
        messages: [{ role: "user", content: "NEW {{topic}}" }],
        variables: [{ name: "topic", description: "topic", required: true }],
        changelog: "v2",
      }),
    });
    v2 = String(v2Resp.body?.id ?? "");
    if (!v2) throw new Error("v2 id missing");

    const action2 = await createAction({
      name: "mh-action-2",
      content: "S2 {{previous_output}}",
      variables: [{ name: "previous_output", description: "prev", required: true }],
    });

    const tpl = await createTemplate({
      name: "mh-template",
      description: "mh-template",
      steps: [
        { actionId, order: 0, role: "SEQUENTIAL" },
        { actionId: String(action2.id), order: 1, role: "SEQUENTIAL" },
      ],
    });
    templateId = String(tpl.id ?? "");

    await step("F-MH-01 generate_image invalid size no upstream leak", results, async () => {
      const r = await callToolRaw("generate_image", {
        model: "openai/dall-e-3",
        prompt: "draw a test image",
        size: "999x999",
      });
      if (r.ok)
        throw new Error(`expected error, got success: ${JSON.stringify(parseToolJson(r.result))}`);
      const err = String(r.error ?? "");
      const forbidden = ["123456", "evil.example", "sk-live-abc123"];
      for (const token of forbidden) {
        if (err.includes(token)) throw new Error(`error leaked sensitive token: ${token}`);
      }
      return err;
    });

    await step("F-MH-02 activate_version rollback", results, async () => {
      parseToolJson(await callTool("activate_version", { action_id: actionId, version_id: v2 }));
      const r1 = parseToolJson(
        await callTool("run_action", { action_id: actionId, variables: { topic: "alpha" } }),
      );
      if (!String(r1.output ?? "").includes("NEW alpha"))
        throw new Error(`v2 output mismatch: ${r1.output}`);

      parseToolJson(await callTool("activate_version", { action_id: actionId, version_id: v1 }));
      const r2 = parseToolJson(
        await callTool("run_action", { action_id: actionId, variables: { topic: "alpha" } }),
      );
      if (!String(r2.output ?? "").includes("OLD alpha"))
        throw new Error(`rollback output mismatch: ${r2.output}`);
      return `v2=${v2} -> v1=${v1}`;
    });

    await step("F-MH-03 run_template returns detailed steps[]", results, async () => {
      const out = parseToolJson(
        await callTool("run_template", { template_id: templateId, variables: { topic: "beta" } }),
      );
      if (!Array.isArray(out.steps) || out.steps.length !== 2) {
        throw new Error(`steps invalid: ${JSON.stringify(out.steps)}`);
      }
      for (const [idx, s] of out.steps.entries()) {
        if (typeof s.stepIndex !== "number") throw new Error(`stepIndex missing at ${idx}`);
        if (typeof s.actionName !== "string" || !s.actionName)
          throw new Error(`actionName missing at ${idx}`);
        if (!Array.isArray(s.input) || s.input.length === 0)
          throw new Error(`input missing at ${idx}`);
        if (typeof s.output !== "string") throw new Error(`output missing at ${idx}`);
        if (!s.usage || typeof s.usage.prompt_tokens !== "number")
          throw new Error(`usage missing at ${idx}`);
        if (typeof s.latencyMs !== "number") throw new Error(`latencyMs missing at ${idx}`);
      }
      return `steps=${out.steps.length}`;
    });

    await step("F-MH-04 get_balance transactions include traceId", results, async () => {
      const imageOk = parseToolJson(
        await callTool("generate_image", {
          model: "openai/dall-e-3",
          prompt: "small blue square",
          size: "1024x1024",
        }),
      );
      const imageTraceId = String(imageOk.traceId ?? "");
      if (!imageTraceId.startsWith("trc_")) {
        throw new Error(`generate_image success traceId missing: ${JSON.stringify(imageOk)}`);
      }

      const data = parseToolJson(await callTool("get_balance", { include_transactions: true }));
      const txs = Array.isArray(data.transactions) ? data.transactions : [];
      const withTrace = txs.find(
        (t: any) => typeof t.traceId === "string" && t.traceId.startsWith("trc_"),
      );
      if (!withTrace)
        throw new Error(`no transaction with traceId found: ${JSON.stringify(txs.slice(0, 3))}`);
      return `tx=${txs.length}, traceId=${withTrace.traceId}, imageTraceId=${imageTraceId}`;
    });

    await step("F-MH-05 top_p=0 handled", results, async () => {
      const r = await callToolRaw("chat", {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "top_p test" }],
        top_p: 0,
      });
      if (!r.ok) {
        const msg = String(r.error ?? "");
        if (!msg.toLowerCase().includes("top_p") && !msg.toLowerCase().includes("greater")) {
          throw new Error(`unexpected top_p=0 error: ${msg}`);
        }
        return `rejected: ${msg}`;
      }
      const data = parseToolJson(r.result);
      return `accepted: traceId=${data.traceId ?? "n/a"}`;
    });

    await step("F-MH-06 run_action supports version_id override", results, async () => {
      // keep active version at v1; version_id=v2 should still run NEW branch
      const out = parseToolJson(
        await callTool("run_action", {
          action_id: actionId,
          version_id: v2,
          variables: { topic: "gamma" },
        }),
      );
      if (!String(out.output ?? "").includes("NEW gamma")) {
        throw new Error(`version override failed: ${JSON.stringify(out)}`);
      }
      return `output=${out.output}`;
    });

    await step("F-MH-07 micro billing not truncated", results, async () => {
      const logs = parseToolJson(await callTool("list_logs", { limit: 20 }));
      if (!Array.isArray(logs) || logs.length === 0) throw new Error("list_logs empty");
      const micro = logs.find((l: any) => {
        const cost = parseDollar(l.cost);
        return cost > 0 && String(l.cost ?? "").match(/^\$\d+\.\d{8}$/);
      });
      if (!micro)
        throw new Error(`no 8-decimal positive cost found: ${JSON.stringify(logs.slice(0, 3))}`);
      if (String(micro.cost) === "$0.00000000") throw new Error("micro cost was truncated to zero");
      return `sample=${micro.cost}`;
    });

    await step("F-MH-08 usage drilldown Σ(single)≈aggregate", results, async () => {
      const logs = parseToolJson(await callTool("list_logs", { limit: 20 }));
      const sum = (Array.isArray(logs) ? logs : []).reduce((acc: number, l: any) => {
        const trace = String(l.traceId ?? "");
        const cost = parseDollar(l.cost);
        return trace ? acc + (Number.isFinite(cost) ? cost : 0) : acc;
      }, 0);

      const usage = parseToolJson(
        await callTool("get_usage_summary", { period: "today", source: "mcp" }),
      );
      const agg = parseDollar(usage.totalCost);
      const sum4 = Number(sum.toFixed(4));
      const diff = Math.abs(sum4 - agg);
      if (diff > 0.0001) {
        throw new Error(`sum4=${sum4.toFixed(4)} agg=${agg.toFixed(4)} diff=${diff.toFixed(6)}`);
      }
      return `sum4=${sum4.toFixed(4)} agg=${agg.toFixed(4)}`;
    });
  } finally {
    try {
      await restoreLocalModels(restoreState);
    } catch {
      // ignore restore errors in report flow
    }
    await mockServer.close();
    await prisma.$disconnect();
  }

  const fail = results.filter((r) => !r.ok).length;
  const report = {
    batch: "mcp-finops-hardening",
    generatedAt: new Date().toISOString(),
    environment: BASE,
    checks: results,
    pass: results.length - fail,
    fail,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  const report = {
    batch: "mcp-finops-hardening",
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
