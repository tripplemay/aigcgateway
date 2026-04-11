import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/admin-ux-health-v2-verifying-e2e-2026-04-11.json";

const prisma = new PrismaClient();

type Step = { id: string; ok: boolean; detail: string };
type ApiRes = { status: number; body: any; text: string };

let adminToken = "";

const created = {
  aliases: [] as string[],
  models: [] as string[],
  channels: [] as string[],
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
  if (auth === "admin" && adminToken) {
    headers.authorization = `Bearer ${adminToken}`;
  }

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
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: "admin123" }),
  });
  adminToken = String(res.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");
}

function runTsc() {
  const r = spawnSync("npx", ["tsc", "--noEmit"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return {
    ok: r.status === 0,
    detail: `exit=${r.status} stderr=${(r.stderr || "").slice(0, 200)}`,
  };
}

async function seedFixtures() {
  const provider = await prisma.provider.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!provider) throw new Error("no active provider found");

  const modelA = await prisma.model.create({
    data: {
      name: uniq("aux-text-a"),
      displayName: "AUX Text A",
      modality: "TEXT",
      enabled: false,
    },
  });
  const modelB = await prisma.model.create({
    data: {
      name: uniq("aux-text-b"),
      displayName: "AUX Text B",
      modality: "TEXT",
      enabled: false,
    },
  });
  const modelC = await prisma.model.create({
    data: {
      name: uniq("aux-text-c"),
      displayName: "AUX Text C",
      modality: "TEXT",
      enabled: false,
    },
  });
  const modelImg = await prisma.model.create({
    data: {
      name: uniq("aux-image"),
      displayName: "AUX Image",
      modality: "IMAGE",
      enabled: false,
    },
  });
  created.models.push(modelA.id, modelB.id, modelC.id, modelImg.id);

  const channelA = await prisma.channel.create({
    data: {
      providerId: provider.id,
      modelId: modelA.id,
      realModelId: "aux-real-a",
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2 },
      sellPrice: { unit: "token", inputPer1M: 0.2, outputPer1M: 0.4 },
    },
  });
  const channelB = await prisma.channel.create({
    data: {
      providerId: provider.id,
      modelId: modelB.id,
      realModelId: "aux-real-b",
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.3, outputPer1M: 0.6 },
      sellPrice: { unit: "token", inputPer1M: 0.6, outputPer1M: 1.2 },
    },
  });
  const channelC = await prisma.channel.create({
    data: {
      providerId: provider.id,
      modelId: modelC.id,
      realModelId: "aux-real-c",
      priority: 2,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.5, outputPer1M: 1.0 },
      sellPrice: { unit: "token", inputPer1M: 1.0, outputPer1M: 2.0 },
    },
  });
  const channelImg = await prisma.channel.create({
    data: {
      providerId: provider.id,
      modelId: modelImg.id,
      realModelId: "aux-real-image",
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "call", perCall: 0.02 },
      sellPrice: { unit: "call", perCall: 0.04 },
    },
  });
  created.channels.push(channelA.id, channelB.id, channelC.id, channelImg.id);

  const aliasSingle = await prisma.modelAlias.create({
    data: {
      alias: uniq("aux-alias-single"),
      brand: "AUX",
      modality: "TEXT",
      enabled: true,
      openRouterModelId: "openai/gpt-4o-mini",
      sellPrice: { unit: "token", inputPer1M: 1.1, outputPer1M: 2.2 },
      models: { create: [{ modelId: modelA.id }] },
    },
  });
  const aliasReorder = await prisma.modelAlias.create({
    data: {
      alias: uniq("aux-alias-reorder"),
      brand: "AUX",
      modality: "TEXT",
      enabled: true,
      models: { create: [{ modelId: modelB.id }, { modelId: modelC.id }] },
    },
  });
  created.aliases.push(aliasSingle.id, aliasReorder.id);

  // Build deterministic grouped failures: two FAILs in one batch(second), then one PASS in previous batch.
  const t0 = new Date(Math.floor(Date.now() / 1000) * 1000);
  const t1 = new Date(t0.getTime() - 1000);
  await prisma.healthCheck.createMany({
    data: [
      {
        channelId: channelA.id,
        level: "CONNECTIVITY",
        result: "FAIL",
        latencyMs: 100,
        errorMessage: "fail-1",
        responseBody: null,
        createdAt: new Date(t0.getTime() + 100),
      },
      {
        channelId: channelA.id,
        level: "FORMAT",
        result: "FAIL",
        latencyMs: 100,
        errorMessage: "fail-2",
        responseBody: null,
        createdAt: new Date(t0.getTime() + 200),
      },
      {
        channelId: channelA.id,
        level: "CONNECTIVITY",
        result: "PASS",
        latencyMs: 90,
        errorMessage: null,
        responseBody: null,
        createdAt: t1,
      },
    ],
  });

  return {
    provider,
    aliasSingle,
    aliasReorder,
    channelA,
    channelB,
    channelC,
    channelImg,
  };
}

async function cleanupFixtures() {
  if (created.aliases.length > 0) {
    await prisma.aliasModelLink.deleteMany({ where: { aliasId: { in: created.aliases } } });
    await prisma.modelAlias.deleteMany({ where: { id: { in: created.aliases } } });
  }
  if (created.channels.length > 0) {
    await prisma.healthCheck.deleteMany({ where: { channelId: { in: created.channels } } });
    await prisma.channel.deleteMany({ where: { id: { in: created.channels } } });
  }
  if (created.models.length > 0) {
    await prisma.model.deleteMany({ where: { id: { in: created.models } } });
  }
}

async function main() {
  const steps: Step[] = [];
  await loginAdmin();
  const fixture = await seedFixtures();

  // F-AUX-01: alias title bar market price + openRouterModelId
  const aliasPage = text("src/app/(console)/admin/model-aliases/page.tsx");
  const hasLinkedCount = aliasPage.includes("linkedModelCount");
  const hasMarketPriceExpr = /openRouterModelId && orPrices\[alias\.openRouterModelId\]/.test(aliasPage);
  const aliasesRes = await api("/api/admin/model-aliases", { auth: "admin", expect: 200 });
  const targetAlias = (aliasesRes.body?.data ?? []).find((a: any) => a.id === fixture.aliasSingle.id);
  const openRouterMapped = targetAlias?.openRouterModelId === "openai/gpt-4o-mini";
  steps.push({
    id: "F-AUX-01-alias-market-price",
    ok: hasLinkedCount && hasMarketPriceExpr && openRouterMapped,
    detail: `linkedCount=${hasLinkedCount} marketExpr=${hasMarketPriceExpr} aliasFound=${Boolean(
      targetAlias,
    )} apiOpenRouterModelId=${openRouterMapped} value=${String(targetAlias?.openRouterModelId ?? "null")}`,
  });

  // F-AUX-02: channel list cost price visible in aliases
  const hasChannelTable = aliasPage.includes("<ChannelTable");
  const passesCostPrice = /costPrice:\s*ch\.costPrice/.test(aliasPage);
  const aliasApiHasCost = Array.isArray(targetAlias?.linkedModels)
    ? targetAlias.linkedModels.some((m: any) =>
        (m.channels ?? []).some((ch: any) => ch.costPrice && typeof ch.costPrice === "object"),
      )
    : false;
  steps.push({
    id: "F-AUX-02-channel-cost-price",
    ok: hasChannelTable && passesCostPrice && aliasApiHasCost,
    detail: `channelTable=${hasChannelTable} passCostPrice=${passesCostPrice} apiCostPrice=${aliasApiHasCost} linkedModels=${targetAlias?.linkedModels?.length ?? 0}`,
  });

  // F-AUX-03: admin/models readonly and no sell-price editing
  const modelsPage = text("src/app/(console)/admin/models/page.tsx");
  const usesReadonlyMode = /mode="readonly"/.test(modelsPage);
  const noEditState = !/editingSellPrice|saveSellPrice|setEditingSellPrice/.test(modelsPage);
  const noSellPriceField = !/sellPrice/.test(modelsPage);
  steps.push({
    id: "F-AUX-03-models-readonly",
    ok: usesReadonlyMode && noEditState && noSellPriceField,
    detail: `readonly=${usesReadonlyMode} noEditState=${noEditState} noSellPriceField=${noSellPriceField}`,
  });

  // F-AUX-04: shared ChannelTable component used in both pages
  const channelTable = text("src/components/admin/channel-table.tsx");
  const aliasUsesShared = aliasPage.includes('from "@/components/admin/channel-table"');
  const modelsUsesShared = modelsPage.includes('from "@/components/admin/channel-table"');
  const hasTwoModes = /mode:\s*"readonly"\s*\|\s*"editable"/.test(channelTable);
  steps.push({
    id: "F-AUX-04-shared-channel-table",
    ok: aliasUsesShared && modelsUsesShared && hasTwoModes,
    detail: `aliasShared=${aliasUsesShared} modelsShared=${modelsUsesShared} modeUnion=${hasTwoModes}`,
  });

  // F-AUX-05: drag sort + priority patch
  const hasDndKit = /@dnd-kit\/core/.test(channelTable) && /drag_indicator/.test(channelTable);
  const hasReorderPatch = /apiFetch\(`\/api\/admin\/channels\/\$\{id\}`/.test(aliasPage);
  await api(`/api/admin/channels/${fixture.channelC.id}`, {
    method: "PATCH",
    auth: "admin",
    expect: 200,
    body: JSON.stringify({ priority: 1 }),
  });
  await api(`/api/admin/channels/${fixture.channelB.id}`, {
    method: "PATCH",
    auth: "admin",
    expect: 200,
    body: JSON.stringify({ priority: 2 }),
  });
  const priorities = await prisma.channel.findMany({
    where: { id: { in: [fixture.channelB.id, fixture.channelC.id] } },
    select: { id: true, priority: true },
  });
  const pMap = Object.fromEntries(priorities.map((x) => [x.id, x.priority]));
  const priorityOk = pMap[fixture.channelC.id] === 1 && pMap[fixture.channelB.id] === 2;
  steps.push({
    id: "F-AUX-05-drag-priority",
    ok: hasDndKit && hasReorderPatch && priorityOk,
    detail: `dndKit=${hasDndKit} reorderPatch=${hasReorderPatch} priorityOk=${priorityOk}`,
  });

  // F-AUX-06: health summary dot + latency + jump to /admin/health
  const hasHealthDotLatency =
    /latencyMs/.test(channelTable) &&
    /href="\/admin\/health"/.test(channelTable) &&
    /w-1\.5 h-1\.5 rounded-full/.test(channelTable);
  steps.push({
    id: "F-AUX-06-health-summary",
    ok: hasHealthDotLatency,
    detail: `dotLatencyLink=${hasHealthDotLatency}`,
  });

  // F-AUX-07: channel sellPrice edit removed from PATCH api
  const before = await prisma.channel.findUnique({
    where: { id: fixture.channelB.id },
    select: { sellPrice: true },
  });
  await api(`/api/admin/channels/${fixture.channelB.id}`, {
    method: "PATCH",
    auth: "admin",
    expect: 200,
    body: JSON.stringify({
      sellPrice: { unit: "token", inputPer1M: 999, outputPer1M: 999 },
      sellPriceLocked: true,
      priority: 3,
    }),
  });
  const after = await prisma.channel.findUnique({
    where: { id: fixture.channelB.id },
    select: { sellPrice: true, sellPriceLocked: true, priority: true },
  });
  const sellPriceReadonly =
    JSON.stringify(before?.sellPrice) === JSON.stringify(after?.sellPrice) &&
    after?.sellPriceLocked === false &&
    after?.priority === 3;
  steps.push({
    id: "F-AUX-07-sellprice-cleanup",
    ok: sellPriceReadonly,
    detail: `sellPriceReadonly=${sellPriceReadonly} before=${JSON.stringify(before?.sellPrice)} after=${JSON.stringify(
      after?.sellPrice,
    )} locked=${String(after?.sellPriceLocked)} priority=${String(after?.priority)}`,
  });

  // F-AUX-08: scheduler V2 (alias-aware + API_REACHABILITY)
  const schema = text("prisma/schema.prisma");
  const scheduler = text("src/lib/health/scheduler.ts");
  const checker = text("src/lib/health/checker.ts");
  const linkRoute = text("src/app/api/admin/model-aliases/[id]/link/route.ts");
  const aliasRoute = text("src/app/api/admin/model-aliases/[id]/route.ts");
  const hasEnum = /API_REACHABILITY/.test(schema);
  const hasAliasAware = /isAliased/.test(scheduler) && /checkMode = "full"/.test(scheduler);
  const hasReachabilityMode = /runApiReachabilityCheck/.test(checker);
  const hasInstantTrigger =
    /Instant health check trigger/.test(linkRoute) && /Instant health check when alias is being enabled/.test(aliasRoute);

  const manualCheck = await api(`/api/admin/health/${fixture.channelImg.id}/check`, {
    method: "POST",
    auth: "admin",
    expect: 200,
  });
  const apiReachabilityOnly = Array.isArray(manualCheck.body?.checks)
    ? manualCheck.body.checks.length === 1 && manualCheck.body.checks[0].level === "API_REACHABILITY"
    : false;

  steps.push({
    id: "F-AUX-08-scheduler-v2",
    ok: hasEnum && hasAliasAware && hasReachabilityMode && hasInstantTrigger && apiReachabilityOnly,
    detail: `enum=${hasEnum} aliasAware=${hasAliasAware} reachability=${hasReachabilityMode} instant=${hasInstantTrigger} apiOnly=${apiReachabilityOnly} checks=${JSON.stringify(
      manualCheck.body?.checks ?? null,
    )}`,
  });

  // F-AUX-09: health page bug fixes (displayName, consecutive batch, highRisk rule)
  const healthRes = await api("/api/admin/health", { auth: "admin", expect: 200 });
  const aliases = healthRes.body?.aliases ?? [];
  const singleAlias = aliases.find((g: any) => g.aliasId === fixture.aliasSingle.id);
  const singleChannel = singleAlias?.channels?.find((c: any) => c.channelId === fixture.channelA.id);
  const providerDisplayOk =
    singleChannel && singleChannel.provider && singleChannel.provider !== singleChannel.providerName;
  const groupedFailuresOk = singleChannel?.consecutiveFailures === 1;
  const highRiskRuleOk =
    singleAlias?.channelCount === 1 && singleAlias?.activeCount === 1 && singleAlias?.highRisk === false;
  steps.push({
    id: "F-AUX-09-health-bugfix",
    ok: Boolean(providerDisplayOk && groupedFailuresOk && highRiskRuleOk),
    detail: `providerDisplay=${providerDisplayOk} groupedFailures=${groupedFailuresOk} consecutiveFailures=${String(
      singleChannel?.consecutiveFailures ?? "na",
    )} highRiskRule=${highRiskRuleOk} aliasStats=${JSON.stringify(
      singleAlias
        ? {
            channelCount: singleAlias.channelCount,
            activeCount: singleAlias.activeCount,
            highRisk: singleAlias.highRisk,
          }
        : null,
    )}`,
  });

  // F-AUX-10: health page V2 design restoration (key structure + no-line corrections)
  const healthPage = text("src/app/(console)/admin/health/page.tsx");
  const has4Cards = /grid grid-cols-1 md:grid-cols-4 gap-6/.test(healthPage);
  const hasCapsuleFilter = /bg-ds-surface-container-low p-3 rounded-full flex items-center gap-4/.test(
    healthPage,
  );
  const hasAliasGrouped = /model_training/.test(healthPage) && /modelAliases/.test(healthPage);
  const hasApiBadge = /API_REACHABILITY/.test(healthPage) && /LEVEL_LABELS\.API_REACHABILITY/.test(healthPage);
  const hasAssignAlias = /href="\/admin\/model-aliases"/.test(healthPage) && /assignAlias/.test(healthPage);
  const noForbiddenBorders =
    !/border-2 border-tertiary\/10/.test(healthPage) && !/border-t border-surface-container-low\/50/.test(healthPage);
  steps.push({
    id: "F-AUX-10-health-v2-design",
    ok: has4Cards && hasCapsuleFilter && hasAliasGrouped && hasApiBadge && hasAssignAlias && noForbiddenBorders,
    detail: `cards=${has4Cards} capsule=${hasCapsuleFilter} grouped=${hasAliasGrouped} apiBadge=${hasApiBadge} assignAlias=${hasAssignAlias} noForbiddenBorders=${noForbiddenBorders}`,
  });

  // Global type check
  const tsc = runTsc();
  steps.push({ id: "F-AUX-tsc", ok: tsc.ok, detail: tsc.detail });

  const pass = steps.filter((s) => s.ok).length;
  const fail = steps.length - pass;
  const report = {
    batch: "ADMIN-UX-health-v2",
    executedAt: new Date().toISOString(),
    baseUrl: BASE,
    pass,
    fail,
    steps,
  };

  writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));

  if (fail > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanupFixtures();
    } catch (err) {
      console.error("cleanup failed:", err);
    }
    await prisma.$disconnect();
  });
