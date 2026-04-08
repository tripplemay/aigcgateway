import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { writeFileSync } from "fs";
import { Prisma, PrismaClient } from "@prisma/client";
import { runModelSync } from "@/lib/sync/model-sync";

const prisma = new PrismaClient();
const MOCK_PORT = Number(process.env.MOCK_PORT ?? "3320");
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}`;
const OUTPUT =
  process.env.OUTPUT_FILE ?? "docs/test-reports/p4-1a-schema-sync-e2e-2026-04-08.json";

type Step = { name: string; ok: boolean; detail: string };

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function startMockServer() {
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/openai/models") {
      // 包含重复 modelId：gpt-4o
      json(res, 200, {
        data: [{ id: "gpt-4o" }, { id: "gpt-4o" }, { id: "gpt-4o-mini" }],
      });
      return;
    }

    if (req.method === "GET" && req.url === "/openrouter/models") {
      // 包含重复 modelId：gpt-4o，且 pricing 非零（避免被 openrouterAdapter 过滤）
      json(res, 200, {
        data: [
          {
            id: "gpt-4o",
            name: "OpenRouter GPT-4o",
            context_length: 128000,
            top_provider: { max_completion_tokens: 4096 },
            pricing: { prompt: "0.000005", completion: "0.000015" },
          },
          {
            id: "gpt-4o",
            name: "OpenRouter GPT-4o duplicate",
            context_length: 128000,
            top_provider: { max_completion_tokens: 4096 },
            pricing: { prompt: "0.000005", completion: "0.000015" },
          },
        ],
      });
      return;
    }

    await readBody(req);
    json(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve()));
  return server;
}

async function prepareProviders() {
  // 仅保留 openai/openrouter 参与同步，避免外部依赖噪音
  await prisma.provider.updateMany({
    where: { name: { notIn: ["openai", "openrouter"] } },
    data: { status: "DISABLED" },
  });

  await prisma.provider.update({
    where: { name: "openai" },
    data: {
      status: "ACTIVE",
      baseUrl: `${MOCK_BASE}/openai`,
      authConfig: { apiKey: "mock-openai-key" },
      proxyUrl: null,
    },
  });

  await prisma.provider.update({
    where: { name: "openrouter" },
    data: {
      status: "ACTIVE",
      baseUrl: `${MOCK_BASE}/openrouter`,
      authConfig: { apiKey: "mock-openrouter-key" },
      proxyUrl: null,
    },
  });

  // 禁用 AI 文档 enrich，确保测试只验证 Schema + alias + reconcile 逻辑
  await prisma.providerConfig.updateMany({
    where: { provider: { name: { in: ["openai", "openrouter"] } } },
    data: { docUrls: Prisma.JsonNull },
  });
}

async function run() {
  const steps: Step[] = [];
  const mock = await startMockServer();

  try {
    await prepareProviders();
    const syncResult = await runModelSync();

    const modelGpt4o = await prisma.model.findUnique({
      where: { name: "gpt-4o" },
      include: { channels: { include: { provider: true } } },
    });

    const canonicalPrefixedCount = await prisma.model.count({
      where: { name: { in: ["openai/gpt-4o", "openrouter/gpt-4o"] } },
    });

    const aliasCount = await prisma.modelAlias.count();
    const aliasSample = await prisma.modelAlias.findUnique({
      where: { alias: "gpt-4o-2024-11-20" },
    });

    const openaiProviderResult = syncResult.providers.find((p) => p.providerName === "openai");
    const openrouterProviderResult = syncResult.providers.find((p) => p.providerName === "openrouter");

    // AC1: sync 后 Model.name 是 canonical name
    steps.push({
      name: "AC1 canonical model name is used after sync",
      ok: !!modelGpt4o && canonicalPrefixedCount === 0,
      detail: `hasCanonical=${!!modelGpt4o}, prefixedCount=${canonicalPrefixedCount}`,
    });

    // AC2: 同一模型多 Provider 仅一条 Model 记录
    const gpt4oCount = await prisma.model.count({ where: { name: "gpt-4o" } });
    steps.push({
      name: "AC2 same model across providers has one Model record",
      ok: gpt4oCount === 1,
      detail: `gpt4oCount=${gpt4oCount}`,
    });

    // AC3: 该 Model 下有多个 Channel
    const providerNames =
      modelGpt4o?.channels
        .filter((c) => c.status === "ACTIVE")
        .map((c) => c.provider.name)
        .sort() ?? [];
    const activeChannels = modelGpt4o?.channels.filter((c) => c.status === "ACTIVE").length ?? 0;
    steps.push({
      name: "AC3 canonical model has channels from multiple providers",
      ok:
        activeChannels >= 2 &&
        providerNames.includes("openai") &&
        providerNames.includes("openrouter"),
      detail: `activeChannels=${activeChannels}, providers=${providerNames.join(",")}`,
    });

    // AC4: ModelAlias 初始数据存在
    steps.push({
      name: "AC4 model_aliases seeded data exists",
      ok: aliasCount >= 25 && aliasSample?.modelName === "gpt-4o",
      detail: `aliasCount=${aliasCount}, sample=${aliasSample?.alias ?? "null"}->${aliasSample?.modelName ?? "null"}`,
    });

    // AC5: Provider 返回重复 modelId 不报错
    steps.push({
      name: "AC5 duplicate modelId from provider does not break sync",
      ok:
        !!openaiProviderResult?.success &&
        !!openrouterProviderResult?.success &&
        !openaiProviderResult?.error &&
        !openrouterProviderResult?.error,
      detail: `openai=${openaiProviderResult?.success ? "ok" : "fail"}:${openaiProviderResult?.error ?? "none"}, openrouter=${openrouterProviderResult?.success ? "ok" : "fail"}:${openrouterProviderResult?.error ?? "none"}`,
    });

    const passCount = steps.filter((s) => s.ok).length;
    const failCount = steps.length - passCount;
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          mockBase: MOCK_BASE,
          passCount,
          failCount,
          syncSummary: syncResult.summary,
          steps,
        },
        null,
        2,
      ),
      "utf8",
    );

    if (failCount > 0) {
      console.error(`[p4-1a-schema-sync-e2e] F-P4A-06 failed: ${failCount} step(s) failed`);
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    writeFileSync(
      OUTPUT,
      JSON.stringify(
        {
          mockBase: MOCK_BASE,
          passCount: 0,
          failCount: 1,
          steps: [{ name: "script runtime", ok: false, detail: msg }],
        },
        null,
        2,
      ),
      "utf8",
    );
    console.error(`[p4-1a-schema-sync-e2e] script error: ${msg}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
    await new Promise<void>((resolve) => mock.close(() => resolve()));
  }
}

run();
