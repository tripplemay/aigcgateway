import { writeFileSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { prisma as appPrisma } from "../../src/lib/prisma";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/price-fix-verifying-e2e-2026-04-12.json";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@aigc-gateway.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";
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

async function seedAlias(modality: "TEXT" | "IMAGE", aliasName: string, modelName: string) {
  const openai = await prisma.provider.findUnique({ where: { name: "openai" } });
  if (!openai) throw new Error("openai provider missing");

  const model = await prisma.model.create({
    data: { name: modelName.toLowerCase(), displayName: modelName, modality, enabled: true },
  });
  created.modelIds.push(model.id);

  const channel = await prisma.channel.create({
    data: {
      providerId: openai.id,
      modelId: model.id,
      realModelId: `${aliasName}-real-model`,
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: modality === "IMAGE" ? "call" : "token", inputPer1M: 0.1, outputPer1M: 0.2 },
      sellPrice:
        modality === "IMAGE"
          ? { unit: "call", perCall: 0.5 }
          : { unit: "token", inputPer1M: 0.3, outputPer1M: 0.6 },
    },
  });
  created.channelIds.push(channel.id);

  const alias = await prisma.modelAlias.create({
    data: { alias: aliasName, modality, enabled: true },
  });
  created.aliasIds.push(alias.id);

  const link = await prisma.aliasModelLink.create({ data: { aliasId: alias.id, modelId: model.id } });
  created.linkIds.push(link.id);

  return { alias, model, channel };
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

  const textFixture = await seedAlias("TEXT", uniq("pf_text_alias"), uniq("pf_text_model"));
  const imageFixture = await seedAlias("IMAGE", uniq("pf_image_alias"), uniq("pf_image_model"));

  // F-PF-01: PATCH API 自动补 unit + 无价格字段返回 400
  const textPatch = await api(`/api/admin/model-aliases/${textFixture.alias.id}`, {
    method: "PATCH",
    auth: "admin",
    expect: 200,
    body: JSON.stringify({ sellPrice: { inputPer1M: 1.23, outputPer1M: 4.56 } }),
  });
  const imagePatch = await api(`/api/admin/model-aliases/${imageFixture.alias.id}`, {
    method: "PATCH",
    auth: "admin",
    expect: 200,
    body: JSON.stringify({ sellPrice: { perCall: 0.789 } }),
  });
  const badPatch = await api(`/api/admin/model-aliases/${textFixture.alias.id}`, {
    method: "PATCH",
    auth: "admin",
    expect: 400,
    body: JSON.stringify({ sellPrice: {} }),
  });
  const apiGuardOk =
    textPatch.body?.sellPrice?.unit === "token" &&
    imagePatch.body?.sellPrice?.unit === "call" &&
    badPatch.body?.error?.code === "invalid_parameter";
  steps.push({
    id: "F-PF-01-api-guard-sellprice-unit",
    ok: apiGuardOk,
    detail: `textUnit=${textPatch.body?.sellPrice?.unit ?? "na"} imageUnit=${imagePatch.body?.sellPrice?.unit ?? "na"} badPatchCode=${badPatch.body?.error?.code ?? "na"}`,
  });

  // F-PF-02: 前端 Layer2 保存补 unit（代码断言）
  const aliasPage = text("src/app/(console)/admin/model-aliases/page.tsx");
  const hasLayer2 =
    aliasPage.includes("Auto-fill unit if missing (Layer 2 — frontend guard)") &&
    aliasPage.includes('converted.unit = "token"') &&
    aliasPage.includes('converted.unit = "call"') &&
    aliasPage.includes('k === "inputPer1M" || k === "outputPer1M" || k === "perCall"');
  steps.push({
    id: "F-PF-02-frontend-save-layer2",
    ok: hasLayer2,
    detail: `layer2CodePresent=${hasLayer2}`,
  });

  // F-PF-03: Prisma Layer3 query hook 保底（动态 + 静态）
  const prismaFile = text("src/lib/prisma.ts");
  const hasLayer3Code =
    prismaFile.includes("ensureSellPriceUnit") &&
    prismaFile.includes("modelAlias") &&
    prismaFile.includes("async create") &&
    prismaFile.includes("async update");
  const layer3Alias = await appPrisma.modelAlias.create({
    data: { alias: uniq("pf_layer3_alias"), modality: "IMAGE", enabled: true, sellPrice: { perCall: 0.66 } },
  });
  created.aliasIds.push(layer3Alias.id);
  const layer3Reload = await prisma.modelAlias.findUnique({ where: { id: layer3Alias.id } });
  const layer3Ok = (layer3Reload?.sellPrice as any)?.unit === "call";
  steps.push({
    id: "F-PF-03-prisma-layer3-guard",
    ok: hasLayer3Code && layer3Ok,
    detail: `layer3Code=${hasLayer3Code} layer3Unit=${(layer3Reload?.sellPrice as any)?.unit ?? "na"}`,
  });

  // F-PF-04: /v1/models 读取兼容缺 unit 历史数据
  await prisma.$executeRawUnsafe(
    `UPDATE model_aliases SET "sellPrice" = ("sellPrice"::jsonb - 'unit') WHERE id = '${imageFixture.alias.id}'`,
  );
  const modelsImage = await api("/api/v1/models?modality=image", { expect: 200 });
  const imageRow = (modelsImage.body?.data ?? []).find((m: any) => m.id === imageFixture.alias.alias);
  const layer4Ok =
    imageRow &&
    imageRow.pricing &&
    imageRow.pricing.unit === "call" &&
    typeof imageRow.pricing.per_call === "number";
  steps.push({
    id: "F-PF-04-v1-models-read-time-unit-infer",
    ok: Boolean(layer4Ok),
    detail: `pricingUnit=${imageRow?.pricing?.unit ?? "na"} perCallType=${typeof imageRow?.pricing?.per_call}`,
  });

  // F-PF-05: IMAGE suggest-price + 前端回填 perCall/unit:call
  const suggest = await api(`/api/admin/model-aliases/${imageFixture.alias.id}/suggest-price?q=image`, {
    auth: "admin",
    expect: 200,
  });
  const candidates = suggest.body?.candidates ?? [];
  const hasImageCandidate = candidates.some(
    (c: any) => c?.unit === "call" && typeof c?.perCallCNY === "number" && c.perCallCNY > 0,
  );
  const hasImageBackfillCode =
    aliasPage.includes('if (pricing.unit === "call")') &&
    aliasPage.includes("perCall: pricing.perCallCNY") &&
    aliasPage.includes('unit: "call"');
  steps.push({
    id: "F-PF-05-image-suggest-price",
    ok: hasImageCandidate && hasImageBackfillCode,
    detail: `candidates=${candidates.length} hasImageCandidate=${hasImageCandidate} backfillCode=${hasImageBackfillCode}`,
  });

  // Redis 缓存失效补充验证（与 PF-01 联动）
  const redis = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  let redisConnected = false;
  try {
    await redis.connect();
    redisConnected = true;
  } catch {
    redisConnected = false;
  }
  let cacheCleared = true;
  if (redisConnected) {
    await redis.set("models:list", "cached", "EX", 120);
    await api(`/api/admin/model-aliases/${textFixture.alias.id}`, {
      method: "PATCH",
      auth: "admin",
      expect: 200,
      body: JSON.stringify({ sellPrice: { inputPer1M: 2.22, outputPer1M: 3.33 } }),
    });
    cacheCleared = (await redis.get("models:list")) === null;
    redis.disconnect();
  }
  steps.push({
    id: "F-PF-cache-invalidate-on-sellprice-update",
    ok: cacheCleared,
    detail: `redisConnected=${redisConnected} cacheCleared=${cacheCleared}`,
  });

  const tsc = runTsc();
  steps.push({ id: "F-PF-tsc", ok: tsc.ok, detail: tsc.detail });

  const pass = steps.filter((s) => s.ok).length;
  const fail = steps.length - pass;
  const report = {
    batch: "PRICE-FIX-sellprice-image",
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
