import "../../tests/helpers/load-test-env";
import { writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { prisma as appPrisma } from "../../src/lib/prisma";
import { createTestApiKey, createTestProject, createTestUser } from "../../tests/factories";
import { jsonResponse, startMockProvider } from "../../tests/mocks/provider-server";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const MCP_URL = `${BASE}/api/mcp`;
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3322");
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ?? "docs/test-reports/dx-polish-verifying-local-e2e-2026-04-13.json";

const prisma = new PrismaClient();

type StepResult = { id: string; ok: boolean; detail: string };

let adminToken = "";
let userToken = "";
let userApiKey = "";
let userId = "";
let projectId = "";
let mockBase = "";
const seenChatBodies: Array<Record<string, unknown>> = [];

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function parseMaybeJson(text: string): any {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function api(
  path: string,
  init?: RequestInit & { auth?: "none" | "admin" | "user" | "key"; expect?: number },
) {
  const { auth = "none", expect, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "admin") headers.authorization = `Bearer ${adminToken}`;
  if (auth === "user") headers.authorization = `Bearer ${userToken}`;
  if (auth === "key") headers.authorization = `Bearer ${userApiKey}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
  const raw = await res.text();
  const body = parseMaybeJson(raw);
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, raw };
}

async function rawMcpRequest(method: string, params?: Record<string, unknown>) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${userApiKey}`,
      accept: "application/json, text/event-stream",
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
    body = text ? JSON.parse(text) : null;
  } catch {
    let firstPayload = "";
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;
      firstPayload = payload;
      break;
    }
    body = firstPayload ? parseMaybeJson(firstPayload) : text;
  }
  return { status: res.status, body, text };
}

function parseToolText(result: any): any {
  const text = result?.content?.[0]?.text ?? "";
  return parseMaybeJson(text);
}

function toModelArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

async function callToolRaw(name: string, args: Record<string, unknown> = {}) {
  const rpc = await rawMcpRequest("tools/call", { name, arguments: args });
  if (rpc.status >= 400) return { ok: false, error: rpc.text };
  if (rpc.body?.error) return { ok: false, error: JSON.stringify(rpc.body.error) };
  const result = rpc.body?.result ?? rpc.body;
  if (result?.isError) {
    return { ok: false, error: String(result?.content?.[0]?.text ?? "tool_error"), result };
  }
  return { ok: true, result };
}

async function step(id: string, out: StepResult[], fn: () => Promise<string>) {
  try {
    out.push({ id, ok: true, detail: await fn() });
  } catch (e) {
    out.push({ id, ok: false, detail: (e as Error).message });
  }
}

function number6(v: unknown): number {
  return Number(Number(v ?? 0).toFixed(6));
}

async function loginAndPrepare() {
  const admin = await api("/api/auth/login", {
    method: "POST",
    expect: 200,
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") }),
  });
  adminToken = String(admin.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");

  const user = await createTestUser(BASE, { prefix: "dxpolish", name: "DX Polish Tester" });
  userToken = user.token;
  const dbUser = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } });
  userId = String(dbUser?.id ?? "");
  if (!userId) throw new Error("user id missing");

  const project = await createTestProject(BASE, userToken, { name: `DX-POLISH ${Date.now()}` });
  projectId = project.id;
  await prisma.user.update({ where: { id: userId }, data: { defaultProjectId: projectId, balance: 20 } });

  const key = await createTestApiKey(BASE, userToken, { name: "dx-polish-key", rateLimit: 120 });
  userApiKey = key.key;
}

async function ensureFixtureAlias(params: {
  alias: string;
  modelName: string;
  modality: "TEXT" | "IMAGE";
  capabilities?: Record<string, unknown>;
  deprecated?: boolean;
  contextWindow?: number | null;
  supportedSizes?: string[];
  sellPrice?: Record<string, unknown>;
}) {
  const provider = await prisma.provider.findUniqueOrThrow({
    where: { name: "openai" },
    select: { id: true },
  });
  const model = await prisma.model.upsert({
    where: { name: params.modelName },
    update: {
      enabled: true,
      displayName: params.modelName,
      modality: params.modality,
      capabilities: params.capabilities ?? {},
      supportedSizes: params.modality === "IMAGE" ? (params.supportedSizes ?? ["1024x1024"]) : null,
    },
    create: {
      name: params.modelName,
      enabled: true,
      displayName: params.modelName,
      modality: params.modality,
      capabilities: params.capabilities ?? {},
      supportedSizes: params.modality === "IMAGE" ? (params.supportedSizes ?? ["1024x1024"]) : null,
    },
  });

  const alias = await prisma.modelAlias.upsert({
    where: { alias: params.alias },
    update: {
      enabled: true,
      modality: params.modality,
      capabilities: params.capabilities ?? {},
      deprecated: params.deprecated ?? false,
      contextWindow: params.contextWindow ?? null,
      sellPrice:
        params.sellPrice ??
        (params.modality === "IMAGE"
          ? { unit: "call", perCall: 0.5, currency: "USD" }
          : { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" }),
    },
    create: {
      alias: params.alias,
      enabled: true,
      modality: params.modality,
      capabilities: params.capabilities ?? {},
      deprecated: params.deprecated ?? false,
      contextWindow: params.contextWindow ?? null,
      sellPrice:
        params.sellPrice ??
        (params.modality === "IMAGE"
          ? { unit: "call", perCall: 0.5, currency: "USD" }
          : { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" }),
    },
  });

  await prisma.aliasModelLink.upsert({
    where: { aliasId_modelId: { aliasId: alias.id, modelId: model.id } },
    update: {},
    create: { aliasId: alias.id, modelId: model.id },
  });

  await prisma.channel.upsert({
    where: { providerId_modelId: { providerId: provider.id, modelId: model.id } },
    update: {
      status: "ACTIVE",
      priority: 1,
      realModelId: params.modality === "IMAGE" ? "gpt-image-1" : "gpt-4o-mini",
      costPrice:
        params.modality === "IMAGE"
          ? { unit: "call", perCall: 0.1, currency: "USD" }
          : { unit: "token", inputPer1M: 0.05, outputPer1M: 0.1, currency: "USD" },
      sellPrice:
        params.sellPrice ??
        (params.modality === "IMAGE"
          ? { unit: "call", perCall: 0.5, currency: "USD" }
          : { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" }),
    },
    create: {
      providerId: provider.id,
      modelId: model.id,
      status: "ACTIVE",
      priority: 1,
      realModelId: params.modality === "IMAGE" ? "gpt-image-1" : "gpt-4o-mini",
      costPrice:
        params.modality === "IMAGE"
          ? { unit: "call", perCall: 0.1, currency: "USD" }
          : { unit: "token", inputPer1M: 0.05, outputPer1M: 0.1, currency: "USD" },
      sellPrice:
        params.sellPrice ??
        (params.modality === "IMAGE"
          ? { unit: "call", perCall: 0.5, currency: "USD" }
          : { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" }),
    },
  });

  return alias;
}

async function main() {
  const steps: StepResult[] = [];
  const mock = await startMockProvider({
    port: MOCK_PORT,
    onRequest: (req, res, body) => {
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const parsed = parseMaybeJson(body || "{}");
        seenChatBodies.push(parsed);

        if (parsed?.response_format?.type === "json_object") {
          jsonResponse(res, 200, {
            id: "chatcmpl-mock-json",
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: String(parsed.model ?? "mock"),
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "```json\n{\"ok\":true,\"n\":1}\n```" },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 9,
              completion_tokens: 5,
              total_tokens: 14,
              completion_tokens_details: { reasoning_tokens: 4 },
            },
          });
          return true;
        }

        jsonResponse(res, 200, {
          id: "chatcmpl-mock",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: String(parsed.model ?? "mock"),
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: `reply:${String(parsed.messages?.[0]?.content ?? "")}` },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 6,
            total_tokens: 16,
            completion_tokens_details: { reasoning_tokens: 3 },
          },
        });
        return true;
      }
      return false;
    },
  });

  mockBase = `${mock.baseUrl}/v1`;

  try {
    await loginAndPrepare();

    const openai = await prisma.provider.findUniqueOrThrow({
      where: { name: "openai" },
      select: { id: true, baseUrl: true, authConfig: true },
    });
    await prisma.provider.update({
      where: { id: openai.id },
      data: { baseUrl: mockBase, authConfig: { apiKey: "mock-openai-key" }, proxyUrl: null },
    });

    const textAlias = uniq("dp_text_alias");
    const imageAlias = uniq("dp_image_alias");
    const deprecatedAlias = uniq("dp_deprecated_alias");

    await ensureFixtureAlias({
      alias: textAlias,
      modelName: uniq("dp_text_model"),
      modality: "TEXT",
      capabilities: {
        function_calling: true,
        json_mode: true,
        streaming: true,
        system_prompt: true,
        reasoning: true,
        search: true,
        vision: true,
      },
    });
    await ensureFixtureAlias({
      alias: imageAlias,
      modelName: uniq("dp_image_model"),
      modality: "IMAGE",
      capabilities: { vision: false },
      supportedSizes: ["1024x1024", "1536x1024"],
      sellPrice: { unit: "call", perCall: 0.5, currency: "USD" },
    });
    await ensureFixtureAlias({
      alias: deprecatedAlias,
      modelName: uniq("dp_deprecated_model"),
      modality: "TEXT",
      capabilities: { function_calling: true },
      deprecated: true,
    });

    // F-DP-06 fixtures (deliberately wrong first)
    await ensureFixtureAlias({
      alias: "deepseek-r1",
      modelName: uniq("dp_deepseek_r1"),
      modality: "TEXT",
      capabilities: { function_calling: false, reasoning: true },
      contextWindow: 128000,
    });
    await ensureFixtureAlias({
      alias: "grok-4.1-fast",
      modelName: uniq("dp_grok_fast"),
      modality: "TEXT",
      capabilities: { function_calling: true },
      contextWindow: 128000,
    });
    await ensureFixtureAlias({
      alias: "minimax-m2.5",
      modelName: uniq("dp_minimax_25"),
      modality: "TEXT",
      capabilities: { function_calling: true },
      contextWindow: 128000,
    });

    await step("F-DP-00-smoke-mcp-initialize", steps, async () => {
      const init = await rawMcpRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "dx-polish-verifier", version: "1.0.0" },
      });
      if (init.status !== 200) throw new Error(`initialize status=${init.status}`);
      return `server=${init.body?.result?.serverInfo?.name ?? "unknown"}`;
    });

    await step("F-DP-01-sellprice-round-6-decimals", steps, async () => {
      const viaPrisma = await appPrisma.modelAlias.create({
        data: {
          alias: uniq("dp_round_alias"),
          modality: "TEXT",
          enabled: true,
          sellPrice: {
            unit: "token",
            inputPer1M: 0.123456789,
            outputPer1M: 0.987654321,
            currency: "USD",
          },
        },
      });
      const sp1 = (viaPrisma.sellPrice as any) ?? {};
      if (Number(sp1.inputPer1M) !== number6(0.123456789)) throw new Error("prisma create not rounded");
      if (Number(sp1.outputPer1M) !== number6(0.987654321)) throw new Error("prisma create not rounded");

      const patched = await api(`/api/admin/model-aliases/${viaPrisma.id}`, {
        method: "PATCH",
        auth: "admin",
        expect: 200,
        body: JSON.stringify({
          sellPrice: { inputPer1M: 1.23456789, outputPer1M: 9.87654321, unit: "token" },
        }),
      });
      const sp2 = patched.body?.sellPrice ?? {};
      if (Number(sp2.inputPer1M) !== number6(1.23456789)) throw new Error("admin patch input not rounded");
      if (Number(sp2.outputPer1M) !== number6(9.87654321)) throw new Error("admin patch output not rounded");
      return `rounded=${sp2.inputPer1M}/${sp2.outputPer1M}`;
    });

    await step("F-DP-02-deprecated-propagates-to-list_models", steps, async () => {
      const lm = await callToolRaw("list_models", {});
      if (!lm.ok) throw new Error(`list_models failed: ${lm.error}`);
      const arr = toModelArray(parseToolText(lm.result));
      const row = arr.find((m) => m.id === deprecatedAlias);
      if (!row) throw new Error(`deprecated alias missing: ${deprecatedAlias}`);
      if (row.deprecated !== true) throw new Error("deprecated flag missing in list_models output");
      return `deprecatedAlias=${deprecatedAlias}`;
    });

    await step("F-DP-03-capability-enum-enforced", steps, async () => {
      const bad = await callToolRaw("list_models", { capability: "bad_capability" });
      if (bad.ok) throw new Error("invalid capability should be rejected");
      const ok = await callToolRaw("list_models", { capability: "function_calling" });
      if (!ok.ok) throw new Error(`valid capability rejected: ${ok.error}`);
      return "invalid rejected + valid accepted";
    });

    await step("F-DP-04-list_logs-model-description-canonical", steps, async () => {
      const list = await rawMcpRequest("tools/list", {});
      if (list.status !== 200) throw new Error(`tools/list status=${list.status}`);
      const tools = list.body?.result?.tools ?? [];
      const t = tools.find((x: any) => x.name === "list_logs");
      const modelDesc = t?.inputSchema?.properties?.model?.description ?? "";
      if (!String(modelDesc).includes("gpt-4o-mini")) throw new Error("canonical example missing");
      if (String(modelDesc).includes("openai/gpt-4o")) throw new Error("legacy provider/model example still present");
      return "description uses canonical model name";
    });

    await step("F-DP-05-not-found-message-unified", steps, async () => {
      const ids = {
        action: `act_${Date.now()}`,
        template: `tpl_${Date.now()}`,
      };
      const checks = [
        await callToolRaw("get_action_detail", { action_id: ids.action }),
        await callToolRaw("delete_action", { action_id: ids.action }),
        await callToolRaw("get_template_detail", { template_id: ids.template }),
        await callToolRaw("delete_template", { template_id: ids.template }),
      ];
      for (const c of checks) {
        if (c.ok) throw new Error("not-found call unexpectedly succeeded");
        if (!String(c.error).includes("not found in this project")) {
          throw new Error(`unexpected not-found message: ${c.error}`);
        }
      }
      return "4 endpoints use unified wording";
    });

    await step("F-DP-06-fix-script-applies-target-data", steps, async () => {
      const run = spawnSync("npx", ["tsx", "scripts/fix-dp-06-model-data.ts", "--apply"], {
        encoding: "utf8",
      });
      if (run.status !== 0) {
        throw new Error(`fix script failed: ${(run.stderr || run.stdout).slice(0, 180)}`);
      }

      const a = await prisma.modelAlias.findUnique({ where: { alias: "deepseek-r1" } });
      const b = await prisma.modelAlias.findUnique({ where: { alias: "grok-4.1-fast" } });
      const c = await prisma.modelAlias.findUnique({ where: { alias: "minimax-m2.5" } });
      const caps = (a?.capabilities as Record<string, unknown> | null) ?? {};
      if (caps.function_calling !== true) throw new Error("deepseek-r1.function_calling not fixed");
      if (b?.contextWindow !== 2_000_000) throw new Error(`grok-4.1-fast contextWindow=${b?.contextWindow}`);
      if (c?.contextWindow !== 1_000_000) throw new Error(`minimax-m2.5 contextWindow=${c?.contextWindow}`);
      return "deepseek-r1/grok-4.1-fast/minimax-m2.5 patched";
    });

    await step("F-DP-07-reasoning-usage-and-max_reasoning_tokens", steps, async () => {
      const chat = await callToolRaw("chat", {
        model: "deepseek-r1",
        messages: [{ role: "user", content: "reasoning path" }],
        max_tokens: 8,
        max_reasoning_tokens: 13,
      });
      if (!chat.ok) throw new Error(`chat failed: ${chat.error}`);
      const out = parseToolText(chat.result);
      if (typeof out?.usage?.reasoningTokens !== "number" || out.usage.reasoningTokens <= 0) {
        throw new Error(`reasoningTokens missing in MCP response: ${JSON.stringify(out?.usage)}`);
      }
      const last = seenChatBodies[seenChatBodies.length - 1] ?? {};
      if ((last as any).max_reasoning_tokens !== undefined) {
        throw new Error("max_reasoning_tokens leaked to upstream request body");
      }
      if (Number((last as any)?.reasoning?.max_tokens) !== 13) {
        throw new Error(`upstream reasoning.max_tokens mismatch: ${JSON.stringify(last)}`);
      }
      return `reasoningTokens=${out.usage.reasoningTokens}, reasoning.max_tokens=13`;
    });

    await step("F-DP-08-json_mode-strip-code-fence", steps, async () => {
      const chat = await callToolRaw("chat", {
        model: textAlias,
        messages: [{ role: "user", content: "return json" }],
        response_format: { type: "json_object" },
      });
      if (!chat.ok) throw new Error(`chat json_mode failed: ${chat.error}`);
      const out = parseToolText(chat.result);
      if (typeof out?.content !== "string") throw new Error("json_mode content missing");
      if (out.content.includes("```")) throw new Error(`code fence not stripped: ${out.content}`);
      const parsed = JSON.parse(out.content);
      if (parsed?.ok !== true) throw new Error(`unexpected JSON payload: ${out.content}`);
      return out.content;
    });

    await step("F-DP-09-chat-modality-validation", steps, async () => {
      const r = await callToolRaw("chat", {
        model: imageAlias,
        messages: [{ role: "user", content: "should be rejected" }],
      });
      if (r.ok) throw new Error("image model chat should fail");
      const msg = String(r.error ?? "");
      if (!msg.includes("invalid_model_modality")) throw new Error(`unexpected code: ${msg}`);
      if (!msg.includes("generate_image")) throw new Error(`missing guidance: ${msg}`);
      return msg.slice(0, 120);
    });

    await step("F-DP-10-nonstream-log-detail-no-ttft", steps, async () => {
      const c = await callToolRaw("chat", {
        model: textAlias,
        messages: [{ role: "user", content: "non-stream call for ttft check" }],
      });
      if (!c.ok) throw new Error(`chat failed: ${c.error}`);
      const out = parseToolText(c.result);
      const traceId = String(out?.traceId ?? "");
      if (!traceId.startsWith("trc_")) throw new Error("traceId missing");

      const detail = await callToolRaw("get_log_detail", { trace_id: traceId });
      if (!detail.ok) throw new Error(`get_log_detail failed: ${detail.error}`);
      const d = parseToolText(detail.result);
      if (Object.prototype.hasOwnProperty.call(d, "ttftMs")) {
        throw new Error(`ttftMs should be omitted for non-stream calls: ${JSON.stringify(d)}`);
      }
      if (Object.prototype.hasOwnProperty.call(d, "ttft")) {
        throw new Error(`ttft should be omitted for non-stream calls: ${JSON.stringify(d)}`);
      }
      return `traceId=${traceId}`;
    });

    await step("F-DP-11-capability-modality-isolation", steps, async () => {
      const lm = await callToolRaw("list_models", { capability: "function_calling" });
      if (!lm.ok) throw new Error(`list_models failed: ${lm.error}`);
      const arr = toModelArray(parseToolText(lm.result));
      if (!Array.isArray(arr) || arr.length === 0) throw new Error("empty result");
      const bad = arr.filter((m) => String(m.modality ?? "").toLowerCase() !== "text");
      if (bad.length > 0) throw new Error(`non-text model leaked: ${JSON.stringify(bad[0])}`);
      return `count=${arr.length}`;
    });

    await step("F-DP-12-chain-smoke-list_models-chat-list_logs", steps, async () => {
      const lm = await callToolRaw("list_models", { modality: "text" });
      if (!lm.ok) throw new Error(`list_models failed: ${lm.error}`);
      const models = toModelArray(parseToolText(lm.result));
      if (models.length === 0) throw new Error("no text models");

      const c = await callToolRaw("chat", {
        model: textAlias,
        messages: [{ role: "user", content: "chain smoke" }],
      });
      if (!c.ok) throw new Error(`chat failed: ${c.error}`);
      const out = parseToolText(c.result);
      const traceId = String(out?.traceId ?? "");

      const logs = await callToolRaw("list_logs", { limit: 10 });
      if (!logs.ok) throw new Error(`list_logs failed: ${logs.error}`);
      const rows = parseToolText(logs.result);
      const found = (Array.isArray(rows) ? rows : []).some((x: any) => String(x.traceId) === traceId);
      if (!found) throw new Error(`trace not found in list_logs: ${traceId}`);
      return `traceId=${traceId}`;
    });
  } finally {
    await mock.close();
    await prisma.$disconnect();
  }

  const pass = steps.filter((s) => s.ok).length;
  const fail = steps.length - pass;
  const report = {
    batch: "DX-POLISH",
    generatedAt: new Date().toISOString(),
    environment: BASE,
    pass,
    fail,
    checks: steps,
  };
  writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  const report = {
    batch: "DX-POLISH",
    generatedAt: new Date().toISOString(),
    environment: BASE,
    pass: 0,
    fail: 1,
    fatal: (err as Error).stack ?? String(err),
    checks: [] as StepResult[],
  };
  writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.error((err as Error).stack ?? String(err));
  process.exit(1);
});

