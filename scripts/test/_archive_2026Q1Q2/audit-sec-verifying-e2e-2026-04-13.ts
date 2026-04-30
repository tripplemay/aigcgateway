import "../../tests/helpers/load-test-env";
import { writeFileSync } from "fs";
import { PrismaClient, type HealthCheckResult } from "@prisma/client";
import { createTestApiKey, createTestProject, createTestUser } from "../../tests/factories";
import { jsonResponse, startMockProvider } from "../../tests/mocks/provider-server";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const MCP_URL = `${BASE}/api/mcp`;
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3318");
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ?? "docs/test-reports/audit-sec-verifying-local-e2e-2026-04-13.json";

const prisma = new PrismaClient();

type CheckResult = {
  id: string;
  ok: boolean;
  detail: string;
};

type Fixture = {
  aliasText: string;
  aliasImage: string;
  aliasDisabled: string;
  aliasAllFail: string;
  aliasFreeImage: string;
};

let token = "";
let apiKey = "";
let userId = "";
let projectId = "";
let mockBase = "";

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseJsonText(maybeText: string): any {
  try {
    return maybeText ? JSON.parse(maybeText) : null;
  } catch {
    return maybeText;
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
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
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
    body = firstPayload ? parseJsonText(firstPayload) : text;
  }
  return { status: res.status, body, text };
}

function parseMcpToolResult(result: any): any {
  const text = result?.content?.[0]?.text ?? "";
  if (!text) return null;
  return parseJsonText(text);
}

function toModelArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.models)) return payload.models;
  return [];
}

async function callToolRaw(name: string, args: Record<string, unknown> = {}) {
  const rpc = await rawMcpRequest("tools/call", { name, arguments: args });
  if (rpc.status >= 400) return { ok: false, error: rpc.text };
  if (rpc.body?.error) return { ok: false, error: JSON.stringify(rpc.body.error) };
  const result = rpc.body?.result ?? rpc.body;
  if (result?.isError) return { ok: false, error: String(result?.content?.[0]?.text ?? "tool_error") };
  return { ok: true, result };
}

function parseCost(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function assertNoLeak(text: string): { ok: boolean; matched: string[] } {
  const forbidden = [
    /QQ\s*\d+/i,
    /wechat/i,
    /context[-\s]?compression plugin/i,
    /https?:\/\/[^\s]+/i,
    /sk-[a-z0-9-]+/i,
    /电话|vx|微信|群号/,
  ];
  const matched = forbidden.filter((r) => r.test(text)).map((r) => r.source);
  return { ok: matched.length === 0, matched };
}

async function step(id: string, checks: CheckResult[], fn: () => Promise<string>) {
  try {
    const detail = await fn();
    checks.push({ id, ok: true, detail });
  } catch (error) {
    checks.push({ id, ok: false, detail: (error as Error).message });
  }
}

async function registerAndPrepareUser() {
  const user = await createTestUser(BASE, { prefix: "auditsec", name: "Audit SEC Tester" });
  token = user.token;
  const dbUser = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true } });
  userId = String(dbUser?.id ?? "");
  if (!userId) throw new Error("test user not found in DB");

  const project = await createTestProject(BASE, token, { name: `AUDIT-SEC ${Date.now()}` });
  projectId = project.id;
  await prisma.user.update({ where: { id: userId }, data: { defaultProjectId: projectId, balance: 20 } });

  const key = await createTestApiKey(BASE, token, { name: "audit-sec-key", rateLimit: 120 });
  apiKey = key.key;
}

async function upsertModelAliasBundle(
  alias: string,
  modality: "TEXT" | "IMAGE",
  model: string,
  aliasSellPrice?: Record<string, unknown>,
) {
  const m = await prisma.model.upsert({
    where: { name: model },
    update: {
      enabled: true,
      displayName: model,
      modality,
      capabilities: {
        function_calling: modality === "TEXT",
        streaming: modality === "TEXT",
        json_mode: modality === "TEXT",
        vision: modality === "IMAGE",
      },
      supportedSizes: modality === "IMAGE" ? ["1024x1024", "1536x1024"] : null,
    },
    create: {
      name: model,
      enabled: true,
      displayName: model,
      modality,
      capabilities: {
        function_calling: modality === "TEXT",
        streaming: modality === "TEXT",
        json_mode: modality === "TEXT",
        vision: modality === "IMAGE",
      },
      supportedSizes: modality === "IMAGE" ? ["1024x1024", "1536x1024"] : null,
    },
  });

  const a = await prisma.modelAlias.upsert({
    where: { alias },
    update: {
      enabled: true,
      modality,
      sellPrice: aliasSellPrice ?? (modality === "IMAGE" ? { unit: "call" } : undefined),
    },
    create: {
      alias,
      enabled: true,
      modality,
      sellPrice: aliasSellPrice ?? (modality === "IMAGE" ? { unit: "call" } : undefined),
    },
  });

  await prisma.aliasModelLink.upsert({
    where: { aliasId_modelId: { aliasId: a.id, modelId: m.id } },
    update: {},
    create: { aliasId: a.id, modelId: m.id },
  });

  return { modelId: m.id };
}

async function ensureChannelsAndHealth(fixture: Fixture) {
  const provider = await prisma.provider.findUniqueOrThrow({
    where: { name: "openai" },
    select: { id: true, baseUrl: true, authConfig: true },
  });

  await prisma.provider.update({
    where: { id: provider.id },
    data: { baseUrl: mockBase, authConfig: { apiKey: "mock-openai-key" }, proxyUrl: null },
  });

  const textMain = await upsertModelAliasBundle(fixture.aliasText, "TEXT", uniq("auditsec_text_model"));
  const imageMain = await upsertModelAliasBundle(fixture.aliasImage, "IMAGE", uniq("auditsec_image_model"));
  const imageDisabled = await upsertModelAliasBundle(
    fixture.aliasDisabled,
    "IMAGE",
    uniq("auditsec_disabled_image"),
  );
  const imageAllFail = await upsertModelAliasBundle(
    fixture.aliasAllFail,
    "IMAGE",
    uniq("auditsec_fail_image"),
  );
  const imageFree = await upsertModelAliasBundle(fixture.aliasFreeImage, "IMAGE", uniq("auditsec_free_image"), {
    unit: "call",
    perCall: 0,
  });

  const upsertChannel = async (
    modelId: string,
    status: "ACTIVE" | "DEGRADED" | "DISABLED",
    sellPrice: Record<string, unknown>,
  ) => {
    return prisma.channel.upsert({
      where: { providerId_modelId: { providerId: provider.id, modelId } },
      update: { status, priority: 1, realModelId: "mock-model", costPrice: sellPrice, sellPrice },
      create: { providerId: provider.id, modelId, status, priority: 1, realModelId: "mock-model", costPrice: sellPrice, sellPrice },
    });
  };

  const chText = await upsertChannel(textMain.modelId, "ACTIVE", {
    unit: "token",
    inputPer1M: 0.1,
    outputPer1M: 0.2,
    currency: "USD",
  });
  const chImageMain = await upsertChannel(imageMain.modelId, "ACTIVE", {
    unit: "call",
    perCall: 0.5,
    currency: "USD",
  });
  await upsertChannel(imageDisabled.modelId, "DISABLED", { unit: "call", perCall: 0.5, currency: "USD" });
  const chImageAllFail = await upsertChannel(imageAllFail.modelId, "ACTIVE", {
    unit: "call",
    perCall: 0.5,
    currency: "USD",
  });
  await upsertChannel(imageFree.modelId, "ACTIVE", { unit: "call", perCall: 0, currency: "USD" });

  await prisma.healthCheck.createMany({
    data: [
      { channelId: chText.id, level: "API_REACHABILITY", result: "PASS" },
      { channelId: chImageMain.id, level: "API_REACHABILITY", result: "PASS" },
      { channelId: chImageAllFail.id, level: "API_REACHABILITY", result: "FAIL" as HealthCheckResult },
    ],
  });
}

async function main() {
  const checks: CheckResult[] = [];
  const fixture: Fixture = {
    aliasText: uniq("auditsec_text_alias"),
    aliasImage: uniq("auditsec_image_alias"),
    aliasDisabled: uniq("auditsec_disabled_alias"),
    aliasAllFail: uniq("auditsec_all_fail_alias"),
    aliasFreeImage: uniq("auditsec_free_alias"),
  };

  const mock = await startMockProvider({
    port: MOCK_PORT,
    onRequest: (req, res, body) => {
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const parsed = parseJsonText(body || "{}");
        const msgs = Array.isArray(parsed?.messages) ? parsed.messages : [];
        const hasTrigger = msgs.some((m: any) =>
          String(m?.content ?? "").includes("trigger-upstream-error"),
        );
        if (hasTrigger) {
          jsonResponse(res, 400, {
            error: {
              message:
                "context-compression plugin failed. contact QQ 123456 and WeChat group. docs: https://evil.example/help key=sk-live-leak",
              code: "provider_bad_request",
            },
          });
          return true;
        }
      }
      return false;
    },
  });
  mockBase = `${mock.baseUrl}/v1`;

  try {
    await registerAndPrepareUser();
    await ensureChannelsAndHealth(fixture);

    await step("F-AS-00-smoke-mcp-initialize", checks, async () => {
      const init = await rawMcpRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "audit-sec-tester", version: "1.0.0" },
      });
      if (init.status !== 200) throw new Error(`initialize status=${init.status}`);
      return `server=${init.body?.result?.serverInfo?.name ?? "unknown"}`;
    });

    await step("F-AS-01-upstream-error-sanitized-rest-chat", checks, async () => {
      const r = await api("/v1/chat/completions", {
        method: "POST",
        auth: "key",
        expect: 400,
        body: JSON.stringify({
          model: fixture.aliasText,
          messages: [{ role: "user", content: "trigger-upstream-error" }],
        }),
      });
      const content = JSON.stringify(r.body);
      const leak = assertNoLeak(content);
      if (!leak.ok) throw new Error(`sanitization leak patterns: ${leak.matched.join(", ")}`);
      return content.slice(0, 120);
    });

    await step("F-AS-01-upstream-error-sanitized-mcp-chat", checks, async () => {
      const r = await callToolRaw("chat", {
        model: fixture.aliasText,
        messages: [{ role: "user", content: "trigger-upstream-error" }],
      });
      if (r.ok) throw new Error("chat unexpectedly succeeded; expected sanitized error");
      const leak = assertNoLeak(String(r.error ?? ""));
      if (!leak.ok) throw new Error(`sanitization leak patterns: ${leak.matched.join(", ")}`);
      return String(r.error ?? "").slice(0, 120);
    });

    await step("F-AS-02-list_models-filter-unavailable", checks, async () => {
      const mcpModels = await callToolRaw("list_models", { modality: "image" });
      if (!mcpModels.ok) throw new Error(`list_models failed: ${mcpModels.error}`);
      const arr = toModelArray(parseMcpToolResult(mcpModels.result));
      const ids = arr.map((m: any) => String(m.id ?? ""));
      if (ids.length === 0) {
        throw new Error("list_models(modality=image) returned empty set");
      }
      if (ids.includes(fixture.aliasDisabled)) throw new Error(`disabled alias leaked: ${fixture.aliasDisabled}`);
      if (ids.includes(fixture.aliasAllFail)) throw new Error(`all-fail alias leaked: ${fixture.aliasAllFail}`);
      return `visible=${ids.length}`;
    });

    await step("F-AS-03-image-model-supportedSizes-present", checks, async () => {
      const mcpModels = await callToolRaw("list_models", { modality: "image" });
      if (!mcpModels.ok) throw new Error(`list_models failed: ${mcpModels.error}`);
      const arr = toModelArray(parseMcpToolResult(mcpModels.result));
      if (arr.length === 0) throw new Error("list_models(modality=image) returned empty set");
      const missing = arr
        .filter((m: any) => !Array.isArray(m.supportedSizes) || m.supportedSizes.length === 0)
        .map((m: any) => String(m.id ?? "unknown"));
      if (missing.length > 0) throw new Error(`missing supportedSizes: ${missing.join(", ")}`);
      return `models=${Array.isArray(arr) ? arr.length : 0}`;
    });

    await step("F-AS-04-image-billing-cost-and-balance", checks, async () => {
      const before = await callToolRaw("get_balance", { include_transactions: true });
      if (!before.ok) throw new Error(`get_balance(before) failed: ${before.error}`);
      const beforeData = parseMcpToolResult(before.result);
      const beforeBalance = parseCost(beforeData?.balance);

      const img = await callToolRaw("generate_image", {
        model: fixture.aliasImage,
        prompt: "<script>alert('x')</script> audit-sec billing",
        size: "1024x1024",
      });
      if (!img.ok) throw new Error(`generate_image failed: ${img.error}`);
      const imgData = parseMcpToolResult(img.result);
      if (imgData?.error) throw new Error(`generate_image payload has error: ${JSON.stringify(imgData.error)}`);

      const logs = await callToolRaw("list_logs", { model: fixture.aliasImage, limit: 5 });
      if (!logs.ok) throw new Error(`list_logs failed: ${logs.error}`);
      const rows = parseMcpToolResult(logs.result);
      const row = (Array.isArray(rows) ? rows : []).find((r: any) => String(r.model) === fixture.aliasImage);
      const traceId = String(row?.traceId ?? "");
      if (!traceId.startsWith("trc_")) throw new Error(`cannot locate traceId from list_logs for ${fixture.aliasImage}`);

      const detail = await callToolRaw("get_log_detail", { trace_id: traceId });
      if (!detail.ok) throw new Error(`get_log_detail failed: ${detail.error}`);
      const detailData = parseMcpToolResult(detail.result);
      const cost = parseCost(detailData?.cost ?? row?.cost);
      if (!(cost > 0)) throw new Error(`cost must be > 0, got ${detailData?.cost}`);

      const after = await callToolRaw("get_balance", { include_transactions: true });
      if (!after.ok) throw new Error(`get_balance(after) failed: ${after.error}`);
      const afterData = parseMcpToolResult(after.result);
      const afterBalance = parseCost(afterData?.balance);
      if (!(afterBalance < beforeBalance)) {
        throw new Error(`balance not deducted: before=${beforeBalance}, after=${afterBalance}`);
      }

      return `traceId=${traceId} cost=${detailData?.cost} balanceDelta=${(beforeBalance - afterBalance).toFixed(8)}`;
    });

    await step("F-AS-05-free_only-filter", checks, async () => {
      const rest = await api("/api/v1/models?modality=image&free_only=true", { auth: "key", expect: 200 });
      const restIds = (Array.isArray(rest.body?.data) ? rest.body.data : []).map((m: any) => String(m.id ?? ""));
      const mcpModels = await callToolRaw("list_models", { free_only: true, modality: "image" });
      if (!mcpModels.ok) throw new Error(`list_models free_only failed: ${mcpModels.error}`);
      const arr = toModelArray(parseMcpToolResult(mcpModels.result));
      const ids = arr.map((m: any) => String(m.id ?? ""));
      const inRest = restIds.includes(fixture.aliasFreeImage);
      const inMcp = ids.includes(fixture.aliasFreeImage);
      if (!inRest || !inMcp) {
        throw new Error(
          `free alias missing: rest=${inRest} mcp=${inMcp} alias=${fixture.aliasFreeImage}`,
        );
      }
      return `restFreeCount=${restIds.length} mcpFreeCount=${ids.length}`;
    });

    await step("F-AS-06-log-xss-escaped", checks, async () => {
      const logs = await callToolRaw("list_logs", { limit: 20 });
      if (!logs.ok) throw new Error(`list_logs failed: ${logs.error}`);
      const rows = parseMcpToolResult(logs.result);
      const target = (Array.isArray(rows) ? rows : []).find((r: any) => String(r.model || "") === fixture.aliasImage);
      if (!target) throw new Error(`cannot find recent image log for model=${fixture.aliasImage}`);

      const detail = await callToolRaw("get_log_detail", { trace_id: target.traceId });
      if (!detail.ok) throw new Error(`get_log_detail failed: ${detail.error}`);
      const d = parseMcpToolResult(detail.result);
      const promptText = JSON.stringify(d?.prompt ?? "");
      const responseText = JSON.stringify(d?.response ?? "");
      if (!promptText.includes("&lt;script&gt;")) throw new Error("escaped prompt not found (&lt;script&gt;)");
      if (promptText.includes("<script>")) throw new Error("raw <script> still present in prompt");
      if (responseText.includes("<script>")) throw new Error("raw <script> still present in response");
      return `traceId=${target.traceId}`;
    });

    await step("F-AS-07-invalid-size-precheck-rest", checks, async () => {
      const r = await api("/v1/images/generations", {
        method: "POST",
        auth: "key",
        expect: 400,
        body: JSON.stringify({
          model: fixture.aliasImage,
          prompt: "invalid size check",
          size: "999x999",
        }),
      });
      const raw = JSON.stringify(r.body);
      if (!/invalid_size/i.test(raw)) throw new Error(`missing invalid_size code: ${raw}`);
      if (!/1024x1024|1536x1024/.test(raw)) throw new Error(`supportedSizes not exposed in message: ${raw}`);
      return raw.slice(0, 120);
    });

    await step("F-AS-07-invalid-size-precheck-mcp", checks, async () => {
      const r = await callToolRaw("generate_image", {
        model: fixture.aliasImage,
        prompt: "invalid size check",
        size: "999x999",
      });
      const text = r.ok ? JSON.stringify(parseMcpToolResult(r.result)) : String(r.error ?? "");
      if (!/invalid_size/i.test(text)) throw new Error(`missing invalid_size code: ${text}`);
      if (!/1024x1024|1536x1024/.test(text)) throw new Error(`supportedSizes not in error: ${text}`);
      return text.slice(0, 120);
    });
  } finally {
    await mock.close();
    await prisma.$disconnect();
  }

  const pass = checks.filter((c) => c.ok).length;
  const fail = checks.length - pass;
  const report = {
    batch: "AUDIT-SEC",
    generatedAt: new Date().toISOString(),
    environment: BASE,
    pass,
    fail,
    checks,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  const report = {
    batch: "AUDIT-SEC",
    generatedAt: new Date().toISOString(),
    environment: BASE,
    pass: 0,
    fail: 1,
    fatal: (err as Error).stack ?? String(err),
    checks: [] as CheckResult[],
  };
  writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.error((err as Error).stack ?? String(err));
  process.exit(1);
});
