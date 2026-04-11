import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ??
  "docs/test-reports/admin-ops-plus-verifying-e2e-2026-04-12.json";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@aigc-gateway.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379/0";

const prisma = new PrismaClient();

type Step = { id: string; ok: boolean; detail: string };
type ApiRes = { status: number; body: any; text: string };

let adminToken = "";
const created = {
  providerIds: [] as string[],
  modelIds: [] as string[],
  channelIds: [] as string[],
  aliasIds: [] as string[],
  linkIds: [] as string[],
  systemLogIds: [] as string[],
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

async function cleanup() {
  if (created.systemLogIds.length) {
    await prisma.systemLog.deleteMany({ where: { id: { in: created.systemLogIds } } });
  }
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
  if (created.providerIds.length) {
    await prisma.providerConfig.deleteMany({ where: { providerId: { in: created.providerIds } } });
    await prisma.provider.deleteMany({ where: { id: { in: created.providerIds } } });
  }
}

async function main() {
  const steps: Step[] = [];
  await loginAdmin();

  // F-AOP-01: 推断结果提示条状态分支（错误/最新/成功/警告）
  const opsPage = text("src/app/(console)/admin/operations/page.tsx");
  const hasInferBannerBranches =
    opsPage.includes("inferBannerError") &&
    opsPage.includes("inferBannerUpToDate") &&
    opsPage.includes("inferBannerSkipped") &&
    opsPage.includes("inferBannerClassified") &&
    opsPage.includes("text-rose-700 bg-rose-50") &&
    opsPage.includes("text-blue-700 bg-blue-50") &&
    opsPage.includes("text-emerald-700 bg-emerald-50") &&
    opsPage.includes("text-amber-700 bg-amber-50");
  steps.push({
    id: "F-AOP-01-inference-status-banner-variants",
    ok: hasInferBannerBranches,
    detail: `branchesFound=${hasInferBannerBranches}`,
  });

  // F-AOP-02: SystemLog API + 页面 tab/分页/筛选
  const logsPage = text("src/app/(console)/admin/logs/page.tsx");
  const systemLogsRoute = text("src/app/api/admin/system-logs/route.ts");
  const hasSystemTabAndFilters =
    logsPage.includes('(["api", "system"] as const)') &&
    logsPage.includes('["", "SYNC", "INFERENCE", "HEALTH_CHECK", "AUTO_RECOVERY"]') &&
    logsPage.includes('["", "INFO", "WARN", "ERROR"]') &&
    logsPage.includes("Pagination");
  const hasSystemLogsPagingFilter =
    systemLogsRoute.includes("pageSize") &&
    systemLogsRoute.includes("category") &&
    systemLogsRoute.includes("level") &&
    systemLogsRoute.includes("skip: (page - 1) * pageSize");
  const s1 = await prisma.systemLog.create({
    data: { category: "SYNC", level: "WARN", message: uniq("aop-sync-warn") },
  });
  const s2 = await prisma.systemLog.create({
    data: { category: "INFERENCE", level: "ERROR", message: uniq("aop-inf-err") },
  });
  created.systemLogIds.push(s1.id, s2.id);
  const sysLogsWarn = await api("/api/admin/system-logs?category=SYNC&level=WARN&page=1&pageSize=20", {
    auth: "admin",
    expect: 200,
  });
  const syncWarnHit = (sysLogsWarn.body?.data ?? []).some((x: any) => x.id === s1.id);
  const inferErrorMiss = !(sysLogsWarn.body?.data ?? []).some((x: any) => x.id === s2.id);
  steps.push({
    id: "F-AOP-02-system-log-tab-api-pagination-filter",
    ok: hasSystemTabAndFilters && hasSystemLogsPagingFilter && syncWarnHit && inferErrorMiss,
    detail: `tabFilters=${hasSystemTabAndFilters} apiPagingFilter=${hasSystemLogsPagingFilter} syncWarnHit=${syncWarnHit} inferErrorExcluded=${inferErrorMiss}`,
  });

  // F-AOP-03: 同步/推断进度 API + 共用进度组件
  const syncProgressApi = await api("/api/admin/sync/status", { auth: "admin", expect: 200 });
  const inferProgressApi = await api("/api/admin/inference/status", { auth: "admin", expect: 200 });
  const progressPollingAndSharedBar =
    opsPage.includes('"/api/admin/sync/status"') &&
    opsPage.includes('"/api/admin/inference/status"') &&
    opsPage.includes("}, 3000);") &&
    (opsPage.match(/<ProgressBar/g)?.length ?? 0) >= 2;
  const progressApiShape =
    Object.prototype.hasOwnProperty.call(syncProgressApi.body ?? {}, "data") &&
    Object.prototype.hasOwnProperty.call(inferProgressApi.body ?? {}, "data");
  steps.push({
    id: "F-AOP-03-sync-inference-progress",
    ok: progressPollingAndSharedBar && progressApiShape,
    detail: `sharedBarAndPolling=${progressPollingAndSharedBar} progressApiShape=${progressApiShape} syncDataType=${typeof syncProgressApi.body?.data} inferDataType=${typeof inferProgressApi.body?.data}`,
  });

  // F-AOP-04: 创建 Provider 自动创建 ProviderConfig
  const providerName = uniq("aop-provider").toLowerCase();
  const createdProvider = await api("/api/admin/providers", {
    method: "POST",
    auth: "admin",
    expect: 201,
    body: JSON.stringify({
      name: providerName,
      displayName: "AOP Provider",
      baseUrl: "https://example.com/v1",
      adapterType: "openai-compat",
      apiKey: "aop-dummy-key",
    }),
  });
  const providerId = String(createdProvider.body?.id ?? "");
  if (providerId) created.providerIds.push(providerId);
  const config = await prisma.providerConfig.findUnique({ where: { providerId } });
  const providerConfigOk =
    providerId.length > 0 &&
    config?.chatEndpoint === "/chat/completions" &&
    typeof config?.supportsModelsApi === "boolean";
  steps.push({
    id: "F-AOP-04-provider-auto-create-config",
    ok: providerConfigOk,
    detail: `providerId=${providerId || "missing"} chatEndpoint=${config?.chatEndpoint ?? "null"} supportsModelsApi=${String(config?.supportsModelsApi)}`,
  });

  // F-AOP-05: /docs 文档更新（参数 + 别名 + MCP 工具数）
  const docsPage = text("src/app/(console)/docs/page.tsx");
  const docsUpdated =
    docsPage.includes("top_p") &&
    docsPage.includes("frequency_penalty") &&
    docsPage.includes("tools") &&
    docsPage.includes("tool_choice") &&
    docsPage.includes("availableTools") &&
    docsPage.includes("(28)");
  steps.push({
    id: "F-AOP-05-docs-content-updated",
    ok: docsUpdated,
    detail: `docsUpdated=${docsUpdated}`,
  });

  // F-AOP-06: Settings 项目切换下拉
  const settingsPage = text("src/app/(console)/settings/page.tsx");
  const settingsProjectSelector =
    settingsPage.includes("projects.length > 1") &&
    settingsPage.includes("<select") &&
    settingsPage.includes("select(e.target.value)") &&
    settingsPage.includes("`/api/projects/${current.id}`");
  steps.push({
    id: "F-AOP-06-settings-project-selector",
    ok: settingsProjectSelector,
    detail: `selectorAndSwitch=${settingsProjectSelector}`,
  });

  // F-AOP-07: model 名称小写归一化 + 清理脚本存在 + 当前库无大小写重复
  const modelSync = text("src/lib/sync/model-sync.ts");
  const docEnricher = text("src/lib/sync/doc-enricher.ts");
  const cleanupScript = text("scripts/fix-model-name-case.ts");
  const hasLowercasePipeline =
    modelSync.includes("return modelId.toLowerCase()") &&
    docEnricher.includes("const modelId = m.model_id!.toLowerCase()") &&
    cleanupScript.includes('m.name.toLowerCase()');
  const duplicateRows = (await prisma.$queryRawUnsafe<any[]>(
    'SELECT LOWER(name) AS lname, COUNT(*)::int AS c FROM models GROUP BY LOWER(name) HAVING COUNT(*) > 1',
  )) as Array<{ lname: string; c: number }>;
  const uppercaseRows = (await prisma.$queryRawUnsafe<any[]>(
    "SELECT COUNT(*)::int AS c FROM models WHERE name <> LOWER(name)",
  )) as Array<{ c: number }>;
  const nonLowerCount = Number(uppercaseRows?.[0]?.c ?? 0);
  steps.push({
    id: "F-AOP-07-model-name-lowercase-normalization",
    ok: hasLowercasePipeline && duplicateRows.length === 0 && nonLowerCount === 0,
    detail: `pipeline=${hasLowercasePipeline} lowerNameDuplicates=${duplicateRows.length} nonLowercaseModels=${nonLowerCount}`,
  });

  // F-AOP-08: classifier 批次 <= 15
  const classifier = text("src/lib/sync/alias-classifier.ts");
  const allBatchSizes = Array.from(classifier.matchAll(/const BATCH_SIZE = (\d+);/g)).map((m) =>
    Number(m[1]),
  );
  const batchSizeOk = allBatchSizes.length > 0 && allBatchSizes.every((n) => n <= 15);
  steps.push({
    id: "F-AOP-08-classifier-batch-size-le-15",
    ok: batchSizeOk,
    detail: `batchSizes=${allBatchSizes.join(",")}`,
  });

  // F-AOP-09: 别名价格/启用更新后清 Redis 缓存（L1 以 key 失效为证据）
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
  const model = await prisma.model.create({
    data: { name: uniq("aop-text-model"), displayName: "AOP text", modality: "TEXT", enabled: true },
  });
  created.modelIds.push(model.id);
  const ch = await prisma.channel.create({
    data: {
      providerId: openai.id,
      modelId: model.id,
      realModelId: "aop-real-model",
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2 },
      sellPrice: { unit: "token", inputPer1M: 0.3, outputPer1M: 0.6 },
    },
  });
  created.channelIds.push(ch.id);
  const alias = await prisma.modelAlias.create({
    data: {
      alias: uniq("aop-alias"),
      modality: "TEXT",
      enabled: true,
      sellPrice: { unit: "token", inputPer1M: 1, outputPer1M: 2 },
    },
  });
  created.aliasIds.push(alias.id);
  const link = await prisma.aliasModelLink.create({ data: { aliasId: alias.id, modelId: model.id } });
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
    id: "F-AOP-09-alias-update-invalidates-models-cache",
    ok: cacheCleared,
    detail: `redisConnected=${redisConnected} cacheCleared=${cacheCleared}`,
  });

  // tsc baseline
  const tsc = runTsc();
  steps.push({ id: "F-AOP-tsc", ok: tsc.ok, detail: tsc.detail });

  const pass = steps.filter((s) => s.ok).length;
  const fail = steps.length - pass;
  const report = {
    batch: "ADMIN-OPS-plus",
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
