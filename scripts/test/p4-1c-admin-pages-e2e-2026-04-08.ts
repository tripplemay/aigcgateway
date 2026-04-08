import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/p4-1c-admin-pages-e2e-2026-04-08.json";

type Step = { name: string; ok: boolean; detail: string };

const RUN_ID = Date.now();
const targetModelName = `p4c-target-${RUN_ID}`;
const sourceModelName = `p4c-source-${RUN_ID}`;
const unclassifiedModelName = `p4c-unclassified-${RUN_ID}`;
const multiModelName = `p4c-multi-${RUN_ID}`;
const createdAlias = `p4c-alias-${RUN_ID}`;

let adminToken = "";
let devToken = "";

async function api(
  path: string,
  init?: RequestInit & { expect?: number; token?: string; auth?: "none" },
) {
  const { expect, token, auth, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth !== "none" && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...rest, headers, redirect: "manual" });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (expect && res.status !== expect) {
    throw new Error(`${path} expected ${expect}, got ${res.status}: ${JSON.stringify(body)}`);
  }
  return { status: res.status, body, text, headers: res.headers };
}

async function loginAdmin() {
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email: "admin@aigc-gateway.local", password: "admin123" }),
  });
  adminToken = String(login.body?.token ?? "");
  if (!adminToken) throw new Error("admin token missing");
}

async function createDeveloperUser() {
  const email = `p4c_dev_${RUN_ID}@test.local`;
  const password = "Test1234";

  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email, password, name: "P4C Dev" }),
  });

  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });
  devToken = String(login.body?.token ?? "");
  if (!devToken) throw new Error("developer token missing");
}

async function seedModelsAndChannels() {
  const [openai, openrouter] = await Promise.all([
    prisma.provider.findUnique({ where: { name: "openai" }, select: { id: true } }),
    prisma.provider.findUnique({ where: { name: "openrouter" }, select: { id: true } }),
  ]);
  if (!openai || !openrouter) throw new Error("required providers not found");

  const target = await prisma.model.create({
    data: {
      name: targetModelName,
      displayName: "P4C Target",
      modality: "TEXT",
      enabled: true,
      capabilities: { streaming: true },
    },
  });

  const source = await prisma.model.create({
    data: {
      name: sourceModelName,
      displayName: "P4C Source",
      modality: "TEXT",
      enabled: false,
    },
  });

  const multi = await prisma.model.create({
    data: {
      name: multiModelName,
      displayName: "P4C Multi Channel",
      modality: "TEXT",
      enabled: true,
    },
  });

  await prisma.model.create({
    data: {
      name: unclassifiedModelName,
      displayName: "P4C Unclassified",
      modality: "TEXT",
      enabled: false,
    },
  });

  await prisma.channel.create({
    data: {
      providerId: openai.id,
      modelId: source.id,
      realModelId: sourceModelName,
      priority: 3,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 1, outputPer1M: 1, currency: "USD" },
      sellPrice: { unit: "token", inputPer1M: 2, outputPer1M: 2, currency: "USD" },
    },
  });

  await prisma.channel.createMany({
    data: [
      {
        providerId: openai.id,
        modelId: multi.id,
        realModelId: `${multiModelName}-oa`,
        priority: 2,
        status: "ACTIVE",
        costPrice: { unit: "token", inputPer1M: 1.1, outputPer1M: 1.3, currency: "USD" },
        sellPrice: { unit: "token", inputPer1M: 2.2, outputPer1M: 2.6, currency: "USD" },
      },
      {
        providerId: openrouter.id,
        modelId: multi.id,
        realModelId: `${multiModelName}-or`,
        priority: 1,
        status: "ACTIVE",
        costPrice: { unit: "token", inputPer1M: 1.2, outputPer1M: 1.4, currency: "USD" },
        sellPrice: { unit: "token", inputPer1M: 2.4, outputPer1M: 2.8, currency: "USD" },
      },
    ],
  });
}

async function run() {
  const steps: Step[] = [];

  try {
    await loginAdmin();
    await createDeveloperUser();
    await seedModelsAndChannels();

    // AC1: alias CRUD API
    let aliasId = "";
    {
      const create = await api("/api/admin/model-aliases", {
        method: "POST",
        token: adminToken,
        expect: 201,
        body: JSON.stringify({ alias: createdAlias, modelName: targetModelName }),
      });
      aliasId = String(create.body?.id ?? "");

      const list1 = await api("/api/admin/model-aliases", {
        token: adminToken,
        expect: 200,
      });
      const grouped1 = list1.body?.data?.[targetModelName] ?? [];
      const inList = grouped1.some((a: any) => a.alias === createdAlias);

      await api(`/api/admin/model-aliases/${aliasId}`, {
        method: "DELETE",
        token: adminToken,
        expect: 200,
      });

      const list2 = await api("/api/admin/model-aliases", {
        token: adminToken,
        expect: 200,
      });
      const grouped2 = list2.body?.data?.[targetModelName] ?? [];
      const removed = !grouped2.some((a: any) => a.alias === createdAlias);

      steps.push({
        name: "AC1 alias CRUD API works",
        ok: Boolean(aliasId) && inList && removed,
        detail: `aliasId=${aliasId || "-"}, createdVisible=${inList}, deletedInvisible=${removed}`,
      });
    }

    // AC2: merge API migrates channels and deletes source model
    {
      const sourceBefore = await prisma.model.findUnique({
        where: { name: sourceModelName },
        include: { channels: true },
      });
      const targetBefore = await prisma.model.findUnique({
        where: { name: targetModelName },
        include: { channels: true },
      });
      if (!sourceBefore || !targetBefore) throw new Error("merge precondition models missing");

      const merge = await api("/api/admin/model-aliases/merge", {
        method: "POST",
        token: adminToken,
        expect: 200,
        body: JSON.stringify({ sourceModelId: sourceBefore.id, targetModelName }),
      });

      const sourceAfter = await prisma.model.findUnique({ where: { id: sourceBefore.id } });
      const migratedCount = await prisma.channel.count({ where: { modelId: targetBefore.id } });
      const alias = await prisma.modelAlias.findUnique({ where: { alias: sourceModelName } });
      const expectedMigrated = targetBefore.channels.length + sourceBefore.channels.length;
      const apiMigrated = Number(merge.body?.merged?.channelsMigrated ?? -1);

      steps.push({
        name: "AC2 merge API migrates channels and deletes source model",
        ok:
          apiMigrated === sourceBefore.channels.length &&
          sourceAfter === null &&
          migratedCount === expectedMigrated &&
          alias?.modelName === targetModelName,
        detail: `apiMigrated=${apiMigrated}, sourceDeleted=${sourceAfter === null}, targetChannels=${migratedCount}/${expectedMigrated}, aliasMapped=${alias?.modelName === targetModelName}`,
      });
    }

    // AC3+AC4: data required by alias page and whitelist expanded channels exists
    {
      const aliasesRes = await api("/api/admin/model-aliases", {
        token: adminToken,
        expect: 200,
      });
      const grouped = aliasesRes.body?.data ?? {};
      const targetAliases = grouped[targetModelName] ?? [];
      const aliasFromMergeVisible = targetAliases.some((a: any) => a.alias === sourceModelName);

      const modelsRes = await api("/api/admin/models", {
        token: adminToken,
        expect: 200,
      });
      const models = modelsRes.body?.data ?? [];
      const unclassified = models.find((m: any) => m.name === unclassifiedModelName);
      const multi = models.find((m: any) => m.name === multiModelName);

      const multiChannelsOk =
        Array.isArray(multi?.channels) &&
        multi.channels.length >= 2 &&
        multi.channels.every((ch: any) => typeof ch.priority === "number" && ch.sellPrice);

      steps.push({
        name: "AC3 alias data and unclassified model are available for admin page",
        ok: aliasFromMergeVisible && Boolean(unclassified),
        detail: `mergeAliasVisible=${aliasFromMergeVisible}, unclassifiedVisible=${Boolean(unclassified)}`,
      });

      steps.push({
        name: "AC4 whitelist data contains multi-channel entries with priority and price",
        ok: multiChannelsOk,
        detail: `multiFound=${Boolean(multi)}, channelCount=${multi?.channels?.length ?? 0}, channelsHavePriorityAndPrice=${multiChannelsOk}`,
      });
    }

    // AC5: non-admin cannot access alias page
    {
      const res = await api("/admin/model-aliases", {
        token: devToken,
      });
      const location = res.headers.get("location") || "";
      const forbidden = res.status >= 300 && res.status < 400 && location.includes("/dashboard");

      steps.push({
        name: "AC5 non-admin cannot access /admin/model-aliases",
        ok: forbidden,
        detail: `status=${res.status}, location=${location || "-"}`,
      });
    }

    const passCount = steps.filter((s) => s.ok).length;
    const failCount = steps.length - passCount;

    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          runId: RUN_ID,
          fixtures: {
            targetModelName,
            sourceModelName,
            unclassifiedModelName,
            multiModelName,
            createdAlias,
          },
          adminTokenHint: `${adminToken.slice(0, 10)}...`,
          passCount,
          failCount,
          steps,
        },
        null,
        2,
      ),
      "utf8",
    );

    if (failCount > 0) {
      console.error(`[p4-1c-admin-pages-e2e] failed: ${failCount} step(s) failed`);
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          baseUrl: BASE,
          runId: RUN_ID,
          fixtures: {
            targetModelName,
            sourceModelName,
            unclassifiedModelName,
            multiModelName,
            createdAlias,
          },
          passCount: 0,
          failCount: 1,
          steps: [{ name: "script runtime", ok: false, detail: msg }],
        },
        null,
        2,
      ),
      "utf8",
    );
    console.error(`[p4-1c-admin-pages-e2e] script error: ${msg}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

run();
