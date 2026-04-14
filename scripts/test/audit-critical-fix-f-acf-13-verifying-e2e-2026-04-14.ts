import "../../tests/helpers/load-test-env";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { createTestApiKey, createTestProject, createTestUser } from "../../tests/factories";
import { jsonResponse, startMockProvider } from "../../tests/mocks/provider-server";
import { runCallProbeForChannel } from "../../src/lib/health/scheduler";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/audit-critical-fix-f-acf-13-verifying-e2e-2026-04-14.json";

const prisma = new PrismaClient();

type Check = { id: string; ok: boolean; detail: string };

let token = "";
let apiKey = "";
let userId = "";
let projectId = "";
let mockBase = "";
let observedReasoningMax: number | null = null;
let failProbeChannelId = "";

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
  return { status: res.status, body, raw };
}

async function rawMcpRequest(method: string, params?: Record<string, unknown>) {
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
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;
      body = parseJsonText(payload);
      break;
    }
    if (!body) body = text;
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
  const rpc = await rawMcpRequest("tools/call", { name, arguments: args });
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

async function waitForCallLog(traceId: string, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const log = await prisma.callLog.findUnique({
      where: { traceId },
      select: { traceId: true, status: true, sellPrice: true },
    });
    if (log) return log;
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

async function setupIdentity() {
  const user = await createTestUser(BASE, { prefix: "acf13", name: "ACF13 Verifier" });
  token = user.token;
  const u = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } });
  userId = String(u?.id ?? "");
  if (!userId) throw new Error("user not found");

  const project = await createTestProject(BASE, token, { name: `ACF13 ${Date.now()}` });
  projectId = project.id;
  await prisma.user.update({ where: { id: userId }, data: { defaultProjectId: projectId, balance: 100 } });

  const key = await createTestApiKey(BASE, token, { name: "acf13-key", rateLimit: 200 });
  apiKey = key.key;
}

async function setupFixtures() {
  const mock = await startMockProvider({
    port: 3329,
    onRequest: (req, res, body) => {
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const payload = parseJsonText(body || "{}") ?? {};
        const messages = Array.isArray(payload.messages) ? payload.messages : [];
        const model = String(payload.model ?? "");
        const prompt = String(messages[messages.length - 1]?.content ?? "");

        if (model === "qwen/qwen3.5-flash" || model === "qwen3.5-flash") {
          observedReasoningMax = Number(
            payload.max_reasoning_tokens ?? payload.reasoning?.max_tokens ?? 0,
          );
        }

        if (/upstream-leak/i.test(prompt)) {
          jsonResponse(res, 400, {
            error: {
              code: "provider_bad_request",
              message:
                'This endpoint\'s maximum context length is 1000000 tokens via chat. Content preview: "secret data". see https://upstream.example sk-live-leak',
            },
          });
          return true;
        }

        jsonResponse(res, 200, {
          id: "chatcmpl-acf13",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, message: { role: "assistant", content: `ok:${prompt}` }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        });
        return true;
      }

      if (req.method === "POST" && req.url === "/v1/images/generations") {
        const payload = parseJsonText(body || "{}") ?? {};
        const prompt = String(payload.prompt ?? "");
        const model = String(payload.model ?? "");
        if (model === "failing-image") {
          jsonResponse(res, 200, { created: Date.now(), data: [] });
          return true;
        }
        if (/zero-image/i.test(prompt)) {
          jsonResponse(res, 200, { created: Date.now(), data: [] });
          return true;
        }
        jsonResponse(res, 200, {
          created: Date.now(),
          data: [{ url: "https://bizyair-prod.oss-cn-shanghai.aliyuncs.com/mock.png" }],
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
    data: { baseUrl: mockBase, authConfig: { apiKey: "mock-openai-key" }, status: "ACTIVE", proxyUrl: null },
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
    enabledModel?: boolean;
    capabilities?: Record<string, unknown>;
    contextWindow?: number;
    sell?: Record<string, unknown>;
    channelStatus?: "ACTIVE" | "DISABLED";
  }) => {
    const m = await prisma.model.upsert({
      where: { name: params.modelName },
      update: {
        enabled: params.enabledModel ?? true,
        displayName: params.modelName,
        modality: params.modality,
        contextWindow: params.contextWindow ?? (params.modality === "TEXT" ? 64000 : null),
        maxTokens: params.modality === "TEXT" ? 16000 : null,
        capabilities: params.capabilities ?? (params.modality === "TEXT" ? { streaming: true } : { vision: true }),
        supportedSizes: params.modality === "IMAGE" ? ["1024x1024", "1536x1024"] : null,
      },
      create: {
        name: params.modelName,
        enabled: params.enabledModel ?? true,
        displayName: params.modelName,
        modality: params.modality,
        contextWindow: params.contextWindow ?? (params.modality === "TEXT" ? 64000 : null),
        maxTokens: params.modality === "TEXT" ? 16000 : null,
        capabilities: params.capabilities ?? (params.modality === "TEXT" ? { streaming: true } : { vision: true }),
        supportedSizes: params.modality === "IMAGE" ? ["1024x1024", "1536x1024"] : null,
      },
    });

    const a = await prisma.modelAlias.upsert({
      where: { alias: params.alias },
      update: { enabled: true, modality: params.modality, sellPrice: params.sell ?? undefined },
      create: { alias: params.alias, enabled: true, modality: params.modality, sellPrice: params.sell ?? undefined },
    });

    // Keep test routing deterministic: each alias maps to exactly one model in this fixture.
    await prisma.aliasModelLink.deleteMany({
      where: { aliasId: a.id, NOT: { modelId: m.id } },
    });

    await prisma.aliasModelLink.upsert({
      where: { aliasId_modelId: { aliasId: a.id, modelId: m.id } },
      update: {},
      create: { aliasId: a.id, modelId: m.id },
    });

    const ch = await prisma.channel.upsert({
      where: { providerId_modelId: { providerId: provider.id, modelId: m.id } },
      update: {
        realModelId: params.modelName.split("/").pop() ?? params.modelName,
        priority: 1,
        status: params.channelStatus ?? "ACTIVE",
        costPrice: params.modality === "IMAGE" ? { unit: "call", perCall: 0.3, currency: "USD" } : { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
        sellPrice: params.sell ?? (params.modality === "IMAGE" ? { unit: "call", perCall: 0.5, currency: "USD" } : { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" }),
      },
      create: {
        providerId: provider.id,
        modelId: m.id,
        realModelId: params.modelName.split("/").pop() ?? params.modelName,
        priority: 1,
        status: params.channelStatus ?? "ACTIVE",
        costPrice: params.modality === "IMAGE" ? { unit: "call", perCall: 0.3, currency: "USD" } : { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
        sellPrice: params.sell ?? (params.modality === "IMAGE" ? { unit: "call", perCall: 0.5, currency: "USD" } : { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" }),
      },
    });

    // Previous runs may leave latest FAIL records and make router skip this channel.
    await prisma.healthCheck.deleteMany({ where: { channelId: ch.id } });

    return { model: m, alias: a, channel: ch };
  };

  await upsertAlias({ alias: "deepseek-v3", modelName: "deepseek/v3", modality: "TEXT" });
  await upsertAlias({ alias: "gpt-4o-mini", modelName: "openai/gpt-4o-mini", modality: "TEXT" });
  await upsertAlias({
    alias: "qwen3.5-flash",
    modelName: "qwen/qwen3.5-flash",
    modality: "TEXT",
    capabilities: { reasoning: true, streaming: true },
    contextWindow: 64000,
  });
  await upsertAlias({ alias: "gpt-image-mini", modelName: "openai/gpt-image-mini", modality: "IMAGE" });
  await upsertAlias({
    alias: "claude-sonnet-4.6",
    modelName: "anthropic/claude-sonnet-4.6",
    modality: "TEXT",
    enabledModel: false,
  });
  const failProbe = await upsertAlias({ alias: "failing-image", modelName: "failing-image", modality: "IMAGE" });
  failProbeChannelId = failProbe.channel.id;

  await prisma.healthCheck.createMany({
    data: [{ channelId: failProbeChannelId, level: "API_REACHABILITY", result: "PASS" }],
  });

  return mock;
}

async function main() {
  const checks: Check[] = [];
  const startedAt = new Date().toISOString();

  await setupIdentity();
  const mock = await setupFixtures();

  try {
    await step("F-ACF-00-smoke-init", checks, async () => {
      const init = await rawMcpRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "acf13", version: "1.0.0" },
      });
      if (init.status !== 200) throw new Error(`status=${init.status}`);
      return "mcp initialize ok";
    });

    await step("F-ACF-01-zero-image-cost-zero", checks, async () => {
      const gen = await callTool("generate_image", { model: "gpt-image-mini", prompt: "zero-image", size: "1024x1024" });
      if (!gen.ok) throw new Error(gen.text);
      const traceId = String(gen.json?.traceId ?? "");
      if (!traceId) throw new Error(`missing traceId, tool=${gen.text}`);
      const log = await waitForCallLog(traceId);
      if (!log) throw new Error(`no call log for trace=${traceId}`);
      if (log.status !== "FILTERED") throw new Error(`status=${log.status}`);
      if (Number(log.sellPrice ?? 1) !== 0) throw new Error(`sellPrice=${log.sellPrice}`);
      const detail = await callTool("get_log_detail", { trace_id: traceId });
      if (!detail.ok) throw new Error(detail.text);
      if (String(detail.json?.status ?? "").toLowerCase() !== "filtered") {
        throw new Error(`detail.status=${String(detail.json?.status)}`);
      }
      if (Number(String(detail.json?.cost ?? "$1").replace("$", "")) !== 0) {
        throw new Error(`detail.cost=${detail.json?.cost}`);
      }
      return `trace=${traceId}, status=${log.status}, sell=${log.sellPrice}`;
    });

    await step("F-ACF-02-list-chat-consistency", checks, async () => {
      const models = await callTool("list_models", { modality: "text" });
      const arr = Array.isArray(models.json) ? models.json : [];
      const names = arr.map((x: any) => String(x.name));
      if (names.includes("claude-sonnet-4.6")) throw new Error("disabled alias leaked in list_models");
      const denied = await callTool("chat", { model: "claude-sonnet-4.6", messages: [{ role: "user", content: "hi" }] });
      if (denied.ok) throw new Error("disabled alias unexpectedly routable");
      return `list_has_disabled=false, chat_denied=${denied.text.slice(0, 80)}`;
    });

    await step("F-ACF-04-run-template-active-version", checks, async () => {
      const act = await callTool("create_action", { name: uniq("acf13_act"), model: "deepseek-v3", messages: [{ role: "system", content: "V1" }, { role: "user", content: "{{input}}" }] });
      if (!act.ok) throw new Error(act.text);
      const actionId = String(act.json?.action_id ?? "");
      if (!actionId) throw new Error(`missing action_id: ${act.text}`);
      const actionRow = await prisma.action.findUnique({
        where: { id: actionId },
        select: { activeVersionId: true },
      });
      const v1Id = String(actionRow?.activeVersionId ?? "");
      if (!v1Id) throw new Error("missing v1 activeVersionId");
      const v2 = await callTool("create_action_version", { action_id: actionId, messages: [{ role: "system", content: "V2" }, { role: "user", content: "{{input}}" }] });
      if (!v2.ok) throw new Error(v2.text);
      const v2Id = String(v2.json?.version_id ?? "");
      if (!v2Id) throw new Error(`missing version_id: ${v2.text}`);
      await callTool("activate_version", { action_id: actionId, version_id: v2Id });
      await callTool("activate_version", { action_id: actionId, version_id: v1Id });
      const tpl = await callTool("create_template", { name: uniq("acf13_tpl"), steps: [{ action_id: actionId, role: "SEQUENTIAL" }] });
      if (!tpl.ok) throw new Error(tpl.text);
      const templateId = String(tpl.json?.template_id ?? "");
      if (!templateId) throw new Error(`missing template_id: ${tpl.text}`);
      const run = await callTool("run_template", { template_id: templateId, variables: { input: "HELLO" } });
      if (!run.ok) throw new Error(run.text);
      const stepInput = JSON.stringify(run.json?.steps?.[0]?.input ?? "");
      if (!stepInput.includes("V1") || stepInput.includes("V2")) throw new Error(`unexpected step input: ${stepInput}`);
      return `active version respected`;
    });

    await step("F-ACF-05-reasoning-default-cap", checks, async () => {
      const c = await callTool("chat", { model: "qwen3.5-flash", messages: [{ role: "user", content: "reasoning-check" }], max_tokens: 3 });
      if (!c.ok) throw new Error(c.text);
      if (!observedReasoningMax || observedReasoningMax <= 0 || observedReasoningMax > 32000) {
        throw new Error(`observed max_reasoning_tokens=${observedReasoningMax}`);
      }
      return `max_reasoning_tokens=${observedReasoningMax}`;
    });

    await step("F-ACF-06-max-tokens-guard", checks, async () => {
      const c = await callTool("chat", { model: "qwen3.5-flash", messages: [{ role: "user", content: "hi" }], max_tokens: 99_999_999 });
      if (c.ok) throw new Error("expected invalid_parameter error");
      if (!/invalid_parameter|context window|exceeds/i.test(c.text)) throw new Error(c.text);
      return c.text.slice(0, 120);
    });

    await step("F-ACF-07-image-url-proxy", checks, async () => {
      const img = await callTool("generate_image", { model: "gpt-image-mini", prompt: "normal-image", size: "1024x1024" });
      if (!img.ok) throw new Error(img.text);
      const urls = (Array.isArray(img.json?.images) ? img.json.images : []).map((x: any) => String(x ?? ""));
      if (!urls.length) throw new Error("no urls");
      if (urls.some((u: string) => /aliyuncs|bizyair|comfyui|openai\.com/i.test(u))) throw new Error(`upstream url leaked: ${urls[0]}`);
      if (!urls[0].includes("/v1/images/proxy/")) throw new Error(`not proxy url: ${urls[0]}`);
      return urls[0];
    });

    await step("F-ACF-08-sanitize-upstream-error", checks, async () => {
      const c = await callTool("chat", { model: "deepseek-v3", messages: [{ role: "user", content: "upstream-leak" }] });
      if (c.ok) throw new Error("expected sanitized error");
      if (/This endpoint|Content preview|via chat|https?:\/\//i.test(c.text)) throw new Error(`leak not scrubbed: ${c.text}`);
      if (/sk-live-leak/i.test(c.text)) throw new Error(`key leak not scrubbed: ${c.text}`);
      return c.text.slice(0, 120);
    });

    await step("F-ACF-09-xss-escape-parameters", checks, async () => {
      const payload = `<img src=x onerror=alert(1)>`;
      const img = await callTool("generate_image", { model: "gpt-image-mini", prompt: payload, size: "1024x1024" });
      if (!img.ok) throw new Error(img.text);
      const traceId = String(img.json?.traceId ?? "");
      if (!traceId) throw new Error("missing traceId");
      const detail = await callTool("get_log_detail", { trace_id: traceId });
      if (!detail.ok) throw new Error(detail.text);
      const reqPrompt = String(detail.json?.parameters?.prompt ?? "");
      if (!reqPrompt.includes("&lt;img")) throw new Error(`not escaped: ${reqPrompt}`);
      return `trace=${traceId}`;
    });

    await step("F-ACF-10-call-probe-auto-disable", checks, async () => {
      for (let i = 0; i < 3; i++) {
        await runCallProbeForChannel(failProbeChannelId);
      }
      const ch = await prisma.channel.findUnique({ where: { id: failProbeChannelId }, select: { status: true } });
      if (ch?.status !== "DISABLED") throw new Error(`status=${ch?.status}`);
      return `channel=${failProbeChannelId} disabled`;
    });

    await step("F-ACF-11-invalid-model-modality", checks, async () => {
      const img = await callTool("generate_image", { model: "deepseek-v3", prompt: "test", size: "1024x1024" });
      if (img.ok) throw new Error("expected invalid_model_modality");
      if (!/invalid_model_modality|text model|use the chat tool/i.test(img.text)) throw new Error(img.text);
      return img.text.slice(0, 120);
    });

    await step("F-ACF-12-idor-wording", checks, async () => {
      const r = await callTool("get_log_detail", { trace_id: `trc_${Date.now()}_missing` });
      if (r.ok) throw new Error("expected not found");
      if (!/Call log with traceId .* not found in this project\./i.test(r.text)) throw new Error(r.text);
      return r.text;
    });

    await step("F-ACF-12-run-all-audits-extract-logic", checks, async () => {
      const script = await (await import("fs/promises")).readFile("tests/mcp-test/run_all_audits.sh", "utf8");
      if (!script.includes("sleep 2")) throw new Error("missing sleep 2");
      if (!script.includes("by_role")) throw new Error("missing by_role");
      if (!script.includes("WARNING: no json block")) throw new Error("missing warning for no json block");
      return "sleep/by_role/warning checks passed";
    });

    await step("F-ACF-13-regression-tests", checks, async () => {
      const { execSync } = await import("child_process");
      execSync("npx vitest run src/lib/engine/sanitize-error.test.ts src/lib/health/checker.test.ts", { stdio: "pipe" });
      return "vitest sanitize-error + checker passed";
    });
  } finally {
    await mock.close();
  }

  const failed = checks.filter((x) => !x.ok);
  const report = {
    feature: "F-ACF-13",
    batch: "AUDIT-CRITICAL-FIX",
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
