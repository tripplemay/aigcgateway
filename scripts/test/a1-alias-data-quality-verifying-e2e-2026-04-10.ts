import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { writeFileSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { PrismaClient } from "@prisma/client";

import { classifyNewModels, inferMissingBrands } from "@/lib/sync/alias-classifier";
import { requireEnv } from "../lib/require-env";

const execFileAsync = promisify(execFile);
const prisma = new PrismaClient();

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/a1-alias-data-quality-verifying-2026-04-10.json";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3346");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@aigc-gateway.local";
const ADMIN_PASSWORD = requireEnv("ADMIN_TEST_PASSWORD");

type Step = { id: string; name: string; ok: boolean; detail: string };
type ApiResult = { status: number; body: any; text: string };
type Scenario = "classification" | "brand";

const tag = Date.now().toString(36);
const prefix = `a1-${tag}`;

let adminToken = "";
let currentScenario: Scenario | null = null;
let capturedPrompts: Array<{ scenario: Scenario; prompt: string }> = [];

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function startMockServer() {
  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/chat/completions") {
      const text = await readBody(req);
      const body = JSON.parse(text || "{}");
      const prompt = String(body?.messages?.[0]?.content ?? "");
      if (!currentScenario) return json(res, 500, { error: "scenario_not_set" });
      capturedPrompts.push({ scenario: currentScenario, prompt });

      if (currentScenario === "classification") {
        const response = {
          [`${prefix}/image-new-model-2026`]: {
            new_alias: `${prefix}-image-new`,
            brand: "OpenAI",
            context_window: 111111,
            max_tokens: 2222,
            capabilities: { vision: true, image_input: true, streaming: false, function_calling: false, system_prompt: true, json_mode: false },
          },
          [`${prefix}/text-fallback-model-2026`]: {
            new_alias: `${prefix}-text-fallback`,
            brand: "DeepSeek",
            context_window: 128000,
            max_tokens: 4096,
            capabilities: { streaming: true, function_calling: true, system_prompt: true, json_mode: true, vision: false, image_input: false },
          },
          [`${prefix}/image-mismatch-model-2026`]: {
            existing_alias: `${prefix}-text-existing`,
            brand: "OpenAI",
            context_window: 64000,
            max_tokens: 2048,
            capabilities: { streaming: true, function_calling: true, system_prompt: true, json_mode: true, vision: false, image_input: false },
          },
          [`${prefix}/text-fill-existing-model-2026`]: {
            existing_alias: `${prefix}-fill-existing`,
            brand: "DeepSeek",
            context_window: 333333,
            max_tokens: 7777,
            capabilities: { streaming: true, function_calling: true, system_prompt: true, json_mode: true, vision: false, image_input: false },
          },
        };
        return json(res, 200, {
          id: "chatcmpl-a1-classification",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "deepseek-chat",
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(response) }, finish_reason: "stop" }],
        });
      }

      const brandResponse = {
        [`${prefix}-brand-missing`]: "智谱AI",
      };
      return json(res, 200, {
        id: "chatcmpl-a1-brand",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "deepseek-chat",
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(brandResponse) }, finish_reason: "stop" }],
      });
    }

    await readBody(req);
    return json(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", resolve));
  return server;
}

async function api(path: string, init?: RequestInit & { expect?: number; auth?: "jwt" | "none" }) {
  const { expect, auth = "jwt", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "jwt" && adminToken) headers.authorization = `Bearer ${adminToken}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (typeof expect === "number" && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, text } as ApiResult;
}

async function loginAdmin() {
  const res = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  adminToken = String(res.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");
}

async function patchDeepSeekProviderForMock() {
  const provider = await prisma.provider.findUniqueOrThrow({
    where: { name: "deepseek" },
    select: { id: true, baseUrl: true, authConfig: true, proxyUrl: true },
  });
  await prisma.provider.update({
    where: { id: provider.id },
    data: { baseUrl: MOCK_BASE, authConfig: { apiKey: "mock-deepseek-key" }, proxyUrl: null },
  });
  return provider;
}

async function restoreDeepSeekProvider(state: { id: string; baseUrl: string; authConfig: unknown; proxyUrl: string | null }) {
  await prisma.provider.update({
    where: { id: state.id },
    data: { baseUrl: state.baseUrl, authConfig: state.authConfig as any, proxyUrl: state.proxyUrl },
  });
}

async function resetFixtureTables() {
  await prisma.aliasModelLink.deleteMany({ where: { OR: [{ alias: { alias: { startsWith: prefix } } }, { model: { name: { startsWith: prefix } } }] } });
  await prisma.channel.deleteMany({ where: { model: { name: { startsWith: prefix } } } });
  await prisma.modelAlias.deleteMany({ where: { alias: { startsWith: prefix } } });
  await prisma.model.deleteMany({ where: { name: { startsWith: prefix } } });
}

async function resetAllAliasTables() {
  await prisma.aliasModelLink.deleteMany({});
  await prisma.channel.deleteMany({});
  await prisma.modelAlias.deleteMany({});
  await prisma.model.deleteMany({});
}

async function createModel(data: {
  name: string;
  modality: "TEXT" | "IMAGE";
  contextWindow?: number | null;
  maxTokens?: number | null;
}) {
  return prisma.model.create({
    data: {
      name: data.name,
      displayName: data.name,
      modality: data.modality,
      enabled: false,
      contextWindow: data.contextWindow ?? null,
      maxTokens: data.maxTokens ?? null,
    },
  });
}

async function attachActiveChannel(modelId: string) {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { name: "openai" }, select: { id: true } });
  await prisma.channel.create({
    data: {
      providerId: provider.id,
      modelId,
      realModelId: `${prefix}-raw`,
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2 },
      sellPrice: { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24 },
    },
  });
}

async function runTsxScript(scriptPath: string, args: string[] = []) {
  const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    PORT: process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
  };
  return execFileAsync("npx", ["tsx", scriptPath, ...args], {
    cwd: process.cwd(),
    env,
    maxBuffer: 1024 * 1024,
  });
}

async function run() {
  const steps: Step[] = [];
  const mock = await startMockServer();
  const deepseekState = await patchDeepSeekProviderForMock();

  try {
    const smoke = await api("/v1/models", { auth: "none", expect: 200 });
    steps.push({
      id: "SMOKE-1",
      name: "GET /v1/models returns 200",
      ok: smoke.status === 200,
      detail: `status=${smoke.status}`,
    });

    await loginAdmin();
    steps.push({
      id: "SMOKE-2",
      name: "Admin login returns JWT",
      ok: adminToken.length > 20,
      detail: `token_length=${adminToken.length}`,
    });

    await resetAllAliasTables();

    const imageNew = await createModel({
      name: `${prefix}/image-new-model-2026`,
      modality: "IMAGE",
      contextWindow: 16000,
      maxTokens: 2048,
    });
    const textFallback = await createModel({
      name: `${prefix}/text-fallback-model-2026`,
      modality: "TEXT",
      contextWindow: null,
      maxTokens: null,
    });
    const imageMismatch = await createModel({
      name: `${prefix}/image-mismatch-model-2026`,
      modality: "IMAGE",
      contextWindow: 32000,
      maxTokens: 4096,
    });
    const textFillExisting = await createModel({
      name: `${prefix}/text-fill-existing-model-2026`,
      modality: "TEXT",
      contextWindow: 64000,
      maxTokens: 8192,
    });

    await Promise.all([
      attachActiveChannel(imageNew.id),
      attachActiveChannel(textFallback.id),
      attachActiveChannel(imageMismatch.id),
      attachActiveChannel(textFillExisting.id),
    ]);

    const textExisting = await prisma.modelAlias.create({
      data: {
        alias: `${prefix}-text-existing`,
        brand: "OpenAI",
        modality: "TEXT",
        enabled: true,
      },
    });
    const fillExisting = await prisma.modelAlias.create({
      data: {
        alias: `${prefix}-fill-existing`,
        brand: "DeepSeek",
        modality: "TEXT",
        enabled: true,
        contextWindow: null,
        maxTokens: null,
      },
    });

    currentScenario = "classification";
    const classifyResult = await classifyNewModels();
    currentScenario = null;

    const createdImageAlias = await prisma.modelAlias.findUnique({ where: { alias: `${prefix}-image-new` } });
    const createdTextAlias = await prisma.modelAlias.findUnique({ where: { alias: `${prefix}-text-fallback` } });
    const updatedFillAlias = await prisma.modelAlias.findUnique({ where: { id: fillExisting.id } });
    const mismatchLink = await prisma.aliasModelLink.findFirst({
      where: { aliasId: textExisting.id, modelId: imageMismatch.id },
    });
    const classifyPrompt = capturedPrompts.find((p) => p.scenario === "classification")?.prompt ?? "";

    const classifyOk =
      classifyResult.classified === 3 &&
      classifyResult.newAliases === 2 &&
      classifyResult.skipped >= 1 &&
      createdImageAlias?.modality === "IMAGE" &&
      createdImageAlias?.contextWindow === 16000 &&
      createdImageAlias?.maxTokens === 2048 &&
      createdTextAlias?.contextWindow === 128000 &&
      createdTextAlias?.maxTokens === 4096 &&
      updatedFillAlias?.contextWindow === 64000 &&
      updatedFillAlias?.maxTokens === 8192 &&
      !mismatchLink &&
      classifyPrompt.includes('"OpenAI"') &&
      classifyPrompt.includes('"DeepSeek"') &&
      classifyPrompt.includes("context_window") &&
      classifyPrompt.includes("max_tokens");

    steps.push({
      id: "AC1",
      name: "classifyNewModels 继承 modality/contextWindow/maxTokens，mismatch 跳过",
      ok: classifyOk,
      detail:
        `result=${JSON.stringify(classifyResult)}, image_alias=${JSON.stringify(createdImageAlias)}, ` +
        `text_fallback=${JSON.stringify(createdTextAlias)}, fill_existing=${JSON.stringify(updatedFillAlias)}, ` +
        `mismatch_link=${!!mismatchLink}, prompt_has_brand_anchor=${classifyPrompt.includes('"OpenAI"') && classifyPrompt.includes('"DeepSeek"')}`,
    });

    const brandMissing = await prisma.modelAlias.create({
      data: {
        alias: `${prefix}-brand-missing`,
        brand: null,
        modality: "TEXT",
        enabled: true,
      },
    });
    await prisma.modelAlias.create({
      data: {
        alias: `${prefix}-brand-anchor`,
        brand: "智谱AI",
        modality: "TEXT",
        enabled: true,
      },
    });

    currentScenario = "brand";
    const brandResult = await inferMissingBrands();
    currentScenario = null;

    const updatedBrandAlias = await prisma.modelAlias.findUnique({ where: { id: brandMissing.id } });
    const brandPrompt = capturedPrompts.find((p) => p.scenario === "brand")?.prompt ?? "";
    const brandOk =
      brandResult.updated >= 1 &&
      updatedBrandAlias?.brand === "智谱AI" &&
      brandPrompt.includes("已有品牌列表") &&
      brandPrompt.includes('"智谱AI"');
    steps.push({
      id: "AC2",
      name: "inferMissingBrands 使用已有品牌列表锚定",
      ok: brandOk,
      detail: `result=${JSON.stringify(brandResult)}, updated_brand=${updatedBrandAlias?.brand ?? "null"}, prompt_has_anchor=${brandPrompt.includes('"智谱AI"')}`,
    });

    const dirtyModalityAlias = await prisma.modelAlias.create({
      data: {
        alias: `${prefix}-dirty-modality`,
        brand: "OpenAI",
        modality: "TEXT",
        enabled: true,
      },
    });
    const dirtyImageModel = await createModel({
      name: `${prefix}/dirty-image-model-2026`,
      modality: "IMAGE",
      contextWindow: null,
      maxTokens: null,
    });
    await prisma.aliasModelLink.create({
      data: { aliasId: dirtyModalityAlias.id, modelId: dirtyImageModel.id },
    });

    const beforeDryRunModality = await prisma.modelAlias.findUnique({ where: { id: dirtyModalityAlias.id } });
    const modalityDryRun = await runTsxScript("scripts/fix-alias-modality.ts", ["--dry-run"]);
    const afterDryRunModality = await prisma.modelAlias.findUnique({ where: { id: dirtyModalityAlias.id } });
    const modalityRun = await runTsxScript("scripts/fix-alias-modality.ts");
    const afterRunModality = await prisma.modelAlias.findUnique({ where: { id: dirtyModalityAlias.id } });
    const modalityFixOk =
      beforeDryRunModality?.modality === "TEXT" &&
      afterDryRunModality?.modality === "TEXT" &&
      modalityDryRun.stdout.includes(`${prefix}-dirty-modality: TEXT → IMAGE`) &&
      afterRunModality?.modality === "IMAGE" &&
      modalityRun.stdout.includes("Total: 1 aliases") &&
      modalityRun.stdout.includes("fixed");
    steps.push({
      id: "AC3",
      name: "fix-alias-modality 支持 dry-run，实跑后修正 IMAGE alias",
      ok: modalityFixOk,
      detail: `dry_run=${JSON.stringify(modalityDryRun.stdout.trim())}, final_modality=${afterRunModality?.modality ?? "null"}`,
    });

    const dirtyBrand1 = await prisma.modelAlias.create({
      data: { alias: `${prefix}-brand-zhipu`, brand: "智谱 AI", modality: "TEXT", enabled: true },
    });
    const dirtyBrand2 = await prisma.modelAlias.create({
      data: { alias: `${prefix}-brand-arcee`, brand: "Arcee AI", modality: "TEXT", enabled: true },
    });
    const beforeDryRunBrand = await prisma.modelAlias.findMany({
      where: { id: { in: [dirtyBrand1.id, dirtyBrand2.id] } },
      select: { alias: true, brand: true },
      orderBy: { alias: "asc" },
    });
    const brandDryRun = await runTsxScript("scripts/fix-brand-duplicates.ts", ["--dry-run"]);
    const afterDryRunBrand = await prisma.modelAlias.findMany({
      where: { id: { in: [dirtyBrand1.id, dirtyBrand2.id] } },
      select: { alias: true, brand: true },
      orderBy: { alias: "asc" },
    });
    const brandRun = await runTsxScript("scripts/fix-brand-duplicates.ts");
    const afterRunBrand = await prisma.modelAlias.findMany({
      where: { id: { in: [dirtyBrand1.id, dirtyBrand2.id] } },
      select: { alias: true, brand: true },
      orderBy: { alias: "asc" },
    });
    const brandFixOk =
      beforeDryRunBrand[0]?.brand === "Arcee AI" &&
      beforeDryRunBrand[1]?.brand === "智谱 AI" &&
      afterDryRunBrand[0]?.brand === "Arcee AI" &&
      afterDryRunBrand[1]?.brand === "智谱 AI" &&
      brandDryRun.stdout.includes('"Arcee AI" → "Arcee"') &&
      brandDryRun.stdout.includes('"智谱 AI" → "智谱AI"') &&
      afterRunBrand.some((a) => a.brand === "Arcee") &&
      afterRunBrand.some((a) => a.brand === "智谱AI");
    steps.push({
      id: "AC4",
      name: "fix-brand-duplicates 支持 dry-run，实跑后合并重复品牌变体",
      ok: brandFixOk,
      detail: `dry_run_contains_zhipu=${brandDryRun.stdout.includes('"智谱 AI" → "智谱AI"')}, final=${JSON.stringify(afterRunBrand)}`,
    });

    const aliasesApi = await api("/api/admin/model-aliases", { expect: 200 });
    const apiData = Array.isArray(aliasesApi.body?.data) ? aliasesApi.body.data : [];
    const apiImageAlias = apiData.find((a: any) => a.alias === `${prefix}-image-new`);
    const apiBrandAlias = apiData.find((a: any) => a.alias === `${prefix}-brand-zhipu`);
    const adminApiOk =
      apiImageAlias?.modality === "IMAGE" &&
      apiImageAlias?.contextWindow === 16000 &&
      apiBrandAlias?.brand === "智谱AI";
    steps.push({
      id: "AC5",
      name: "Admin alias API 可观察到修复后的 modality/contextWindow/brand",
      ok: adminApiOk,
      detail: `image_alias=${JSON.stringify(apiImageAlias)}, brand_alias=${JSON.stringify(apiBrandAlias)}`,
    });

    const ok = steps.every((s) => s.ok);
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          ok,
          executedAt: new Date().toISOString(),
          output: OUTPUT,
          steps,
          prompts: capturedPrompts,
        },
        null,
        2,
      ),
    );
    if (!ok) {
      throw new Error(steps.filter((s) => !s.ok).map((s) => `${s.id}: ${s.detail}`).join("\n"));
    }
  } finally {
    await resetFixtureTables().catch(() => {});
    await restoreDeepSeekProvider(deepseekState).catch(() => {});
    await new Promise<void>((resolve, reject) => {
      mock.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    }).catch(() => {});
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        ok: false,
        executedAt: new Date().toISOString(),
        output: OUTPUT,
        error: err instanceof Error ? err.message : String(err),
        prompts: capturedPrompts,
      },
      null,
      2,
    ),
  );
  console.error(err);
  process.exit(1);
});
