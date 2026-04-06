import { execFileSync } from "child_process";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3099";
const OUTPUT_FILE =
  process.env.OUTPUT_FILE ?? "docs/test-reports/bugfix-model-cleanup-local-e2e-2026-04-06.json";

const prisma = new PrismaClient();

type StepResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

let adminToken = "";
let userToken = "";
let projectId = "";
let apiKey = "";
let textModelName = "";
let imageModelName = "";
let disabledChannelBackup: Array<{ id: string; status: string }> = [];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(
  path: string,
  init?: RequestInit & { expect?: number; auth?: "admin" | "user" | "key" | "none" },
) {
  const { expect, auth = "none", ...rest } = init ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (auth === "admin" && adminToken) headers.Authorization = `Bearer ${adminToken}`;
  if (auth === "user" && userToken) headers.Authorization = `Bearer ${userToken}`;
  if (auth === "key" && apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${BASE}${path}`, { ...rest, headers });
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
  return { res, body, text };
}

async function rawMcpToolCall(name: string, args: Record<string, unknown>) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
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

async function step(name: string, results: StepResult[], fn: () => Promise<string | undefined>) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message });
  }
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

async function createUserProjectAndKey() {
  const email = `cln_${Date.now()}@test.com`;
  const password = "Test1234";
  await api("/api/auth/register", {
    method: "POST",
    auth: "none",
    expect: 201,
    body: JSON.stringify({ email, password, name: "cleanup tester" }),
  });
  const login = await api("/api/auth/login", {
    method: "POST",
    auth: "none",
    expect: 200,
    body: JSON.stringify({ email, password }),
  });
  userToken = String(login.body?.token ?? "");
  if (!userToken) throw new Error("user token missing");

  const project = await api("/api/projects", {
    method: "POST",
    auth: "user",
    expect: 201,
    body: JSON.stringify({ name: `cleanup-${Date.now()}` }),
  });
  projectId = String(project.body?.id ?? "");
  if (!projectId) throw new Error("project id missing");

  const key = await api(`/api/projects/${projectId}/keys`, {
    method: "POST",
    auth: "user",
    expect: 201,
    body: JSON.stringify({ name: "cleanup-key" }),
  });
  apiKey = String(key.body?.key ?? "");
  if (!apiKey) throw new Error("api key missing");

  await prisma.project.update({ where: { id: projectId }, data: { balance: 20 } });
}

async function seedOrphanModelAndChannel(orphanName: string) {
  const provider = await prisma.provider.findUniqueOrThrow({
    where: { name: "openai" },
    select: { id: true },
  });
  const model = await prisma.model.upsert({
    where: { name: orphanName },
    update: {},
    create: {
      name: orphanName,
      displayName: "Orphan Test Model",
      modality: "TEXT",
      capabilities: { unknown: false },
      contextWindow: 4096,
      maxTokens: 1024,
    },
  });
  await prisma.channel.upsert({
    where: {
      providerId_modelId_realModelId: {
        providerId: provider.id,
        modelId: model.id,
        realModelId: "orphan-test-real-model",
      },
    },
    update: { status: "ACTIVE" },
    create: {
      providerId: provider.id,
      modelId: model.id,
      realModelId: "orphan-test-real-model",
      priority: 999,
      status: "ACTIVE",
      costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.1, currency: "USD" },
      sellPrice: { unit: "token", inputPer1M: 0.2, outputPer1M: 0.2, currency: "USD" },
    },
  });
}

async function disableChannelsForModel(modelName: string) {
  const model = await prisma.model.findUnique({
    where: { name: modelName },
    select: { id: true },
  });
  if (!model) throw new Error(`model not found for channel disable: ${modelName}`);
  const channels = await prisma.channel.findMany({
    where: { modelId: model.id },
    select: { id: true, status: true },
  });
  if (channels.length === 0) throw new Error(`no channels found for model: ${modelName}`);
  disabledChannelBackup.push(...channels.map((c) => ({ id: c.id, status: c.status })));
  await prisma.channel.updateMany({
    where: { modelId: model.id },
    data: { status: "DISABLED" },
  });
}

async function pickActiveModelsForChannelTests() {
  let text = await prisma.model.findFirst({
    where: { modality: "TEXT", channels: { some: { status: "ACTIVE" } } },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  let image = await prisma.model.findFirst({
    where: { modality: "IMAGE", channels: { some: { status: "ACTIVE" } } },
    orderBy: { name: "asc" },
    select: { name: true },
  });

  const provider = await prisma.provider.findUniqueOrThrow({
    where: { name: "openai" },
    select: { id: true },
  });

  if (!text) {
    const textModel = await prisma.model.upsert({
      where: { name: "openai/gpt-4.1-mini" },
      update: {
        modality: "TEXT",
        capabilities: { streaming: true, json_mode: true, unknown: false },
      },
      create: {
        name: "openai/gpt-4.1-mini",
        displayName: "OpenAI GPT-4.1 Mini",
        modality: "TEXT",
        capabilities: { streaming: true, json_mode: true, unknown: false },
      },
      select: { id: true, name: true },
    });
    await prisma.channel.upsert({
      where: {
        providerId_modelId_realModelId: {
          providerId: provider.id,
          modelId: textModel.id,
          realModelId: "gpt-4.1-mini",
        },
      },
      update: { status: "ACTIVE" },
      create: {
        providerId: provider.id,
        modelId: textModel.id,
        realModelId: "gpt-4.1-mini",
        priority: 1,
        status: "ACTIVE",
        costPrice: { unit: "token", inputPer1M: 0.1, outputPer1M: 0.2, currency: "USD" },
        sellPrice: { unit: "token", inputPer1M: 0.12, outputPer1M: 0.24, currency: "USD" },
      },
    });
    text = { name: textModel.name };
  }

  if (!image) {
    const imageModel = await prisma.model.upsert({
      where: { name: "openai/dall-e-3" },
      update: {
        modality: "IMAGE",
        capabilities: { unknown: false },
      },
      create: {
        name: "openai/dall-e-3",
        displayName: "OpenAI DALL-E 3",
        modality: "IMAGE",
        capabilities: { unknown: false },
      },
      select: { id: true, name: true },
    });
    await prisma.channel.upsert({
      where: {
        providerId_modelId_realModelId: {
          providerId: provider.id,
          modelId: imageModel.id,
          realModelId: "dall-e-3",
        },
      },
      update: { status: "ACTIVE" },
      create: {
        providerId: provider.id,
        modelId: imageModel.id,
        realModelId: "dall-e-3",
        priority: 1,
        status: "ACTIVE",
        costPrice: { unit: "call", perCall: 0.01, currency: "USD" },
        sellPrice: { unit: "call", perCall: 0.012, currency: "USD" },
      },
    });
    image = { name: imageModel.name };
  }

  textModelName = text.name;
  imageModelName = image.name;
}

async function restoreDisabledChannels() {
  for (const ch of disabledChannelBackup) {
    await prisma.channel.update({
      where: { id: ch.id },
      data: { status: ch.status as any },
    });
  }
  disabledChannelBackup = [];
}

async function waitSyncFinished(previousSyncTime: string | null, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const statusRes = await api("/api/admin/sync-status", {
      method: "GET",
      auth: "admin",
      expect: 200,
    });
    const data = statusRes.body?.data ?? {};
    const current = data.lastSyncTime as string | null;
    if (previousSyncTime == null) {
      if (current) return current;
    } else if (current && current !== previousSyncTime) {
      return current;
    }
    await sleep(3000);
  }
  throw new Error("sync status did not update within timeout");
}

async function main() {
  const results: StepResult[] = [];
  const orphanName = `openai/orphan-test-${Date.now()}`;
  let syncTimeAfter: string | null = null;

  try {
    await loginAdmin();
    await createUserProjectAndKey();
    await seedOrphanModelAndChannel(orphanName);

    await step("F-CLN-02: cleanup script dry-run output", results, async () => {
      const output = execFileSync(
        "npx",
        ["tsx", "scripts/cleanup-orphan-models.ts"],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      if (!output.includes("[DRY RUN]")) throw new Error("dry-run marker missing");
      if (!output.includes(orphanName)) throw new Error("orphan model not listed in dry-run");
      if (!output.includes("白名单外（待删除）")) throw new Error("dry-run summary missing");
      return `dry-run contains orphan: ${orphanName}`;
    });

    await step("F-CLN-01: sync cleanup removes non-whitelist models", results, async () => {
      const before = await api("/api/admin/sync-status", { method: "GET", auth: "admin", expect: 200 });
      const previousSyncTime = (before.body?.data?.lastSyncTime as string | null) ?? null;

      await api("/api/admin/sync-models", { method: "POST", auth: "admin", expect: 202 });
      syncTimeAfter = await waitSyncFinished(previousSyncTime);

      const count = await prisma.model.count({ where: { name: orphanName } });
      if (count !== 0) throw new Error(`orphan model still exists after sync: ${orphanName}`);
      return `sync updated at ${syncTimeAfter}; orphan removed`;
    });

    await pickActiveModelsForChannelTests();

    await step("F-CLN-03: MCP chat/generate_image channel_unavailable behavior", results, async () => {
      await disableChannelsForModel(textModelName);
      await disableChannelsForModel(imageModelName);

      const chat = await rawMcpToolCall("chat", {
        model: textModelName,
        messages: [{ role: "user", content: "hello" }],
      });
      const chatResult = chat.body?.result ?? chat.body;
      const chatMsg = String(chatResult?.content?.[0]?.text ?? "");
      if (!chatResult?.isError) throw new Error("chat should return isError under no channel");
      if (!chatMsg.includes("No available channel")) {
        throw new Error(`chat error message unexpected: ${chatMsg}`);
      }

      const image = await rawMcpToolCall("generate_image", {
        model: imageModelName,
        prompt: "a red cube",
        size: "1024x1024",
      });
      const imageResult = image.body?.result ?? image.body;
      const imageText = String(imageResult?.content?.[0]?.text ?? "");
      if (!imageResult?.isError) throw new Error("generate_image should return isError under no channel");
      let parsed: any = null;
      try {
        parsed = JSON.parse(imageText);
      } catch {
        throw new Error(`generate_image error is not JSON: ${imageText}`);
      }
      if (parsed?.code !== "channel_unavailable") {
        throw new Error(`expected code channel_unavailable, got ${parsed?.code}`);
      }
      return `chat/isError + generate_image/code=${parsed.code}`;
    });

    await step("F-CLN-04: admin models returns correct activeChannelCount", results, async () => {
      await restoreDisabledChannels();
      const model = await prisma.model.findUnique({
        where: { name: textModelName },
        select: { id: true },
      });
      if (!model) throw new Error(`model not found: ${textModelName}`);

      const expected = await prisma.channel.count({
        where: { modelId: model.id, status: "ACTIVE" },
      });

      const adminModels = await api("/api/admin/models", { method: "GET", auth: "admin", expect: 200 });
      const target = (adminModels.body?.data ?? []).find((m: any) => m.name === textModelName);
      if (!target) throw new Error(`admin models missing ${textModelName}`);
      if (typeof target.activeChannelCount !== "number") {
        throw new Error("activeChannelCount missing in response");
      }
      if (target.activeChannelCount !== expected) {
        throw new Error(`activeChannelCount mismatch: api=${target.activeChannelCount}, db=${expected}`);
      }
      return `${textModelName}: activeChannelCount=${expected}`;
    });
  } finally {
    await restoreDisabledChannels().catch(() => {});
    await prisma.$disconnect();
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const summary = {
    passed,
    failed,
    results,
    orphanName,
    syncTimeAfter,
    textModelName,
    imageModelName,
  };
  writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (error) => {
  const fatal = { fatal: (error as Error).message };
  try {
    writeFileSync(OUTPUT_FILE, JSON.stringify(fatal, null, 2));
  } catch {}
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
