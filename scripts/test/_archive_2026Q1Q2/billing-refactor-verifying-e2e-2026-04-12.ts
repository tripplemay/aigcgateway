import "../../tests/helpers/load-test-env";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { startMockProvider } from "../../tests/mocks/provider-server";
import { createTestUser, createTestProject, createTestApiKey } from "../../tests/factories";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const MCP_URL = `${BASE}/api/mcp`;
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3316");
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/billing-refactor-verifying-e2e-2026-04-12.json";

const prisma = new PrismaClient();

type StepResult = { id: string; ok: boolean; detail: string };
type ApiRes = { status: number; body: any; text: string };
type RestoreState = { providerId: string; baseUrl: string; authConfig: unknown };

let userToken = "";
let adminToken = "";
let apiKey = "";
let projectId = "";
let userId = "";
let mockBase = "";

const created = {
  modelIds: [] as string[],
  aliasIds: [] as string[],
  linkIds: [] as string[],
  channelIds: [] as string[],
};

let testAlias = "";
let testChannelId = "";

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseDollar(v: unknown): number {
  return Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
}

function decimalPlaces(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const s = String(v);
  if (!s.includes(".")) return 0;
  return s.split(".")[1].length;
}

async function api(
  path: string,
  init?: RequestInit & { expect?: number; auth?: "none" | "user" | "admin" | "key" },
): Promise<ApiRes> {
  const { expect, auth = "none", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "user" && userToken) headers.authorization = `Bearer ${userToken}`;
  if (auth === "admin" && adminToken) headers.authorization = `Bearer ${adminToken}`;
  if (auth === "key" && apiKey) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (typeof expect === "number" && expect !== res.status) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, text };
}

async function rawMcp(method: string, params?: Record<string, unknown>): Promise<ApiRes> {
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
  const rpc = await rawMcp("tools/call", { name, arguments: args });
  if (rpc.status >= 400) throw new Error(`tools/call ${name} http=${rpc.status}: ${rpc.text}`);
  if (rpc.body?.error) throw new Error(`tools/call ${name} rpc=${JSON.stringify(rpc.body.error)}`);
  const result = rpc.body?.result ?? rpc.body;
  if (result?.isError) {
    throw new Error(`tools/call ${name} tool=${result?.content?.[0]?.text ?? "unknown"}`);
  }
  return result;
}

async function setupUserProjectAndKey() {
  const user = await createTestUser(BASE, { prefix: "br", name: "Billing Refactor Tester" });
  userToken = user.token;

  const dbUser = await prisma.user.findUnique({
    where: { email: user.email },
    select: { id: true },
  });
  userId = String(dbUser?.id ?? "");
  if (!userId) throw new Error("test user not found in DB");

  const project = await createTestProject(BASE, userToken, {
    name: `BR Project ${Date.now()}`,
  });
  projectId = project.id;

  await prisma.user.update({
    where: { id: userId },
    data: { defaultProjectId: projectId, balance: 20 },
  });

  const key = await createTestApiKey(BASE, userToken, { name: "br-key", rateLimit: 120 });
  apiKey = key.key;
}

async function loginAdmin() {
  const res = await api("/api/auth/login", {
    method: "POST",
    expect: 200,
    auth: "none",
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: requireEnv("ADMIN_TEST_PASSWORD") }),
  });
  adminToken = String(res.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");
}

async function setupProviderAndAliasFixture(): Promise<RestoreState> {
  const provider = await prisma.provider.findUniqueOrThrow({
    where: { name: "openai" },
    select: { id: true, baseUrl: true, authConfig: true },
  });

  const restore: RestoreState = {
    providerId: provider.id,
    baseUrl: provider.baseUrl,
    authConfig: provider.authConfig,
  };

  await prisma.provider.update({
    where: { id: provider.id },
    data: { baseUrl: mockBase, authConfig: { apiKey: "mock-openai-key" }, proxyUrl: null },
  });

  const model = await prisma.model.create({
    data: {
      name: uniq("br_model"),
      displayName: "BR Test Model",
      modality: "TEXT",
      enabled: true,
      contextWindow: 128000,
      maxTokens: 8192,
      capabilities: { streaming: true, json_mode: true },
    },
  });
  created.modelIds.push(model.id);

  testAlias = uniq("br_alias");
  const alias = await prisma.modelAlias.create({
    data: {
      alias: testAlias,
      modality: "TEXT",
      enabled: true,
      sellPrice: {
        unit: "token",
        inputPer1M: 0.333333,
        outputPer1M: 0.666667,
        currency: "USD",
      },
    },
  });
  created.aliasIds.push(alias.id);

  const link = await prisma.aliasModelLink.create({ data: { aliasId: alias.id, modelId: model.id } });
  created.linkIds.push(link.id);

  const channel = await prisma.channel.create({
    data: {
      providerId: provider.id,
      modelId: model.id,
      realModelId: "gpt-4o-mini",
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
      // Intentionally set very different channel sellPrice to verify it no longer drives billing.
      sellPrice: { unit: "token", inputPer1M: 9.999999, outputPer1M: 8.888888, currency: "USD" },
    },
  });
  created.channelIds.push(channel.id);
  testChannelId = channel.id;

  return restore;
}

async function restoreProvider(state: RestoreState) {
  await prisma.provider.update({
    where: { id: state.providerId },
    data: { baseUrl: state.baseUrl, authConfig: state.authConfig as any },
  });
}

async function cleanupFixtures() {
  if (created.linkIds.length) {
    await prisma.aliasModelLink.deleteMany({ where: { id: { in: created.linkIds } } });
  }
  if (created.aliasIds.length) {
    await prisma.modelAlias.deleteMany({ where: { id: { in: created.aliasIds } } });
  }
  if (created.channelIds.length) {
    await prisma.healthCheck.deleteMany({ where: { channelId: { in: created.channelIds } } });
    await prisma.channel.deleteMany({ where: { id: { in: created.channelIds } } });
  }
  if (created.modelIds.length) {
    await prisma.model.deleteMany({ where: { id: { in: created.modelIds } } });
  }
}

async function step(id: string, steps: StepResult[], fn: () => Promise<string>) {
  try {
    const detail = await fn();
    steps.push({ id, ok: true, detail });
  } catch (err) {
    steps.push({ id, ok: false, detail: (err as Error).message });
  }
}

async function main() {
  const steps: StepResult[] = [];

  const mockServer = await startMockProvider({ port: MOCK_PORT });
  mockBase = `${mockServer.baseUrl}/v1`;

  let restoreState: RestoreState | null = null;
  try {
    restoreState = await setupProviderAndAliasFixture();
    await setupUserProjectAndKey();
    await loginAdmin();

    await step("SMOKE-01-service-ready", steps, async () => {
      const models = await api("/v1/models", { auth: "none", expect: 200 });
      const list = models.body?.data ?? [];
      return `status=${models.status} models=${Array.isArray(list) ? list.length : 0}`;
    });

    await step("SMOKE-02-mcp-initialize", steps, async () => {
      const init = await rawMcp("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "billing-refactor-verifier", version: "1.0.0" },
      });
      if (init.status !== 200) throw new Error(`initialize status=${init.status}`);
      const server = init.body?.result?.serverInfo?.name;
      if (!server) throw new Error("serverInfo missing");
      return `server=${server}`;
    });

    await step("F-BR-AC1-AC4-cost-equals-list-price-and-ignore-channel-sellPrice", steps, async () => {
      const models = parseToolJson(await callTool("list_models", { modality: "text" })) as any[];
      const target = models.find((m: any) => m.name === testAlias);
      if (!target) throw new Error(`alias ${testAlias} not found in list_models`);
      const inPerM = Number(target.pricing?.inputPerMillion);
      const outPerM = Number(target.pricing?.outputPerMillion);
      if (!Number.isFinite(inPerM) || !Number.isFinite(outPerM)) {
        throw new Error(`pricing invalid: ${JSON.stringify(target.pricing)}`);
      }

      const chat = parseToolJson(
        await callTool("chat", {
          model: testAlias,
          messages: [{ role: "user", content: "billing refactor verification" }],
        }),
      );
      const traceId = String(chat.traceId ?? "");
      if (!traceId.startsWith("trc_")) throw new Error(`traceId missing: ${JSON.stringify(chat)}`);

      const usage = chat.usage ?? {};
      const p = Number(usage.promptTokens ?? 0);
      const c = Number(usage.completionTokens ?? 0);

      const detail = parseToolJson(await callTool("get_log_detail", { trace_id: traceId }));
      const actual = parseDollar(detail.cost);
      const expected = Number(((p * inPerM + c * outPerM) / 1_000_000).toFixed(8));
      const byChannel = Number(((p * 9.999999 + c * 8.888888) / 1_000_000).toFixed(8));

      if (actual !== expected) {
        throw new Error(`cost mismatch: expected=${expected.toFixed(8)} actual=${actual.toFixed(8)}`);
      }
      if (actual === byChannel) {
        throw new Error(
          `cost still equals channel sellPrice path: actual=${actual.toFixed(8)} channel=${byChannel.toFixed(8)}`,
        );
      }

      // Try to update channel.sellPrice via admin API (should be ignored), then verify cost unchanged.
      await api(`/api/admin/channels/${testChannelId}`, {
        method: "PATCH",
        auth: "admin",
        expect: 200,
        body: JSON.stringify({
          sellPrice: { unit: "token", inputPer1M: 88.888888, outputPer1M: 77.777777, currency: "USD" },
          priority: 1,
        }),
      });

      const chat2 = parseToolJson(
        await callTool("chat", {
          model: testAlias,
          messages: [{ role: "user", content: "billing refactor verification after channel patch" }],
        }),
      );
      const traceId2 = String(chat2.traceId ?? "");
      if (!traceId2.startsWith("trc_")) throw new Error("traceId2 missing");
      const usage2 = chat2.usage ?? {};
      const p2 = Number(usage2.promptTokens ?? 0);
      const c2 = Number(usage2.completionTokens ?? 0);
      const detail2 = parseToolJson(await callTool("get_log_detail", { trace_id: traceId2 }));
      const actual2 = parseDollar(detail2.cost);
      const expected2 = Number(((p2 * inPerM + c2 * outPerM) / 1_000_000).toFixed(8));
      if (actual2 !== expected2) {
        throw new Error(
          `post-patch mismatch: expected=${expected2.toFixed(8)} actual=${actual2.toFixed(8)}`,
        );
      }

      return `trace1=${traceId} trace2=${traceId2} price=${inPerM}/${outPerM} cost=${actual.toFixed(8)}`;
    });

    await step("F-BR-AC2-no-enabled-model-pricing-empty", steps, async () => {
      const models = parseToolJson(await callTool("list_models")) as any[];
      const missing = models.filter((m: any) => {
        const p = m?.pricing;
        if (!p || typeof p !== "object") return true;
        if (p.perCall !== undefined) return !Number.isFinite(Number(p.perCall));
        if (p.inputPerMillion !== undefined || p.outputPerMillion !== undefined) {
          return !Number.isFinite(Number(p.inputPerMillion)) || !Number.isFinite(Number(p.outputPerMillion));
        }
        return true;
      });
      if (missing.length > 0) {
        throw new Error(
          `models with empty/invalid pricing: ${missing
            .slice(0, 5)
            .map((m: any) => m.name)
            .join(", ")}`,
        );
      }
      return `checked=${models.length}`;
    });

    await step("F-BR-AC3-pricing-decimals-max-6", steps, async () => {
      const models = parseToolJson(await callTool("list_models")) as any[];
      const noisy: string[] = [];

      for (const m of models) {
        const p = m?.pricing ?? {};
        const nums: Array<[string, number]> = [];
        if (p.inputPerMillion !== undefined) nums.push(["inputPerMillion", Number(p.inputPerMillion)]);
        if (p.outputPerMillion !== undefined) nums.push(["outputPerMillion", Number(p.outputPerMillion)]);
        if (p.perCall !== undefined) nums.push(["perCall", Number(p.perCall)]);

        for (const [k, v] of nums) {
          if (!Number.isFinite(v)) continue;
          if (decimalPlaces(v) > 6) noisy.push(`${m.name}.${k}=${v}`);
        }
      }

      if (noisy.length > 0) {
        throw new Error(`float tail found: ${noisy.slice(0, 6).join(", ")}`);
      }
      return `checked=${models.length}`;
    });
  } finally {
    if (restoreState) await restoreProvider(restoreState).catch(() => {});
    await cleanupFixtures().catch(() => {});
    await mockServer.close().catch(() => {});
    await prisma.$disconnect();
  }

  const fail = steps.filter((s) => !s.ok).length;
  const report = {
    batch: "BILLING-REFACTOR",
    feature: "F-BR-07",
    executedAt: new Date().toISOString(),
    baseUrl: BASE,
    mcpUrl: MCP_URL,
    pass: steps.length - fail,
    fail,
    steps,
  };
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));

  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  const report = {
    batch: "BILLING-REFACTOR",
    feature: "F-BR-07",
    executedAt: new Date().toISOString(),
    baseUrl: BASE,
    mcpUrl: MCP_URL,
    pass: 0,
    fail: 1,
    steps: [] as StepResult[],
    fatal: (err as Error).stack ?? String(err),
  };
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.error((err as Error).stack ?? String(err));
  process.exit(1);
});
