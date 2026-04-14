import "../../tests/helpers/load-test-env";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { createTestApiKey, createTestProject, createTestUser } from "../../tests/factories";
import { jsonResponse, startMockProvider } from "../../tests/mocks/provider-server";
import { recordSpending, recordTokenUsage } from "../../src/lib/api/rate-limit";
import { getRedis } from "../../src/lib/redis";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/rate-limit-f-rl-08-verifying-e2e-2026-04-15.json";

const prisma = new PrismaClient();

type Check = { id: string; ok: boolean; detail: string };

let userToken = "";
let adminToken = "";
let apiKey = "";
let apiKeyId = "";
let userId = "";
let projectId = "";

function parseJsonText(input: string): any {
  try {
    return input ? JSON.parse(input) : null;
  } catch {
    return input;
  }
}

async function api(
  path: string,
  init?: RequestInit & { auth?: "none" | "user" | "admin" | "key"; expect?: number },
) {
  const { auth = "none", expect, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "user") headers.authorization = `Bearer ${userToken}`;
  if (auth === "admin") headers.authorization = `Bearer ${adminToken}`;
  if (auth === "key") headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  const raw = await res.text();
  const body = parseJsonText(raw);
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, raw, headers: res.headers };
}

function extractErr(resp: { body: any; raw: string }) {
  if (resp.body?.error?.code) {
    return {
      code: String(resp.body.error.code),
      message: String(resp.body.error.message ?? ""),
    };
  }
  return { code: "", message: resp.raw };
}

async function setGlobalDefault(key: string, value: number) {
  const r = await api("/api/admin/config", {
    method: "PUT",
    auth: "admin",
    body: JSON.stringify({ key, value }),
  });
  if (r.status !== 200) throw new Error(`set ${key} failed: ${r.raw}`);
}

async function chatCall(body: Record<string, unknown>) {
  return api("/v1/chat/completions", {
    method: "POST",
    auth: "key",
    body: JSON.stringify({
      model: "rl-test-text",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 8,
      ...body,
    }),
  });
}

async function callMcpTool(name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    }),
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
  if (body?.error) {
    throw new Error(`mcp error: ${JSON.stringify(body.error)}`);
  }
  const t = String(body?.result?.content?.[0]?.text ?? "");
  return parseJsonText(t);
}

async function step(id: string, checks: Check[], fn: () => Promise<string>) {
  try {
    const detail = await fn();
    checks.push({ id, ok: true, detail });
  } catch (err) {
    checks.push({ id, ok: false, detail: (err as Error).message });
  }
}

async function loginAdmin() {
  const candidates = [
    { email: "codex-admin@aigc-gateway.local", password: "Codex@2026!" },
    { email: "admin@aigc-gateway.local", password: "admin123" },
  ];
  for (const c of candidates) {
    const r = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(c),
    });
    if (r.status === 200 && r.body?.token) {
      adminToken = String(r.body.token);
      return;
    }
  }
  throw new Error("admin login failed");
}

async function setupIdentity() {
  await loginAdmin();
  const user = await createTestUser(BASE, { prefix: "rl08", name: "RL08 Verifier" });
  userToken = user.token;

  const row = await prisma.user.findUnique({
    where: { email: user.email },
    select: { id: true },
  });
  userId = String(row?.id ?? "");
  if (!userId) throw new Error("user not found");

  const project = await createTestProject(BASE, userToken, { name: `RL08 ${Date.now()}` });
  projectId = project.id;
  await prisma.user.update({
    where: { id: userId },
    data: { defaultProjectId: projectId, balance: 200, rateLimit: null },
  });

  const k = await createTestApiKey(BASE, userToken, {
    name: "rl08-key-main",
    rateLimit: 120,
  });
  apiKey = k.key;
  apiKeyId = k.id;
}

async function setupFixtures() {
  const mock = await startMockProvider({
    port: 3331,
    onRequest: (req, res, body) => {
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const payload = parseJsonText(body || "{}") ?? {};
        const model = String(payload.model ?? "rl-test-text");
        jsonResponse(res, 200, {
          id: "chatcmpl-rl08",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            { index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" },
          ],
          usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 },
        });
        return true;
      }
      return false;
    },
  });

  const provider = await prisma.provider.findUniqueOrThrow({ where: { name: "openai" } });
  await prisma.provider.update({
    where: { id: provider.id },
    data: {
      baseUrl: `${mock.baseUrl}/v1`,
      authConfig: { apiKey: "mock-openai-key" },
      status: "ACTIVE",
    },
  });
  await prisma.providerConfig.upsert({
    where: { providerId: provider.id },
    update: {
      supportsModelsApi: true,
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
    },
    create: {
      providerId: provider.id,
      supportsModelsApi: true,
      chatEndpoint: "/chat/completions",
      imageEndpoint: "/images/generations",
    },
  });

  const model = await prisma.model.upsert({
    where: { name: "openai/rl-test-text" },
    update: {
      enabled: true,
      displayName: "openai/rl-test-text",
      modality: "TEXT",
      contextWindow: 8000,
      maxTokens: 2048,
      capabilities: { streaming: true },
    },
    create: {
      name: "openai/rl-test-text",
      enabled: true,
      displayName: "openai/rl-test-text",
      modality: "TEXT",
      contextWindow: 8000,
      maxTokens: 2048,
      capabilities: { streaming: true },
    },
  });

  const alias = await prisma.modelAlias.upsert({
    where: { alias: "rl-test-text" },
    update: { enabled: true, modality: "TEXT" },
    create: { alias: "rl-test-text", enabled: true, modality: "TEXT" },
  });
  await prisma.aliasModelLink.deleteMany({
    where: { aliasId: alias.id, NOT: { modelId: model.id } },
  });
  await prisma.aliasModelLink.upsert({
    where: { aliasId_modelId: { aliasId: alias.id, modelId: model.id } },
    update: {},
    create: { aliasId: alias.id, modelId: model.id },
  });

  const channel = await prisma.channel.upsert({
    where: { providerId_modelId: { providerId: provider.id, modelId: model.id } },
    update: {
      realModelId: "rl-test-text",
      status: "ACTIVE",
      priority: 1,
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
      sellPrice: { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
    },
    create: {
      providerId: provider.id,
      modelId: model.id,
      realModelId: "rl-test-text",
      status: "ACTIVE",
      priority: 1,
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
      sellPrice: { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
    },
  });
  await prisma.healthCheck.deleteMany({ where: { channelId: channel.id } });

  return mock;
}

async function clearRateLimitState() {
  const redis = getRedis();
  if (!redis) return;
  const minute = Math.floor(Date.now() / 60_000);
  const keys = [
    `rl:rpm:project:${projectId}`,
    `rl:rpm:user:${userId}`,
    `rl:rpm:key:${apiKeyId}`,
    `rl:tpm:${projectId}`,
    `rl:burst:${projectId}`,
    `rl:spend:${userId}:${minute}`,
  ];
  await redis.del(...keys);
}

async function main() {
  const checks: Check[] = [];
  const startedAt = new Date().toISOString();
  const logStart = new Date();

  await setupIdentity();
  const mock = await setupFixtures();

  try {
    await setGlobalDefault("GLOBAL_DEFAULT_BURST_COUNT", 200);
    await setGlobalDefault("GLOBAL_DEFAULT_BURST_WINDOW_SEC", 5);
    await setGlobalDefault("GLOBAL_DEFAULT_KEY_RPM", 120);
    await setGlobalDefault("GLOBAL_DEFAULT_USER_RPM", 120);
    await setGlobalDefault("GLOBAL_DEFAULT_RPM", 120);
    await setGlobalDefault("GLOBAL_DEFAULT_TPM", 100000);
    await setGlobalDefault("GLOBAL_DEFAULT_SPEND_PER_MIN", 1);
    await clearRateLimitState();

    await step("F-RL-08-01-burst-parallel", checks, async () => {
      await setGlobalDefault("GLOBAL_DEFAULT_BURST_COUNT", 5);
      await clearRateLimitState();
      const reqs = Array.from({ length: 15 }, () => chatCall({}));
      const rs = await Promise.all(reqs);
      const burst429 = rs.filter((r) => r.status === 429 && extractErr(r).code === "burst_limit_exceeded");
      if (burst429.length === 0) throw new Error("no burst_limit_exceeded under 15 concurrent requests");
      await setGlobalDefault("GLOBAL_DEFAULT_BURST_COUNT", 200);
      return `burst_429=${burst429.length}/15`;
    });

    await step("F-RL-08-02-rpm-limit", checks, async () => {
      await api(`/api/keys/${apiKeyId}`, {
        method: "PATCH",
        auth: "user",
        body: JSON.stringify({ rateLimit: 2 }),
        expect: 200,
      });
      await clearRateLimitState();
      await chatCall({});
      await chatCall({});
      const r3 = await chatCall({});
      const err = extractErr(r3);
      if (r3.status !== 429 || err.code !== "rate_limit_exceeded") {
        throw new Error(`expected 429 rate_limit_exceeded, got ${r3.status}: ${r3.raw}`);
      }
      if (!/on key/i.test(err.message)) throw new Error(`not key dimension: ${err.message}`);
      return err.message;
    });

    await step("F-RL-08-03-tpm-limit", checks, async () => {
      await setGlobalDefault("GLOBAL_DEFAULT_TPM", 60);
      await clearRateLimitState();
      await recordTokenUsage({ id: projectId, rateLimit: null }, 80);
      const r = await chatCall({});
      const err = extractErr(r);
      if (r.status !== 429 || err.code !== "token_rate_limit_exceeded") {
        throw new Error(`expected token_rate_limit_exceeded, got ${r.status}: ${r.raw}`);
      }
      await setGlobalDefault("GLOBAL_DEFAULT_TPM", 100000);
      return err.message;
    });

    await step("F-RL-08-04-spend-rate-limit", checks, async () => {
      await setGlobalDefault("GLOBAL_DEFAULT_SPEND_PER_MIN", 1);
      await clearRateLimitState();
      await recordSpending(userId, 1.2);
      const r = await chatCall({});
      const err = extractErr(r);
      if (r.status !== 429 || err.code !== "spend_rate_exceeded") {
        throw new Error(`expected spend_rate_exceeded, got ${r.status}: ${r.raw}`);
      }
      return err.message;
    });

    await step("F-RL-08-05-user-dimension", checks, async () => {
      await setGlobalDefault("GLOBAL_DEFAULT_USER_RPM", 1);
      await setGlobalDefault("GLOBAL_DEFAULT_KEY_RPM", 120);
      await api(`/api/keys/${apiKeyId}`, {
        method: "PATCH",
        auth: "user",
        body: JSON.stringify({ rateLimit: 120 }),
        expect: 200,
      });
      await api(`/api/projects/${projectId}`, {
        method: "PATCH",
        auth: "user",
        body: JSON.stringify({ rateLimit: { rpm: 120, tpm: 100000, imageRpm: 120 } }),
        expect: 200,
      });
      await clearRateLimitState();
      await chatCall({});
      const r2 = await chatCall({});
      const err = extractErr(r2);
      if (r2.status !== 429 || err.code !== "rate_limit_exceeded" || !/on user/i.test(err.message)) {
        throw new Error(`expected user dimension limit, got ${r2.status}: ${r2.raw}`);
      }
      await setGlobalDefault("GLOBAL_DEFAULT_USER_RPM", 120);
      return err.message;
    });

    await step("F-RL-08-06-project-settings-immediate", checks, async () => {
      await setGlobalDefault("GLOBAL_DEFAULT_KEY_RPM", 120);
      await setGlobalDefault("GLOBAL_DEFAULT_USER_RPM", 120);
      await api(`/api/keys/${apiKeyId}`, {
        method: "PATCH",
        auth: "user",
        body: JSON.stringify({ rateLimit: 120 }),
        expect: 200,
      });
      await api(`/api/projects/${projectId}`, {
        method: "PATCH",
        auth: "user",
        body: JSON.stringify({ rateLimit: { rpm: 1, tpm: 100000, imageRpm: 120 } }),
        expect: 200,
      });
      await clearRateLimitState();
      await chatCall({});
      const r2 = await chatCall({});
      const err = extractErr(r2);
      if (r2.status !== 429 || err.code !== "rate_limit_exceeded" || !/on project/i.test(err.message)) {
        throw new Error(`expected project dimension limit, got ${r2.status}: ${r2.raw}`);
      }
      return err.message;
    });

    await step("F-RL-08-07-admin-default-immediate", checks, async () => {
      const k2 = await api("/api/keys", {
        method: "POST",
        auth: "user",
        body: JSON.stringify({ name: "rl08-key-global", rateLimit: null }),
      });
      if (k2.status !== 201) throw new Error(`create key2 failed: ${k2.raw}`);
      const key2 = String(k2.body?.key ?? "");
      const key2Id = String(k2.body?.id ?? "");
      if (!key2 || !key2Id) throw new Error("key2 missing");

      await setGlobalDefault("GLOBAL_DEFAULT_KEY_RPM", 1);
      await api(`/api/projects/${projectId}`, {
        method: "PATCH",
        auth: "user",
        body: JSON.stringify({ rateLimit: { rpm: 120, tpm: 100000, imageRpm: 120 } }),
        expect: 200,
      });
      const prevKey = apiKey;
      const prevKeyId = apiKeyId;
      apiKey = key2;
      apiKeyId = key2Id;
      await clearRateLimitState();
      await chatCall({});
      const r2 = await chatCall({});
      const err = extractErr(r2);
      apiKey = prevKey;
      apiKeyId = prevKeyId;
      await setGlobalDefault("GLOBAL_DEFAULT_KEY_RPM", 120);
      if (r2.status !== 429 || err.code !== "rate_limit_exceeded" || !/on key/i.test(err.message)) {
        throw new Error(`expected global key default effective, got ${r2.status}: ${r2.raw}`);
      }
      return err.message;
    });

    await step("F-RL-08-08-systemlog-rate-limit", checks, async () => {
      const logs = await prisma.systemLog.findMany({
        where: {
          category: "RATE_LIMIT",
          createdAt: { gte: logStart },
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      });
      if (logs.length === 0) throw new Error("no RATE_LIMIT system log");
      const scopes = new Set(logs.map((l) => String((l.detail as any)?.scope ?? "")));
      for (const s of ["rpm", "tpm", "burst", "spend"]) {
        if (!scopes.has(s)) throw new Error(`missing scope log: ${s}`);
      }
      return `logs=${logs.length}, scopes=${Array.from(scopes).sort().join(",")}`;
    });

    await step("F-RL-08-09-usage-summary-rate-limited-count", checks, async () => {
      const expected = await prisma.systemLog.count({
        where: {
          category: "RATE_LIMIT",
          createdAt: { gte: logStart },
          detail: { path: ["identifier"], equals: projectId },
        },
      });
      const usage = await callMcpTool("get_usage_summary", { period: "today" });
      const actual = Number(usage?.rateLimitedCount ?? -1);
      if (!Number.isFinite(actual) || actual < 0) throw new Error(`invalid usage summary: ${JSON.stringify(usage)}`);
      if (actual !== expected) throw new Error(`rateLimitedCount mismatch expected=${expected} actual=${actual}`);
      return `rateLimitedCount=${actual}`;
    });

    await step("F-RL-08-10-smoke-ok", checks, async () => {
      await clearRateLimitState();
      const ok = await chatCall({});
      if (ok.status !== 200) throw new Error(`chat smoke failed: ${ok.raw}`);
      return "chat ok under non-limited config";
    });
  } finally {
    await mock.close();
  }

  const failed = checks.filter((c) => !c.ok);
  const report = {
    feature: "F-RL-08",
    batch: "RATE-LIMIT",
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
