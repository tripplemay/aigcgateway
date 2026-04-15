import "../../tests/helpers/load-test-env";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { createTestApiKey, createTestProject, createTestUser } from "../../tests/factories";
import { jsonResponse, startMockProvider } from "../../tests/mocks/provider-server";
import type { ServerResponse } from "http";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/workflow-polish-f-wp-10-verifying-e2e-2026-04-15.json";

const prisma = new PrismaClient();

type Check = { id: string; ok: boolean; detail: string };

let token = "";
let apiKey = "";
let userId = "";
let projectId = "";
let mockBase = "";

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function parseJsonText(input: string): any {
  try {
    return input ? JSON.parse(input) : null;
  } catch {
    return input;
  }
}

async function api(
  path: string,
  init?: RequestInit & { auth?: "none" | "jwt" | "key"; expect?: number },
) {
  const { auth = "none", expect, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "jwt") headers.authorization = `Bearer ${token}`;
  if (auth === "key") headers.authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  const raw = await res.text();
  const body = parseJsonText(raw);
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, raw, headers: res.headers };
}

async function rawMcp(method: string, params?: Record<string, unknown>) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params: params ?? {} }),
  });
  const text = await res.text();
  let body = parseJsonText(text);
  if (!body || typeof body !== "object") {
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;
      body = parseJsonText(payload);
      break;
    }
  }
  return { status: res.status, body, text };
}

function parseToolResult(body: any): { ok: boolean; text: string; json: any } {
  const result = body?.result ?? body;
  const isError = !!result?.isError;
  const text = String(result?.content?.[0]?.text ?? "");
  const json = parseJsonText(text);
  return { ok: !isError, text, json };
}

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const rpc = await rawMcp("tools/call", { name, arguments: args });
  if (rpc.status >= 400) return { ok: false, text: rpc.text, json: null };
  if (rpc.body?.error) return { ok: false, text: JSON.stringify(rpc.body.error), json: null };
  return parseToolResult(rpc.body);
}

async function step(id: string, checks: Check[], fn: () => Promise<string>) {
  try {
    const detail = await fn();
    checks.push({ id, ok: true, detail });
  } catch (err) {
    checks.push({ id, ok: false, detail: (err as Error).message });
  }
}

async function setupIdentity() {
  const user = await createTestUser(BASE, { prefix: "wp10", name: "WP10 Verifier" });
  token = user.token;
  const u = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } });
  userId = String(u?.id ?? "");
  if (!userId) throw new Error("user not found");

  const project = await createTestProject(BASE, token, { name: `WP10 ${Date.now()}` });
  projectId = project.id;
  await prisma.user.update({
    where: { id: userId },
    data: { defaultProjectId: projectId, balance: 100 },
  });
  await api(`/api/projects/${projectId}`, {
    auth: "jwt",
    method: "PATCH",
    body: JSON.stringify({
      rateLimit: { rpm: 300, tpm: 300000, imageRpm: 120 },
    }),
    expect: 200,
  });

  const key = await createTestApiKey(BASE, token, { name: "wp10-key", rateLimit: 300 });
  apiKey = key.key;
}

async function setupFixtures() {
  const sse = (res: ServerResponse, chunks: string[], usage: Record<string, unknown>) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const created = Math.floor(Date.now() / 1000);
    for (const piece of chunks) {
      res.write(
        `data: ${JSON.stringify({
          id: "chatcmpl-wp10",
          object: "chat.completion.chunk",
          created,
          model: "mock",
          choices: [{ index: 0, delta: { content: piece }, finish_reason: null }],
        })}\n\n`,
      );
    }
    res.write(
      `data: ${JSON.stringify({
        id: "chatcmpl-wp10",
        object: "chat.completion.chunk",
        created,
        model: "mock",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage,
      })}\n\n`,
    );
    res.write("data: [DONE]\n\n");
    res.end();
  };

  const mock = await startMockProvider({
    port: 3332,
    onRequest: (req, res, body) => {
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const payload = parseJsonText(body || "{}") ?? {};
        const model = String(payload.model ?? "");
        const messages = Array.isArray(payload.messages) ? payload.messages : [];
        const prompt = String(messages[messages.length - 1]?.content ?? "");
        if (/force-error/i.test(prompt)) {
          jsonResponse(res, 500, { error: { code: "provider_error", message: "forced error" } });
          return true;
        }
        const isReasoning = model.includes("reason");
        if (payload.stream === true) {
          const usage = isReasoning
            ? { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50, reasoning_tokens: 7 }
            : { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 };
          sse(res, [`ok:${prompt}`], usage);
          return true;
        }
        jsonResponse(res, 200, {
          id: "chatcmpl-wp10",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, message: { role: "assistant", content: `ok:${prompt}` }, finish_reason: "stop" }],
          usage: isReasoning
            ? { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50, reasoning_tokens: 7 }
            : { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
        });
        return true;
      }
      if (req.method === "POST" && req.url === "/v1/images/generations") {
        jsonResponse(res, 200, {
          created: Date.now(),
          data: [{ url: "https://example.com/wp10.png" }],
        });
        return true;
      }
      return false;
    },
  });

  mockBase = `${mock.baseUrl}/v1`;

  const provider = await prisma.provider.findUniqueOrThrow({ where: { name: "openai" } });
  await prisma.provider.update({
    where: { id: provider.id },
    data: { baseUrl: mockBase, authConfig: { apiKey: "mock-openai-key" }, status: "ACTIVE" },
  });
  await prisma.providerConfig.upsert({
    where: { providerId: provider.id },
    update: { supportsModelsApi: true, chatEndpoint: "/chat/completions", imageEndpoint: "/images/generations" },
    create: { providerId: provider.id, supportsModelsApi: true, chatEndpoint: "/chat/completions", imageEndpoint: "/images/generations" },
  });

  const upsertAlias = async (params: {
    alias: string;
    modelName: string;
    modality: "TEXT" | "IMAGE";
    capabilities?: Record<string, unknown>;
    contextWindow?: number;
    supportedSizes?: string[] | null;
  }) => {
    const model = await prisma.model.upsert({
      where: { name: params.modelName },
      update: {
        enabled: true,
        displayName: params.modelName,
        modality: params.modality,
        contextWindow: params.contextWindow ?? (params.modality === "TEXT" ? 64000 : null),
        maxTokens: params.modality === "TEXT" ? 16000 : null,
        capabilities: params.capabilities ?? (params.modality === "TEXT" ? { streaming: true } : { vision: true }),
        supportedSizes: params.supportedSizes ?? (params.modality === "IMAGE" ? ["1024x1024"] : null),
      },
      create: {
        name: params.modelName,
        enabled: true,
        displayName: params.modelName,
        modality: params.modality,
        contextWindow: params.contextWindow ?? (params.modality === "TEXT" ? 64000 : null),
        maxTokens: params.modality === "TEXT" ? 16000 : null,
        capabilities: params.capabilities ?? (params.modality === "TEXT" ? { streaming: true } : { vision: true }),
        supportedSizes: params.supportedSizes ?? (params.modality === "IMAGE" ? ["1024x1024"] : null),
      },
    });
    const alias = await prisma.modelAlias.upsert({
      where: { alias: params.alias },
      update: {
        enabled: true,
        modality: params.modality,
        capabilities: params.capabilities ?? undefined,
      },
      create: {
        alias: params.alias,
        enabled: true,
        modality: params.modality,
        capabilities: params.capabilities ?? undefined,
      },
    });
    await prisma.aliasModelLink.deleteMany({
      where: { aliasId: alias.id, NOT: { modelId: model.id } },
    });
    await prisma.aliasModelLink.upsert({
      where: { aliasId_modelId: { aliasId: alias.id, modelId: model.id } },
      update: {},
      create: { aliasId: alias.id, modelId: model.id },
    });
    const ch = await prisma.channel.upsert({
      where: { providerId_modelId: { providerId: provider.id, modelId: model.id } },
      update: {
        realModelId: params.modelName.split("/").pop() ?? params.modelName,
        priority: 1,
        status: "ACTIVE",
        costPrice:
          params.modality === "IMAGE"
            ? { unit: "call", perCall: 0.2, currency: "USD" }
            : { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
        sellPrice:
          params.modality === "IMAGE"
            ? { unit: "call", perCall: 0.3, currency: "USD" }
            : { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
      },
      create: {
        providerId: provider.id,
        modelId: model.id,
        realModelId: params.modelName.split("/").pop() ?? params.modelName,
        priority: 1,
        status: "ACTIVE",
        costPrice:
          params.modality === "IMAGE"
            ? { unit: "call", perCall: 0.2, currency: "USD" }
            : { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
        sellPrice:
          params.modality === "IMAGE"
            ? { unit: "call", perCall: 0.3, currency: "USD" }
            : { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
      },
    });
    await prisma.healthCheck.deleteMany({ where: { channelId: ch.id } });
  };

  await upsertAlias({ alias: "reason-model", modelName: "openai/reason-model", modality: "TEXT", capabilities: { reasoning: true, streaming: true } });
  await upsertAlias({ alias: "deepseek-v3", modelName: "deepseek/v3", modality: "TEXT", capabilities: { streaming: true } });
  await upsertAlias({ alias: "gpt-image-mini", modelName: "openai/gpt-image-mini", modality: "IMAGE", capabilities: { image_input: true } });
  await upsertAlias({ alias: "vision-text", modelName: "openai/vision-text", modality: "TEXT", capabilities: { vision: true, streaming: true } });
  await upsertAlias({ alias: "vision-image", modelName: "openai/vision-image", modality: "IMAGE", capabilities: { vision: true, image_input: true } });

  return mock;
}

async function main() {
  const checks: Check[] = [];
  const startedAt = new Date().toISOString();

  await setupIdentity();
  const mock = await setupFixtures();

  try {
    await step("F-WP-10-00-smoke-init", checks, async () => {
      const init = await rawMcp("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "wp10", version: "1.0.0" },
      });
      if (init.status !== 200) throw new Error(`status=${init.status}`);
      return "mcp initialize ok";
    });

    let lockedTemplateId = "";
    let lockedActionId = "";
    let lockedV1Id = "";
    let lockedV2Id = "";

    await step("F-WP-10-01-usage-thinking-tokens", checks, async () => {
      const action = await callTool("create_action", {
        name: uniq("wp10_reason_action"),
        model: "reason-model",
        messages: [{ role: "user", content: "REASON {{input}}" }],
      });
      if (!action.ok) throw new Error(action.text);
      const actionId = String(action.json?.action_id ?? "");
      const tpl = await callTool("create_template", {
        name: uniq("wp10_reason_tpl"),
        steps: [{ action_id: actionId, role: "SEQUENTIAL" }],
      });
      if (!tpl.ok) throw new Error(tpl.text);
      const run = await callTool("run_template", {
        template_id: String(tpl.json?.template_id ?? ""),
        variables: { input: "HELLO" },
      });
      if (!run.ok) throw new Error(run.text);
      const usage = run.json?.steps?.[0]?.usage ?? {};
      const thinking = Number(usage.thinking_tokens ?? 0);
      if (!(thinking > 0)) throw new Error(`missing thinking_tokens: ${JSON.stringify(usage)}`);
      if (usage.total_tokens !== usage.prompt_tokens + usage.output_tokens + usage.thinking_tokens) {
        throw new Error(`total mismatch: ${JSON.stringify(usage)}`);
      }
      return `usage=${JSON.stringify(usage)}`;
    });

    await step("F-WP-10-02-step-variables-override", checks, async () => {
      const a1 = await callTool("create_action", {
        name: uniq("wp10_var_a1"),
        model: "deepseek-v3",
        messages: [{ role: "user", content: "S1 {{topic}}" }],
      });
      if (!a1.ok) throw new Error(a1.text);
      const a2 = await callTool("create_action", {
        name: uniq("wp10_var_a2"),
        model: "deepseek-v3",
        messages: [{ role: "user", content: "S2 {{topic}} {{previous_output}}" }],
      });
      if (!a2.ok) throw new Error(a2.text);
      const tpl = await callTool("create_template", {
        name: uniq("wp10_var_tpl"),
        steps: [
          { action_id: String(a1.json?.action_id), role: "SEQUENTIAL" },
          { action_id: String(a2.json?.action_id), role: "SEQUENTIAL" },
        ],
      });
      if (!tpl.ok) throw new Error(tpl.text);
      const run = await callTool("run_template", {
        template_id: String(tpl.json?.template_id),
        variables: { __global: { topic: "GLOBAL" }, __step_0: { topic: "STEP0" } },
      });
      if (!run.ok) throw new Error(run.text);
      const out0 = String(run.json?.steps?.[0]?.output ?? "");
      const out1 = String(run.json?.steps?.[1]?.output ?? "");
      if (!out0.includes("STEP0")) throw new Error(`step0 override not applied: ${out0}`);
      if (!out1.includes("GLOBAL")) throw new Error(`step1 global not applied: ${out1}`);
      return `${out0} | ${out1}`;
    });

    await step("F-WP-10-03-step-version-lock", checks, async () => {
      const act = await callTool("create_action", {
        name: uniq("wp10_lock_action"),
        model: "deepseek-v3",
        messages: [{ role: "user", content: "LOCK_V1 {{input}}" }],
      });
      if (!act.ok) throw new Error(act.text);
      lockedActionId = String(act.json?.action_id ?? "");
      const actionRow = await prisma.action.findUnique({
        where: { id: lockedActionId },
        select: { activeVersionId: true },
      });
      lockedV1Id = String(actionRow?.activeVersionId ?? "");
      if (!lockedV1Id) throw new Error("missing v1 id");

      const v2 = await callTool("create_action_version", {
        action_id: lockedActionId,
        messages: [{ role: "user", content: "LOCK_V2 {{input}}" }],
      });
      if (!v2.ok) throw new Error(v2.text);
      lockedV2Id = String(v2.json?.version_id ?? "");
      if (!lockedV2Id) throw new Error("missing v2 id");

      const tpl = await callTool("create_template", {
        name: uniq("wp10_lock_tpl"),
        steps: [{ action_id: lockedActionId, version_id: lockedV1Id, role: "SEQUENTIAL" }],
      });
      if (!tpl.ok) throw new Error(tpl.text);
      lockedTemplateId = String(tpl.json?.template_id ?? "");
      await callTool("activate_version", { action_id: lockedActionId, version_id: lockedV2Id });

      const run = await callTool("run_template", {
        template_id: lockedTemplateId,
        variables: { input: "XYZ" },
      });
      if (!run.ok) throw new Error(run.text);
      const output = String(run.json?.output ?? "");
      if (!output.includes("LOCK_V1")) throw new Error(`locked version not used: ${output}`);
      if (output.includes("LOCK_V2")) throw new Error(`unexpected v2 output: ${output}`);
      return output;
    });

    await step("F-WP-10-04-get-template-detail-version-fields", checks, async () => {
      const detail = await callTool("get_template_detail", { template_id: lockedTemplateId });
      if (!detail.ok) throw new Error(detail.text);
      const step0 = detail.json?.steps?.[0] ?? {};
      if (!step0.activeVersionId || !step0.activeVersionNumber) {
        throw new Error(`missing active version fields: ${JSON.stringify(step0)}`);
      }
      if (step0.lockedVersionId !== lockedV1Id) {
        throw new Error(`lockedVersionId mismatch: ${JSON.stringify(step0)}`);
      }
      return `active=${step0.activeVersionNumber}, locked=${step0.lockedVersionNumber}`;
    });

    await step("F-WP-10-05-empty-message-invalid", checks, async () => {
      const r = await api("/v1/chat/completions", {
        auth: "key",
        method: "POST",
        body: JSON.stringify({
          model: "deepseek-v3",
          messages: [{ role: "user", content: "" }],
        }),
      });
      const code = String(r.body?.error?.code ?? "");
      if (r.status !== 400 || code !== "invalid_parameter") {
        throw new Error(`expected 400 invalid_parameter, got ${r.status}: ${r.raw}`);
      }
      return r.body?.error?.message ?? r.raw;
    });

    await step("F-WP-10-06-binary-prompt-invalid", checks, async () => {
      const bin = "\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008binary";
      const r = await api("/v1/images/generations", {
        auth: "key",
        method: "POST",
        body: JSON.stringify({ model: "gpt-image-mini", prompt: bin, size: "1024x1024" }),
      });
      const code = String(r.body?.error?.code ?? "");
      if (r.status !== 400 || code !== "invalid_prompt") {
        throw new Error(`expected invalid_prompt, got ${r.status}: ${r.raw}`);
      }
      return r.body?.error?.message ?? r.raw;
    });

    await step("F-WP-10-07-capability-vision-is-text-only", checks, async () => {
      const mcp = await callTool("list_models", { capability: "vision" });
      if (!mcp.ok) throw new Error(mcp.text);
      const mcpRows = Array.isArray(mcp.json) ? mcp.json : [];
      if (mcpRows.some((r: any) => String(r.modality).toLowerCase() !== "text")) {
        throw new Error(`mcp contains non-text: ${JSON.stringify(mcpRows)}`);
      }

      const rest = await api("/v1/models?capability=vision", { auth: "key", method: "GET" });
      if (rest.status !== 200) throw new Error(rest.raw);
      const data = Array.isArray(rest.body?.data) ? rest.body.data : [];
      if (data.some((r: any) => String(r.modality).toLowerCase() !== "text")) {
        throw new Error(`rest contains non-text vision model: ${JSON.stringify(data)}`);
      }
      return `mcp=${mcpRows.length}, rest=${data.length}`;
    });

    await step("F-WP-10-08-usage-summary-success-error", checks, async () => {
      await callTool("chat", { model: "deepseek-v3", messages: [{ role: "user", content: "ok-path" }] });
      await callTool("chat", { model: "deepseek-v3", messages: [{ role: "user", content: "force-error" }] });

      const mcpUsage = await callTool("get_usage_summary", { period: "today", group_by: "model" });
      if (!mcpUsage.ok) throw new Error(mcpUsage.text);
      const groups = Array.isArray(mcpUsage.json?.groups) ? mcpUsage.json.groups : [];
      if (!groups.every((g: any) => "successCalls" in g && "errorCalls" in g)) {
        throw new Error(`missing success/error in grouped usage: ${JSON.stringify(groups)}`);
      }

      const restUsage = await api(`/api/projects/${projectId}/usage?period=today`, {
        auth: "jwt",
        method: "GET",
      });
      if (restUsage.status !== 200) throw new Error(restUsage.raw);
      if (
        typeof restUsage.body?.successCalls !== "number" ||
        typeof restUsage.body?.errorCalls !== "number"
      ) {
        throw new Error(`rest usage missing split fields: ${restUsage.raw}`);
      }
      return `mcp_groups=${groups.length}, rest_success=${restUsage.body.successCalls}, rest_error=${restUsage.body.errorCalls}`;
    });

    await step("F-WP-10-09-get-balance-transaction-model-source", checks, async () => {
      await callTool("chat", { model: "deepseek-v3", messages: [{ role: "user", content: "for-transaction" }] });
      const bal = await callTool("get_balance", { include_transactions: true });
      if (!bal.ok) throw new Error(bal.text);
      const txs = Array.isArray(bal.json?.transactions) ? bal.json.transactions : [];
      const ded = txs.find((t: any) => t.type === "deduction");
      if (!ded) throw new Error(`no deduction tx: ${JSON.stringify(txs)}`);
      if (!("model" in ded) || !("source" in ded)) {
        throw new Error(`deduction missing model/source: ${JSON.stringify(ded)}`);
      }
      return `model=${ded.model}, source=${ded.source}`;
    });

    await step("F-WP-10-10-typo-fix", checks, async () => {
      const r = await api("/v1/images/generations", {
        auth: "key",
        method: "POST",
        body: JSON.stringify({ model: "deepseek-v3", prompt: "x", size: "1024x1024" }),
      });
      if (r.status !== 400) throw new Error(`expected 400, got ${r.status}: ${r.raw}`);
      const msg = String(r.body?.error?.message ?? "");
      if (msg.includes("接口接口")) throw new Error(`typo still exists: ${msg}`);
      return msg;
    });

    await step("F-WP-10-11-qualityscore-cleanup", checks, async () => {
      await prisma.template.updateMany({
        data: { isPublic: true, qualityScore: null },
      });
      const pub = await callTool("list_public_templates", { page: 1, pageSize: 20 });
      if (!pub.ok) throw new Error(pub.text);
      const arr = Array.isArray(pub.json?.templates) ? pub.json.templates : [];
      const hasQualityField = arr.some((t: any) => Object.prototype.hasOwnProperty.call(t, "qualityScore"));
      if (hasQualityField) throw new Error(`qualityScore should be omitted when all null: ${JSON.stringify(arr)}`);
      return `templates=${arr.length}, qualityScore_omitted=true`;
    });
  } finally {
    await mock.close();
  }

  const failed = checks.filter((x) => !x.ok);
  const report = {
    feature: "F-WP-10",
    batch: "WORKFLOW-POLISH",
    env: "L1-local-3099",
    startedAt,
    finishedAt: new Date().toISOString(),
    pass: failed.length === 0,
    passCount: checks.length - failed.length,
    failCount: failed.length,
    checks,
  };

  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`report=${OUTPUT_FILE}`);
  if (failed.length) {
    console.error(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
