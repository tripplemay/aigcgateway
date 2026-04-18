import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync, writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

import {
import { requireEnv } from "../lib/require-env";
  classifyNewModels,
  inferMissingBrands,
  inferMissingCapabilities,
} from "@/lib/sync/alias-classifier";

const prisma = new PrismaClient();

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/l1-llm-inference-robustness-verifying-2026-04-10.json";
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3344");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@aigc-gateway.local";
const ADMIN_PASSWORD = requireEnv("ADMIN_TEST_PASSWORD");

type Step = { id: string; name: string; ok: boolean; detail: string };
type ApiResult = { status: number; body: any; text: string };
type Action = "ok" | "http500";
type ScenarioKind = "classification" | "brand" | "capabilities";

let adminToken = "";
let activeScenario = "";

const scenarioPlans: Record<string, { kind: ScenarioKind; actions: Action[] }> = {};
const scenarioRequests: Record<string, number> = {};
const requestLog: Array<{ scenario: string; kind: ScenarioKind; action: Action; size: number }> = [];

function nowTag() {
  return Date.now().toString(36);
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function parseList(prompt: string, marker: string): string[] {
  const idx = prompt.indexOf(marker);
  if (idx < 0) return [];
  return prompt
    .slice(idx)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function buildCaps(alias: string) {
  const lower = alias.toLowerCase();
  const vision = /(vision|image|vl|gemini|gpt-4o)/.test(lower);
  return {
    function_calling: true,
    streaming: true,
    vision,
    system_prompt: true,
    json_mode: true,
    image_input: vision,
  };
}

function aliasFromModelName(modelName: string) {
  return modelName
    .replace(/\//g, "-")
    .replace(/-20\d{2}.*/, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .toLowerCase();
}

function setScenario(name: string, kind: ScenarioKind, actions: Action[]) {
  activeScenario = name;
  scenarioPlans[name] = { kind, actions: [...actions] };
  scenarioRequests[name] = 0;
}

function nextAction(kind: ScenarioKind, size: number): Action {
  const plan = scenarioPlans[activeScenario];
  if (!plan || plan.kind !== kind) {
    throw new Error(`scenario mismatch: active=${activeScenario}, expected=${kind}`);
  }
  const action = plan.actions.shift() ?? "ok";
  scenarioRequests[activeScenario] = (scenarioRequests[activeScenario] ?? 0) + 1;
  requestLog.push({ scenario: activeScenario, kind, action, size });
  return action;
}

function buildClassificationResponse(modelNames: string[]) {
  const result: Record<string, { new_alias: string; brand: string; capabilities: ReturnType<typeof buildCaps> }> =
    {};
  for (const modelName of modelNames) {
    const alias = aliasFromModelName(modelName);
    result[modelName] = {
      new_alias: alias,
      brand: "DeepSeek",
      capabilities: buildCaps(alias),
    };
  }
  return result;
}

function buildBrandResponse(aliases: string[]) {
  return Object.fromEntries(aliases.map((alias) => [alias, "DeepSeek"]));
}

function buildCapabilitiesResponse(aliases: string[]) {
  return Object.fromEntries(aliases.map((alias) => [alias, buildCaps(alias)]));
}

async function startMockServer() {
  const server = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/chat/completions") {
      const bodyText = await readBody(req);
      const body = JSON.parse(bodyText || "{}");
      const prompt = String(body?.messages?.[0]?.content ?? "");

      if (prompt.includes("## 待分类的新模型 ID")) {
        const modelNames = parseList(prompt, "## 待分类的新模型 ID");
        const action = nextAction("classification", modelNames.length);
        if (action === "http500") return json(res, 500, { error: "mock_classification_failure" });
        return json(res, 200, {
          id: "chatcmpl-l1-classification",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "deepseek-chat",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: JSON.stringify(buildClassificationResponse(modelNames)) },
              finish_reason: "stop",
            },
          ],
        });
      }

      if (prompt.includes("请判断每个模型属于哪个厂商")) {
        const aliases = parseList(prompt, "别名列表：");
        const action = nextAction("brand", aliases.length);
        if (action === "http500") return json(res, 500, { error: "mock_brand_failure" });
        return json(res, 200, {
          id: "chatcmpl-l1-brand",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "deepseek-chat",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: JSON.stringify(buildBrandResponse(aliases)) },
              finish_reason: "stop",
            },
          ],
        });
      }

      if (prompt.includes("请推断每个模型的能力")) {
        const aliases = parseList(prompt, "别名列表：");
        const action = nextAction("capabilities", aliases.length);
        if (action === "http500") return json(res, 500, { error: "mock_caps_failure" });
        return json(res, 200, {
          id: "chatcmpl-l1-capabilities",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "deepseek-chat",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: JSON.stringify(buildCapabilitiesResponse(aliases)) },
              finish_reason: "stop",
            },
          ],
        });
      }

      return json(res, 404, { error: "not_found" });
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

  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
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
  const providers = await api("/api/admin/providers", { expect: 200 });
  const list = Array.isArray(providers.body?.data) ? providers.body.data : [];
  const deepseek = list.find((p: any) => p?.name === "deepseek");
  if (!deepseek?.id) throw new Error("deepseek provider not found");

  await api(`/api/admin/providers/${deepseek.id}`, {
    method: "PATCH",
    expect: 200,
    body: JSON.stringify({
      status: "ACTIVE",
      baseUrl: MOCK_BASE,
      apiKey: "mock-deepseek-key",
      proxyUrl: null,
    }),
  });

  return String(deepseek.id);
}

async function cleanupPrefix(prefix: string) {
  const aliases = await prisma.modelAlias.findMany({
    where: { alias: { startsWith: prefix } },
    select: { id: true },
  });
  const models = await prisma.model.findMany({
    where: { name: { startsWith: prefix } },
    select: { id: true },
  });

  const aliasIds = aliases.map((a) => a.id);
  const modelIds = models.map((m) => m.id);

  if (aliasIds.length > 0) {
    await prisma.aliasModelLink.deleteMany({ where: { aliasId: { in: aliasIds } } });
    await prisma.modelAlias.deleteMany({ where: { id: { in: aliasIds } } });
  }
  if (modelIds.length > 0) {
    await prisma.aliasModelLink.deleteMany({ where: { modelId: { in: modelIds } } });
    await prisma.channel.deleteMany({ where: { modelId: { in: modelIds } } });
    await prisma.model.deleteMany({ where: { id: { in: modelIds } } });
  }
}

async function resetSyncTables() {
  await prisma.aliasModelLink.deleteMany({});
  await prisma.channel.deleteMany({});
  await prisma.modelAlias.deleteMany({});
  await prisma.model.deleteMany({});
}

async function createBrandAliases(prefix: string, count: number) {
  for (let i = 0; i < count; i++) {
    await prisma.modelAlias.create({
      data: {
        alias: `${prefix}-alias-${String(i).padStart(3, "0")}`,
        brand: null,
        modality: "TEXT",
        enabled: false,
      },
    });
  }
}

async function createCapabilitiesAliases(prefix: string, count: number) {
  for (let i = 0; i < count; i++) {
    await prisma.modelAlias.create({
      data: {
        alias: `${prefix}-alias-${String(i).padStart(3, "0")}`,
        brand: "SeedBrand",
        modality: "TEXT",
        enabled: false,
        capabilities: null,
      },
    });
  }
}

async function createUnlinkedModels(prefix: string, count: number, providerId: string) {
  for (let i = 0; i < count; i++) {
    const name = `${prefix}/model-${String(i).padStart(3, "0")}-2026`;
    const model = await prisma.model.create({
      data: {
        name,
        displayName: name,
        modality: "TEXT",
        enabled: false,
      },
    });
    await prisma.channel.create({
      data: {
        providerId,
        modelId: model.id,
        realModelId: name,
        priority: 1,
        status: "ACTIVE",
        costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2 },
        sellPrice: { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24 },
      },
    });
  }
}

async function countClassified(prefix: string) {
  return prisma.aliasModelLink.count({
    where: {
      model: { name: { startsWith: prefix } },
    },
  });
}

async function countBrandsFilled(prefix: string) {
  return prisma.modelAlias.count({
    where: {
      alias: { startsWith: prefix },
      NOT: { brand: null },
    },
  });
}

async function countCapsFilled(prefix: string) {
  const aliases = await prisma.modelAlias.findMany({
    where: { alias: { startsWith: prefix } },
    select: { capabilities: true },
  });
  return aliases.filter((a) => a.capabilities && Object.keys(a.capabilities as object).length > 0).length;
}

function staticAudit() {
  const source = readFileSync("src/lib/sync/model-sync.ts", "utf8");
  return (
    source.includes("const classifyResult = await classifyNewModels();") &&
    source.includes("const brandResult = await inferMissingBrands();") &&
    source.includes("const capsResult = await inferMissingCapabilities();")
  );
}

async function run() {
  const tag = nowTag();
  const steps: Step[] = [];
  const mock = await startMockServer();

  try {
    const smokeModels = await api("/v1/models", { expect: 200, auth: "none" });
    steps.push({
      id: "SMOKE-1",
      name: "GET /v1/models returns 200",
      ok: smokeModels.status === 200,
      detail: `status=${smokeModels.status}`,
    });

    await loginAdmin();
    steps.push({
      id: "SMOKE-2",
      name: "Admin login returns JWT",
      ok: adminToken.length > 20,
      detail: `token_length=${adminToken.length}`,
    });

    const deepseekProviderId = await patchDeepSeekProviderForMock();
    steps.push({
      id: "SMOKE-3",
      name: "DeepSeek provider patched to local mock",
      ok: !!deepseekProviderId,
      detail: `provider_id=${deepseekProviderId}, mock_base=${MOCK_BASE}`,
    });

    await resetSyncTables();
    steps.push({
      id: "SMOKE-4",
      name: "Model/Alias tables reset for isolated L1 fixtures",
      ok: true,
      detail: "deleted existing Model/Channel/ModelAlias/AliasModelLink rows",
    });

    const classifyPrefix = `${tag}-classify`;
    await cleanupPrefix(classifyPrefix);
    await createUnlinkedModels(classifyPrefix, 65, deepseekProviderId);

    setScenario("classification-first", "classification", ["ok", "http500", "http500", "http500", "ok"]);
    const classifyFirst = await classifyNewModels();
    const classifyPersistedAfterFirst = await countClassified(classifyPrefix);

    setScenario("classification-second", "classification", ["ok"]);
    const classifySecond = await classifyNewModels();
    const classifyPersistedFinal = await countClassified(classifyPrefix);

    const classifyOk =
      classifyFirst.classified === 35 &&
      classifyFirst.skipped === 30 &&
      classifyPersistedAfterFirst === 35 &&
      classifySecond.classified === 30 &&
      classifySecond.skipped === 0 &&
      classifyPersistedFinal === 65;
    steps.push({
      id: "AC1",
      name: "classifyNewModels 跳过失败批次并在下次执行补处理",
      ok: classifyOk,
      detail:
        `first=${JSON.stringify(classifyFirst)}, after_first=${classifyPersistedAfterFirst}, ` +
        `second=${JSON.stringify(classifySecond)}, final=${classifyPersistedFinal}`,
    });

    const brandPrefix = `${tag}-brand`;
    await cleanupPrefix(brandPrefix);
    await createBrandAliases(brandPrefix, 65);

    setScenario("brand-first", "brand", ["ok", "http500", "http500", "http500", "ok"]);
    const brandFirst = await inferMissingBrands();
    const brandPersistedAfterFirst = await countBrandsFilled(brandPrefix);

    setScenario("brand-second", "brand", ["ok"]);
    const brandSecond = await inferMissingBrands();
    const brandPersistedFinal = await countBrandsFilled(brandPrefix);

    const brandOk =
      brandFirst.updated === 35 &&
      brandFirst.skipped === 30 &&
      brandPersistedAfterFirst === 35 &&
      brandSecond.updated === 30 &&
      brandSecond.skipped === 0 &&
      brandPersistedFinal === 65;
    steps.push({
      id: "AC2",
      name: "inferMissingBrands 跳过失败批次并在下次执行补处理",
      ok: brandOk,
      detail:
        `first=${JSON.stringify(brandFirst)}, after_first=${brandPersistedAfterFirst}, ` +
        `second=${JSON.stringify(brandSecond)}, final=${brandPersistedFinal}`,
    });

    await resetSyncTables();

    const capsBulkPrefix = `${tag}-caps-bulk`;
    await cleanupPrefix(capsBulkPrefix);
    await createCapabilitiesAliases(capsBulkPrefix, 105);

    const capsBulkStart = Date.now();
    setScenario("caps-bulk", "capabilities", ["ok", "ok", "ok", "ok"]);
    const capsBulk = await inferMissingCapabilities();
    const capsBulkFilled = await countCapsFilled(capsBulkPrefix);
    const capsBulkDurationMs = Date.now() - capsBulkStart;
    const capsBulkRequests = requestLog.filter((r) => r.scenario === "caps-bulk").map((r) => r.size);

    const capsBulkOk =
      capsBulk.updated === 105 &&
      capsBulk.skipped === 0 &&
      capsBulk.errors.length === 0 &&
      capsBulkFilled === 105 &&
      JSON.stringify(capsBulkRequests) === JSON.stringify([30, 30, 30, 15]) &&
      capsBulkDurationMs < 60_000;
    steps.push({
      id: "AC3",
      name: "inferMissingCapabilities 对 100+ alias 按批完成且无超时",
      ok: capsBulkOk,
      detail:
        `result=${JSON.stringify(capsBulk)}, filled=${capsBulkFilled}, ` +
        `requests=${JSON.stringify(capsBulkRequests)}, duration_ms=${capsBulkDurationMs}`,
    });

    await resetSyncTables();

    const capsResumePrefix = `${tag}-caps-resume`;
    await cleanupPrefix(capsResumePrefix);
    await createCapabilitiesAliases(capsResumePrefix, 65);

    setScenario("caps-first", "capabilities", ["ok", "http500", "http500", "http500", "ok"]);
    const capsFirst = await inferMissingCapabilities();
    const capsAfterFirst = await countCapsFilled(capsResumePrefix);

    setScenario("caps-second", "capabilities", ["ok"]);
    const capsSecond = await inferMissingCapabilities();
    const capsFinal = await countCapsFilled(capsResumePrefix);

    const capsResumeOk =
      capsFirst.updated === 35 &&
      capsFirst.skipped === 30 &&
      capsAfterFirst === 35 &&
      capsSecond.updated === 30 &&
      capsSecond.skipped === 0 &&
      capsFinal === 65;
    steps.push({
      id: "AC4",
      name: "inferMissingCapabilities 每批成功立即持久化，失败批次可在下次补处理",
      ok: capsResumeOk,
      detail:
        `first=${JSON.stringify(capsFirst)}, after_first=${capsAfterFirst}, ` +
        `second=${JSON.stringify(capsSecond)}, final=${capsFinal}`,
    });

    const syncAuditOk = staticAudit();
    steps.push({
      id: "AC5",
      name: "model-sync 每轮都会重新调用三条推断链路",
      ok: syncAuditOk,
      detail: syncAuditOk ? "classify/brand/caps reinvoked after each sync" : "call site missing",
    });

    const ok = steps.every((step) => step.ok);
    const report = {
      ok,
      executedAt: new Date().toISOString(),
      output: OUTPUT,
      steps,
      requestLog,
    };

    writeFileSync(OUTPUT, JSON.stringify(report, null, 2));

    if (!ok) {
      const failed = steps.filter((step) => !step.ok).map((step) => `${step.id}: ${step.detail}`);
      throw new Error(failed.join("\n"));
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      mock.close((closeErr) => {
        if (closeErr) reject(closeErr);
        else resolve();
      });
    });
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  const failure = {
    ok: false,
    executedAt: new Date().toISOString(),
    output: OUTPUT,
    error: err instanceof Error ? err.message : String(err),
    requestLog,
  };
  writeFileSync(OUTPUT, JSON.stringify(failure, null, 2));
  console.error(err);
  process.exit(1);
});
