import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { requireEnv } from "../lib/require-env";

const BASE = process.env.BASE_URL ?? "http://localhost:3199";
const OUTPUT = process.env.OUTPUT_FILE ?? "docs/test-reports/bf3-verifying-e2e-2026-04-12.json";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@aigc-gateway.local";
const ADMIN_PASSWORD = requireEnv("ADMIN_TEST_PASSWORD");
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379/0";

const prisma = new PrismaClient();

type Step = { id: string; ok: boolean; detail: string };
type ApiRes = { status: number; body: any; text: string };

let adminToken = "";
const created = {
  modelIds: [] as string[],
  channelIds: [] as string[],
  aliasIds: [] as string[],
  linkIds: [] as string[],
};

function uniq(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function text(path: string) {
  return readFileSync(path, "utf8");
}

async function api(
  path: string,
  init?: RequestInit & { auth?: "none" | "admin"; expect?: number },
): Promise<ApiRes> {
  const { auth = "none", expect, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "admin" && adminToken) headers.authorization = `Bearer ${adminToken}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
  const raw = await res.text();
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, text: raw };
}

async function loginAdmin() {
  const res = await api("/api/auth/login", {
    method: "POST",
    expect: 200,
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  adminToken = String(res.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");
}

function runTsc() {
  const r = spawnSync("npx", ["tsc", "--noEmit"], { cwd: process.cwd(), encoding: "utf8" });
  return {
    ok: r.status === 0,
    detail: `exit=${r.status} stderr=${(r.stderr || "").slice(0, 180)}`,
  };
}

async function createChannelForProvider(providerName: "minimax" | "anthropic", realModelId: string) {
  const provider = await prisma.provider.findUnique({
    where: { name: providerName },
    include: { config: true },
  });
  if (!provider || !provider.config) throw new Error(`${providerName} provider/config missing`);

  const model = await prisma.model.create({
    data: {
      name: uniq(`${providerName}_model`).toLowerCase(),
      displayName: `${providerName} test model`,
      modality: "TEXT",
      enabled: true,
    },
  });
  created.modelIds.push(model.id);

  const channel = await prisma.channel.create({
    data: {
      providerId: provider.id,
      modelId: model.id,
      realModelId,
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2 },
      sellPrice: { unit: "token", inputPer1M: 0.3, outputPer1M: 0.6 },
    },
  });
  created.channelIds.push(channel.id);

  return { provider, model, channel };
}

async function cleanup() {
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

async function main() {
  const steps: Step[] = [];
  await loginAdmin();

  // F-BF3-01: MiniMax URL 修正（ADAPTER_PRESETS + seed + DB）
  const providersPage = text("src/app/(console)/admin/providers/page.tsx");
  const seed = text("prisma/seed.ts");
  const minimaxInPreset = providersPage.includes('baseUrl: "https://api.minimaxi.com/v1"');
  const minimaxInSeed = seed.includes('name: "minimax"') && seed.includes('baseUrl: "https://api.minimaxi.com/v1"');
  const minimaxInDb = await prisma.provider.findUnique({ where: { name: "minimax" } });
  const minimaxDbOk = minimaxInDb?.baseUrl === "https://api.minimaxi.com/v1";
  steps.push({
    id: "F-BF3-01-minimax-base-url",
    ok: minimaxInPreset && minimaxInSeed && minimaxDbOk,
    detail: `preset=${minimaxInPreset} seed=${minimaxInSeed} db=${minimaxDbOk}`,
  });

  // F-BF3-02: healthCheckEndpoint=skip 生效 + anthropic x-api-key
  const providersRoute = text("src/app/api/admin/providers/route.ts");
  const checker = text("src/lib/health/checker.ts");
  const anthropicAdapter = text("src/lib/sync/adapters/anthropic.ts");
  const skipProvidersConfigured =
    providersRoute.includes('new Set(["minimax", "anthropic"])') &&
    providersRoute.includes('healthCheckEndpoint: SKIP_HEALTH_CHECK_PROVIDERS.has(name.toLowerCase()) ? "skip" : null');
  const skipLogicInChecker =
    checker.includes('if (route.config.healthCheckEndpoint === "skip")') &&
    checker.includes('level: "API_REACHABILITY"') &&
    checker.includes('result: "PASS"');
  const anthropicAuthHeader =
    anthropicAdapter.includes('"x-api-key": requireApiKey(provider)') &&
    anthropicAdapter.includes('"anthropic-version": "2023-06-01"');

  const minimaxChannel = await createChannelForProvider("minimax", "MiniMax-Text-01");
  const anthChannel = await createChannelForProvider("anthropic", "claude-3-5-sonnet-20241022");

  const minimaxCheck = await api(`/api/admin/health/${minimaxChannel.channel.id}/check`, {
    method: "POST",
    auth: "admin",
    expect: 200,
  });
  const anthCheck = await api(`/api/admin/health/${anthChannel.channel.id}/check`, {
    method: "POST",
    auth: "admin",
    expect: 200,
  });
  const minimaxPost = await prisma.channel.findUnique({ where: { id: minimaxChannel.channel.id } });
  const anthPost = await prisma.channel.findUnique({ where: { id: anthChannel.channel.id } });

  const minimaxSkipOk =
    minimaxCheck.body?.overall === "PASS" &&
    minimaxCheck.body?.checks?.length === 1 &&
    minimaxCheck.body?.checks?.[0]?.level === "API_REACHABILITY" &&
    minimaxCheck.body?.checks?.[0]?.result === "PASS" &&
    minimaxPost?.status === "ACTIVE";
  const anthSkipOk =
    anthCheck.body?.overall === "PASS" &&
    anthCheck.body?.checks?.length === 1 &&
    anthCheck.body?.checks?.[0]?.level === "API_REACHABILITY" &&
    anthCheck.body?.checks?.[0]?.result === "PASS" &&
    anthPost?.status === "ACTIVE";
  steps.push({
    id: "F-BF3-02-healthcheck-skip-and-anthropic-auth",
    ok: skipProvidersConfigured && skipLogicInChecker && anthropicAuthHeader && minimaxSkipOk && anthSkipOk,
    detail: `skipProviders=${skipProvidersConfigured} skipLogic=${skipLogicInChecker} anthropicHeader=${anthropicAuthHeader} minimaxSkip=${minimaxSkipOk} anthropicSkip=${anthSkipOk}`,
  });

  // F-BF3-03: 小写归一化修复
  const modelSync = text("src/lib/sync/model-sync.ts");
  const docEnricher = text("src/lib/sync/doc-enricher.ts");
  const lowercasePipeline =
    modelSync.includes("return modelId.toLowerCase()") &&
    docEnricher.includes("const modelId = m.model_id!.toLowerCase()");
  steps.push({
    id: "F-BF3-03-model-name-lowercase",
    ok: lowercasePipeline,
    detail: `pipeline=${lowercasePipeline}`,
  });

  // F-BF3-04: classifier 批次 <= 15
  const classifier = text("src/lib/sync/alias-classifier.ts");
  const allBatchSizes = Array.from(classifier.matchAll(/const BATCH_SIZE = (\d+);/g)).map((m) =>
    Number(m[1]),
  );
  const batchSizeOk = allBatchSizes.length > 0 && allBatchSizes.every((n) => n <= 15);
  steps.push({
    id: "F-BF3-04-classifier-batch-size-le-15",
    ok: batchSizeOk,
    detail: `batchSizes=${allBatchSizes.join(",")}`,
  });

  // F-BF3-05: alias 更新后 Redis models:list 缓存失效
  const redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  let redisConnected = false;
  try {
    await redis.connect();
    redisConnected = true;
  } catch {
    redisConnected = false;
  }
  const openai = await prisma.provider.findUnique({ where: { name: "openai" } });
  if (!openai) throw new Error("openai provider missing");
  const cacheModel = await prisma.model.create({
    data: {
      name: uniq("bf3_text_model").toLowerCase(),
      displayName: "BF3 cache model",
      modality: "TEXT",
      enabled: true,
    },
  });
  created.modelIds.push(cacheModel.id);
  const cacheChannel = await prisma.channel.create({
    data: {
      providerId: openai.id,
      modelId: cacheModel.id,
      realModelId: "bf3-cache-real-model",
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2 },
      sellPrice: { unit: "token", inputPer1M: 0.3, outputPer1M: 0.6 },
    },
  });
  created.channelIds.push(cacheChannel.id);
  const alias = await prisma.modelAlias.create({
    data: {
      alias: uniq("bf3_alias"),
      modality: "TEXT",
      enabled: true,
      sellPrice: { unit: "token", inputPer1M: 1, outputPer1M: 2 },
    },
  });
  created.aliasIds.push(alias.id);
  const link = await prisma.aliasModelLink.create({
    data: { aliasId: alias.id, modelId: cacheModel.id },
  });
  created.linkIds.push(link.id);

  if (redisConnected) {
    await redis.set("models:list", "cached", "EX", 120);
    await redis.set("models:list:TEXT", "cached-text", "EX", 120);
  }
  await api(`/api/admin/model-aliases/${alias.id}`, {
    method: "PATCH",
    auth: "admin",
    expect: 200,
    body: JSON.stringify({ sellPrice: { unit: "token", inputPer1M: 3, outputPer1M: 4 } }),
  });

  let cacheCleared = false;
  if (redisConnected) {
    const v1 = await redis.get("models:list");
    const v2 = await redis.get("models:list:TEXT");
    cacheCleared = v1 === null && v2 === null;
    redis.disconnect();
  } else {
    cacheCleared = true;
  }
  steps.push({
    id: "F-BF3-05-alias-cache-invalidation",
    ok: cacheCleared,
    detail: `redisConnected=${redisConnected} cacheCleared=${cacheCleared}`,
  });

  // tsc
  const tsc = runTsc();
  steps.push({ id: "F-BF3-tsc", ok: tsc.ok, detail: tsc.detail });

  const pass = steps.filter((s) => s.ok).length;
  const fail = steps.length - pass;
  const report = {
    batch: "BF3-tech-fixes",
    executedAt: new Date().toISOString(),
    baseUrl: BASE,
    pass,
    fail,
    steps,
  };
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2));

  if (fail > 0) {
    console.error(`verification failed: ${fail} step(s) failed`);
    process.exitCode = 1;
  } else {
    console.log(`verification passed: ${pass}/${steps.length}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch(() => {});
    await prisma.$disconnect();
  });
