import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT = process.env.OUTPUT_FILE ?? "docs/test-reports/bf2-verifying-e2e-2026-04-12.json";

const prisma = new PrismaClient();

type Step = { id: string; ok: boolean; detail: string };
type ApiRes = { status: number; body: any; text: string };

let adminToken = "";
let originalOpenaiAuthConfig: unknown = null;

const created = {
  providerIds: [] as string[],
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

async function triggerSyncAndWait(marker: string, timeoutMs = 120000) {
  const before = await api("/api/admin/sync-status", { auth: "admin", expect: 200 });
  const beforeTime = before.body?.data?.lastSyncTime ?? null;

  await api("/api/admin/sync-models", { method: "POST", auth: "admin", expect: 202 });

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2500));
    const now = await api("/api/admin/sync-status", { auth: "admin", expect: 200 });
    const sync = now.body?.data?.lastSyncResultDetail;
    const afterTime = now.body?.data?.lastSyncTime ?? null;
    const providers = sync?.providers ?? [];

    const hasMarker = providers.some((p: any) => p.providerName === marker);
    const timeChanged = afterTime && afterTime !== beforeTime;
    if (hasMarker && timeChanged) return now.body?.data;
  }
  throw new Error(`sync timeout waiting marker provider ${marker}`);
}

function runTsc() {
  const r = spawnSync("npx", ["tsc", "--noEmit"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return {
    ok: r.status === 0,
    detail: `exit=${r.status} stderr=${(r.stderr || "").slice(0, 180)}`,
  };
}

async function seedWarningProviderAndAlias() {
  const minimaxProvider = await prisma.provider.findUnique({
    where: { name: "minimax" },
    include: { config: true },
  });
  if (!minimaxProvider) throw new Error("seed minimax provider not found");

  const openaiProvider = await prisma.provider.findUnique({ where: { name: "openai" } });
  if (!openaiProvider) throw new Error("seed openai provider not found");
  originalOpenaiAuthConfig = openaiProvider.authConfig;
  await prisma.provider.update({
    where: { id: openaiProvider.id },
    data: { authConfig: { apiKey: "bf2-invalid-key-for-warning-check" } },
  });

  const model = await prisma.model.create({
    data: {
      name: uniq("bf2-text-model"),
      displayName: "BF2 Text Model",
      modality: "TEXT",
      enabled: true,
    },
  });
  created.modelIds.push(model.id);

  const channel = await prisma.channel.create({
    data: {
      providerId: openaiProvider.id,
      modelId: model.id,
      realModelId: "bf2-real-model",
      priority: 1,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2 },
      sellPrice: { unit: "token", inputPer1M: 0.3, outputPer1M: 0.6 },
    },
  });
  created.channelIds.push(channel.id);

  const alias = await prisma.modelAlias.create({
    data: {
      alias: uniq("bf2-alias"),
      modality: "TEXT",
      enabled: true,
      openRouterModelId: "openai/gpt-4o-mini",
      sellPrice: { unit: "token", inputPer1M: 0.4, outputPer1M: 0.7 },
    },
  });
  created.aliasIds.push(alias.id);

  const link = await prisma.aliasModelLink.create({
    data: { aliasId: alias.id, modelId: model.id },
  });
  created.linkIds.push(link.id);

  return {
    warningProviderName: openaiProvider.name,
    aliasId: alias.id,
    aliasName: alias.alias,
    minimaxName: minimaxProvider.name,
  };
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
  if (created.providerIds.length) {
    await prisma.providerConfig.deleteMany({ where: { providerId: { in: created.providerIds } } });
    await prisma.provider.deleteMany({ where: { id: { in: created.providerIds } } });
  }
  if (originalOpenaiAuthConfig != null) {
    await prisma.provider.update({
      where: { name: "openai" },
      data: { authConfig: originalOpenaiAuthConfig as object },
    });
  }
}

async function main() {
  const steps: Step[] = [];
  await loginAdmin();
  const fixture = await seedWarningProviderAndAlias();

  // F-BF2-01: onApply once-set + unit token; /v1/models shows pricing after save
  const aliasPage = text("src/app/(console)/admin/model-aliases/page.tsx");
  const onApplyMatch = aliasPage.match(/onApply=\{\(input, output, orModelId\) => \{([\s\S]*?)\n\s*\}\}/);
  const onApplyBody = onApplyMatch?.[1] ?? "";
  const hasSingleSetEdit = /setEditField\(alias\.id,\s*"sellPrice",\s*\{[\s\S]*unit:\s*"token"/.test(
    onApplyBody,
  );
  const noDoubleSetSellField =
    !/setSellPriceField\(alias\.id,\s*"inputPer1M"/.test(onApplyBody) &&
    !/setSellPriceField\(alias\.id,\s*"outputPer1M"/.test(onApplyBody);
  const v1Models = await api("/v1/models?modality=text", { expect: 200 });
  const bf2Model = (v1Models.body?.data ?? []).find((m: any) => m.id === fixture.aliasName);
  const priceOk =
    bf2Model &&
    typeof bf2Model.pricing?.input_per_1m === "number" &&
    typeof bf2Model.pricing?.output_per_1m === "number" &&
    bf2Model.pricing.input_per_1m > 0 &&
    bf2Model.pricing.output_per_1m > 0;
  steps.push({
    id: "F-BF2-01-suggest-apply-and-model-price",
    ok: hasSingleSetEdit && noDoubleSetSellField && Boolean(priceOk),
    detail: `singleSet=${hasSingleSetEdit} noDoubleSet=${noDoubleSetSellField} v1PriceOk=${Boolean(
      priceOk,
    )}`,
  });

  // F-BF2-02: contextWindow/maxTokens thousand separator with click-to-edit
  const hasClickEdit =
    /editingNumField === `\$\{alias\.id\}_contextWindow`/.test(aliasPage) &&
    /editingNumField === `\$\{alias\.id\}_maxTokens`/.test(aliasPage) &&
    /toLocaleString\(\)/.test(aliasPage) &&
    /onClick=\{\(\) => setEditingNumField\(`\$\{alias\.id\}_contextWindow`\)\}/.test(aliasPage);
  steps.push({
    id: "F-BF2-02-thousand-separator-click-edit",
    ok: hasClickEdit,
    detail: `clickEditWithLocale=${hasClickEdit}`,
  });

  // F-BF2-03: fallbackPrice API + placeholder uses effective CNY
  const aliasApiRoute = text("src/app/api/admin/model-aliases/route.ts");
  const hasFallbackApi = /fallbackPrice/.test(aliasApiRoute) && /topChannelSp/.test(aliasApiRoute);
  const hasPlaceholderUse =
    /placeholder=\{\s*alias\.fallbackPrice\?\.inputPer1M[\s\S]*exchangeRate/.test(aliasPage) &&
    /placeholder=\{\s*alias\.fallbackPrice\?\.outputPer1M[\s\S]*exchangeRate/.test(aliasPage);
  const aliasesRes = await api("/api/admin/model-aliases", { auth: "admin", expect: 200 });
  const targetAlias = (aliasesRes.body?.data ?? []).find((a: any) => a.id === fixture.aliasId);
  const fallbackPresent =
    targetAlias &&
    targetAlias.fallbackPrice &&
    typeof targetAlias.fallbackPrice.inputPer1M === "number" &&
    typeof targetAlias.fallbackPrice.outputPer1M === "number";
  steps.push({
    id: "F-BF2-03-fallback-placeholder",
    ok: hasFallbackApi && hasPlaceholderUse && Boolean(fallbackPresent),
    detail: `fallbackApi=${hasFallbackApi} placeholder=${hasPlaceholderUse} fallbackData=${Boolean(
      fallbackPresent,
    )}`,
  });

  // F-BF2-04: alias-classifier strict generation split + cleanup script
  const classifier = text("src/lib/sync/alias-classifier.ts");
  const hasGenerationRule =
    classifier.includes("不同大版本号的模型必须为独立别名") &&
    classifier.includes("仅以下差异才视为\"同一别名的变体\"");
  const hasCleanupScript = text("scripts/fix-alias-mislinked-models.ts").includes("extractVersion");
  steps.push({
    id: "F-BF2-04-classifier-version-rule",
    ok: hasGenerationRule && hasCleanupScript,
    detail: `generationRule=${hasGenerationRule} cleanupScript=${hasCleanupScript}`,
  });

  // F-BF2-05 + F-BF2-06: minimax sync >0 and L1 warning visible
  const syncData = await triggerSyncAndWait(fixture.warningProviderName);
  const providers = syncData?.lastSyncResultDetail?.providers ?? [];
  const minimax = providers.find((p: any) => p.providerName === fixture.minimaxName);
  const bad = providers.find((p: any) => p.providerName === fixture.warningProviderName);
  const minimaxOk = minimax && (minimax.modelCount > 0 || minimax.apiModels > 0);
  const warningInData = bad && !bad.success && typeof bad.warning === "string" && bad.warning.length > 0;

  const opsPage = text("src/app/(console)/admin/operations/page.tsx");
  const hasWarningUi =
    /WARNING/.test(opsPage) || /p\.warning/.test(opsPage) || /text-amber/.test(opsPage);
  const hasErrorVisible = /p\.error/.test(opsPage) || /error/.test(opsPage);

  steps.push({
    id: "F-BF2-05-minimax-sync",
    ok: Boolean(minimaxOk),
    detail: `minimaxModelCount=${String(minimax?.modelCount ?? "na")} minimaxApiModels=${String(
      minimax?.apiModels ?? "na",
    )}`,
  });
  steps.push({
    id: "F-BF2-06-layer1-warning-visible",
    ok: Boolean(warningInData && hasWarningUi && hasErrorVisible),
    detail: `warningInData=${Boolean(warningInData)} warningUi=${hasWarningUi} errorVisibleUi=${hasErrorVisible} badProvider=${JSON.stringify(
      bad ?? null,
    )}`,
  });

  // F-BF2-07: provider page label "引擎类型" in zh/en
  const providersPage = text("src/app/(console)/admin/providers/page.tsx");
  const zh = text("src/messages/zh-CN.json");
  const en = text("src/messages/en.json");
  const labelOk =
    /{t\("adapter"\)}/.test(providersPage) &&
    zh.includes('"adapter": "引擎类型"') &&
    en.includes('"adapter": "Engine Type"');
  steps.push({
    id: "F-BF2-07-engine-type-label",
    ok: labelOk,
    detail: `labelBinding=${/{t\("adapter"\)}/.test(providersPage)} zh=${zh.includes('"adapter": "引擎类型"')} en=${en.includes('"adapter": "Engine Type"')}`,
  });

  const tsc = runTsc();
  steps.push({ id: "F-BF2-tsc", ok: tsc.ok, detail: tsc.detail });

  const pass = steps.filter((s) => s.ok).length;
  const fail = steps.length - pass;
  const report = {
    batch: "BF2-bugfix-round",
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
      await cleanup();
    } catch (e) {
      console.error("cleanup failed:", e);
    }
    await prisma.$disconnect();
  });
